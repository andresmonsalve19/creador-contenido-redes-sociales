import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import express, { Router } from 'express';
import { z } from 'zod';
import { generateBackground } from '../../shared/ai/backgroundImage.js';
import { assertModel, listModels } from '../../shared/ai/modelService.js';
import { parseModelJson } from '../../shared/ai/parseModelJson.js';
import { getProvider } from '../../shared/ai/providers/index.js';
import { getBrandContext, readMarkdown } from '../../shared/brandContext/contextStore.js';
import { serverEnv } from '../../shared/config/env.js';
import { AppError, badRequest, notReady } from '../../shared/http/errors.js';
import { localOnly } from '../../shared/http/localOnly.js';
import { validate } from '../../shared/http/validate.js';
import { readRulesFor } from '../../shared/learning/learningStore.js';
import { assembleCaption } from '../../shared/publishing/caption.js';
import { assertAvatarsAuthorized } from '../../shared/video/authorization.js';
import { getVideoProvider, listAvatars, listVoices } from '../../shared/video/index.js';
import { readBackgroundImage, readVideoSettings } from '../../shared/video/videoSettingsStore.js';
import { estimateScript } from './estimate.js';
import { createJobRunner, type BackgroundFile } from './jobRunner.js';
import {
  ACTIVE_STATUSES,
  BACKGROUNDS_DIR,
  REELS_DIR,
  createFileJobStore,
  resolveReelFile,
  type Job,
} from './jobStore.js';
import {
  backgroundBody,
  estimateBody,
  generateBody,
  reviseScriptBody,
  scriptResponseSchema,
  scriptBody,
  type SceneBackgroundSpec,
  type VideoSpec,
} from './schemas.js';
import {
  SCRIPT_JSON_SCHEMA,
  buildRevisionPrompt,
  buildScriptPrompt,
  type ScriptContext,
} from './scriptBuilder.js';

const IMAGE_EXTENSIONS = { 'image/png': 'png', 'image/jpeg': 'jpg' } as const;
const idParams = z.object({ id: z.uuid('Ese video no existe.') });
const voicesQuery = z.object({ language: z.string().trim().max(60).optional() });

/** Lee del disco un fondo generado para un reel (PNG o JPEG). */
async function readGeneratedBackground(imageId: string): Promise<BackgroundFile | null> {
  for (const [mimeType, ext] of Object.entries(IMAGE_EXTENSIONS) as [
    BackgroundFile['mimeType'],
    string,
  ][]) {
    try {
      const data = await fs.readFile(path.join(BACKGROUNDS_DIR, `${imageId}.${ext}`));
      return { data, mimeType, fileName: `fondo-${imageId.slice(0, 8)}.${ext}` };
    } catch {
      // probar la siguiente extensión
    }
  }
  return null;
}

async function loadBackground(background: SceneBackgroundSpec): Promise<BackgroundFile> {
  if (background.type === 'brandImage') {
    const image = await readBackgroundImage();
    if (!image) throw notReady('No hay una imagen de fondo guardada en la configuración de video.');
    const ext = IMAGE_EXTENSIONS[image.mimeType];
    return { data: image.data, mimeType: image.mimeType, fileName: `fondo-marca.${ext}` };
  }
  if (background.type === 'generated') {
    const image = await readGeneratedBackground(background.imageId);
    if (!image) throw notReady('El fondo generado ya no existe. Genera uno nuevo.');
    return image;
  }
  throw new Error(`El fondo "${background.type}" no es una imagen.`);
}

const store = createFileJobStore();
const runner = createJobRunner({
  store,
  getProvider: getVideoProvider,
  loadBackground,
  reelsDir: REELS_DIR,
  timeoutMs: serverEnv.HEYGEN_POLL_TIMEOUT_MIN * 60_000,
  log: (message) => console.log(message),
});

/** Retoma los videos en curso si el servidor se reinició mientras se generaban. */
export const resumeReels = () => runner.resume();

