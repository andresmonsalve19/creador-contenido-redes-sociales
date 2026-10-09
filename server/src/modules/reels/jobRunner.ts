import { createWriteStream, promises as fs } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import { VideoProviderError, isRetryable } from '../../shared/video/errors.js';
import type { RenderRequest, SceneBackground, VideoProvider } from '../../shared/video/types.js';
import { videoFileName, type Job, type JobStore } from './jobStore.js';
import type { SceneBackgroundSpec } from './schemas.js';

export interface BackgroundFile {
  data: Buffer;
  mimeType: 'image/png' | 'image/jpeg';
  fileName: string;
}

export interface JobRunnerDeps {
  store: JobStore;
  getProvider: () => VideoProvider;
  /** Lee del disco la imagen de un fondo (de la marca o generada). */
  loadBackground: (background: SceneBackgroundSpec) => Promise<BackgroundFile>;
  /** Carpeta donde se guardan los MP4 (data/reels). */
  reelsDir: string;
  /** Tiempo máximo esperando a que el proveedor termine un render. */
  timeoutMs: number;
  maxActive?: number;
  /** Esperas entre consultas de estado; la última se repite. */
  pollDelaysMs?: readonly number[];
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  log?: (message: string) => void;
}

const DEFAULT_POLL_DELAYS_MS = [5_000, 10_000, 20_000, 30_000];
const MAX_ATTEMPTS = 3;

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Ejecuta los renders en segundo plano:
 * - Máximo `maxActive` renders a la vez (por defecto 2); el resto espera en cola.
 * - Polling con intervalo creciente (5 s, 10 s, 20 s y luego cada 30 s) hasta `timeoutMs`.
 * - Al completar descarga el video de inmediato: las URLs del proveedor expiran.
 * - Reintenta solo errores reintentables. La creación usa una clave de idempotencia (el id del
 *   video) y, una vez que existe `providerVideoId`, el render nunca se vuelve a crear.
 */
