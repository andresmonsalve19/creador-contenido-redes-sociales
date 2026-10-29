import express, { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { badRequest } from '../http/errors.js';
import { AppError } from '../http/errors.js';
import { localOnly } from '../http/localOnly.js';
import { validate } from '../http/validate.js';
import { paletteFrom } from '../video/brandSuggestions.js';
import {
  PARTNER_USAGES,
  addPartner,
  identityTextSchema,
  isPartnerLogoType,
  readIdentity,
  readPartnerLogo,
  removePartner,
  saveIdentityText,
  updatePartner,
  type Identity,
} from './identityStore.js';
import { listVersions, readVersion } from './brandHistory.js';
import {
  LOGO_TYPES,
  isComplete,
  readLogo,
  readMarkdown,
  readMeta,
  restoreVersion,
  saveBrand,
  saveMarkdown,
  type BrandUpload,
  type LogoMimeType,
} from './contextStore.js';

const MAX_MARKDOWN_BYTES = 300 * 1024;
const MAX_LOGO_BYTES = 5 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_LOGO_BYTES, files: 4 },
});

const isLogoType = (mime: string): mime is LogoMimeType => mime in LOGO_TYPES;

function readMarkdownFile(file: Express.Multer.File | undefined, label: string) {
  if (!file) return undefined;
  if (!/\.(md|markdown)$/i.test(file.originalname)) {
    throw badRequest(`${label} debe ser un archivo Markdown (.md).`);
  }
  if (file.size > MAX_MARKDOWN_BYTES) throw badRequest(`${label} supera los 300 KB.`);
  const content = file.buffer.toString('utf8').trim();
  if (!content) throw badRequest(`${label} está vacío.`);
  return { fileName: file.originalname, content };
}

export const contextRouter = Router();

contextRouter.get('/', async (_req, res) => {
  const [meta, company, design, videoGuidelines] = await Promise.all([
    readMeta(),
    readMarkdown('company'),
    readMarkdown('design'),
    readMarkdown('videoGuidelines'),
  ]);
  res.json({
    complete: isComplete(meta),
    company: meta.company ? { ...meta.company, content: company ?? '' } : null,
    design: meta.design ? { ...meta.design, content: design ?? '' } : null,
    videoGuidelines: meta.videoGuidelines
      ? { ...meta.videoGuidelines, content: videoGuidelines ?? '' }
      : null,
    logo: meta.logo
      ? { ...meta.logo, url: `/api/context/logo?v=${encodeURIComponent(meta.logo.updatedAt)}` }
      : null,
  });
});

contextRouter.get('/logo', async (_req, res) => {
  const logo = await readLogo();
  if (!logo) {
    res.status(404).end();
    return;
  }
  res
    .type(logo.mimeType)
    .set('Cache-Control', 'private, max-age=31536000, immutable')
    .send(logo.data);
});

contextRouter.put(
  '/',
  localOnly,
  upload.fields([
    { name: 'company', maxCount: 1 },
    { name: 'design', maxCount: 1 },
    { name: 'videoGuidelines', maxCount: 1 },
    { name: 'logo', maxCount: 1 },
  ]),
  async (req, res) => {
    const files = (req.files ?? {}) as Record<string, Express.Multer.File[] | undefined>;
    const logo = files.logo?.[0];

    const payload: BrandUpload = {
      company: readMarkdownFile(files.company?.[0], 'La información de la empresa'),
      design: readMarkdownFile(files.design?.[0], 'Los lineamientos de diseño'),
      videoGuidelines: readMarkdownFile(files.videoGuidelines?.[0], 'Los lineamientos de video'),
    };

    if (logo) {
      if (!isLogoType(logo.mimetype)) throw badRequest('El logo debe ser PNG, JPG o WebP.');
      payload.logo = { fileName: logo.originalname, mimeType: logo.mimetype, data: logo.buffer };
    }

    if (!payload.company && !payload.design && !payload.videoGuidelines && !payload.logo) {
      throw badRequest('Adjunta al menos un archivo.');
    }

    const meta = await saveBrand(payload);
    res.json({ complete: isComplete(meta) });
  },
);

// --- Kit de marca: slogans, frases, identidad y logos de asociaciones ------------------------

const json = express.json({ limit: '100kb' });

/** Lo que ve el cliente: cada logo de asociación con su URL. */
const publicIdentity = (identity: Identity) => ({
  ...identity,
  partners: identity.partners.map((partner) => ({
    ...partner,
    logoUrl: `/api/context/identity/partners/${partner.id}/logo?v=${encodeURIComponent(partner.updatedAt)}`,
  })),
});

