export type VideoProviderId = 'heygen';

/** Proporciones que ofrece la app para video (HeyGen no admite 3:4). */
export const VIDEO_ASPECT_RATIOS = ['9:16', '4:5', '1:1', '16:9'] as const;
export type VideoAspectRatio = (typeof VIDEO_ASPECT_RATIOS)[number];

/** Tipo de avatar según el proveedor. `digital_twin` y `photo_avatar` pueden ser personas reales. */
export type AvatarType = 'studio_avatar' | 'digital_twin' | 'photo_avatar' | 'unknown';

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

export interface RenderScene {
  avatarId: string;
  voiceId: string;
  script: string;
  background: SceneBackground;
}

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

/** Contrato de un proveedor de video con avatar. Permite agregar otros además de HeyGen. */
export interface VideoProvider {
  readonly id: VideoProviderId;
  /** Llamada de solo lectura para confirmar que la key es válida. */
  validateKey(): Promise<void>;
  getAccount(): Promise<VideoAccount>;
  listAvatars(): Promise<VideoAvatar[]>;
  getAvatar(id: string): Promise<VideoAvatar>;
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
}
