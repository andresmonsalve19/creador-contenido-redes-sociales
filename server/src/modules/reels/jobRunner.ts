import { createWriteStream, promises as fs } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import { VideoProviderError, isRetryable } from '../../shared/video/errors.js';
import type {
  RenderRequest,
  RenderScene,
  SceneBackground,
  VideoProvider,
} from '../../shared/video/types.js';
import { CARD_SECONDS } from './estimate.js';
import { ACTIVE_STATUSES, videoFileName, type Job, type JobStore } from './jobStore.js';
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
  /** Logo de la marca en PNG o JPEG para adjuntarlo al agente de video (null si no hay). */
  loadLogo?: () => Promise<{ mimeType: 'image/png' | 'image/jpeg'; data: Buffer } | null>;
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
    loadLogo = async () => null,
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

  /** Reintenta solo cuando el proveedor pidió esperar (429): en ese caso no se creó nada. */
  async function withRateLimitRetries<T>(task: () => Promise<T>): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await task();
      } catch (error) {
        const rateLimited = error instanceof VideoProviderError && error.status === 429;
        if (!rateLimited || attempt >= MAX_ATTEMPTS) throw error;
        await sleep((error.retryAfterSeconds ?? 2 * attempt) * 1000);
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

    /** Sube una imagen generada (apoyo o tarjeta) una sola vez y devuelve su id en el proveedor. */
    const imageAsset = async (imageId: string) => {
      const background = await toBackground({ type: 'generated', imageId });
      if (background.type !== 'image') throw new Error('Imagen no válida.');
      return background.assetId;
    };

    const scenes: RenderScene[] = [];
    const cards = job.spec.cards;
    if (cards?.introImageId) {
      scenes.push({
        kind: 'image',
        assetId: await imageAsset(cards.introImageId),
        durationSeconds: CARD_SECONDS.intro,
      });
    }
    for (const scene of job.spec.scenes) {
      if (scene.kind === 'broll' && scene.imageId) {
        // Imagen de apoyo a pantalla completa mientras la misma voz sigue narrando.
        scenes.push({
          kind: 'image',
          assetId: await imageAsset(scene.imageId),
          narration: { script: scene.script, voiceId: scene.voiceId },
        });
        continue;
      }
      scenes.push({
        kind: 'avatar',
        avatarId: scene.avatarId,
        voiceId: scene.voiceId,
        script: scene.script,
        background: await toBackground(scene.background),
        engine: scene.engine ?? null,
        motionPrompt: scene.motionPrompt ?? null,
      });
    }
    if (cards?.outroImageId) {
      scenes.push({
        kind: 'image',
        assetId: await imageAsset(cards.outroImageId),
        durationSeconds: CARD_SECONDS.outro,
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

  const timeoutError = (provider: VideoProvider) =>
    new VideoProviderError(504, {
      proveedor: provider.id,
      codigo: 'timeout',
      mensaje: `El proveedor no terminó el video en ${Math.round(timeoutMs / 60_000)} minutos. Puede seguir procesándose en tu cuenta de HeyGen.`,
      reintentable: false,
    });

  /** Sigue el render hasta completarlo y descarga el video de inmediato. */
  async function followRender(job: Job, provider: VideoProvider): Promise<void> {
    const deadline = now() + timeoutMs;
    for (let poll = 0; ; poll++) {
      if (now() > deadline) throw timeoutError(provider);
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
        await store.update(job.id, {
          status: 'completed',
          file,
          durationSeconds: state.durationSeconds,
          error: null,
        });
        log(`Reel ${job.id}: descargado`);
        return;
      }

      if (state.status !== job.status) job = await store.update(job.id, { status: state.status });
    }
  }

  /**
   * Edición automática (Video Agent): crea la sesión en modo revisión y la sigue hasta que el
   * storyboard queda listo (se detiene a esperar la aprobación del usuario) o hasta que el
   * agente empieza a renderizar (entonces sigue el render como cualquier otro video).
   */
  async function runAgent(job: Job, provider: VideoProvider): Promise<void> {
    const agent = job.agent;
    if (!agent) throw new Error('Falta el guion para el agente de video.');

    if (!agent.sessionId) {
      const logo = await loadLogo();
      const presenter = job.spec.scenes.find((scene) => scene.kind === 'avatar');
      // Crear la sesión no es idempotente: solo se reintenta si el proveedor pidió esperar
      // (429), porque en ese caso no creó nada.
      const sessionId = await withRateLimitRetries(() =>
        provider.createAgentSession({
          prompt: agent.prompt,
          mode: 'chat',
          avatarId: presenter?.avatarId || null,
          voiceId: presenter?.voiceId || null,
          brandKitId: job.spec.brandKitId ?? null,
          orientation: job.spec.aspectRatio === '16:9' ? 'landscape' : 'portrait',
          files: logo ? [logo] : [],
        }),
      );
      job = await store.update(job.id, {
        status: 'drafting',
        agent: { ...agent, sessionId },
        error: null,
      });
      log(`Reel ${job.id}: sesión del agente creada`);
    }

    const sessionId = job.agent?.sessionId ?? '';
    const deadline = now() + timeoutMs;
    for (let poll = 0; ; poll++) {
      if (now() > deadline) throw timeoutError(provider);
      await sleep(pollDelaysMs[Math.min(poll, pollDelaysMs.length - 1)] ?? 30_000);

      let session;
      try {
        session = await provider.getAgentSession(sessionId);
      } catch (error) {
        if (isRetryable(error)) continue;
        throw error;
      }

      const messages = session.messages
        .filter((message) => message.content.trim())
        .slice(0, 12)
        .map((message) => ({
          role: message.role,
          content: message.content,
          createdAt: message.createdAt,
        }));
      const current = job.agent ?? agent;

      if (session.status === 'failed') {
        const reason = session.messages.find((m) => m.type === 'error' || m.role === 'model');
        throw new VideoProviderError(502, {
          proveedor: provider.id,
          codigo: 'agent_failed',
          mensaje: reason?.content
            ? `El agente de HeyGen no pudo continuar: ${reason.content}`
            : 'El agente de HeyGen no pudo continuar.',
          reintentable: false,
        });
      }

      if (session.videoId) {
        job = await store.update(job.id, {
          providerVideoId: session.videoId,
          status: 'processing',
          agent: { ...current, progress: session.progress, messages },
        });
        await followRender(job, provider);
        return;
      }

      if (session.status === 'reviewing' || session.status === 'waiting_for_input') {
        // Storyboard listo: se guardan sus imágenes y se espera la decisión del usuario.
        const resourceIds = [
          ...new Set(
            session.messages
              .filter((message) => message.role === 'model')
              .flatMap((message) => message.resourceIds),
          ),
        ].slice(0, 12);
        const storyboard = [];
        for (const resourceId of resourceIds) {
          try {
            storyboard.push(await provider.getAgentResource(sessionId, resourceId));
          } catch {
            // Un recurso que no carga no impide revisar los demás.
          }
        }
        await store.update(job.id, {
          status: 'reviewing',
          agent: { ...current, progress: session.progress, messages, storyboard },
        });
        log(`Reel ${job.id}: storyboard listo para revisar`);
        return;
      }

      job = await store.update(job.id, {
        status: 'drafting',
        agent: { ...current, progress: session.progress, messages },
      });
    }
  }

  async function run(id: string): Promise<void> {
    let job = await store.get(id);
    if (!job || job.status === 'completed' || job.status === 'failed') return;
    if (job.status === 'reviewing') return; // espera la decisión del usuario
    const provider = getProvider();

    if (job.spec.style === 'agent' && !job.providerVideoId) {
      await runAgent(job, provider);
      return;
    }

    if (!job.providerVideoId) {
      const request = await buildRequest(job, provider);
      const providerVideoId = await withRetries(() => provider.createVideo(request, job!.id));
      job = await store.update(id, { providerVideoId, status: 'pending', error: null });
      log(`Reel ${id}: enviado a ${provider.id}`);
    }
    await followRender(job, provider);
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
        if (ACTIVE_STATUSES.includes(job.status)) {
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
