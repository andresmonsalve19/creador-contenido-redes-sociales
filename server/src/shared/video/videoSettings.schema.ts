import { z } from 'zod';
import { VIDEO_ASPECT_RATIOS, type AvatarType } from './types.js';

export const VIDEO_DURATIONS = [15, 30, 45, 60] as const;
export type VideoDuration = (typeof VIDEO_DURATIONS)[number];

export const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Usa un color en formato HEX, por ejemplo #0F2A5F.');

/** Id que entrega el proveedor (avatar o voz). Nunca se escribe a mano: se elige de la API. */
const providerId = z.string().trim().min(1).max(200);

/**
 * Fondo por defecto de los videos:
 * - avatar: el fondo original del avatar (el más seguro: funciona con cualquier avatar).
 * - color: color sólido de la marca.
 * - image: la imagen de fondo subida en la configuración.
 * - generated: una imagen generada con IA para cada reel.
 */
export const videoBackgroundSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('avatar') }),
  z.object({ type: z.literal('color'), color: hexColor }),
  z.object({ type: z.literal('image') }),
  z.object({ type: z.literal('generated') }),
]);
export type VideoBackgroundSetting = z.infer<typeof videoBackgroundSchema>;

export const LOGO_POSITIONS = ['top-right', 'top-left', 'bottom-right', 'bottom-left'] as const;
export const LOGO_SIZES = ['small', 'medium', 'large'] as const;

/** Dónde y de qué tamaño va el logo en TODAS las escenas de la edición automática. */
export const logoPlacementSchema = z.object({
  position: z.enum(LOGO_POSITIONS),
  size: z.enum(LOGO_SIZES),
});
export type LogoPlacement = z.infer<typeof logoPlacementSchema>;

/** Constancia de que la persona que representa un avatar autorizó el uso de su imagen y voz. */
export const avatarAuthorizationSchema = z.object({
  confirmed: z.literal(true, {
    message: 'Confirma que cuentas con autorización escrita de esta persona.',
  }),
  personName: z.string().trim().min(3, 'Escribe el nombre de la persona.').max(120),
  date: z.iso.date('Escribe la fecha de la autorización.'),
});
export type AvatarAuthorization = z.infer<typeof avatarAuthorizationSchema>;

export const videoSettingsSchema = z.object({
  defaultAvatarId: providerId.nullable(),
  defaultVoiceId: providerId.nullable(),
  /** Avatares de la marca: uno fijo o varios para alternar entre escenas. */
  favoriteAvatarIds: z.array(providerId).max(12, 'Elige como máximo 12 avatares favoritos.'),
  /** Idioma de las voces tal como lo nombra el proveedor (p. ej. "Spanish"). */
  voiceLanguage: z.string().trim().max(60),
  voiceSpeed: z.number().min(0.5).max(1.5),
  background: videoBackgroundSchema,
  captions: z.boolean(),
  aspectRatio: z.enum(VIDEO_ASPECT_RATIOS),
  durationSeconds: z.union(VIDEO_DURATIONS.map((value) => z.literal(value))),
  /** Kit de marca del proveedor (colores, fuentes y logo) para la edición automática. */
  brandKitId: providerId.nullable(),
  logo: logoPlacementSchema,
  /** Reglas que el guion debe cumplir siempre (p. ej. no prometer resultados). Tienen prioridad. */
  complianceRules: z.string().trim().max(3000),
  authorizations: z.record(providerId, avatarAuthorizationSchema),
});
export type VideoSettings = z.infer<typeof videoSettingsSchema>;

export const DEFAULT_VIDEO_SETTINGS: VideoSettings = {
  defaultAvatarId: null,
  defaultVoiceId: null,
  favoriteAvatarIds: [],
  voiceLanguage: 'Spanish',
  voiceSpeed: 1,
  background: { type: 'avatar' },
  captions: true,
  aspectRatio: '9:16',
  durationSeconds: 30,
  brandKitId: null,
  logo: { position: 'top-right', size: 'medium' },
  complianceRules: '',
  authorizations: {},
};

/**
 * Exigen autorización escrita los avatares propios de la cuenta que pueden representar a una
 * persona real (digital twin o photo avatar). Los de stock son del catálogo licenciado del
 * proveedor y no la necesitan.
 */
export const requiresAuthorization = (type: AvatarType, ownership: 'public' | 'private') =>
  ownership === 'private' && (type === 'digital_twin' || type === 'photo_avatar');
