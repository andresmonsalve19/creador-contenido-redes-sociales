import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { z } from 'zod';
import { AppError, badRequest } from '../http/errors.js';
import { localOnly } from '../http/localOnly.js';
import { validate } from '../http/validate.js';
import {
  getLibraryStore,
  isLibraryImageType,
  newLibraryId,
  type LibraryImageType,
  type LibraryItem,
} from './libraryStore.js';

const MAX_IMPORT_BYTES = 15 * 1024 * 1024;
const MAX_IMPORT_FILES = 20;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMPORT_BYTES, files: MAX_IMPORT_FILES },
});

/** Lo que ve el cliente: cada imagen con su URL (versionada para no mostrar una copia vieja). */
export const publicItem = (item: LibraryItem) => ({
  ...item,
  slides: item.slides.map(({ file: _file, ...slide }) => ({
    ...slide,
    url: `/api/library/${item.id}/${slide.index}?v=${encodeURIComponent(slide.updatedAt)}`,
  })),
});

export const libraryRouter = Router();

libraryRouter.get('/', async (_req, res) => {
  res.json({ items: (await getLibraryStore().list()).map(publicItem) });
});

const slideParams = z.object({
  id: z.uuid('Esa pieza no existe.'),
  index: z.coerce.number().int().min(0).max(50),
});

const previewQuery = z.object({ preview: z.coerce.number().int().min(128).max(2048).optional() });

libraryRouter.get('/:id/:index', async (req, res) => {
  const { id, index } = validate(slideParams, req.params);
  const file = await getLibraryStore().slideFile(id, index);
  if (!file) throw new AppError(404, 'Esa imagen no existe.', 'NOT_FOUND');
  res.set('Cache-Control', 'private, max-age=31536000, immutable');
  // Vista previa reducida en JPEG (la usa el servidor MCP de Claude, que no procesa imágenes).
  const { preview } = validate(previewQuery, req.query);
  if (preview) {
    const jpeg = await sharp(file.path)
      .resize({ width: preview, height: preview, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
    res.type('image/jpeg').send(jpeg);
  } else if (req.query.download === '1') {
    res.download(file.path, `${String(index + 1).padStart(2, '0')}${path.extname(file.path)}`);
  } else {
    res.type(file.mimeType).sendFile(file.path);
  }
});

const idParams = z.object({ id: z.uuid('Esa pieza no existe.') });

libraryRouter.delete('/:id', localOnly, async (req, res) => {
  const { id } = validate(idParams, req.params);
  await getLibraryStore().remove(id);
  res.status(204).end();
});

/** Importa imágenes que ya tienes (p. ej. descargas anteriores): una pieza por archivo. */
libraryRouter.post(
  '/import',
  localOnly,
  upload.array('images', MAX_IMPORT_FILES),
  async (req, res) => {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (files.length === 0) throw badRequest('Elige al menos una imagen.');
    const invalid = files.find((file) => !isLibraryImageType(file.mimetype));
    if (invalid) throw badRequest(`"${invalid.originalname}" no es PNG, JPG ni WebP.`);

    const store = getLibraryStore();
    const items = [];
    for (const file of files) {
      items.push(
        await store.saveSlide({
          id: newLibraryId(),
          kind: 'import',
          source: 'import',
          title: path.parse(file.originalname).name.slice(0, 120) || 'Imagen importada',
          caption: '',
          aspectRatio: null,
          index: 0,
          mimeType: file.mimetype as LibraryImageType,
          data: file.buffer,
        }),
      );
    }
    res.status(201).json({ items: items.map(publicItem) });
  },
);
