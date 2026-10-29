import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { TEMPLATES_DIR } from '../config/paths.js';
import { AppError, badRequest } from '../http/errors.js';
import { localOnly } from '../http/localOnly.js';
import { validate } from '../http/validate.js';
import { assertAvatarsAuthorized } from './authorization.js';
import { randomUUID } from 'node:crypto';
import { readMarkdown } from '../brandContext/contextStore.js';
import { paletteFrom, suggestColorRoles, voiceHintFrom, websiteFrom } from './brandSuggestions.js';
import {
  forgetAvatars,
  forgetBrandKits,
  getVideoProvider,
  listAvatars,
  listBrandKits,
  listVoices,
} from './index.js';
import { addTwin, readTwins } from './twinStore.js';
import { BRAND_COLOR_ROLES, hasQualityEngine, type TwinVideoMimeType } from './types.js';
import { avatarAuthorizationSchema, videoSettingsSchema } from './videoSettings.schema.js';
import { englishVoicePrompt, VOICE_ACCENTS, type VoiceAccent } from './voiceDesign.js';
import {
  BACKGROUND_TYPES,
  readBackgroundImage,
  readBackgroundMeta,
  readVideoSettings,
  saveBackgroundImage,
  saveVideoSettings,
  type BackgroundMimeType,
} from './videoSettingsStore.js';

const MAX_BACKGROUND_BYTES = 10 * 1024 * 1024;
const TEMPLATE_FILE = 'lineamientos-video.md';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BACKGROUND_BYTES, files: 1 },
});

const voicesQuery = z.object({ language: z.string().trim().max(60).optional() });

const isBackgroundType = (mime: string): mime is BackgroundMimeType => mime in BACKGROUND_TYPES;

/** Funciones de video comunes a cualquier módulo: configuración de la marca y catálogo del proveedor. */
export const videoRouter = Router();

videoRouter.get('/settings', async (_req, res) => {
  const [settings, background] = await Promise.all([readVideoSettings(), readBackgroundMeta()]);
  res.json({
    settings,
    backgroundImage: background
      ? {
          ...background,
          url: `/api/video/background?v=${encodeURIComponent(background.updatedAt)}`,
        }
      : null,
  });
});

videoRouter.put('/settings', localOnly, async (req, res) => {
  const received = validate(videoSettingsSchema, req.body);
  // Las autorizaciones de los gemelos digitales se registran al crearlos: se conservan aunque el
  // formulario solo envíe las de los avatares seleccionados.
  const [stored, twins] = await Promise.all([readVideoSettings(), readTwins()]);
  const twinAuthorizations = Object.fromEntries(
    twins.flatMap((twin) => {
      const auth = stored.authorizations[twin.lookId];
      return auth ? [[twin.lookId, auth] as const] : [];
    }),
  );
  const settings = {
    ...received,
    // El kit de HeyGen y el logo se editan en el paso "Kit de marca" (PATCH /settings/brand).
    brandKitId: stored.brandKitId,
    logo: stored.logo,
    authorizations: { ...twinAuthorizations, ...received.authorizations },
  };
  const avatarIds = [settings.defaultAvatarId, ...settings.favoriteAvatarIds].filter(
    (id): id is string => Boolean(id),
  );
  if (avatarIds.length > 0) await assertAvatarsAuthorized(avatarIds, settings.authorizations);
  res.json({ settings: await saveVideoSettings(settings) });
});

const brandSettingsBody = videoSettingsSchema.pick({ brandKitId: true, logo: true });

/** Kit de marca de HeyGen y ubicación del logo (paso "Kit de marca"). */
videoRouter.patch('/settings/brand', localOnly, async (req, res) => {
  const brand = validate(brandSettingsBody, req.body);
  res.json({ settings: await saveVideoSettings({ ...(await readVideoSettings()), ...brand }) });
});

videoRouter.get('/background', async (_req, res) => {
  const image = await readBackgroundImage();
  if (!image) {
    res.status(404).end();
    return;
  }
  res
    .type(image.mimeType)
    .set('Cache-Control', 'private, max-age=31536000, immutable')
    .send(image.data);
});

videoRouter.put('/background', localOnly, upload.single('background'), async (req, res) => {
  const file = req.file;
  if (!file) throw badRequest('Adjunta una imagen de fondo.');
  // HeyGen solo acepta PNG o JPEG como fondo.
  if (!isBackgroundType(file.mimetype)) throw badRequest('El fondo debe ser PNG o JPG.');
  const meta = await saveBackgroundImage(file.originalname, file.mimetype, file.buffer);
  res.json({ backgroundImage: meta });
});

/** Plantilla genérica de lineamientos de video, sin datos de ninguna empresa. */
videoRouter.get('/template', (_req, res) => {
  res.download(path.join(TEMPLATES_DIR, TEMPLATE_FILE), TEMPLATE_FILE);
});

// Solo avatares con Avatar IV o V: Avatar III no se usa.
videoRouter.get('/avatars', async (_req, res) => {
  res.json({ avatars: (await listAvatars()).filter(hasQualityEngine) });
});

