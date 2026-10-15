/**
 * Cliente de la API v3 de HeyGen.
 *
 * Documentación oficial consultada el 2026-10-08:
 * - Índice:            https://developers.heygen.com/llms.txt
 * - API key:           https://developers.heygen.com/docs/api-key.md          (cabecera X-Api-Key, GET /v3/users/me)
 * - Videos multiescena: https://developers.heygen.com/studio-videos.md         (POST /v3/videos, type "studio")
 * - Estado del video:  https://developers.heygen.com/reference/get-video.md   (GET /v3/videos/{id})
 * - Avatares:          https://developers.heygen.com/reference/list-avatar-looks.md (GET /v3/avatars/looks)
 * - Voces:             https://developers.heygen.com/docs/voices/search-voices.md   (GET /v3/voices)
 * - Recursos:          https://developers.heygen.com/docs/upload-assets.md   (POST /v3/assets)
 * - Límites:           https://developers.heygen.com/docs/usage-limits.md
 * - Errores:           https://developers.heygen.com/docs/error-codes.md
 *
 * HeyGen no publica en su documentación los precios por segundo (solo en el panel con sesión
 * iniciada), por eso esta app no estima costos en dólares: muestra el saldo de la cuenta.
 */
import { z } from 'zod';
import { VideoProviderError } from '../errors.js';
import type {
  AgentResource,
  AgentSession,
  AgentSessionRequest,
  AgentStatus,
  AvatarType,
  BrandKit,
  BrandKitDetail,
  BrandKitUpdate,
  RenderRequest,
  RenderState,
  SceneBackground,
  VideoAccount,
  VideoAvatar,
  VideoProvider,
  VideoVoice,
} from '../types.js';
import { BRAND_COLOR_ROLES } from '../types.js';

const BASE_URL = 'https://api.heygen.com';
const REQUEST_TIMEOUT_MS = 30_000;
const PAGE_SIZE_LOOKS = 50;
const PAGE_SIZE_VOICES = 100;
/**
 * Topes de páginas al listar (el listado se guarda en caché). El catálogo de stock tiene unos
 * 1.250 avatares de estudio y casi 8.000 photo avatars (octubre de 2026), y la API no filtra por
 * género: se piden por tipo para que los de estudio, los de mejor calidad, siempre aparezcan.
 */
const MAX_PUBLIC_STUDIO_PAGES = 40;
const MAX_PUBLIC_PHOTO_PAGES = 20;
const MAX_PUBLIC_VOICE_PAGES = 4;
const MAX_PRIVATE_PAGES = 10;

type FetchLike = typeof fetch;

// --- Respuestas de la API (solo los campos que se usan) -------------------------------------

const nullableString = z.string().nullish();

const lookSchema = z.object({
  id: z.string(),
  name: z.string().nullish(),
  avatar_type: z.string().nullish(),
  preview_image_url: nullableString,
  preview_video_url: nullableString,
  gender: nullableString,
  default_voice_id: nullableString,
  preferred_orientation: nullableString,
  supported_api_engines: z.array(z.string()).nullish(),
  group_id: nullableString,
});

const pageSchema = <T extends z.ZodType>(item: T) =>
  z.object({
    data: z.array(item),
    has_more: z.boolean().nullish(),
    next_token: nullableString,
  });

const voiceSchema = z.object({
  voice_id: z.string(),
  name: z.string().nullish(),
  language: z.string().nullish(),
  gender: nullableString,
  preview_audio_url: nullableString,
});

const creditPool = z.object({ remaining: z.number().nullish() }).nullish();

const userSchema = z.object({
  data: z.object({
    billing_type: z.string().nullish(),
    wallet: z
      .object({ currency: z.string().nullish(), remaining_balance: z.number().nullish() })
      .nullish(),
    subscription: z
      .object({
        plan: z.string().nullish(),
        credits: z.object({ premium_credits: creditPool, add_on_credits: creditPool }).nullish(),
      })
      .nullish(),
    usage_based: z
      .object({
        spending_current_usd: z.number().nullish(),
        spending_cap_usd: z.number().nullish(),
      })
      .nullish(),
  }),
});

const createVideoSchema = z.object({ data: z.object({ video_id: z.string() }) });

