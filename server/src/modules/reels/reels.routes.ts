import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import express, { Router } from 'express';
import { z } from 'zod';
import { generateBackground } from '../../shared/ai/backgroundImage.js';
import { generateBroll } from '../../shared/ai/brollImage.js';
import type { InlineImage } from '../../shared/ai/providers/types.js';
import { assertModel, listModels } from '../../shared/ai/modelService.js';
import { parseModelJson } from '../../shared/ai/parseModelJson.js';
import { getProvider } from '../../shared/ai/providers/index.js';
import sharp from 'sharp';
import { getBrandContext, readLogo, readMarkdown } from '../../shared/brandContext/contextStore.js';
import { readIdentity, readPartnerLogos } from '../../shared/brandContext/identityStore.js';
import { serverEnv } from '../../shared/config/env.js';
import { AppError, badRequest, notReady } from '../../shared/http/errors.js';
import { localOnly } from '../../shared/http/localOnly.js';
import { validate } from '../../shared/http/validate.js';
import { readRulesFor } from '../../shared/learning/learningStore.js';
import { assembleCaption } from '../../shared/publishing/caption.js';
import { assertAvatarsAuthorized } from '../../shared/video/authorization.js';
import { VideoProviderError } from '../../shared/video/errors.js';
import { getVideoProvider, listAvatars, listVoices } from '../../shared/video/index.js';
import {
  hasQualityEngine,
  pickEngine,
  supportsMotionPrompt,
  type VideoAvatar,
} from '../../shared/video/types.js';
import { readBackgroundImage, readVideoSettings } from '../../shared/video/videoSettingsStore.js';
import { buildAgentPrompt } from './agentPrompt.js';
import { brandColorFrom, renderIntroCard, renderOutroCard } from './brandCards.js';
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
  brollBody,
  cardsPreviewBody,
  estimateBody,
  generateBody,
  reviseScriptBody,
  scriptResponseSchema,
  scriptBody,
  videoSpecSchema,
  type SceneBackgroundSpec,
  type SceneKind,
  type SceneSpec,
  type VideoStyle,
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

/** Guarda una imagen generada (PNG o JPEG) y devuelve su id. */
async function saveImage(data: Buffer, mimeType: string): Promise<string> {
  const ext = IMAGE_EXTENSIONS[mimeType as keyof typeof IMAGE_EXTENSIONS];
  if (!ext)
    throw new AppError(502, 'El modelo devolvió un formato de imagen que HeyGen no admite.');
  const imageId = randomUUID();
  await fs.mkdir(BACKGROUNDS_DIR, { recursive: true });
  await fs.writeFile(path.join(BACKGROUNDS_DIR, `${imageId}.${ext}`), data);
  return imageId;
}

async function resolveImageModel(requested?: string): Promise<string> {
  const imageModel = requested ?? (await listModels('image')).recommendedId;
  if (!imageModel) throw notReady('Tu API key de Gemini no tiene modelos de imagen disponibles.');
  await assertModel(imageModel, 'image');
  return imageModel;
}

/** Logo y color de la marca para las tarjetas de apertura y cierre. */
async function cardInput() {
  const [brand, settings] = await Promise.all([getBrandContext(), readVideoSettings()]);
  const preferred = settings.background.type === 'color' ? settings.background.color : null;
  return {
    color: brandColorFrom(brand.design, preferred),
    logo: Buffer.from(brand.logo.data, 'base64'),
    partners: brand.partnerLogos.map((partner) => Buffer.from(partner.image.data, 'base64')),
  };
}

const toInline = (data: Buffer): InlineImage => ({
  mimeType: 'image/png',
  data: data.toString('base64'),
});

/**
 * Tomas variadas: cada vez que un avatar de stock vuelve a aparecer usa otro look de su grupo
 * (otra toma de la misma persona). Los avatares propios se dejan igual porque su autorización
 * de imagen está registrada por look.
 */
