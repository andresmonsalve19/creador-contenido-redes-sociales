export type VideoProviderId = 'heygen';

/** Proporciones que ofrece la app para video (HeyGen no admite 3:4). */
export const VIDEO_ASPECT_RATIOS = ['9:16', '4:5', '1:1', '16:9'] as const;
export type VideoAspectRatio = (typeof VIDEO_ASPECT_RATIOS)[number];

/** Tipo de avatar según el proveedor. `digital_twin` y `photo_avatar` pueden ser personas reales. */
export type AvatarType = 'studio_avatar' | 'digital_twin' | 'photo_avatar' | 'unknown';

/**
 * Motores de render de HeyGen. Cada avatar admite solo algunos (`supported_api_engines`):
 * los avatares de estudio de stock, por ejemplo, solo `avatar_iii`.
 */
export const VIDEO_ENGINES = ['avatar_iv', 'avatar_iii', 'avatar_v'] as const;
export type VideoEngine = (typeof VIDEO_ENGINES)[number];

/**
 * Motor a usar con un avatar: Avatar IV (el estándar del proveedor) si lo admite; si no, Avatar
 * III y luego Avatar V. Sin información, null deja que el proveedor use su motor por defecto.
 */
export function pickEngine(supported: readonly string[]): VideoEngine | null {
  return VIDEO_ENGINES.find((engine) => supported.includes(engine)) ?? null;
}

/**
 * `motion_prompt` (gestos y movimiento de manos) solo lo admiten los photo avatars, con cualquier
 * motor, y los avatares de video con Avatar V.
 */
export const supportsMotionPrompt = (type: AvatarType, engine: VideoEngine | null) =>
  type === 'photo_avatar' || engine === 'avatar_v';

export interface VideoAvatar {
  id: string;
  name: string;
  type: AvatarType;
  /** `public` = avatar de stock del proveedor; `private` = creado en la cuenta. */
  ownership: 'public' | 'private';
  gender: string | null;
  previewImageUrl: string | null;
  previewVideoUrl: string | null;
  defaultVoiceId: string | null;
  orientation: 'portrait' | 'landscape' | 'square' | null;
  /** Motores de render que admite (p. ej. ["avatar_iii"]). Vacío si el proveedor no lo informa. */
  engines: string[];
  /** Grupo del avatar: los looks de un mismo grupo son la misma persona en otras tomas. */
  groupId: string | null;
}

export interface VideoVoice {
  id: string;
  name: string;
  language: string;
  gender: string | null;
  ownership: 'public' | 'private';
  previewAudioUrl: string | null;
}

/** Saldo de la cuenta tal como lo informa el proveedor. */
export interface VideoAccount {
  billingType: 'wallet' | 'subscription' | 'usage_based' | 'unknown';
  /** Saldo en USD si la cuenta es de billetera; null si el proveedor no lo informa. */
  balanceUsd: number | null;
  /** Resumen legible (p. ej. "US$ 12,50 en la billetera" o "120 créditos"). */
  summary: string;
}

export type SceneBackground =
  { type: 'avatar' } | { type: 'color'; color: string } | { type: 'image'; assetId: string };

/** Escena con el avatar hablando a cámara. */
export interface AvatarRenderScene {
  kind: 'avatar';
  avatarId: string;
  voiceId: string;
  script: string;
  background: SceneBackground;
  /** Motor compatible con el avatar; si se omite, el proveedor usa el suyo por defecto. */
  engine?: VideoEngine | null;
  /** Gestos y movimiento, solo si el avatar y el motor lo admiten. */
  motionPrompt?: string | null;
}

/**
 * Escena de imagen a pantalla completa: narrada (la voz sigue hablando sobre la imagen) si lleva
 * guion, o fija durante `durationSeconds` (p. ej. tarjetas de apertura y cierre con el logo).
 */
export interface ImageRenderScene {
  kind: 'image';
  assetId: string;
  narration?: { script: string; voiceId: string } | null;
  durationSeconds?: number;
}

export type RenderScene = AvatarRenderScene | ImageRenderScene;

export interface RenderRequest {
  title: string;
  aspectRatio: VideoAspectRatio;
  /** Multiplicador de velocidad de la voz (0,5 a 1,5). */
  voiceSpeed: number;
  /** Subtítulos quemados en el video. */
  captions: boolean;
  scenes: RenderScene[];
}

export type RenderStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface RenderState {
  status: RenderStatus;
  /** URL temporal del video final (con subtítulos si se pidieron). Expira: descargar de inmediato. */
  downloadUrl: string | null;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  failureCode: string | null;
  failureMessage: string | null;
}

