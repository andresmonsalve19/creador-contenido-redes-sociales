import { promises as fs } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { DATA_DIR } from '../../shared/config/paths.js';
import { videoSpecSchema } from './schemas.js';

export const REELS_DIR = path.join(DATA_DIR, 'reels');
export const BACKGROUNDS_DIR = path.join(REELS_DIR, 'fondos');

/**
 * Estados locales de un video:
 * - queued: esperando turno (máximo 2 renders a la vez); aún no se envió a HeyGen.
 * - pending / processing: HeyGen lo recibió y lo está renderizando.
 * - completed: descargado en el disco.
 * - failed: error definitivo (ver `error`).
 */
export const JOB_STATUSES = ['queued', 'pending', 'processing', 'completed', 'failed'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];
export const ACTIVE_STATUSES: readonly JobStatus[] = ['queued', 'pending', 'processing'];

export const jobSchema = z.object({
  id: z.uuid(),
  createdAt: z.string(),
  updatedAt: z.string(),
  spec: videoSpecSchema,
  provider: z.literal('heygen'),
  /** Id del render en HeyGen. Si existe, el render ya se creó: nunca se vuelve a crear. */
  providerVideoId: z.string().nullable(),
  status: z.enum(JOB_STATUSES),
  /** Costo estimado en USD; null porque HeyGen no publica sus precios en la documentación. */
  estimatedCostUsd: z.number().nullable(),
  estimatedSeconds: z.number(),
  durationSeconds: z.number().nullable(),
  /** Ruta del MP4 relativa a data/reels (p. ej. "2026-10/2026-10-08-mi-reel-1a2b3c4d.mp4"). */
  file: z.string().nullable(),
  error: z.object({ codigo: z.string(), mensaje: z.string() }).nullable(),
  duplicatedFrom: z.string().nullable(),
});
export type Job = z.infer<typeof jobSchema>;

const historySchema = z.array(jobSchema);
const HISTORY_FILE = path.join(REELS_DIR, 'history.json');

export interface JobStore {
  list(): Promise<Job[]>;
  get(id: string): Promise<Job | null>;
  save(job: Job): Promise<Job>;
  update(id: string, patch: Partial<Omit<Job, 'id' | 'createdAt'>>): Promise<Job>;
  remove(id: string): Promise<void>;
}

/** Historial de videos en un JSON. Las escrituras se encadenan para no pisarse entre sí. */
export function createFileJobStore(file = HISTORY_FILE): JobStore {
  let queue: Promise<unknown> = Promise.resolve();
  const serialize = <T>(task: () => Promise<T>): Promise<T> => {
    const run = queue.then(task, task);
    queue = run.catch(() => undefined);
    return run;
  };

  async function read(): Promise<Job[]> {
    try {
      const parsed = historySchema.safeParse(JSON.parse(await fs.readFile(file, 'utf8')));
      return parsed.success ? parsed.data : [];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
  }

  async function write(jobs: Job[]): Promise<void> {
    await fs.mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(jobs, null, 2), 'utf8');
    await fs.rename(tmp, file);
  }

  return {
    list: () => serialize(async () => (await read()).toReversed()),
    get: (id) => serialize(async () => (await read()).find((job) => job.id === id) ?? null),
    save: (job) =>
      serialize(async () => {
        const jobs = await read();
        await write([...jobs.filter((j) => j.id !== job.id), job]);
        return job;
      }),
    update: (id, patch) =>
      serialize(async () => {
        const jobs = await read();
        const index = jobs.findIndex((job) => job.id === id);
        const current = jobs[index];
        if (!current) throw new Error(`No existe el video ${id}.`);
        const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
        jobs[index] = next;
        await write(jobs);
        return next;
      }),
    remove: (id) =>
      serialize(async () => {
        await write((await read()).filter((job) => job.id !== id));
      }),
  };
}

const slug = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);

/** Nombre seguro del archivo: sin tildes, espacios ni caracteres especiales. */
export function videoFileName(job: Pick<Job, 'id' | 'createdAt' | 'spec'>): string {
  const date = job.createdAt.slice(0, 10);
  const month = job.createdAt.slice(0, 7);
  const name = slug(job.spec.title) || 'reel';
  return path.posix.join(month, `${date}-${name}-${job.id.slice(0, 8)}.mp4`);
}

/** Ruta absoluta de un archivo del historial, verificando que no se salga de data/reels. */
export function resolveReelFile(relative: string, root = REELS_DIR): string | null {
  const absolute = path.resolve(root, relative);
  return absolute.startsWith(`${path.resolve(root)}${path.sep}`) ? absolute : null;
}