async function varyLooks(scenes: SceneSpec[], avatars: Map<string, VideoAvatar>) {
  const provider = getVideoProvider();
  const looksByAvatar = new Map<string, VideoAvatar[]>();
  for (const avatar of avatars.values()) {
    if (avatar.ownership !== 'public' || !avatar.groupId) continue;
    const looks = await provider.listGroupLooks(avatar.groupId).catch(() => []);
    const others = looks.filter((look) => look.id !== avatar.id && pickEngine(look.engines));
    if (others.length > 0) looksByAvatar.set(avatar.id, [avatar, ...others]);
  }

  const seen = new Map<string, number>();
  const lookById = new Map<string, VideoAvatar>();
  const result = scenes.map((scene) => {
    const looks = scene.kind === 'avatar' ? looksByAvatar.get(scene.avatarId) : undefined;
    if (!looks) return scene;
    const count = seen.get(scene.avatarId) ?? 0;
    seen.set(scene.avatarId, count + 1);
    const look = looks[count % looks.length] ?? looks[0]!;
    lookById.set(look.id, look);
    return { ...scene, avatarId: look.id };
  });
  return { scenes: result, looks: lookById };
}

/** Logo real de la marca para adjuntarlo al agente de video (HeyGen acepta PNG o JPEG). */
async function logoForAgent(): Promise<{
  mimeType: 'image/png' | 'image/jpeg';
  data: Buffer;
} | null> {
  const logo = await readLogo();
  if (!logo) return null;
  if (logo.mimeType === 'image/png' || logo.mimeType === 'image/jpeg') {
    return { mimeType: logo.mimeType, data: logo.data };
  }
  return { mimeType: 'image/png', data: await sharp(logo.data).png().toBuffer() };
}

/** Registro de un video nuevo, en cola. */
function newJob(spec: Job['spec'], duplicatedFrom: string | undefined, agent: Job['agent']): Job {
  const now = new Date().toISOString();
  return {
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
    agent,
  };
}

const store = createFileJobStore();
const runner = createJobRunner({
  store,
  getProvider: getVideoProvider,
  loadBackground,
  loadLogo: logoForAgent,
  loadPartnerLogos: async () =>
    (await readPartnerLogos()).map(({ mimeType, data }) => ({ mimeType, data })),
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
    identity: brand.identity,
    learning,
  };
}