export function createJobRunner(deps: JobRunnerDeps) {
  const {
    store,
    getProvider,
    loadBackground,
    reelsDir,
    timeoutMs,
    maxActive = 2,
    pollDelaysMs = DEFAULT_POLL_DELAYS_MS,
    sleep = defaultSleep,
    now = Date.now,
    log = () => undefined,
  } = deps;

  const waiting: string[] = [];
  const active = new Set<string>();
  const idle = new Set<() => void>();

  async function withRetries<T>(task: () => Promise<T>): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await task();
      } catch (error) {
        if (!isRetryable(error) || attempt >= MAX_ATTEMPTS) throw error;
        const retryAfter = error instanceof VideoProviderError ? error.retryAfterSeconds : null;
        await sleep(retryAfter ? retryAfter * 1000 : 2_000 * 2 ** (attempt - 1));
      }
    }
  }

  /** Sube cada fondo de imagen una sola vez y arma la petición para el proveedor. */
  async function buildRequest(job: Job, provider: VideoProvider): Promise<RenderRequest> {
    const uploaded = new Map<string, string>();
    const toBackground = async (background: SceneBackgroundSpec): Promise<SceneBackground> => {
      if (background.type === 'avatar') return { type: 'avatar' };
      if (background.type === 'color') return { type: 'color', color: background.color };
      const key = background.type === 'generated' ? background.imageId : 'brand';
      let assetId = uploaded.get(key);
      if (!assetId) {
        const file = await loadBackground(background);
        assetId = await withRetries(() =>
          provider.uploadImage(file.data, file.mimeType, file.fileName),
        );
        uploaded.set(key, assetId);
      }
      return { type: 'image', assetId };
    };

    const scenes = [];
    for (const scene of job.spec.scenes) {
      scenes.push({
        avatarId: scene.avatarId,
        voiceId: scene.voiceId,
        script: scene.script,
        background: await toBackground(scene.background),
      });
    }
    return {
      title: job.spec.title,
      aspectRatio: job.spec.aspectRatio,
      voiceSpeed: job.spec.voiceSpeed,
      captions: job.spec.captions,
      scenes,
    };
  }

  async function download(job: Job, provider: VideoProvider, url: string): Promise<string> {
    const relative = videoFileName(job);
    const destination = path.join(reelsDir, relative);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    const partial = `${destination}.part`;

    let currentUrl = url;
    for (let attempt = 1; ; attempt++) {
      try {
        const response = await provider.download(currentUrl);
        await pipeline(
          Readable.fromWeb(response.body as WebReadableStream<Uint8Array>),
          createWriteStream(partial),
        );
        await fs.rename(partial, destination);
        return relative;
      } catch (error) {
        await fs.rm(partial, { force: true });
        if (!isRetryable(error) || attempt >= MAX_ATTEMPTS) throw error;
        await sleep(2_000 * attempt);
        // La URL pudo expirar: se pide una nueva al proveedor.
        const fresh = await provider.getVideo(job.providerVideoId ?? '');
        if (fresh.downloadUrl) currentUrl = fresh.downloadUrl;
      }
    }
  }

  async function fail(id: string, error: unknown): Promise<void> {
    const details =
      error instanceof VideoProviderError
        ? { codigo: error.details.codigo, mensaje: error.details.mensaje }
        : {
            codigo: 'internal',
            mensaje:
              error instanceof Error ? error.message : 'Error inesperado al generar el video.',
          };
    await store.update(id, { status: 'failed', error: details });
    log(`Reel ${id}: error ${details.codigo}`);
  }

  async function run(id: string): Promise<void> {
    let job = await store.get(id);
    if (!job || job.status === 'completed' || job.status === 'failed') return;
    const provider = getProvider();

    if (!job.providerVideoId) {
      const request = await buildRequest(job, provider);
      const providerVideoId = await withRetries(() => provider.createVideo(request, job!.id));
      job = await store.update(id, { providerVideoId, status: 'pending', error: null });
      log(`Reel ${id}: enviado a ${provider.id}`);
    }

    const deadline = now() + timeoutMs;
    for (let poll = 0; ; poll++) {
      if (now() > deadline) {
        throw new VideoProviderError(504, {
          proveedor: provider.id,
          codigo: 'timeout',
          mensaje: `El proveedor no terminó el video en ${Math.round(timeoutMs / 60_000)} minutos. Puede seguir procesándose en tu cuenta de HeyGen.`,
          reintentable: false,
        });
      }
      await sleep(pollDelaysMs[Math.min(poll, pollDelaysMs.length - 1)] ?? 30_000);

      let state;
      try {
        state = await provider.getVideo(job.providerVideoId ?? '');
      } catch (error) {
        if (isRetryable(error)) continue; // un fallo temporal no detiene el seguimiento
        throw error;
      }

      if (state.status === 'failed') {
        throw new VideoProviderError(502, {
          proveedor: provider.id,
          codigo: state.failureCode ?? 'render_failed',
          mensaje: state.failureMessage
            ? `HeyGen no pudo generar el video: ${state.failureMessage}`
            : 'HeyGen no pudo generar el video.',
          reintentable: false,
        });
      }

      if (state.status === 'completed') {
        if (!state.downloadUrl) continue;
        const file = await download(job, provider, state.downloadUrl);
        await store.update(id, {
          status: 'completed',
          file,
          durationSeconds: state.durationSeconds,
          error: null,
        });
        log(`Reel ${id}: descargado`);
        return;
      }

      if (state.status !== job.status) job = await store.update(id, { status: state.status });
    }
  }

  function pump(): void {
    while (active.size < maxActive && waiting.length > 0) {
      const id = waiting.shift();
      if (!id || active.has(id)) continue;
      active.add(id);
      run(id)
        .catch((error: unknown) => fail(id, error))
        .catch(() => undefined)
        .finally(() => {
          active.delete(id);
          pump();
          if (active.size === 0 && waiting.length === 0) for (const done of idle) done();
        });
    }
  }

  return {
    enqueue(id: string): void {
      if (!active.has(id) && !waiting.includes(id)) waiting.push(id);
      pump();
    },
    isActive: (id: string) => active.has(id) || waiting.includes(id),
    /** Retoma los videos que quedaron en curso si el servidor se reinició. */
    async resume(): Promise<void> {
      const jobs = await store.list();
      for (const job of jobs.toReversed()) {
        if (job.status === 'queued' || job.status === 'pending' || job.status === 'processing') {
          this.enqueue(job.id);
        }
      }
    },
    /** Para pruebas: se resuelve cuando no queda nada en curso ni en cola. */
    whenIdle(): Promise<void> {
      if (active.size === 0 && waiting.length === 0) return Promise.resolve();
      return new Promise((resolve) => {
        const done = () => {
          idle.delete(done);
          resolve();
        };
        idle.add(done);
      });
    },
  };
}

export type JobRunner = ReturnType<typeof createJobRunner>;