/** Todo lo que la marca aporta al guion. Falla si faltan los archivos obligatorios de la marca. */
async function scriptContext(): Promise<ScriptContext> {
  const [brand, videoGuidelines, settings, learning] = await Promise.all([
    getBrandContext(),
    readMarkdown('videoGuidelines'),
    readVideoSettings(),
    readRulesFor('video'),
  ]);
  return {
    complianceRules: settings.complianceRules,
    videoGuidelines,
    company: brand.company,
    design: brand.design,
    learning,
  };
}

async function writeScript(
  textModel: string,
  { system, prompt, roles }: { system: string; prompt: string; roles: string[] },
  contact: Parameters<typeof assembleCaption>[2],
) {
  const raw = await getProvider().generateText({
    model: textModel,
    system,
    prompt,
    temperature: 0.8,
    jsonSchema: SCRIPT_JSON_SCHEMA,
  });
  const result = parseModelJson(scriptResponseSchema, raw);
  if (result.scenes.length !== roles.length) {
    throw new AppError(
      502,
      `Se esperaban ${roles.length} escenas y el modelo devolvió ${result.scenes.length}. Inténtalo de nuevo.`,
    );
  }
  return {
    concept: result.concept,
    caption: assembleCaption(result.captionBody, result.hashtags, contact),
    scenes: result.scenes.map((scene, index) => ({ ...scene, role: roles[index] })),
    warnings: result.ignoredByCompliance,
  };
}

/** Lo que ve el cliente de un video (sin rutas absolutas del disco). */
const publicJob = (job: Job) => ({
  ...job,
  videoUrl: job.file ? `/api/reels/jobs/${job.id}/video` : null,
});

async function findJob(id: string): Promise<Job> {
  const job = await store.get(id);
  if (!job) throw new AppError(404, 'Ese video no existe.', 'NOT_FOUND');
  return job;
}

export const reelsRouter = Router();
const json = express.json({ limit: '200kb' });

reelsRouter.get('/avatars', async (_req, res) => {
  res.json({ avatars: await listAvatars() });
});

reelsRouter.get('/voices', async (req, res) => {
  const { language } = validate(voicesQuery, req.query);
  res.json({ voices: await listVoices(language || undefined) });
});

reelsRouter.post('/script', json, async (req, res) => {
  const body = validate(scriptBody, req.body);
  await assertModel(body.textModel, 'text');
  const prompt = buildScriptPrompt(body, await scriptContext());
  res.json(await writeScript(body.textModel, prompt, body.contact));
});

reelsRouter.post('/revise-script', json, async (req, res) => {
  const body = validate(reviseScriptBody, req.body);
  await assertModel(body.textModel, 'text');
  const prompt = buildRevisionPrompt(body, await scriptContext());
  res.json(await writeScript(body.textModel, prompt, body.contact));
});

/** Duración estimada del guion y saldo de la cuenta. HeyGen no publica precios: no hay costo en USD. */
reelsRouter.post('/estimate', json, async (req, res) => {
  const body = validate(estimateBody, req.body);
  const estimate = estimateScript(body.scenes, body.wordsPerSecond, body.durationSeconds);
  const account = await getVideoProvider()
    .getAccount()
    .catch(() => null);
  res.json({ ...estimate, costUsd: null, account });
});

/** Genera con IA un fondo sin texto ni personas, con la identidad de la marca. */
reelsRouter.post('/background', localOnly, json, async (req, res) => {
  const body = validate(backgroundBody, req.body);
  const imageModel = body.imageModel ?? (await listModels('image')).recommendedId;
  if (!imageModel) throw notReady('Tu API key de Gemini no tiene modelos de imagen disponibles.');
  await assertModel(imageModel, 'image');

  const [brand, videoGuidelines, settings] = await Promise.all([
    getBrandContext(),
    readMarkdown('videoGuidelines'),
    readVideoSettings(),
  ]);
  const image = await generateBackground({
    imageModel,
    aspectRatio: body.aspectRatio,
    design: brand.design,
    videoGuidelines,
    complianceRules: settings.complianceRules,
    topic: body.topic,
  });

  const ext = IMAGE_EXTENSIONS[image.mimeType as keyof typeof IMAGE_EXTENSIONS];
  if (!ext)
    throw new AppError(502, 'El modelo devolvió un formato de imagen que HeyGen no admite.');
  const imageId = randomUUID();
  await fs.mkdir(BACKGROUNDS_DIR, { recursive: true });
  await fs.writeFile(
    path.join(BACKGROUNDS_DIR, `${imageId}.${ext}`),
    Buffer.from(image.data, 'base64'),
  );
  res.json({ imageId, image });
});

