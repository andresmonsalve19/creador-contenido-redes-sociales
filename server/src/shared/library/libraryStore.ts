import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { DATA_DIR } from '../config/paths.js';

export const LIBRARY_DIR = path.join(DATA_DIR, 'library');

export const LIBRARY_IMAGE_TYPES = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
} as const;
export type LibraryImageType = keyof typeof LIBRARY_IMAGE_TYPES;

export const isLibraryImageType = (type: string): type is LibraryImageType =>
  type in LIBRARY_IMAGE_TYPES;

/**
 * Pieza de la biblioteca:
 * - single / carousel: creada en la app (cada imagen se guarda en cuanto se genera).
 * - edit: imagen propia editada con instrucciones.
 * - import: imagen subida por el usuario (p. ej. descargas anteriores).
 */
export const libraryItemSchema = z.object({
  id: z.uuid(),
  kind: z.enum(['single', 'carousel', 'edit', 'import']),
  /** Quién la creó: la app, una importación o Claude Desktop. */
  source: z.enum(['app', 'import', 'claude']),
  title: z.string(),
  caption: z.string(),
  aspectRatio: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  slides: z.array(
    z.object({
      index: z.number().int().min(0),
      file: z.string(),
      mimeType: z.enum(Object.keys(LIBRARY_IMAGE_TYPES) as [LibraryImageType]),
      updatedAt: z.string(),
    }),
  ),
});
export type LibraryItem = z.infer<typeof libraryItemSchema>;

export interface SaveSlideInput {
  id: string;
  kind: LibraryItem['kind'];
  source: LibraryItem['source'];
  title: string;
  caption: string;
  aspectRatio: string | null;
  index: number;
  mimeType: LibraryImageType;
  /** Contenido de la imagen. */
  data: Buffer;
}

/** Biblioteca en disco: un índice JSON y una carpeta por pieza. Escrituras encadenadas. */
export function createLibraryStore(root = LIBRARY_DIR) {
  const indexFile = path.join(root, 'index.json');
  let queue: Promise<unknown> = Promise.resolve();
  const serialize = <T>(task: () => Promise<T>): Promise<T> => {
    const run = queue.then(task, task);
    queue = run.catch(() => undefined);
    return run;
  };

  async function read(): Promise<LibraryItem[]> {
    try {
      const parsed = z
        .array(libraryItemSchema)
        .safeParse(JSON.parse(await fs.readFile(indexFile, 'utf8')));
      return parsed.success ? parsed.data : [];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
  }

  async function write(items: LibraryItem[]): Promise<void> {
    await fs.mkdir(root, { recursive: true });
    const tmp = `${indexFile}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(items, null, 2), 'utf8');
    await fs.rename(tmp, indexFile);
  }

  /** Ruta absoluta de un archivo, verificando que no se salga de la biblioteca. */
  const resolve = (relative: string): string | null => {
    const absolute = path.resolve(root, relative);
    return absolute.startsWith(`${path.resolve(root)}${path.sep}`) ? absolute : null;
  };

  return {
    /** Más recientes primero. */
    list: () =>
      serialize(async () =>
        (await read()).toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      ),

    get: (id: string) =>
      serialize(async () => (await read()).find((item) => item.id === id) ?? null),

    /**
     * Guarda una imagen de una pieza. Si la pieza no existe la crea; si la imagen ya existía
     * (p. ej. tras un ajuste) la reemplaza por la versión nueva.
     */
    saveSlide: (input: SaveSlideInput) =>
      serialize(async () => {
        const items = await read();
        const now = new Date().toISOString();
        const file = path.posix.join(
          input.id,
          `${String(input.index + 1).padStart(2, '0')}.${LIBRARY_IMAGE_TYPES[input.mimeType]}`,
        );
        const absolute = resolve(file);
        if (!absolute) throw new Error('Ruta de la biblioteca no válida.');
        await fs.mkdir(path.dirname(absolute), { recursive: true });

        const current = items.find((item) => item.id === input.id);
        const previous = current?.slides.find((slide) => slide.index === input.index);
        if (previous && previous.file !== file) {
          const old = resolve(previous.file);
          if (old) await fs.rm(old, { force: true });
        }
        await fs.writeFile(absolute, input.data);

        const slide = { index: input.index, file, mimeType: input.mimeType, updatedAt: now };
        const item: LibraryItem = current
          ? {
              ...current,
              title: input.title || current.title,
              caption: input.caption || current.caption,
              updatedAt: now,
              slides: [...current.slides.filter((s) => s.index !== input.index), slide].sort(
                (a, b) => a.index - b.index,
              ),
            }
          : {
              id: input.id,
              kind: input.kind,
              source: input.source,
              title: input.title,
              caption: input.caption,
              aspectRatio: input.aspectRatio,
              createdAt: now,
              updatedAt: now,
              slides: [slide],
            };
        await write([...items.filter((i) => i.id !== input.id), item]);
        return item;
      }),

    /** Archivo de una imagen (ruta absoluta), o null si no existe. */
    slideFile: (id: string, index: number) =>
      serialize(async () => {
        const item = (await read()).find((i) => i.id === id);
        const slide = item?.slides.find((s) => s.index === index);
        if (!slide) return null;
        const absolute = resolve(slide.file);
        return absolute ? { path: absolute, mimeType: slide.mimeType } : null;
      }),

    remove: (id: string) =>
      serialize(async () => {
        const items = await read();
        const dir = resolve(id);
        if (dir) await fs.rm(dir, { recursive: true, force: true });
        await write(items.filter((item) => item.id !== id));
      }),
  };
}

export type LibraryStore = ReturnType<typeof createLibraryStore>;

let defaultStore: LibraryStore | null = null;
export const getLibraryStore = () => (defaultStore ??= createLibraryStore());

export const newLibraryId = () => randomUUID();