contextRouter.get('/identity', async (_req, res) => {
  const [identity, design] = await Promise.all([readIdentity(), readMarkdown('design')]);
  // Los colores salen de los lineamientos de diseño: se muestran para tenerlos a la vista.
  res.json({ identity: publicIdentity(identity), palette: paletteFrom(design ?? '') });
});

contextRouter.put('/identity', localOnly, json, async (req, res) => {
  const text = validate(identityTextSchema, req.body);
  const { identity, backupId } = await saveIdentityText(text);
  res.json({ identity: publicIdentity(identity), backupId });
});

const partnerFields = z.object({
  name: z.string().trim().min(2, 'Escribe el nombre de la asociación.').max(120),
  usage: z.enum(PARTNER_USAGES),
});
const partnerParams = z.object({ id: z.uuid('Ese logo no existe.') });

contextRouter.post('/identity/partners', localOnly, upload.single('logo'), async (req, res) => {
  const file = req.file;
  if (!file) throw badRequest('Adjunta el logo de la asociación.');
  if (!isPartnerLogoType(file.mimetype)) throw badRequest('El logo debe ser PNG o JPG.');
  const fields = validate(partnerFields, req.body);
  try {
    const identity = await addPartner({ ...fields, mimeType: file.mimetype, data: file.buffer });
    res.status(201).json({ identity: publicIdentity(identity) });
  } catch (error) {
    throw badRequest(error instanceof Error ? error.message : 'No se pudo guardar el logo.');
  }
});

contextRouter.patch('/identity/partners/:id', localOnly, json, async (req, res) => {
  const { id } = validate(partnerParams, req.params);
  const identity = await updatePartner(id, validate(partnerFields, req.body));
  if (!identity) throw new AppError(404, 'Ese logo no existe.', 'NOT_FOUND');
  res.json({ identity: publicIdentity(identity) });
});

contextRouter.delete('/identity/partners/:id', localOnly, async (req, res) => {
  const { id } = validate(partnerParams, req.params);
  res.json({ identity: publicIdentity(await removePartner(id)) });
});

contextRouter.get('/identity/partners/:id/logo', async (req, res) => {
  const { id } = validate(partnerParams, req.params);
  const partner = (await readIdentity()).partners.find((p) => p.id === id);
  const data = partner ? await readPartnerLogo(partner) : null;
  if (!partner || !data) throw new AppError(404, 'Ese logo no existe.', 'NOT_FOUND');
  res
    .type(partner.mimeType)
    .set('Cache-Control', 'private, max-age=31536000, immutable')
    .send(data);
});

// --- Edición de los archivos de marca (p. ej. mejorados por Claude) e historial --------------

const markdownBody = z.object({
  content: z
    .string()
    .trim()
    .min(50, 'El archivo quedó casi vacío.')
    .refine(
      (text) => Buffer.byteLength(text) <= MAX_MARKDOWN_BYTES,
      'El archivo supera los 300 KB.',
    ),
});
const kindParams = z.object({ kind: z.enum(['company', 'design', 'videoGuidelines']) });

/** Reemplaza un archivo de marca. Antes guarda una copia del actual (devuelve su id). */
contextRouter.put(
  '/markdown/:kind',
  localOnly,
  express.json({ limit: '400kb' }),
  async (req, res) => {
    const { kind } = validate(kindParams, req.params);
    const { content } = validate(markdownBody, req.body);
    res.json({ backupId: await saveMarkdown(kind, content) });
  },
);

contextRouter.get('/versions', async (_req, res) => {
  res.json({ versions: await listVersions() });
});

const versionParams = z.object({
  id: z.string().regex(/^[\w.-]{1,80}$/, 'Esa versión no existe.'),
});

contextRouter.get('/versions/:id', async (req, res) => {
  const { id } = validate(versionParams, req.params);
  const version = await readVersion(id);
  if (!version) throw new AppError(404, 'Esa versión no existe.', 'NOT_FOUND');
  res.json(version);
});

contextRouter.post('/versions/:id/restore', localOnly, async (req, res) => {
  const { id } = validate(versionParams, req.params);
  const restored = await restoreVersion(id);
  if (!restored) throw new AppError(404, 'Esa versión no existe.', 'NOT_FOUND');
  res.json(restored);
});
