import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { VideoProviderError } from '../src/shared/video/errors.js';
import { HeyGenProvider, buildStudioBody } from '../src/shared/video/heygen/client.js';
import { pickEngine } from '../src/shared/video/types.js';
import { fixture, jsonResponse, mockFetch } from './helpers.js';

const FAKE_KEY = 'clave-ficticia-de-prueba';

/** `input` de una escena de avatar del cuerpo enviado a HeyGen. */
const inputOf = (body: ReturnType<typeof buildStudioBody>, index: number) =>
  ((body.scenes[index] as { input?: Record<string, unknown> }).input ?? {}) as Record<
    string,
    unknown
  >;

describe('HeyGenProvider', () => {
  it('lista propios, de estudio y photo avatars, en ese orden y recorriendo las páginas', async () => {
    const { fetchImpl, calls } = mockFetch((url) => {
      if (url.searchParams.get('ownership') === 'private')
        return jsonResponse(fixture('looks-private.json'));
      if (url.searchParams.get('avatar_type') === 'photo_avatar')
        return jsonResponse(fixture('looks-public-photo.json'));
      return url.searchParams.get('token') === 'pagina-2'
        ? jsonResponse(fixture('looks-public-page2.json'))
        : jsonResponse(fixture('looks-public-page1.json'));
    });
    const avatars = await new HeyGenProvider(FAKE_KEY, fetchImpl).listAvatars();

    assert.deepEqual(
      avatars.map((a) => [a.id, a.type, a.ownership]),
      [
        ['look_privado_001', 'digital_twin', 'private'],
        ['look_stock_001', 'studio_avatar', 'public'],
        ['look_stock_002', 'studio_avatar', 'public'],
        ['look_foto_001', 'photo_avatar', 'public'],
      ],
    );
    assert.equal(calls.length, 4);
    assert.ok(calls.some((call) => call.url.includes('avatar_type=studio_avatar')));
    assert.ok(
      calls.every((call) => call.url.startsWith('https://api.heygen.com/v3/avatars/looks')),
    );
    assert.ok(calls.every((call) => call.headers['x-api-key'] === FAKE_KEY));
  });

  it('si falla una página intermedia, devuelve los avatares ya cargados', async () => {
    const { fetchImpl } = mockFetch((url) => {
      if (url.searchParams.get('ownership') === 'private') {
        return jsonResponse(fixture('looks-private.json'));
      }
      if (url.searchParams.get('avatar_type') === 'photo_avatar') {
        return jsonResponse({ data: [], has_more: false });
      }
      return url.searchParams.get('token') === 'pagina-2'
        ? new Response('caída temporal', { status: 503 })
        : jsonResponse(fixture('looks-public-page1.json'));
    });
    const avatars = await new HeyGenProvider(FAKE_KEY, fetchImpl).listAvatars();
    assert.deepEqual(
      avatars.map((a) => a.id),
      ['look_privado_001', 'look_stock_001'],
    );
  });

  it('si falla la primera página, informa el error', async () => {
    const { fetchImpl } = mockFetch(() => new Response('caída', { status: 503 }));
    await assert.rejects(new HeyGenProvider(FAKE_KEY, fetchImpl).listAvatars(), VideoProviderError);
  });

  it('resume el saldo de una cuenta de billetera', async () => {
    const { fetchImpl } = mockFetch(() => jsonResponse(fixture('user-wallet.json')));
    const account = await new HeyGenProvider(FAKE_KEY, fetchImpl).getAccount();
    assert.equal(account.billingType, 'wallet');
    assert.equal(account.balanceUsd, 12.5);
    assert.match(account.summary, /billetera/);
  });

  it('crea el video con Idempotency-Key y cuerpo "studio"', async () => {
    const { fetchImpl, calls } = mockFetch(() =>
      jsonResponse({ data: { video_id: 'vid_ejemplo_001', status: 'waiting' } }),
    );
    const id = await new HeyGenProvider(FAKE_KEY, fetchImpl).createVideo(
      {
        title: 'Reel de prueba',
        aspectRatio: '9:16',
        voiceSpeed: 1.1,
        captions: true,
        scenes: [
          {
            kind: 'avatar',
            avatarId: 'look_stock_001',
            voiceId: 'voz_001',
            script: 'Hola',
            background: { type: 'color', color: '#112233' },
          },
        ],
      },
      'clave-idempotencia-1',
    );

    assert.equal(id, 'vid_ejemplo_001');
    const [call] = calls;
    assert.equal(call?.method, 'POST');
    assert.equal(call?.headers['idempotency-key'], 'clave-idempotencia-1');
    assert.deepEqual(call?.body, {
      type: 'studio',
      title: 'Reel de prueba',
      aspect_ratio: '9:16',
      resolution: '1080p',
      caption: { file_format: 'srt', style: 'default' },
      scenes: [
        {
          type: 'avatar_video',
          input: {
            type: 'avatar',
            avatar_id: 'look_stock_001',
            script: 'Hola',
            voice_id: 'voz_001',
            voice_settings: { speed: 1.1 },
            remove_background: true,
            background: { type: 'color', color: '#112233' },
          },
        },
      ],
    });
  });

  it('con el fondo original no recorta el avatar ni pide subtítulos si están apagados', () => {
    const body = buildStudioBody({
      title: 't',
      aspectRatio: '1:1',
      voiceSpeed: 1,
      captions: false,
      scenes: [
        {
          kind: 'avatar',
          avatarId: 'a',
          voiceId: 'v',
          script: 's',
          background: { type: 'avatar' },
        },
      ],
    });
    assert.equal('caption' in body, false);
    assert.equal('remove_background' in inputOf(body, 0), false);
  });

  it('envía el motor de cada escena cuando se conoce', () => {
    const body = buildStudioBody({
      title: 't',
      aspectRatio: '9:16',
      voiceSpeed: 1,
      captions: false,
      scenes: [
        {
          kind: 'avatar',
          avatarId: 'a',
          voiceId: 'v',
          script: 's',
          background: { type: 'avatar' },
          engine: 'avatar_iii',
        },
        {
          kind: 'avatar',
          avatarId: 'b',
          voiceId: 'v',
          script: 's',
          background: { type: 'avatar' },
          engine: null,
        },
      ],
    });
    assert.deepEqual(inputOf(body, 0).engine, { type: 'avatar_iii' });
    assert.equal('engine' in inputOf(body, 1), false);
  });

  it('arma escenas de imagen narradas y fijas, y gestos para el avatar', () => {
    const body = buildStudioBody({
      title: 't',
      aspectRatio: '9:16',
      voiceSpeed: 1.1,
      captions: false,
      scenes: [
        { kind: 'image', assetId: 'tarjeta', durationSeconds: 2 },
        {
          kind: 'avatar',
          avatarId: 'a',
          voiceId: 'v',
          script: 'Hola',
          background: { type: 'avatar' },
          motionPrompt: 'asiente al cerrar',
        },
        { kind: 'image', assetId: 'apoyo', narration: { script: 'Mira esto', voiceId: 'v' } },
      ],
    });
    assert.deepEqual(body.scenes[0], {
      type: 'image',
      source: { type: 'asset_id', asset_id: 'tarjeta' },
      duration: 2,
    });
    assert.equal(inputOf(body, 1).motion_prompt, 'asiente al cerrar');
    assert.deepEqual(body.scenes[2], {
      type: 'image',
      source: { type: 'asset_id', asset_id: 'apoyo' },
      script: 'Mira esto',
      voice_id: 'v',
      voice_settings: { speed: 1.1 },
    });
  });

  it('lee los motores que admite cada avatar', async () => {
    const { fetchImpl } = mockFetch(() =>
      jsonResponse({
        data: { id: 'x', avatar_type: 'studio_avatar', supported_api_engines: ['avatar_iii'] },
      }),
    );
    const avatar = await new HeyGenProvider(FAKE_KEY, fetchImpl).getAvatar('x');
    assert.deepEqual(avatar.engines, ['avatar_iii']);
  });

  it('deja solo las voces del idioma pedido (HeyGen solo las ordena)', async () => {
    const voice = (id: string, language: string) => ({
      voice_id: id,
      name: id,
      language,
      gender: 'female',
      preview_audio_url: null,
    });
    const { fetchImpl } = mockFetch((url) =>
      jsonResponse({
        data:
          url.searchParams.get('type') === 'private'
            ? []
            : url.searchParams.get('language') === 'es'
              ? [voice('juliana', 'es'), voice('en', 'English')]
              : [voice('es', 'Spanish'), voice('multi', 'Multilingual'), voice('en', 'English')],
        has_more: false,
      }),
    );
    const voices = await new HeyGenProvider(FAKE_KEY, fetchImpl).listVoices('Spanish');
    // También las etiquetadas con el código ("es"), que HeyGen solo pone primero si se piden así.
    assert.deepEqual(
      voices.map((v) => v.id),
      ['es', 'juliana'],
    );
  });

  it('lee las escenas del video con su texto hablado y si muestran al presentador', async () => {
    const { fetchImpl, calls } = mockFetch(() =>
      jsonResponse({
        data: {
          video_id: 'vid_1',
          edit_version: 'a'.repeat(64),
          video: {},
          scenes: [
            {
              id: 's1',
              script: [{ id: 't1', text: 'Hola,  bienvenida.' }],
              elements: [
                { id: 'e1', type: 'avatar' },
                { id: 'e2', type: 'motion_graphics' },
              ],
            },
            { id: 's2', script: [{ id: 't2', text: '<break time="3.0s"/>' }], elements: [] },
          ],
        },
      }),
    );
    const scenes = await new HeyGenProvider(FAKE_KEY, fetchImpl).getVideoScenes('vid_1');
    assert.ok(calls[0]?.url.endsWith('/v3/videos/vid_1/scenes'));
    assert.equal(scenes.editVersion, 'a'.repeat(64));
    assert.deepEqual(scenes.scenes, [
      { id: 's1', script: 'Hola, bienvenida.', hasPresenter: true },
      { id: 's2', script: '', hasPresenter: false },
    ]);
  });

  it('envía los cambios por escena como edit_plan con clave de idempotencia', async () => {
    const { fetchImpl, calls } = mockFetch(() =>
      jsonResponse({ data: { session_id: 'ses_1', run_id: 'run_1', video_id: 'vid_2' } }),
    );
    const videoId = await new HeyGenProvider(FAKE_KEY, fetchImpl).editAgentScenes(
      'ses_1',
      [{ sceneId: 's1', text: 'Logo más grande', snapshotVideoId: 'vid_1', editVersion: 'v' }],
      'clave-1',
    );
    assert.equal(videoId, 'vid_2');
    assert.equal(calls[0]?.method, 'POST');
    assert.ok(calls[0]?.url.endsWith('/v3/video-agents/ses_1'));
    assert.equal(calls[0]?.headers['idempotency-key'], 'clave-1');
    assert.deepEqual(calls[0]?.body, {
      edit_plan: [
        {
          scene_id: 's1',
          text: 'Logo más grande',
          scene_snapshot_video_id: 'vid_1',
          edit_version: 'v',
        },
      ],
    });
  });

  it('sube el video del gemelo en tres pasos y no envía la API key al almacenamiento', async () => {
    const { fetchImpl, calls } = mockFetch((url) => {
      if (url.pathname.endsWith('/direct-uploads')) {
        return jsonResponse({
          data: {
            asset_id: 'asset_v',
            upload_url: 'https://almacenamiento.invalid/subida',
            upload_headers: { 'Content-Type': 'video/mp4' },
          },
        });
      }
      if (url.hostname === 'almacenamiento.invalid') return new Response(null, { status: 200 });
      return jsonResponse({ data: { asset_id: 'asset_v', status: 'processing' } });
    });
    const assetId = await new HeyGenProvider(FAKE_KEY, fetchImpl).uploadVideo(
      Buffer.from('mp4'),
      'video/mp4',
      'doctora.mp4',
    );
    assert.equal(assetId, 'asset_v');
    assert.deepEqual(calls[0]?.body, {
      filename: 'doctora.mp4',
      content_type: 'video/mp4',
      size_bytes: 3,
    });
    assert.equal(calls[1]?.method, 'PUT');
    assert.equal(calls[1]?.headers['x-api-key'], undefined);
    assert.ok(calls[2]?.url.endsWith('/v3/assets/asset_v/complete'));
  });

  it('crea el gemelo digital con el video subido y devuelve look, grupo y voz clonada', async () => {
    const { fetchImpl, calls } = mockFetch(() =>
      jsonResponse({
        data: {
          avatar_item: { id: 'look_1', default_voice_id: 'voz_clonada' },
          avatar_group: { id: 'grupo_1' },
        },
      }),
    );
    const twin = await new HeyGenProvider(FAKE_KEY, fetchImpl).createDigitalTwin(
      'Dra. Ejemplo',
      'asset_v',
      'clave-1',
    );
    assert.deepEqual(twin, { lookId: 'look_1', groupId: 'grupo_1', voiceId: 'voz_clonada' });
    assert.equal(calls[0]?.headers['idempotency-key'], 'clave-1');
    assert.deepEqual(calls[0]?.body, {
      type: 'digital_twin',
      name: 'Dra. Ejemplo',
      file: { type: 'asset_id', asset_id: 'asset_v' },
    });
  });

  it('un gemelo entrenado sin consentimiento aceptado sigue pendiente', async () => {
    const { fetchImpl } = mockFetch((url) =>
      jsonResponse({
        data: url.pathname.includes('/looks/')
          ? { status: 'completed', supported_api_engines: ['avatar_v'], default_voice_id: 'v1' }
          : { consent_status: 'pending' },
      }),
    );
    const state = await new HeyGenProvider(FAKE_KEY, fetchImpl).getDigitalTwin('look_1', 'grupo_1');
    assert.equal(state.status, 'pending_consent');
    assert.equal(state.consentStatus, 'pending');
    assert.equal(state.voiceId, 'v1');
  });

  it('crea ropa nueva para un avatar propio como look de la misma persona', async () => {
    const { fetchImpl, calls } = mockFetch(() =>
      jsonResponse({ data: { avatar_item: { id: 'look_2' }, avatar_group: { id: 'grupo_1' } } }),
    );
    const lookId = await new HeyGenProvider(FAKE_KEY, fetchImpl).createLookFromPrompt(
      'look_1',
      'Bata blanca',
      'Con bata médica blanca, consultorio luminoso',
      '9:16',
      'clave-1',
    );
    assert.equal(lookId, 'look_2');
    assert.ok(calls[0]?.url.endsWith('/v3/avatars'));
    assert.equal(calls[0]?.headers['idempotency-key'], 'clave-1');
    assert.deepEqual(calls[0]?.body, {
      type: 'prompt',
      name: 'Bata blanca',
      prompt: 'Con bata médica blanca, consultorio luminoso',
      avatar_id: 'look_1',
      aspect_ratio: '9:16',
    });
  });

  it('lee el motivo de una sesión del agente que falló', async () => {
    const { fetchImpl } = mockFetch(() =>
      jsonResponse({
        data: {
          status: 'failed',
          messages: [{ role: 'model', content: 'Here is the storyboard plan', type: 'resource' }],
          error: { code: 'free_tier_quota_exceeded', message: 'You have reached your quota.' },
        },
      }),
    );
    const session = await new HeyGenProvider(FAKE_KEY, fetchImpl).getAgentSession('ses_1');
    assert.equal(session.status, 'failed');
    assert.deepEqual(session.error, {
      code: 'free_tier_quota_exceeded',
      message: 'You have reached your quota.',
    });
  });

  it('prefiere el video con subtítulos al consultar el estado', async () => {
    const { fetchImpl } = mockFetch(() => jsonResponse(fixture('video-completed.json')));
    const state = await new HeyGenProvider(FAKE_KEY, fetchImpl).getVideo('vid_ejemplo_001');
    assert.equal(state.status, 'completed');
    assert.equal(state.downloadUrl, 'https://ejemplo.invalid/video-subtitulado.mp4');
    assert.equal(state.durationSeconds, 14.6);
  });

  it('trata estados iniciales desconocidos como pendientes', async () => {
    const { fetchImpl } = mockFetch(() => jsonResponse({ data: { status: 'waiting' } }));
    const state = await new HeyGenProvider(FAKE_KEY, fetchImpl).getVideo('x');
    assert.equal(state.status, 'pending');
  });

  describe('errores normalizados', () => {
    const errorFor = async (response: Response) => {
      const { fetchImpl } = mockFetch(() => response);
      try {
        await new HeyGenProvider(FAKE_KEY, fetchImpl).getAccount();
      } catch (error) {
        assert.ok(error instanceof VideoProviderError);
        return error;
      }
      assert.fail('Se esperaba un error');
    };

    it('saldo insuficiente: no reintentable', async () => {
      const error = await errorFor(jsonResponse(fixture('error-insufficient-credit.json'), 402));
      assert.deepEqual(
        { ...error.details, mensaje: undefined },
        {
          proveedor: 'heygen',
          codigo: 'insufficient_credit',
          mensaje: undefined,
          reintentable: false,
        },
      );
      assert.equal(error.status, 402);
    });

    it('límite de tasa: reintentable y respeta Retry-After', async () => {
      const error = await errorFor(
        jsonResponse(fixture('error-rate-limit.json'), 429, { 'Retry-After': '7' }),
      );
      assert.equal(error.details.reintentable, true);
      assert.equal(error.retryAfterSeconds, 7);
    });

    it('caída del proveedor: reintentable', async () => {
      const error = await errorFor(new Response('Bad gateway', { status: 503 }));
      assert.equal(error.details.reintentable, true);
      assert.equal(error.details.codigo, 'http_503');
    });

    it('key inválida: no reintentable y sin exponer la key', async () => {
      const error = await errorFor(jsonResponse({ error: { code: 'unauthorized' } }, 401));
      assert.equal(error.details.reintentable, false);
      assert.ok(!JSON.stringify(error.details).includes(FAKE_KEY));
      assert.ok(!error.message.includes(FAKE_KEY));
    });

    it('sin conexión: reintentable', async () => {
      const fetchImpl = (async () => {
        throw new TypeError('fetch failed');
      }) as typeof fetch;
      await assert.rejects(new HeyGenProvider(FAKE_KEY, fetchImpl).getAccount(), (error) => {
        assert.ok(error instanceof VideoProviderError);
        assert.equal(error.details.codigo, 'network');
        assert.equal(error.details.reintentable, true);
        return true;
      });
    });
  });

  it('solo descarga desde URLs https y sin la API key', async () => {
    const { fetchImpl, calls } = mockFetch(() => new Response('bytes'));
    const provider = new HeyGenProvider(FAKE_KEY, fetchImpl);
    await assert.rejects(provider.download('http://ejemplo.invalid/video.mp4'));
    await provider.download('https://ejemplo.invalid/video.mp4');
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.headers['x-api-key'], undefined);
  });

  it('elige Avatar V si el avatar lo admite; si no, Avatar IV; nunca Avatar III', () => {
    assert.equal(pickEngine(['avatar_v', 'avatar_iv', 'avatar_iii']), 'avatar_v');
    assert.equal(pickEngine(['avatar_iv', 'avatar_iii']), 'avatar_iv');
    assert.equal(pickEngine(['avatar_iii']), null);
    assert.equal(pickEngine([]), null);
  });

  describe('kits de marca', () => {
    const kit = {
      brand_kit_id: 'kit_001',
      name: 'Empresa Ejemplo',
      status: 'completed',
      colors: ['#112233'],
      color_roles: { primary: '#112233' },
      logos: [{ logo_id: 'logo_1', name: 'Logo', url: 'https://ejemplo.invalid/logo.png' }],
      logo_roles: { primary: 'logo_1' },
      fonts: [{ font_id: 'font_1', name: 'Fuente Ejemplo' }],
    };

    it('crea el kit desde un sitio web con clave de idempotencia', async () => {
      const { fetchImpl, calls } = mockFetch(() =>
        jsonResponse({ data: { brand_kit_id: 'kit_001', status: 'loading' } }, 201),
      );
      const id = await new HeyGenProvider(FAKE_KEY, fetchImpl).createBrandKitFromUrl(
        'https://empresa-ejemplo.com',
        'Empresa Ejemplo',
        'clave-1',
      );
      assert.equal(id, 'kit_001');
      assert.equal(calls[0]?.method, 'POST');
      assert.ok(calls[0]?.url.endsWith('/v3/brand-kits'));
      assert.equal(calls[0]?.headers['idempotency-key'], 'clave-1');
      assert.deepEqual(calls[0]?.body, {
        url: 'https://empresa-ejemplo.com',
        name: 'Empresa Ejemplo',
      });
    });

    it('lee el detalle con logos, fuentes y roles', async () => {
      const { fetchImpl } = mockFetch(() => jsonResponse({ data: kit }));
      const detail = await new HeyGenProvider(FAKE_KEY, fetchImpl).getBrandKit('kit_001');
      assert.equal(detail.status, 'completed');
      assert.deepEqual(detail.colorRoles, { primary: '#112233' });
      assert.equal(detail.primaryLogoId, 'logo_1');
      assert.equal(detail.logoUrl, 'https://ejemplo.invalid/logo.png');
      assert.deepEqual(detail.fonts, [{ id: 'font_1', name: 'Fuente Ejemplo' }]);
    });

    it('ajusta colores y logo principal con PATCH', async () => {
      const { fetchImpl, calls } = mockFetch(() => jsonResponse({ data: kit }));
      await new HeyGenProvider(FAKE_KEY, fetchImpl).updateBrandKit('kit_001', {
        colorRoles: { primary: '#AC704F', secondary: '#F1EAE7' },
        primaryLogoId: 'logo_1',
      });
      assert.equal(calls[0]?.method, 'PATCH');
      assert.deepEqual(calls[0]?.body, {
        color_roles: { primary: '#AC704F', secondary: '#F1EAE7' },
        logo_roles: { primary: 'logo_1' },
      });
    });
  });

  it('diseña voces con descripción, género y grupo', async () => {
    const { fetchImpl, calls } = mockFetch(() =>
      jsonResponse({
        data: {
          voices: [
            {
              voice_id: 'voz_1',
              name: 'Voz Ejemplo',
              language: 'Spanish',
              gender: 'female',
              preview_audio_url: 'https://ejemplo.invalid/voz.mp3',
              type: 'public',
            },
          ],
          seed: 1,
        },
      }),
    );
    const voices = await new HeyGenProvider(FAKE_KEY, fetchImpl).designVoices({
      prompt: 'Warm female voice',
      gender: 'female',
      seed: 1,
    });
    assert.equal(calls[0]?.method, 'POST');
    assert.ok(calls[0]?.url.endsWith('/v3/voices'));
    assert.deepEqual(calls[0]?.body, {
      prompt: 'Warm female voice',
      seed: 1,
      gender: 'female',
    });
    assert.deepEqual(
      voices.map((voice) => [voice.id, voice.language, voice.ownership]),
      [['voz_1', 'Spanish', 'public']],
    );
  });
});