const videoSchema = z.object({
  data: z.object({
    status: z.string(),
    video_url: nullableString,
    captioned_video_url: nullableString,
    thumbnail_url: nullableString,
    duration: z.number().nullish(),
    failure_code: nullableString,
    failure_message: nullableString,
  }),
});

const assetSchema = z.object({ data: z.object({ asset_id: z.string() }) });

const brandKitSchema = z.object({
  brand_kit_id: z.string(),
  name: z.string().nullish(),
  logo_url: nullableString,
  colors: z.array(z.string()).nullish(),
});

const brandKitDetailSchema = z.object({
  data: z.object({
    brand_kit_id: z.string(),
    name: z.string().nullish(),
    status: z.string().nullish(),
    colors: z.array(z.string()).nullish(),
    color_roles: z
      .object({
        primary: nullableString,
        secondary: nullableString,
        tertiary: nullableString,
        accent: nullableString,
      })
      .nullish(),
    logos: z
      .array(z.object({ logo_id: z.string(), name: nullableString, url: nullableString }))
      .nullish(),
    logo_roles: z.object({ primary: nullableString }).nullish(),
    fonts: z.array(z.object({ font_id: z.string(), name: nullableString })).nullish(),
  }),
});

function toBrandKitDetail(data: z.infer<typeof brandKitDetailSchema>['data']): BrandKitDetail {
  const roles = data.color_roles ?? {};
  const colorRoles: BrandKitDetail['colorRoles'] = {};
  for (const role of BRAND_COLOR_ROLES) {
    const value = roles[role];
    if (value) colorRoles[role] = value;
  }
  const logos = (data.logos ?? []).map((logo) => ({
    id: logo.logo_id,
    name: logo.name ?? null,
    url: logo.url ?? null,
  }));
  return {
    id: data.brand_kit_id,
    name: data.name?.trim() || 'Kit de marca',
    status: data.status === 'completed' || data.status === 'error' ? data.status : 'loading',
    colors: data.colors ?? [],
    colorRoles,
    logos,
    logoUrl:
      logos.find((logo) => logo.id === data.logo_roles?.primary)?.url ?? logos[0]?.url ?? null,
    primaryLogoId: data.logo_roles?.primary ?? null,
    fonts: (data.fonts ?? []).map((font) => ({ id: font.font_id, name: font.name ?? null })),
  };
}

const agentCreateSchema = z.object({ data: z.object({ session_id: z.string() }) });

const agentMessageSchema = z.object({
  role: z.string(),
  content: z.string().nullish(),
  type: z.string().nullish(),
  created_at: z.number().nullish(),
  resource_ids: z.array(z.string()).nullish(),
});

const agentSessionSchema = z.object({
  data: z.object({
    status: z.string(),
    progress: z.number().nullish(),
    title: nullableString,
    video_id: nullableString,
    messages: z.array(agentMessageSchema).nullish(),
  }),
});

const agentResourceSchema = z.object({
  data: z.object({
    resource_id: z.string(),
    resource_type: z.string().nullish(),
    url: nullableString,
    thumbnail_url: nullableString,
  }),
});

const AGENT_STATUSES: readonly AgentStatus[] = [
  'thinking',
  'waiting_for_input',
  'reviewing',
  'generating',
  'completed',
  'failed',
];

const errorBodySchema = z.object({
  error: z.object({ code: z.string().nullish(), message: z.string().nullish() }),
});

// --- Utilidades ----------------------------------------------------------------------------

const AVATAR_TYPES: readonly AvatarType[] = ['studio_avatar', 'digital_twin', 'photo_avatar'];

function toAvatar(
  look: z.infer<typeof lookSchema>,
  ownership: VideoAvatar['ownership'],
): VideoAvatar {
  const type = AVATAR_TYPES.find((t) => t === look.avatar_type) ?? 'unknown';
  const orientation = look.preferred_orientation;
  return {
    id: look.id,
    name: look.name?.trim() || look.id,
    type,
    ownership,
    gender: look.gender ?? null,
    previewImageUrl: look.preview_image_url ?? null,
    previewVideoUrl: look.preview_video_url ?? null,
    defaultVoiceId: look.default_voice_id ?? null,
    orientation:
      orientation === 'portrait' || orientation === 'landscape' || orientation === 'square'
        ? orientation
        : null,
    engines: look.supported_api_engines ?? [],
    groupId: look.group_id ?? null,
  };
}

