import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { createJobRunner } from '../src/modules/reels/jobRunner.js';
import { createFileJobStore, type Job, type JobStore } from '../src/modules/reels/jobStore.js';
import { VideoProviderError } from '../src/shared/video/errors.js';
import type { RenderState, VideoProvider } from '../src/shared/video/types.js';

const spec: Job['spec'] = {
  title: 'Reel de prueba',
  topic: 'Tres consejos de ejemplo',
  concept: 'Idea ficticia',
  caption: 'Texto ficticio',
  aspectRatio: '9:16',
  durationSeconds: 15,
  wordsPerSecond: 2.5,
  captions: true,
  voiceSpeed: 1,
  style: 'simple',
  brandCards: { intro: false, outro: false },
  varyLooks: false,
  styleParagraph: '',
  scenes: [
    {
      role: 'single',
      kind: 'avatar',
      title: 'Escena',
      visualPrompt: '',
      gestures: '',
      onScreenText: '',
      script: 'Hola, este es un guion de prueba.',
      subtitleNotes: '',
      backgroundNote: '',
      avatarId: 'look_stock_001',
      voiceId: 'voz_001',
      background: { type: 'avatar' },
    },
  ],
};

function newJob(id: string, patch: Partial<Job> = {}): Job {
  return {
    id,
    createdAt: '2026-10-08T12:00:00.000Z',
    updatedAt: '2026-10-08T12:00:00.000Z',
    spec,
    provider: 'heygen',
    providerVideoId: null,
    status: 'queued',
    estimatedCostUsd: null,
    estimatedSeconds: 6,
    durationSeconds: null,
    file: null,
    error: null,
    duplicatedFrom: null,
    ...patch,
  };
}

const retryable = () =>
  new VideoProviderError(429, {
    proveedor: 'heygen',
    codigo: 'rate_limit_exceeded',
    mensaje: 'Espera',
    reintentable: true,
  });

const noCredit = () =>
  new VideoProviderError(402, {
    proveedor: 'heygen',
    codigo: 'insufficient_credit',
    mensaje: 'Saldo insuficiente en HeyGen.',
    reintentable: false,
  });

const done: RenderState = {
  status: 'completed',
  downloadUrl: 'https://ejemplo.invalid/video.mp4',
  thumbnailUrl: null,
  durationSeconds: 14.2,
  failureCode: null,
  failureMessage: null,
};
const processing: RenderState = { ...done, status: 'processing', downloadUrl: null };

/** Proveedor simulado: cada método se puede reemplazar por prueba. */
function fakeProvider(overrides: Partial<VideoProvider> = {}) {
  const created: string[] = [];
  const provider: VideoProvider = {
    id: 'heygen',
    validateKey: async () => undefined,
    getAccount: async () => ({ billingType: 'wallet', balanceUsd: 10, summary: '' }),
    listAvatars: async () => [],
    getAvatar: async () => {
      throw new Error('no usado');
    },
    listGroupLooks: async () => [],
    listBrandKits: async () => [],
    createBrandKitFromUrl: async () => 'kit_001',
    getBrandKit: async () => {
      throw new Error('no usado');
    },
    updateBrandKit: async () => {
      throw new Error('no usado');
    },
    createAgentSession: async () => 'sesion_001',
    getAgentSession: async () => ({
      status: 'reviewing',
      progress: 40,
      title: null,
      videoId: null,
      messages: [],
    }),
    sendAgentMessage: async () => undefined,
    getAgentResource: async (_session, id) => ({
      id,
      type: 'image',
      url: null,
      thumbnailUrl: null,
    }),
    listVoices: async () => [],
    uploadImage: async () => 'asset_001',
    createVideo: async (_request, key) => {
      created.push(key);
      return `vid_${key}`;
    },
    getVideo: async () => done,
    download: async () => new Response('contenido-mp4-ficticio'),
    ...overrides,
  };
  return { provider, created };
}

