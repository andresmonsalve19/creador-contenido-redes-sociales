import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { VideoProviderError } from '../src/shared/video/errors.js';
import { HeyGenProvider, buildStudioBody } from '../src/shared/video/heygen/client.js';
import { fixture, jsonResponse, mockFetch } from './helpers.js';

const FAKE_KEY = 'clave-ficticia-de-prueba';

describe('HeyGenProvider', () => {
  it('lista avatares propios y de stock recorriendo las páginas', async () => {
    const { fetchImpl, calls } = mockFetch((url) => {
      if (url.searchParams.get('ownership') === 'private')
        return jsonResponse(fixture('looks-private.json'));
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
      ],
    );
    assert.equal(calls.length, 3);
    assert.ok(
      calls.every((call) => call.url.startsWith('https://api.heygen.com/v3/avatars/looks')),
    );
    assert.ok(calls.every((call) => call.headers['x-api-key'] === FAKE_KEY));
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
      scenes: [{ avatarId: 'a', voiceId: 'v', script: 's', background: { type: 'avatar' } }],
    });
    assert.equal('caption' in body, false);
    assert.equal('remove_background' in (body.scenes[0]?.input ?? {}), false);
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
});