videoRouter.get('/voices', async (req, res) => {
  const { language } = validate(voicesQuery, req.query);
  res.json({ voices: await listVoices(language || undefined) });
});

videoRouter.get('/brand-kits', async (_req, res) => {
  res.json({ brandKits: await listBrandKits() });
});

/** Sugerencias para crear el kit: sitio web de la empresa y colores por rol de los lineamientos. */
videoRouter.get('/brand-kits/suggestions', async (_req, res) => {
  const [company, design] = await Promise.all([readMarkdown('company'), readMarkdown('design')]);
  const palette = paletteFrom(design ?? '');
  res.json({
    website: websiteFrom(company ?? ''),
    palette,
    colorRoles: suggestColorRoles(palette),
  });
});

const createKitBody = z.object({
  url: z.url({ protocol: /^https?$/, message: 'Escribe la dirección completa del sitio web.' }),
  name: z.string().trim().min(1).max(256),
});

/** Crea un kit importando el sitio web público de la marca. Solo desde este equipo. */
videoRouter.post('/brand-kits', localOnly, async (req, res) => {
  const { url, name } = validate(createKitBody, req.body);
  const id = await getVideoProvider().createBrandKitFromUrl(url, name, randomUUID());
  forgetBrandKits();
  res.status(201).json({ brandKit: await getVideoProvider().getBrandKit(id) });
});

const kitParams = z.object({ id: z.string().trim().min(1).max(200) });

videoRouter.get('/brand-kits/:id', async (req, res) => {
  const { id } = validate(kitParams, req.params);
  res.json({ brandKit: await getVideoProvider().getBrandKit(id) });
});

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Usa colores en formato HEX.');
const updateKitBody = z.object({
  colorRoles: z.object(Object.fromEntries(BRAND_COLOR_ROLES.map((role) => [role, hex.optional()]))),
  primaryLogoId: z.string().trim().min(1).max(200).optional(),
});

/** Fija los colores exactos y el logo principal del kit. Solo desde este equipo. */
videoRouter.patch('/brand-kits/:id', localOnly, async (req, res) => {
  const { id } = validate(kitParams, req.params);
  const body = validate(updateKitBody, req.body);
  const brandKit = await getVideoProvider().updateBrandKit(id, {
    colorRoles: body.colorRoles as Record<string, string>,
    primaryLogoId: body.primaryLogoId,
  });
  forgetBrandKits();
  res.json({ brandKit });
});

/** Descripción sugerida para buscar la voz, tomada de los lineamientos de video. */
videoRouter.get('/voices/suggestion', async (_req, res) => {
  res.json(voiceHintFrom(await readMarkdown('videoGuidelines')));
});

const designBody = z.object({
  prompt: z.string().trim().min(3, 'Describe la voz que buscas.').max(1000),
  gender: z.enum(['female', 'male']).optional(),
  accent: z.enum(Object.keys(VOICE_ACCENTS) as [VoiceAccent, ...VoiceAccent[]]).optional(),
  seed: z.number().int().min(0).max(50).default(0),
});

/**
 * "Design a Voice" de HeyGen: CREA hasta 3 voces nuevas en la cuenta (ocupan cupo de voces
 * personalizadas). La descripción se traduce antes al inglés. Solo desde este equipo.
 */
videoRouter.post('/voices/design', localOnly, async (req, res) => {
  const { prompt, gender, accent, seed } = validate(designBody, req.body);
  const english = await englishVoicePrompt(prompt, accent);
  const voices = await getVideoProvider().designVoices({ prompt: english, gender, seed });
  res.json({ voices, seed, prompt: english });
});

const voiceParams = z.object({ id: z.string().trim().min(1).max(200) });

/** Una voz por su id (la voz original de un avatar puede no estar en la lista del idioma). */
videoRouter.get('/voices/:id', async (req, res) => {
  const { id } = validate(voiceParams, req.params);
  res.json({ voice: await getVideoProvider().getVoice(id) });
});

const avatarParams = z.object({ id: z.string().trim().min(1).max(200) });

/** Otros looks (otra ropa, pose o fondo) del mismo avatar, compatibles con Avatar IV o V. */
videoRouter.get('/avatars/:id/looks', async (req, res) => {
  const { id } = validate(avatarParams, req.params);
  const avatar = (await listAvatars()).find((item) => item.id === id);
  if (!avatar)
    throw new AppError(404, 'Ese avatar no existe o no admite Avatar IV o V.', 'NOT_FOUND');
  const looks = avatar.groupId
    ? (await getVideoProvider().listGroupLooks(avatar.groupId)).filter(hasQualityEngine)
    : [avatar];
  res.json({ avatar, looks });
});

const newLookBody = z.object({
  description: z.string().trim().min(5, 'Describe la ropa o el estilo.').max(1000),
  name: z.string().trim().min(2).max(80),
  aspectRatio: z.enum(['9:16', '16:9', '1:1', 'auto']).default('9:16'),
});