describe('jobRunner', () => {
  let dir: string;
  let store: JobStore;
  let sleeps: number[];

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'reels-test-'));
    store = createFileJobStore(path.join(dir, 'history.json'));
    sleeps = [];
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const runner = (
    provider: VideoProvider,
    extra: { timeoutMs?: number; now?: () => number } = {},
  ) =>
    createJobRunner({
      store,
      getProvider: () => provider,
      loadBackground: async () => ({
        data: Buffer.from('png'),
        mimeType: 'image/png',
        fileName: 'fondo.png',
      }),
      reelsDir: dir,
      timeoutMs: extra.timeoutMs ?? 60_000,
      now: extra.now,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });

  it('crea, consulta con intervalo creciente y descarga de inmediato', async () => {
    let polls = 0;
    const { provider, created } = fakeProvider({
      getVideo: async () => (++polls < 5 ? processing : done),
    });
    await store.save(newJob('11111111-1111-4111-8111-111111111111'));
    const r = runner(provider);
    r.enqueue('11111111-1111-4111-8111-111111111111');
    await r.whenIdle();

    const job = await store.get('11111111-1111-4111-8111-111111111111');
    assert.equal(job?.status, 'completed');
    assert.equal(job?.providerVideoId, 'vid_11111111-1111-4111-8111-111111111111');
    assert.equal(job?.durationSeconds, 14.2);
    assert.deepEqual(created, ['11111111-1111-4111-8111-111111111111']);
    assert.deepEqual(sleeps, [5_000, 10_000, 20_000, 30_000, 30_000]);
    assert.ok(job?.file?.startsWith('2026-10/2026-10-08-reel-de-prueba-'));
    const file = path.join(dir, job?.file ?? '');
    assert.equal(readFileSync(file, 'utf8'), 'contenido-mp4-ficticio');
  });

  it('reintenta errores reintentables con la misma clave de idempotencia', async () => {
    let attempts = 0;
    const keys: string[] = [];
    const { provider } = fakeProvider({
      createVideo: async (_request, key) => {
        keys.push(key);
        if (++attempts < 3) throw retryable();
        return 'vid_ok';
      },
    });
    await store.save(newJob('22222222-2222-4222-8222-222222222222'));
    const r = runner(provider);
    r.enqueue('22222222-2222-4222-8222-222222222222');
    await r.whenIdle();

    assert.equal((await store.get('22222222-2222-4222-8222-222222222222'))?.status, 'completed');
    assert.equal(keys.length, 3);
    assert.ok(keys.every((key) => key === '22222222-2222-4222-8222-222222222222'));
  });

  it('no reintenta errores definitivos (saldo insuficiente)', async () => {
    let attempts = 0;
    const { provider } = fakeProvider({
      createVideo: async () => {
        attempts++;
        throw noCredit();
      },
    });
    await store.save(newJob('33333333-3333-4333-8333-333333333333'));
    const r = runner(provider);
    r.enqueue('33333333-3333-4333-8333-333333333333');
    await r.whenIdle();

    const job = await store.get('33333333-3333-4333-8333-333333333333');
    assert.equal(attempts, 1);
    assert.equal(job?.status, 'failed');
    assert.deepEqual(job?.error, {
      codigo: 'insufficient_credit',
      mensaje: 'Saldo insuficiente en HeyGen.',
    });
  });

  it('nunca vuelve a crear un render que ya existe (retoma solo la consulta)', async () => {
    const { provider, created } = fakeProvider();
    await store.save(
      newJob('44444444-4444-4444-8444-444444444444', {
        providerVideoId: 'vid_existente',
        status: 'processing',
      }),
    );
    const r = runner(provider);
    await r.resume();
    await r.whenIdle();

    assert.deepEqual(created, []);
    assert.equal((await store.get('44444444-4444-4444-8444-444444444444'))?.status, 'completed');
  });

  it('marca error si el proveedor informa que falló el render', async () => {
    const { provider } = fakeProvider({
      getVideo: async () => ({
        ...processing,
        status: 'failed',
        failureCode: 'rendering_failed',
        failureMessage: 'motivo ficticio',
      }),
    });
    await store.save(newJob('55555555-5555-4555-8555-555555555555'));
    const r = runner(provider);
    r.enqueue('55555555-5555-4555-8555-555555555555');
    await r.whenIdle();

    const job = await store.get('55555555-5555-4555-8555-555555555555');
    assert.equal(job?.status, 'failed');
    assert.equal(job?.error?.codigo, 'rendering_failed');
    assert.match(job?.error?.mensaje ?? '', /motivo ficticio/);
  });

  it('se rinde al superar el tiempo máximo', async () => {
    let clock = 0;
    const { provider } = fakeProvider({
      getVideo: async () => {
        clock += 40_000;
        return processing;
      },
    });
    await store.save(newJob('66666666-6666-4666-8666-666666666666'));
    const r = runner(provider, { timeoutMs: 100_000, now: () => clock });
    r.enqueue('66666666-6666-4666-8666-666666666666');
    await r.whenIdle();

    const job = await store.get('66666666-6666-4666-8666-666666666666');
    assert.equal(job?.status, 'failed');
    assert.equal(job?.error?.codigo, 'timeout');
  });

  it('no ejecuta más de 2 renders a la vez', async () => {
    let active = 0;
    let peak = 0;
    const { provider } = fakeProvider({
      getVideo: async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active--;
        return done;
      },
    });
    const ids = [
      '77777771-7777-4777-8777-777777777777',
      '77777772-7777-4777-8777-777777777777',
      '77777773-7777-4777-8777-777777777777',
      '77777774-7777-4777-8777-777777777777',
    ];
    for (const id of ids) await store.save(newJob(id));
    const r = runner(provider);
    for (const id of ids) r.enqueue(id);
    await r.whenIdle();

    assert.ok(peak <= 2, `Se ejecutaron ${peak} a la vez`);
    for (const id of ids) assert.equal((await store.get(id))?.status, 'completed');
  });

  it('sube cada fondo de imagen una sola vez', async () => {
    const uploads: string[] = [];
    const { provider } = fakeProvider({
      uploadImage: async (_data, _mime, name) => {
        uploads.push(name);
        return 'asset_fondo';
      },
    });
    const background = {
      type: 'generated' as const,
      imageId: '99999999-9999-4999-8999-999999999999',
    };
    const twoScenes = {
      ...spec,
      scenes: [0, 1].map(() => ({ ...spec.scenes[0]!, background })),
    };
    await store.save(newJob('88888888-8888-4888-8888-888888888888', { spec: twoScenes }));
    const r = runner(provider);
    r.enqueue('88888888-8888-4888-8888-888888888888');
    await r.whenIdle();

    assert.equal(uploads.length, 1);
    assert.equal(existsSync(path.join(dir, 'history.json')), true);
  });

  it('estilo dinámico: tarjeta de apertura, presentador, apoyo narrado y tarjeta de cierre', async () => {
    let request: Parameters<VideoProvider['createVideo']>[0] | null = null;
    const uploads: string[] = [];
    const { provider } = fakeProvider({
      uploadImage: async (_data, _mime, name) => {
        uploads.push(name);
        return `asset_${uploads.length}`;
      },
      createVideo: async (req) => {
        request = req;
        return 'vid_dinamico';
      },
    });
    const avatarScene = spec.scenes[0]!;
    const dynamic: Job['spec'] = {
      ...spec,
      style: 'dynamic',
      brandCards: { intro: true, outro: true },
      cards: {
        introImageId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        outroImageId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      },
      scenes: [
        { ...avatarScene, role: 'hook', motionPrompt: 'asiente' },
        {
          ...avatarScene,
          role: 'cta',
          kind: 'broll',
          avatarId: '',
          imageId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          script: 'Narración sobre la imagen.',
        },
      ],
    };
    await store.save(newJob('99999999-0000-4000-8000-000000000001', { spec: dynamic }));
    const r = runner(provider);
    r.enqueue('99999999-0000-4000-8000-000000000001');
    await r.whenIdle();

    const scenes = (request as Parameters<VideoProvider['createVideo']>[0] | null)?.scenes ?? [];
    assert.deepEqual(
      scenes.map((scene) => scene.kind),
      ['image', 'avatar', 'image', 'image'],
    );
    assert.deepEqual(scenes[0], { kind: 'image', assetId: 'asset_1', durationSeconds: 2 });
    assert.equal(scenes[1]?.kind === 'avatar' && scenes[1].motionPrompt, 'asiente');
    assert.deepEqual(scenes[2], {
      kind: 'image',
      assetId: 'asset_2',
      narration: { script: 'Narración sobre la imagen.', voiceId: 'voz_001' },
    });
    assert.deepEqual(scenes[3], { kind: 'image', assetId: 'asset_3', durationSeconds: 3 });
    assert.equal(uploads.length, 3);
  });

  describe('edición automática (Video Agent)', () => {
    const agentSpec: Job['spec'] = { ...spec, style: 'agent', brandKitId: 'kit_001' };
    const agentState = () => ({
      sessionId: null,
      prompt: 'prompt ficticio',
      progress: null,
      messages: [],
      storyboard: [],
    });

    it('crea la sesión en modo revisión y se detiene con el storyboard, sin generar', async () => {
      const created: Parameters<VideoProvider['createAgentSession']>[0][] = [];
      let videoPolls = 0;
      const { provider } = fakeProvider({
        createAgentSession: async (request) => {
          created.push(request);
          return 'sesion_001';
        },
        getAgentSession: async () => ({
          status: 'reviewing',
          progress: 50,
          title: null,
          videoId: null,
          messages: [
            {
              role: 'model',
              content: 'Storyboard listo',
              type: 'text',
              createdAt: 1,
              resourceIds: ['res_1'],
            },
          ],
        }),
        getVideo: async () => {
          videoPolls++;
          return done;
        },
      });
      await store.save(
        newJob('aaaaaaaa-0000-4000-8000-000000000001', { spec: agentSpec, agent: agentState() }),
      );
      const r = createJobRunner({
        store,
        getProvider: () => provider,
        loadBackground: async () => ({
          data: Buffer.from(''),
          mimeType: 'image/png',
          fileName: 'x.png',
        }),
        loadLogo: async () => ({ mimeType: 'image/png', data: Buffer.from('logo') }),
        reelsDir: dir,
        timeoutMs: 60_000,
        sleep: async () => undefined,
      });
      r.enqueue('aaaaaaaa-0000-4000-8000-000000000001');
      await r.whenIdle();

      const job = await store.get('aaaaaaaa-0000-4000-8000-000000000001');
      assert.equal(job?.status, 'reviewing');
      assert.equal(job?.agent?.sessionId, 'sesion_001');
      assert.deepEqual(
        job?.agent?.storyboard.map((item) => item.id),
        ['res_1'],
      );
      assert.equal(created.length, 1);
      assert.equal(created[0]?.mode, 'chat');
      assert.equal(created[0]?.brandKitId, 'kit_001');
      assert.equal(created[0]?.avatarId, 'look_stock_001');
      assert.equal(created[0]?.files.length, 1);
      assert.equal(videoPolls, 0, 'no se consulta ningún render antes de aprobar');
    });

    it('tras aprobar, sigue el render y descarga el video sin crear otra sesión', async () => {
      let sessions = 0;
      const { provider } = fakeProvider({
        createAgentSession: async () => {
          sessions++;
          return 'otra';
        },
        getAgentSession: async () => ({
          status: 'generating',
          progress: 80,
          title: null,
          videoId: 'vid_agente',
          messages: [],
        }),
      });
      await store.save(
        newJob('aaaaaaaa-0000-4000-8000-000000000002', {
          spec: agentSpec,
          status: 'drafting',
          agent: { ...agentState(), sessionId: 'sesion_001' },
        }),
      );
      const r = runner(provider);
      r.enqueue('aaaaaaaa-0000-4000-8000-000000000002');
      await r.whenIdle();

      const job = await store.get('aaaaaaaa-0000-4000-8000-000000000002');
      assert.equal(sessions, 0);
      assert.equal(job?.providerVideoId, 'vid_agente');
      assert.equal(job?.status, 'completed');
    });

    it('no reintenta crear la sesión ante un error que no sea de límite de tasa', async () => {
      let attempts = 0;
      const { provider } = fakeProvider({
        createAgentSession: async () => {
          attempts++;
          throw new VideoProviderError(502, {
            proveedor: 'heygen',
            codigo: 'http_502',
            mensaje: 'caída',
            reintentable: true,
          });
        },
      });
      await store.save(
        newJob('aaaaaaaa-0000-4000-8000-000000000003', { spec: agentSpec, agent: agentState() }),
      );
      const r = runner(provider);
      r.enqueue('aaaaaaaa-0000-4000-8000-000000000003');
      await r.whenIdle();
      assert.equal(attempts, 1);
      assert.equal((await store.get('aaaaaaaa-0000-4000-8000-000000000003'))?.status, 'failed');
    });
  });
});