reelsRouter.get('/backgrounds/:id', async (req, res) => {
  const { id } = validate(idParams, req.params);
  const image = await readGeneratedBackground(id);
  if (!image) {
    res.status(404).end();
    return;
  }
  res
    .type(image.mimeType)
    .set('Cache-Control', 'private, max-age=31536000, immutable')
    .send(image.data);
});

/** Crea el trabajo y lo pone en cola. Solo desde este equipo y con confirmación explícita. */
reelsRouter.post('/generate', localOnly, json, async (req, res) => {
  // `confirmed` ya quedó validado como true por el esquema; no forma parte de la especificación.
  const { confirmed, duplicatedFrom, ...spec } = validate(generateBody, req.body);
  void confirmed;
  const settings = await readVideoSettings();
  await assertAvatarsAuthorized(
    spec.scenes.map((scene) => scene.avatarId),
    settings.authorizations,
  );

  // Los fondos de imagen deben existir antes de encolar, para fallar aquí y no a mitad del render.
  for (const scene of spec.scenes) {
    if (scene.background.type === 'brandImage' || scene.background.type === 'generated') {
      await loadBackground(scene.background);
    }
  }

  const now = new Date().toISOString();
  const job: Job = {
    id: randomUUID(),
    createdAt: now,
    updatedAt: now,
    spec,
    provider: 'heygen',
    providerVideoId: null,
    status: 'queued',
    estimatedCostUsd: null,
    estimatedSeconds: estimateScript(spec.scenes, spec.wordsPerSecond, spec.durationSeconds)
      .totalSeconds,
    durationSeconds: null,
    file: null,
    error: null,
    duplicatedFrom: duplicatedFrom ?? null,
  };
  await store.save(job);
  runner.enqueue(job.id);
  res.status(202).json({ job: publicJob(job) });
});

reelsRouter.get('/jobs', async (_req, res) => {
  res.json({ jobs: (await store.list()).map(publicJob) });
});

reelsRouter.get('/jobs/:id', async (req, res) => {
  const { id } = validate(idParams, req.params);
  res.json({ job: publicJob(await findJob(id)) });
});

reelsRouter.get('/jobs/:id/video', async (req, res) => {
  const { id } = validate(idParams, req.params);
  const job = await findJob(id);
  const file = job.file ? resolveReelFile(job.file) : null;
  if (!file) throw new AppError(404, 'El video aún no está disponible.', 'NOT_FOUND');
  const download = req.query.download === '1';
  res.set('Cache-Control', 'private, no-cache');
  if (download) res.download(file, path.basename(file));
  else res.sendFile(file);
});

/** Devuelve la especificación de un video para volver a generarlo con cambios. No crea nada. */
reelsRouter.post('/jobs/:id/duplicate', localOnly, async (req, res) => {
  const { id } = validate(idParams, req.params);
  const job = await findJob(id);
  const draft: VideoSpec & { duplicatedFrom: string } = { ...job.spec, duplicatedFrom: job.id };
  res.json({ draft });
});

reelsRouter.delete('/jobs/:id', localOnly, async (req, res) => {
  const { id } = validate(idParams, req.params);
  const job = await findJob(id);
  if (ACTIVE_STATUSES.includes(job.status) || runner.isActive(id)) {
    throw badRequest('No se puede borrar un video que se está generando.');
  }
  const file = job.file ? resolveReelFile(job.file) : null;
  if (file) await fs.rm(file, { force: true });
  await store.remove(id);
  res.status(204).end();
});
