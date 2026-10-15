import type { InlineImage } from '../../shared/api/types';

export type PostFormat = 'single' | 'carousel';
export type AspectRatio = '1:1' | '4:5' | '3:4' | '9:16' | '16:9';

export type { Contact } from '../../shared/publishing/contact';

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
