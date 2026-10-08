import { Router } from 'express';
import multer from 'multer';
import { badRequest } from '../http/errors.js';
import { localOnly } from '../http/localOnly.js';
import {
  LOGO_TYPES,
  isComplete,
  readLogo,
  readMarkdown,
  readMeta,
  saveBrand,
  type BrandUpload,
  type LogoMimeType,
} from './contextStore.js';

const MAX_MARKDOWN_BYTES = 300 * 1024;
const MAX_LOGO_BYTES = 5 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_LOGO_BYTES, files: 3 },
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
  const [meta, company, design] = await Promise.all([
    readMeta(),
    readMarkdown('company'),
    readMarkdown('design'),
  ]);
  res.json({
    complete: isComplete(meta),
    company: meta.company ? { ...meta.company, content: company ?? '' } : null,
    design: meta.design ? { ...meta.design, content: design ?? '' } : null,
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
    { name: 'logo', maxCount: 1 },
  ]),
  async (req, res) => {
    const files = (req.files ?? {}) as Record<string, Express.Multer.File[] | undefined>;
    const logo = files.logo?.[0];

    const payload: BrandUpload = {
      company: readMarkdownFile(files.company?.[0], 'La información de la empresa'),
      design: readMarkdownFile(files.design?.[0], 'Los lineamientos de diseño'),
    };

    if (logo) {
      if (!isLogoType(logo.mimetype)) throw badRequest('El logo debe ser PNG, JPG o WebP.');
      payload.logo = { fileName: logo.originalname, mimeType: logo.mimetype, data: logo.buffer };
    }

    if (!payload.company && !payload.design && !payload.logo) {
      throw badRequest('Adjunta al menos un archivo.');
    }

    const meta = await saveBrand(payload);
    res.json({ complete: isComplete(meta) });
  },
);
