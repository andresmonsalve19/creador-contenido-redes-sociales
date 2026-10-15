// Contratos de las rutas de video comunes (server/src/shared/video).

export type VideoAspectRatio = '9:16' | '4:5' | '1:1' | '16:9';
export const VIDEO_DURATIONS = [15, 30, 45, 60] as const;
export type VideoDuration = (typeof VIDEO_DURATIONS)[number];

export type AvatarType = 'studio_avatar' | 'digital_twin' | 'photo_avatar' | 'unknown';

export interface VideoAvatar {
  id: string;
  name: string;
  type: AvatarType;
  ownership: 'public' | 'private';
  gender: string | null;
  previewImageUrl: string | null;
  previewVideoUrl: string | null;
  defaultVoiceId: string | null;
  orientation: 'portrait' | 'landscape' | 'square' | null;
  /** Motores de render que admite el avatar (el servidor elige uno compatible al generar). */
  engines: string[];
}

export interface VideoVoice {
  id: string;
  name: string;
  language: string;
  gender: string | null;
  ownership: 'public' | 'private';
  previewAudioUrl: string | null;
}

export interface VideoAccount {
  billingType: 'wallet' | 'subscription' | 'usage_based' | 'unknown';
  balanceUsd: number | null;
  summary: string;
}

export type VideoBackgroundSetting =
  { type: 'avatar' } | { type: 'color'; color: string } | { type: 'image' } | { type: 'generated' };

export interface AvatarAuthorization {
  confirmed: true;
  personName: string;
  /** AAAA-MM-DD */
  date: string;
}

export interface VideoSettings {
  defaultAvatarId: string | null;
  defaultVoiceId: string | null;
  favoriteAvatarIds: string[];
  voiceLanguage: string;
  voiceSpeed: number;
  background: VideoBackgroundSetting;
  captions: boolean;
  aspectRatio: VideoAspectRatio;
  durationSeconds: VideoDuration;
  complianceRules: string;
  /** Kit de marca de HeyGen para la edición automática. */
  brandKitId: string | null;
  authorizations: Record<string, AvatarAuthorization>;
}

export interface BrandKit {
  id: string;
  name: string;
  logoUrl: string | null;
  colors: string[];
}

export const BRAND_COLOR_ROLES = ['primary', 'secondary', 'tertiary', 'accent'] as const;
export type BrandColorRole = (typeof BRAND_COLOR_ROLES)[number];

export const COLOR_ROLE_LABEL: Record<BrandColorRole, string> = {
  primary: 'Principal',
  secondary: 'Secundario',
  tertiary: 'Terciario',
  accent: 'Acento',
};

export interface BrandKitDetail extends BrandKit {
  status: 'loading' | 'completed' | 'error';
  colorRoles: Partial<Record<BrandColorRole, string>>;
  logos: { id: string; name: string | null; url: string | null }[];
  primaryLogoId: string | null;
  fonts: { id: string; name: string | null }[];
}

export interface BrandKitSuggestions {
  website: string | null;
  palette: { label: string; hex: string }[];
  colorRoles: Partial<Record<BrandColorRole, string>>;
}

export interface VideoSettingsResponse {
  settings: VideoSettings;
  backgroundImage: { fileName: string; mimeType: string; updatedAt: string; url: string } | null;
}

/**
 * Los digital twins y photo avatars propios de la cuenta pueden representar a una persona real:
 * exigen autorización. Los de stock son del catálogo licenciado de HeyGen y no la necesitan.
 */
export const requiresAuthorization = (avatar: Pick<VideoAvatar, 'type' | 'ownership'>) =>
  avatar.ownership === 'private' &&
  (avatar.type === 'digital_twin' || avatar.type === 'photo_avatar');

export const AVATAR_TYPE_LABEL: Record<AvatarType, string> = {
  studio_avatar: 'Avatar de estudio',
  digital_twin: 'Digital twin',
  photo_avatar: 'Photo avatar',
  unknown: 'Avatar',
};

/** Idiomas de voz más comunes, con el nombre que usa HeyGen. */
export const VOICE_LANGUAGES = [
  { value: 'Spanish', label: 'Español' },
  { value: 'English', label: 'Inglés' },
  { value: 'Portuguese', label: 'Portugués' },
  { value: 'French', label: 'Francés' },
] as const;