function toVoice(
  voice: z.infer<typeof voiceSchema>,
  ownership: VideoVoice['ownership'],
): VideoVoice {
  return {
    id: voice.voice_id,
    name: voice.name?.trim() || voice.voice_id,
    language: voice.language ?? '',
    gender: voice.gender ?? null,
    ownership,
    previewAudioUrl: voice.preview_audio_url ?? null,
  };
}

const usd = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'USD' });

function toAccount(user: z.infer<typeof userSchema>['data']): VideoAccount {
  if (user.billing_type === 'wallet' && user.wallet) {
    const balance = user.wallet.remaining_balance ?? null;
    return {
      billingType: 'wallet',
      balanceUsd: balance,
      summary: balance === null ? 'Saldo no disponible' : `${usd.format(balance)} en la billetera`,
    };
  }
  if (user.billing_type === 'subscription' && user.subscription) {
    const credits =
      (user.subscription.credits?.premium_credits?.remaining ?? 0) +
      (user.subscription.credits?.add_on_credits?.remaining ?? 0);
    return {
      billingType: 'subscription',
      balanceUsd: null,
      summary: `${credits} créditos disponibles (plan ${user.subscription.plan ?? 'de suscripción'})`,
    };
  }
  if (user.billing_type === 'usage_based' && user.usage_based) {
    const { spending_current_usd: spent, spending_cap_usd: cap } = user.usage_based;
    return {
      billingType: 'usage_based',
      balanceUsd: cap != null && spent != null ? cap - spent : null,
      summary:
        spent != null
          ? `${usd.format(spent)} gastados${cap != null ? ` de un tope de ${usd.format(cap)}` : ''}`
          : 'Consumo no disponible',
    };
  }
  return { billingType: 'unknown', balanceUsd: null, summary: 'Saldo no disponible' };
}

function toBackground(background: SceneBackground) {
  switch (background.type) {
    case 'avatar':
      return {};
    case 'color':
      return { remove_background: true, background: { type: 'color', color: background.color } };
    case 'image':
      return {
        remove_background: true,
        background: {
          type: 'image',
          source: { type: 'asset_id', asset_id: background.assetId },
        },
      };
  }
}

/** Cuerpo de POST /v3/videos para un video multiescena (type "studio"). */
export function buildStudioBody(request: RenderRequest) {
  return {
    type: 'studio',
    title: request.title,
    aspect_ratio: request.aspectRatio,
    resolution: '1080p',
    // style "default" quema los subtítulos en el video; sin style solo se entrega el SRT aparte.
    ...(request.captions && { caption: { file_format: 'srt', style: 'default' } }),
    scenes: request.scenes.map((scene) =>
      scene.kind === 'image'
        ? {
            type: 'image',
            source: { type: 'asset_id', asset_id: scene.assetId },
            // Narrada: la voz marca la duración. Fija: se indica la duración en segundos.
            ...(scene.narration
              ? {
                  script: scene.narration.script,
                  voice_id: scene.narration.voiceId,
                  voice_settings: { speed: request.voiceSpeed },
                }
              : { duration: scene.durationSeconds ?? 2 }),
          }
        : {
            type: 'avatar_video',
            input: {
              type: 'avatar',
              avatar_id: scene.avatarId,
              script: scene.script,
              voice_id: scene.voiceId,
              voice_settings: { speed: request.voiceSpeed },
              // Sin motor, HeyGen usa Avatar IV, que no todos los avatares admiten.
              ...(scene.engine && { engine: { type: scene.engine } }),
              ...(scene.motionPrompt && { motion_prompt: scene.motionPrompt }),
              ...toBackground(scene.background),
            },
          },
    ),
  };
}