/**
 * Ropa nueva para un avatar propio (gemelo digital o de foto): HeyGen crea otro look de la misma
 * persona a partir de la descripción. Los avatares de stock no se pueden vestir distinto.
 * La autorización de imagen de la persona se copia al look nuevo. Solo desde este equipo.
 */
videoRouter.post('/avatars/:id/looks', localOnly, async (req, res) => {
  const { id } = validate(avatarParams, req.params);
  const { description, name, aspectRatio } = validate(newLookBody, req.body);
  const avatar = (await listAvatars()).find((item) => item.id === id);
  if (!avatar) throw new AppError(404, 'Ese avatar no existe.', 'NOT_FOUND');
  if (avatar.ownership !== 'private') {
    throw badRequest(
      'Los avatares de HeyGen (stock) no se pueden vestir distinto: elige otro de sus looks o usa un avatar propio.',
    );
  }
  const lookId = await getVideoProvider().createLookFromPrompt(
    id,
    name,
    description,
    aspectRatio,
    randomUUID(),
  );
  const settings = await readVideoSettings();
  const authorization = settings.authorizations[id];
  if (authorization) {
    await saveVideoSettings({
      ...settings,
      authorizations: { ...settings.authorizations, [lookId]: authorization },
    });
  }
  forgetAvatars();
  res.status(201).json({ lookId });
});

const lookParams = z.object({ id: z.string().trim().min(1).max(200) });

videoRouter.get('/looks/:id', async (req, res) => {
  const { id } = validate(lookParams, req.params);
  const look = await getVideoProvider().getLookState(id);
  if (look.status === 'completed') forgetAvatars();
  res.json({ look });
});

/** Video para entrenar un gemelo digital: hasta 200 MB (límite de subida directa de HeyGen). */
const MAX_TWIN_BYTES = 200 * 1024 * 1024;
const TWIN_TYPES: readonly TwinVideoMimeType[] = ['video/mp4', 'video/webm'];
const twinUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_TWIN_BYTES, files: 1 },
});

const twinBody = z.object({
  name: z.string().trim().min(2, 'Escribe un nombre para el avatar.').max(80),
  authorization: avatarAuthorizationSchema,
});

/** Gemelos digitales creados desde la app, con su estado en HeyGen. */
videoRouter.get('/twins', async (_req, res) => {
  const provider = getVideoProvider();
  const twins = await Promise.all(
    (await readTwins()).map(async (twin) => {
      try {
        return { ...twin, state: await provider.getDigitalTwin(twin.lookId, twin.groupId) };
      } catch {
        return { ...twin, state: null };
      }
    }),
  );
  // Al terminar, el avatar aparece en la lista: se olvida la copia guardada.
  if (twins.some((twin) => twin.state?.status === 'completed')) forgetAvatars();
  res.json({ twins });
});

/**
 * Crea un gemelo digital: sube el video, lo entrena y registra la autorización escrita de la
 * persona. HeyGen clona su voz de la misma grabación. Solo desde este equipo.
 */
videoRouter.post('/twins', localOnly, twinUpload.single('footage'), async (req, res) => {
  const file = req.file;
  if (!file) throw badRequest('Adjunta el video de la persona.');
  const mimeType = TWIN_TYPES.find((type) => type === file.mimetype);
  if (!mimeType) throw badRequest('El video debe ser MP4 o WebM.');
  const { name, authorization } = validate(twinBody, {
    name: req.body?.name,
    authorization: {
      confirmed: req.body?.confirmed === 'true',
      personName: req.body?.personName,
      date: req.body?.date,
    },
  });

  const provider = getVideoProvider();
  const assetId = await provider.uploadVideo(file.buffer, mimeType, file.originalname);
  const created = await provider.createDigitalTwin(name, assetId, randomUUID());
  await addTwin({ ...created, name, createdAt: new Date().toISOString() });

  // La autorización queda registrada para el look nuevo (la app la exige para avatares propios).
  const settings = await readVideoSettings();
  await saveVideoSettings({
    ...settings,
    authorizations: { ...settings.authorizations, [created.lookId]: authorization },
  });
  forgetAvatars();
  res.status(201).json({ twin: { ...created, name } });
});

const groupParams = z.object({ groupId: z.string().trim().min(1).max(200) });

/** Enlace para que la persona grabe su consentimiento (válido 24 horas). */
videoRouter.post('/twins/:groupId/consent', localOnly, async (req, res) => {
  const { groupId } = validate(groupParams, req.params);
  if (!(await readTwins()).some((twin) => twin.groupId === groupId)) {
    throw badRequest('Ese avatar no se creó desde esta app.');
  }
  res.json({ url: await getVideoProvider().requestTwinConsent(groupId) });
});

/** Videos de la cuenta de HeyGen (también los hechos en su web). Las URLs expiran pronto. */
videoRouter.get('/account-videos', async (_req, res) => {
  res.json({ videos: await getVideoProvider().listAccountVideos() });
});

videoRouter.get('/account', async (_req, res) => {
  res.json({ account: await getVideoProvider().getAccount() });
});
