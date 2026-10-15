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

  it('elige Avatar IV si el avatar lo admite; si no, Avatar III y luego Avatar V', () => {
    assert.equal(pickEngine(['avatar_v', 'avatar_iv', 'avatar_iii']), 'avatar_iv');
    assert.equal(pickEngine(['avatar_iii']), 'avatar_iii');
    assert.equal(pickEngine(['avatar_v']), 'avatar_v');
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
});