function toRenderState(video: z.infer<typeof videoSchema>['data']): RenderState {
  const status =
    video.status === 'completed' || video.status === 'failed' || video.status === 'processing'
      ? video.status
      : 'pending'; // "pending", "waiting" u otros estados iniciales
  return {
    status,
    downloadUrl: video.captioned_video_url ?? video.video_url ?? null,
    thumbnailUrl: video.thumbnail_url ?? null,
    durationSeconds: video.duration ?? null,
    failureCode: video.failure_code ?? null,
    failureMessage: video.failure_message ?? null,
  };
}

/** Traduce una respuesta de error de HeyGen al formato normalizado, sin exponer la key. */
export async function toVideoError(response: Response): Promise<VideoProviderError> {
  const body = errorBodySchema.safeParse(await response.json().catch(() => null));
  const code = (body.success && body.data.error.code) || `http_${response.status}`;
  const detail = body.success ? (body.data.error.message ?? '') : '';
  const retryAfter = Number(response.headers.get('retry-after'));
  const retryAfterSeconds = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null;

  const make = (status: number, mensaje: string, reintentable: boolean) =>
    new VideoProviderError(
      status,
      { proveedor: 'heygen', codigo: code, mensaje, reintentable },
      retryAfterSeconds,
    );

  if (response.status === 401) return make(401, 'La API key de HeyGen no es válida.', false);
  if (response.status === 402) {
    return make(402, `Saldo insuficiente en HeyGen. ${detail}`.trim(), false);
  }
  if (response.status === 403) {
    return make(
      403,
      `La API key de HeyGen no tiene permiso para esta acción. ${detail}`.trim(),
      false,
    );
  }
  if (response.status === 429) {
    return make(429, 'HeyGen pidió esperar antes de seguir (límite de uso).', true);
  }
  if (response.status >= 500) {
    return make(502, 'HeyGen no respondió correctamente. Se puede intentar de nuevo.', true);
  }
  return make(
    response.status === 404 ? 404 : 400,
    detail ? `HeyGen: ${detail}` : 'HeyGen rechazó la petición.',
    false,
  );
}

const networkError = () =>
  new VideoProviderError(502, {
    proveedor: 'heygen',
    codigo: 'network',
    mensaje: 'No se pudo conectar con HeyGen. Revisa tu conexión a internet.',
    reintentable: true,
  });

// --- Proveedor -----------------------------------------------------------------------------

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH';
  json?: unknown;
  form?: FormData;
  idempotencyKey?: string;
}