async function writeScript(
  textModel: string,
  {
    system,
    prompt,
    roles,
    kinds,
  }: { system: string; prompt: string; roles: string[]; kinds: SceneKind[] },
  contact: Parameters<typeof assembleCaption>[2],
  style: VideoStyle,
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
    scenes: result.scenes.map((scene, index) => {
      const kind = kinds[index] ?? 'avatar';
      // Por escenas, cada tipo solo conserva su campo. En la edición automática todas las escenas
      // llevan su indicación de toma.
      return {
        ...scene,
        role: roles[index],
        kind,
        visualPrompt: style === 'agent' || kind === 'broll' ? scene.visualPrompt : '',
        gestures: kind === 'avatar' ? scene.gestures : '',
      };
    }),
    warnings: result.ignoredByCompliance,
    styleParagraph: result.styleParagraph,
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

// Solo avatares con Avatar IV o V: Avatar III no se usa.
reelsRouter.get('/avatars', async (_req, res) => {
  res.json({ avatars: (await listAvatars()).filter(hasQualityEngine) });
});

reelsRouter.get('/voices', async (req, res) => {
  const { language } = validate(voicesQuery, req.query);
  res.json({ voices: await listVoices(language || undefined) });
});

reelsRouter.post('/script', json, async (req, res) => {
  const body = validate(scriptBody, req.body);
  await assertModel(body.textModel, 'text');
  const prompt = buildScriptPrompt(body, await scriptContext());
  res.json(await writeScript(body.textModel, prompt, body.contact, body.style));
});

reelsRouter.post('/revise-script', json, async (req, res) => {
  const body = validate(reviseScriptBody, req.body);
  await assertModel(body.textModel, 'text');
  const prompt = buildRevisionPrompt(body, await scriptContext());
  res.json(await writeScript(body.textModel, prompt, body.contact, body.style));
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
  const imageModel = await resolveImageModel(body.imageModel);

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

  const imageId = await saveImage(Buffer.from(image.data, 'base64'), image.mimeType);
  res.json({ imageId, image });
});

/** Imagen de apoyo (b-roll) de una escena, con la identidad de la marca. */
reelsRouter.post('/broll', localOnly, json, async (req, res) => {
  const body = validate(brollBody, req.body);
  const imageModel = await resolveImageModel(body.imageModel);
  const [brand, videoGuidelines, settings] = await Promise.all([
    getBrandContext(),
    readMarkdown('videoGuidelines'),
    readVideoSettings(),
  ]);
  const image = await generateBroll({
    imageModel,
    aspectRatio: body.aspectRatio,
    visualPrompt: body.visualPrompt,
    design: brand.design,
    videoGuidelines,
    complianceRules: settings.complianceRules,
    topic: body.topic,
  });
  const imageId = await saveImage(Buffer.from(image.data, 'base64'), image.mimeType);
  res.json({ imageId, image });
});

/** Vista previa de las tarjetas de apertura y cierre (no se guardan). */
reelsRouter.post('/cards/preview', json, async (req, res) => {
  const body = validate(cardsPreviewBody, req.body);
  const brand = await cardInput();
  const [intro, outro] = await Promise.all([
    renderIntroCard({ ...brand, aspectRatio: body.aspectRatio }),
    renderOutroCard({
      ...brand,
      aspectRatio: body.aspectRatio,
      cta: body.cta,
      contact: body.contact,
    }),
  ]);
  res.json({ intro: toInline(intro), outro: toInline(outro) });
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
  const { confirmed, duplicatedFrom, ...request } = validate(generateBody, req.body);
  void confirmed;
  const settings = await readVideoSettings();
  const avatarScenes = request.scenes.filter((scene) => scene.kind === 'avatar');
  const authorized = await assertAvatarsAuthorized(
    avatarScenes.map((scene) => scene.avatarId),
    settings.authorizations,
  );
  const avatars = new Map(authorized.map((avatar) => [avatar.id, avatar]));
  const lowQuality = authorized.find((avatar) => !hasQualityEngine(avatar));
  if (lowQuality) {
    throw badRequest(
      `El avatar "${lowQuality.name}" solo admite Avatar III. Elige uno compatible con Avatar IV o V.`,
    );
  }

  // Edición automática: el agente de HeyGen arma el video. Primero prepara un storyboard y no
  // genera nada hasta que el usuario lo aprueba.
  if (request.style === 'agent') {
    const spec = { ...request, cards: null };
    const prompt = buildAgentPrompt(spec, {
      complianceRules: settings.complianceRules,
      hasLogoFile: Boolean(await readLogo()),
      logo: settings.logo,
      partners: (await readIdentity()).partners,
    });
    const job = newJob(spec, duplicatedFrom, {
      sessionId: null,
      prompt,
      progress: null,
      messages: [],
      storyboard: [],
      edits: [],
    });
    await store.save(job);
    runner.enqueue(job.id);
    res.status(202).json({ job: publicJob(job) });
    return;
  }

  // Por escenas: cada escena de apoyo lleva su imagen generada.
  if (request.scenes.some((scene) => scene.kind === 'broll' && !scene.imageId)) {
    throw badRequest('Genera la imagen de apoyo de cada escena.');
  }

  // Tomas variadas del mismo presentador (opcional).
  let scenes = request.scenes;
  if (request.varyLooks) {
    const varied = await varyLooks(scenes, avatars);
    scenes = varied.scenes;
    for (const [id, look] of varied.looks) if (!avatars.has(id)) avatars.set(id, look);
  }

  // Cada escena usa el mejor motor que su avatar admite (Avatar V o IV) y
  // gestos solo si el avatar y el motor los admiten.
  scenes = scenes.map((scene) => {
    const avatar = scene.kind === 'avatar' ? avatars.get(scene.avatarId) : undefined;
    const engine = avatar ? pickEngine(avatar.engines) : null;
    const motionPrompt =
      avatar && scene.gestures && supportsMotionPrompt(avatar.type, engine) ? scene.gestures : null;
    return { ...scene, engine, motionPrompt };
  });

  // Tarjetas de marca con el logo real (estilo dinámico).
  let cards = null;
  if (request.style === 'dynamic' && (request.brandCards.intro || request.brandCards.outro)) {
    const brand = await cardInput();
    const aspectRatio = request.aspectRatio;
    cards = {
      introImageId: request.brandCards.intro
        ? await saveImage(await renderIntroCard({ ...brand, aspectRatio }), 'image/png')
        : null,
      outroImageId:
        request.brandCards.outro && request.cta
          ? await saveImage(
              await renderOutroCard({
                ...brand,
                aspectRatio,
                cta: request.cta,
                contact: request.contact ?? { email: '', website: '', whatsapp: '' },
              }),
              'image/png',
            )
          : null,
    };
  }

  const spec = { ...request, scenes, cards };

  // Las imágenes de apoyo deben existir antes de encolar.
  for (const scene of spec.scenes) {
    if (scene.kind === 'broll' && scene.imageId) {
      await loadBackground({ type: 'generated', imageId: scene.imageId });
    }
  }

  // Los fondos de imagen deben existir antes de encolar, para fallar aquí y no a mitad del render.
  for (const scene of spec.scenes) {
    if (scene.background.type === 'brandImage' || scene.background.type === 'generated') {
      await loadBackground(scene.background);
    }
  }

  const job = newJob(spec, duplicatedFrom, null);
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

const agentMessageBody = z
  .object({
    /** true = aprobar el storyboard y generar el video (consume saldo). */
    approve: z.boolean(),
    message: z.string().trim().max(2000).default(''),
    confirmed: z.literal(true).optional(),
  })
  .refine((body) => !body.approve || body.confirmed, {
    message: 'Confirma la generación del video.',
  })
  .refine((body) => body.approve || body.message.length >= 3, {
    message: 'Escribe qué quieres cambiar.',
  });

const APPROVAL_MESSAGE =
  'Approved. Generate the video now exactly as planned, following the script word for word.';

/**
 * Vista previa del prompt exacto que se enviará al agente de HeyGen. No envía nada: sirve para
 * revisar el dinamismo, los textos en pantalla y las reglas antes de gastar saldo.
 */
reelsRouter.post('/agent/preview', json, async (req, res) => {
  const spec = validate(videoSpecSchema, req.body);
  const settings = await readVideoSettings();
  res.json({
    prompt: buildAgentPrompt(spec, {
      complianceRules: settings.complianceRules,
      hasLogoFile: Boolean(await readLogo()),
      logo: settings.logo,
      partners: (await readIdentity()).partners,
    }),
  });
});

/** Revisión del storyboard del agente: pedir cambios o aprobar y generar. Solo desde este equipo. */
reelsRouter.post('/jobs/:id/agent-message', localOnly, json, async (req, res) => {
  const { id } = validate(idParams, req.params);
  const body = validate(agentMessageBody, req.body);
  const job = await findJob(id);
  if (job.status !== 'reviewing' || !job.agent?.sessionId) {
    throw badRequest('Este video no está esperando revisión.');
  }

  const message = body.approve
    ? body.message
      ? `${APPROVAL_MESSAGE} ${body.message}`
      : APPROVAL_MESSAGE
    : body.message;
  // Enviar un mensaje no es idempotente: no se reintenta automáticamente.
  await getVideoProvider().sendAgentMessage(job.agent.sessionId, message);

  const updated = await store.update(id, {
    status: 'drafting',
    agent: {
      ...job.agent,
      storyboard: body.approve ? job.agent.storyboard : [],
      messages: [
        { role: 'user', content: message, createdAt: Math.floor(Date.now() / 1000) },
        ...job.agent.messages,
      ],
    },
  });
  runner.enqueue(id);
  res.json({ job: publicJob(updated) });
});

const KEEP_THE_REST = 'Mantén exactamente igual todo lo que no se menciona aquí.';

/** Un video del agente terminado admite cambios por escena sobre la misma sesión. */
const editableAgentJob = async (id: string) => {
  const job = await findJob(id);
  const sessionId = job.agent?.sessionId;
  if (job.spec.style !== 'agent' || !sessionId || !job.providerVideoId) {
    throw badRequest('Solo los videos de edición automática admiten cambios por escena.');
  }
  if (job.status !== 'completed') throw badRequest('Espera a que el video termine.');
  return { job, sessionId, videoId: job.providerVideoId };
};

/** Escenas del video tal como están ahora en HeyGen (lectura). */
reelsRouter.get('/jobs/:id/scenes', async (req, res) => {
  const { id } = validate(idParams, req.params);
  const { videoId } = await editableAgentJob(id);
  res.json(await getVideoProvider().getVideoScenes(videoId));
});

const sceneEditsBody = z.object({
  snapshotVideoId: z.string().trim().min(1).max(200),
  editVersion: z.string().regex(/^[0-9a-f]{64}$/, 'Vuelve a cargar las escenas.'),
  edits: z
    .array(
      z.object({
        sceneId: z.string().trim().min(1).max(255),
        /** Número de la escena (1, 2, …) para el historial. */
        scene: z.number().int().min(1).max(50),
        text: z.string().trim().min(3, 'Describe el cambio.').max(2000),
      }),
    )
    .min(1, 'Elige al menos una escena.')
    .max(50),
});

/**
 * Cambios por escena ("Edit Scenes" de HeyGen): solo cambian las escenas indicadas y el resto
 * queda igual. Genera un video nuevo (cuesta créditos). Solo desde este equipo.
 */
reelsRouter.post('/jobs/:id/scene-edits', localOnly, json, async (req, res) => {
  const { id } = validate(idParams, req.params);
  const body = validate(sceneEditsBody, req.body);
  const { job, sessionId, videoId } = await editableAgentJob(id);
  if (body.snapshotVideoId !== videoId) {
    throw new AppError(409, 'El video cambió. Vuelve a cargar las escenas.', 'STALE_SCENES');
  }

  let newVideoId: string;
  try {
    newVideoId = await getVideoProvider().editAgentScenes(
      sessionId,
      body.edits.map((edit) => ({
        sceneId: edit.sceneId,
        // Que el agente no "aproveche" para cambiar otras cosas de la escena.
        text: `${edit.text}\n\n${KEEP_THE_REST}`,
        snapshotVideoId: body.snapshotVideoId,
        editVersion: body.editVersion,
      })),
      randomUUID(),
    );
  } catch (error) {
    if (error instanceof VideoProviderError && error.status === 409) {
      throw new AppError(409, 'El video cambió. Vuelve a cargar las escenas.', 'STALE_SCENES');
    }
    throw error;
  }

  const agent = job.agent!;
  const updated = await store.update(id, {
    providerVideoId: newVideoId,
    status: 'processing',
    error: null,
    agent: {
      ...agent,
      edits: [
        {
          at: new Date().toISOString(),
          items: body.edits.map(({ scene, text }) => ({ scene, text })),
        },
        ...agent.edits,
      ],
    },
  });
  runner.enqueue(id);
  res.json({ job: publicJob(updated) });
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