/** Kit de marca guardado en el proveedor (colores, fuentes y logo). */
export interface BrandKit {
  id: string;
  name: string;
  logoUrl: string | null;
  colors: string[];
}

export const BRAND_COLOR_ROLES = ['primary', 'secondary', 'tertiary', 'accent'] as const;
export type BrandColorRole = (typeof BRAND_COLOR_ROLES)[number];

/** Detalle de un kit de marca: lo importado del sitio web y qué rol cumple cada elemento. */
export interface BrandKitDetail extends BrandKit {
  /** loading: importando; completed: listo; error: la importación falló (lo que llegó se conserva). */
  status: 'loading' | 'completed' | 'error';
  colorRoles: Partial<Record<BrandColorRole, string>>;
  logos: { id: string; name: string | null; url: string | null }[];
  primaryLogoId: string | null;
  fonts: { id: string; name: string | null }[];
}

export interface BrandKitUpdate {
  name?: string;
  /** Se reemplazan todos los roles de color (los omitidos quedan vacíos). */
  colorRoles?: Partial<Record<BrandColorRole, string>>;
  /** Debe ser uno de los logos importados en el kit. */
  primaryLogoId?: string;
}

/**
 * Sesión del agente de video (Video Agent de HeyGen): arma el video completo (presentador,
 * gráficos, textos, música y transiciones) a partir de un guion. En modo "chat" se detiene con
 * un storyboard para revisar antes de generar.
 */
export interface AgentSessionRequest {
  prompt: string;
  mode: 'chat' | 'generate';
  avatarId: string | null;
  voiceId: string | null;
  brandKitId: string | null;
  orientation: 'portrait' | 'landscape';
  /** Archivos adjuntos (p. ej. el logo real), en base64. */
  files: { mimeType: 'image/png' | 'image/jpeg'; data: Buffer }[];
}

export type AgentStatus =
  'thinking' | 'waiting_for_input' | 'reviewing' | 'generating' | 'completed' | 'failed';

export interface AgentMessage {
  role: 'user' | 'model';
  content: string;
  type: string;
  createdAt: number | null;
  resourceIds: string[];
}

export interface AgentSession {
  status: AgentStatus;
  progress: number | null;
  title: string | null;
  videoId: string | null;
  /** Mensajes más recientes primero. */
  messages: AgentMessage[];
}

export interface AgentResource {
  id: string;
  type: string;
  url: string | null;
  thumbnailUrl: string | null;
}

/** Contrato de un proveedor de video con avatar. Permite agregar otros además de HeyGen. */
export interface VideoProvider {
  readonly id: VideoProviderId;
  /** Llamada de solo lectura para confirmar que la key es válida. */
  validateKey(): Promise<void>;
  getAccount(): Promise<VideoAccount>;
  listAvatars(): Promise<VideoAvatar[]>;
  getAvatar(id: string): Promise<VideoAvatar>;
  /** Looks (otras tomas) del mismo grupo de un avatar. */
  listGroupLooks(groupId: string): Promise<VideoAvatar[]>;
  listVoices(language?: string): Promise<VideoVoice[]>;
  /** Sube una imagen (PNG o JPEG) y devuelve el id del recurso en el proveedor. */
  uploadImage(
    data: Buffer,
    mimeType: 'image/png' | 'image/jpeg',
    fileName: string,
  ): Promise<string>;
  /**
   * Crea el render. La clave de idempotencia evita un segundo render (y un segundo cobro) si la
   * misma petición se reintenta.
   */
  createVideo(request: RenderRequest, idempotencyKey: string): Promise<string>;
  getVideo(id: string): Promise<RenderState>;
  /** Descarga un archivo de una URL entregada por el proveedor. */
  download(url: string): Promise<Response>;
  listBrandKits(): Promise<BrandKit[]>;
  /** Crea un kit importando un sitio web público (logos, colores y fuentes). */
  createBrandKitFromUrl(url: string, name: string, idempotencyKey: string): Promise<string>;
  getBrandKit(id: string): Promise<BrandKitDetail>;
  /** Ajusta colores y logo principal; solo con el kit ya importado. */
  updateBrandKit(id: string, update: BrandKitUpdate): Promise<BrandKitDetail>;
  /** Crea una sesión del agente. No es idempotente: no se debe reintentar a ciegas. */
  createAgentSession(request: AgentSessionRequest): Promise<string>;
  getAgentSession(sessionId: string): Promise<AgentSession>;
  /** Envía un mensaje al agente: pedir cambios o aprobar el storyboard para generar. */
  sendAgentMessage(sessionId: string, message: string): Promise<void>;
  getAgentResource(sessionId: string, resourceId: string): Promise<AgentResource>;
}
