import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { TEMPLATES_DIR } from '../config/paths.js';
import { badRequest } from '../http/errors.js';
import { localOnly } from '../http/localOnly.js';
import { validate } from '../http/validate.js';
import { assertAvatarsAuthorized } from './authorization.js';
import { getVideoProvider, listAvatars, listVoices } from './index.js';
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

videoRouter.get('/account', async (_req, res) => {
  res.json({ account: await getVideoProvider().getAccount() });
});
