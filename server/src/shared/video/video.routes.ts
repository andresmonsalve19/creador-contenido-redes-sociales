import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { TEMPLATES_DIR } from '../config/paths.js';
import { badRequest } from '../http/errors.js';
import { localOnly } from '../http/localOnly.js';
import { validate } from '../http/validate.js';
import { assertAvatarsAuthorized } from './authorization.js';
import { randomUUID } from 'node:crypto';
import { readMarkdown } from '../brandContext/contextStore.js';
import { paletteFrom, suggestColorRoles, websiteFrom } from './brandSuggestions.js';
import {
  forgetBrandKits,
  getVideoProvider,
  listAvatars,
  listBrandKits,
  listVoices,
} from './index.js';
import { BRAND_COLOR_ROLES } from './types.js';
import { videoSettingsSchema } from './videoSettings.schema.js';
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
  const settings = validate(videoSettingsSchema, req.body);
  const avatarIds = [settings.defaultAvatarId, ...settings.favoriteAvatarIds].filter(
    (id): id is string => Boolean(id),
  );
  if (avatarIds.length > 0) await assertAvatarsAuthorized(avatarIds, settings.authorizations);
  res.json({ settings: await saveVideoSettings(settings) });
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

videoRouter.get('/avatars', async (_req, res) => {
  res.json({ avatars: await listAvatars() });
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

videoRouter.get('/account', async (_req, res) => {
  res.json({ account: await getVideoProvider().getAccount() });
});
