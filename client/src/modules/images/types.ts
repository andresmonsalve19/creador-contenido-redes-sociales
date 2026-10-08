import type { InlineImage } from '../../shared/api/types';

export type PostFormat = 'single' | 'carousel';
export type AspectRatio = '1:1' | '4:5' | '3:4' | '9:16' | '16:9';

/** Llamados a la acción que se ofrecen en el paso 2. */
export const CTA_OPTIONS = [
  'Más información',
  'Contáctanos',
  'Síguenos',
  'Solicita tu diagnóstico',
  'Agenda una reunión',
  'Cotiza tu proyecto',
  'Solicita una demostración',
  'Escríbenos por WhatsApp',
  'Escríbenos por mensaje directo',
  'Visita nuestro sitio web',
  'Descarga la guía gratis',
  'Reserva tu asesoría',
  'Regístrate hoy',
  'Suscríbete',
  'Comparte esta publicación',
  'Guarda este post',
  'Comenta y cuéntanos',
] as const;

export const DEFAULT_CTA = CTA_OPTIONS[0];

export interface Contact {
  email: string;
  website: string;
}

/** Valores por defecto de los datos de contacto; el usuario puede cambiarlos en el paso 2. */
export const DEFAULT_CONTACT: Contact = {
  email: 'info@nubetic.com.co',
  website: 'www.nubetic.com.co',
};
export type SlideRole = 'single' | 'hook' | 'development' | 'cta';

export interface SlidePrompt {
  role: SlideRole;
  title: string;
  prompt: string;
}

export interface PromptsResult {
  concept: string;
  caption: string;
  slides: SlidePrompt[];
}

export type SlideResult =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'done'; image: InlineImage }
  | { status: 'error'; error: string };

export const ROLE_LABEL: Record<SlideRole, string> = {
  single: 'Pieza única',
  hook: 'Gancho',
  development: 'Desarrollo',
  cta: 'Llamado a la acción',
};

export const MIN_SLIDES = 2;
export const MAX_SLIDES = 10;
