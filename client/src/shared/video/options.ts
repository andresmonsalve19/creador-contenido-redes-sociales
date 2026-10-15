import { VIDEO_DURATIONS, type VideoDuration } from './types';

/** Proporciones de video que admite HeyGen y ofrece la app. */
export const RATIO_OPTIONS = [
  {
    value: '9:16',
    label: 'Vertical 9:16',
    description: 'Reels, historias y TikTok (1080 × 1920).',
  },
  { value: '4:5', label: 'Vertical 4:5', description: 'Ocupa más pantalla en el feed.' },
  { value: '1:1', label: 'Cuadrado 1:1', description: 'Formato clásico del feed.' },
  { value: '16:9', label: 'Horizontal 16:9', description: 'YouTube, LinkedIn o web.' },
] as const;

export const DURATION_OPTIONS = VIDEO_DURATIONS.map((seconds) => ({
  value: `${seconds}` as `${VideoDuration}`,
  label: `${seconds} s`,
}));