export class HeyGenProvider implements VideoProvider {
  readonly id = 'heygen' as const;

  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  private async request<T extends z.ZodType>(
    schema: T,
    path: string,
    { method = 'GET', json, form, idempotencyKey }: RequestOptions = {},
  ): Promise<z.infer<T>> {
    const headers: Record<string, string> = {
      'X-Api-Key': this.apiKey,
      Accept: 'application/json',
    };
    if (json !== undefined) headers['Content-Type'] = 'application/json';
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

    let response: Response;
    try {
      response = await this.fetchImpl(`${BASE_URL}${path}`, {
        method,
        headers,
        body: form ?? (json === undefined ? undefined : JSON.stringify(json)),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw networkError();
    }

    if (!response.ok) throw await toVideoError(response);

    const parsed = schema.safeParse(await response.json().catch(() => null));
    if (!parsed.success) {
      throw new VideoProviderError(502, {
        proveedor: 'heygen',
        codigo: 'unexpected_response',
        mensaje: 'HeyGen respondió en un formato inesperado.',
        reintentable: false,
      });
    }
    return parsed.data;
  }

  /** Recorre las páginas de un listado con cursor hasta `maxPages`. */
  private async paginate<T extends z.ZodType>(
    item: T,
    path: string,
    params: Record<string, string>,
    maxPages: number,
  ): Promise<z.infer<T>[]> {
    const items: z.infer<T>[] = [];
    let token: string | null | undefined;
    for (let page = 0; page < maxPages; page++) {
      const query = new URLSearchParams({ ...params, ...(token ? { token } : {}) });
      const load = () => this.request(pageSchema(item), `${path}?${query}`);
      let result: z.infer<ReturnType<typeof pageSchema<T>>>;
      try {
        result = await load();
      } catch (error) {
        // La primera página es obligatoria. En las siguientes, un fallo temporal se reintenta una
        // vez y, si persiste, se devuelve lo ya cargado en lugar de perder todo el listado.
        if (page === 0 || !(error instanceof VideoProviderError) || !error.details.reintentable) {
          throw error;
        }
        try {
          result = await load();
        } catch {
          break;
        }
      }
      items.push(...result.data);
      token = result.next_token;
      if (!result.has_more || !token) break;
    }
    return items;
  }

  async validateKey(): Promise<void> {
    await this.request(userSchema, '/v3/users/me');
  }

  async getAccount(): Promise<VideoAccount> {
    const { data } = await this.request(userSchema, '/v3/users/me');
    return toAccount(data);
  }

  async listAvatars(): Promise<VideoAvatar[]> {
    const limit = String(PAGE_SIZE_LOOKS);
    const looks = (params: Record<string, string>, maxPages: number) =>
      this.paginate(lookSchema, '/v3/avatars/looks', { ...params, limit }, maxPages);
    const [own, studio, photo] = await Promise.all([
      looks({ ownership: 'private' }, MAX_PRIVATE_PAGES),
      looks({ ownership: 'public', avatar_type: 'studio_avatar' }, MAX_PUBLIC_STUDIO_PAGES),
      looks({ ownership: 'public', avatar_type: 'photo_avatar' }, MAX_PUBLIC_PHOTO_PAGES),
    ]);
    // Propios primero, luego los de estudio (mejor calidad) y al final los photo avatars.
    return [
      ...own.map((look) => toAvatar(look, 'private')),
      ...studio.map((look) => toAvatar(look, 'public')),
      ...photo.map((look) => toAvatar(look, 'public')),
    ];
  }

  async getAvatar(id: string): Promise<VideoAvatar> {
    const { data } = await this.request(
      z.object({ data: lookSchema }),
      `/v3/avatars/looks/${encodeURIComponent(id)}`,
    );
    // Esta consulta no informa la propiedad; solo se usa para conocer el tipo del avatar.
    return toAvatar(data, 'private');
  }

  async listGroupLooks(groupId: string): Promise<VideoAvatar[]> {
    const looks = await this.paginate(
      lookSchema,
      '/v3/avatars/looks',
      { group_id: groupId, limit: String(PAGE_SIZE_LOOKS) },
      2,
    );
    // La propiedad no viene en el look; se usa solo para alternar tomas del mismo avatar.
    return looks.map((look) => toAvatar(look, 'public'));
  }

  async listVoices(language?: string): Promise<VideoVoice[]> {
    const params: Record<string, string> = {
      limit: String(PAGE_SIZE_VOICES),
      ...(language ? { language } : {}),
    };
    const [own, stock] = await Promise.all([
      this.paginate(voiceSchema, '/v3/voices', { ...params, type: 'private' }, MAX_PRIVATE_PAGES),
      this.paginate(
        voiceSchema,
        '/v3/voices',
        { ...params, type: 'public' },
        MAX_PUBLIC_VOICE_PAGES,
      ),
    ]);
    return [
      ...own.map((voice) => toVoice(voice, 'private')),
      ...stock.map((voice) => toVoice(voice, 'public')),
    ];
  }

  async uploadImage(
    data: Buffer,
    mimeType: 'image/png' | 'image/jpeg',
    fileName: string,
  ): Promise<string> {
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(data)], { type: mimeType }), fileName);
    const result = await this.request(assetSchema, '/v3/assets', { method: 'POST', form });
    return result.data.asset_id;
  }

  async createVideo(request: RenderRequest, idempotencyKey: string): Promise<string> {
    const result = await this.request(createVideoSchema, '/v3/videos', {
      method: 'POST',
      json: buildStudioBody(request),
      idempotencyKey,
    });
    return result.data.video_id;
  }

  async getVideo(id: string): Promise<RenderState> {
    const { data } = await this.request(videoSchema, `/v3/videos/${encodeURIComponent(id)}`);
    return toRenderState(data);
  }

  async download(url: string): Promise<Response> {
    // Las URLs de descarga son prefirmadas: no llevan la API key.
    if (!url.startsWith('https://')) {
      throw new VideoProviderError(502, {
        proveedor: 'heygen',
        codigo: 'invalid_download_url',
        mensaje: 'HeyGen entregó una URL de descarga no válida.',
        reintentable: false,
      });
    }
    let response: Response;
    try {
      response = await this.fetchImpl(url, { signal: AbortSignal.timeout(5 * 60_000) });
    } catch {
      throw networkError();
    }
    if (!response.ok || !response.body) {
      throw new VideoProviderError(502, {
        proveedor: 'heygen',
        codigo: `download_http_${response.status}`,
        mensaje: 'No se pudo descargar el video de HeyGen.',
        reintentable: true,
      });
    }
    return response;
  }

  async listBrandKits(): Promise<BrandKit[]> {
    const kits = await this.paginate(brandKitSchema, '/v3/brand-kits', { limit: '50' }, 4);
    return kits.map((kit) => ({
      id: kit.brand_kit_id,
      name: kit.name?.trim() || 'Kit de marca',
      logoUrl: kit.logo_url ?? null,
      colors: kit.colors ?? [],
    }));
  }

  async createAgentSession(request: AgentSessionRequest): Promise<string> {
    const result = await this.request(agentCreateSchema, '/v3/video-agents', {
      method: 'POST',
      json: {
        prompt: request.prompt,
        mode: request.mode,
        orientation: request.orientation,
        ...(request.avatarId && { avatar_id: request.avatarId }),
        ...(request.voiceId && { voice_id: request.voiceId }),
        ...(request.brandKitId && { brand_kit_id: request.brandKitId }),
        ...(request.files.length > 0 && {
          files: request.files.map((file) => ({
            type: 'base64',
            media_type: file.mimeType,
            data: file.data.toString('base64'),
          })),
        }),
      },
    });
    return result.data.session_id;
  }

  async getAgentSession(sessionId: string): Promise<AgentSession> {
    const { data } = await this.request(
      agentSessionSchema,
      `/v3/video-agents/${encodeURIComponent(sessionId)}`,
    );
    const status = AGENT_STATUSES.find((value) => value === data.status) ?? 'thinking';
    return {
      status,
      progress: data.progress ?? null,
      title: data.title ?? null,
      videoId: data.video_id ?? null,
      messages: (data.messages ?? []).map((message) => ({
        role: message.role === 'user' ? 'user' : 'model',
        content: message.content ?? '',
        type: message.type ?? 'text',
        createdAt: message.created_at ?? null,
        resourceIds: message.resource_ids ?? [],
      })),
    };
  }

  async sendAgentMessage(sessionId: string, message: string): Promise<void> {
    await this.request(z.unknown(), `/v3/video-agents/${encodeURIComponent(sessionId)}`, {
      method: 'POST',
      json: { message },
    });
  }

  async getAgentResource(sessionId: string, resourceId: string): Promise<AgentResource> {
    const { data } = await this.request(
      agentResourceSchema,
      `/v3/video-agents/${encodeURIComponent(sessionId)}/resources/${encodeURIComponent(resourceId)}`,
    );
    return {
      id: data.resource_id,
      type: data.resource_type ?? 'unknown',
      url: data.url ?? null,
      thumbnailUrl: data.thumbnail_url ?? null,
    };
  }

  async createBrandKitFromUrl(url: string, name: string, idempotencyKey: string): Promise<string> {
    const result = await this.request(
      z.object({ data: z.object({ brand_kit_id: z.string() }) }),
      '/v3/brand-kits',
      { method: 'POST', json: { url, name }, idempotencyKey },
    );
    return result.data.brand_kit_id;
  }

  async getBrandKit(id: string): Promise<BrandKitDetail> {
    const { data } = await this.request(
      brandKitDetailSchema,
      `/v3/brand-kits/${encodeURIComponent(id)}`,
    );
    return toBrandKitDetail(data);
  }

  async updateBrandKit(id: string, update: BrandKitUpdate): Promise<BrandKitDetail> {
    const { data } = await this.request(
      brandKitDetailSchema,
      `/v3/brand-kits/${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        json: {
          ...(update.name && { name: update.name }),
          ...(update.colorRoles && { color_roles: update.colorRoles }),
          ...(update.primaryLogoId && { logo_roles: { primary: update.primaryLogoId } }),
        },
      },
    );
    return toBrandKitDetail(data);
  }
}
