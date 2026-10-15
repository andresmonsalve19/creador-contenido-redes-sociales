import type { SceneKind, SceneRole, VideoStyle } from './schemas.js';

/** Duración fija de las tarjetas de marca (segundos). */
export const CARD_SECONDS = { intro: 2, outro: 3 } as const;

/** Segundos disponibles para hablar: la duración elegida menos las tarjetas de marca. */
export function speakingSeconds(
  durationSeconds: number,
  cards: { intro: boolean; outro: boolean },
) {
  const cardTime = (cards.intro ? CARD_SECONDS.intro : 0) + (cards.outro ? CARD_SECONDS.outro : 0);
  return Math.max(8, durationSeconds - cardTime);
}

/**
 * Tipo de cada escena. En estilo dinámico se alternan presentador e imágenes de apoyo, empezando
 * y terminando con el presentador (gancho y cierre): 3 escenas → A B A; 5 → A B A B A.
 */
export function sceneKinds(count: number, style: VideoStyle): SceneKind[] {
  return Array.from({ length: count }, (_, index) =>
    style !== 'simple' && index > 0 && index < count - 1 && index % 2 === 1 ? 'broll' : 'avatar',
  );
}

export const countWords = (text: string) => text.split(/\s+/).filter(Boolean).length;

/** Segundos aproximados que tarda en decirse un texto al ritmo indicado (palabras por segundo). */
export const estimateSeconds = (text: string, wordsPerSecond: number) =>
  Math.round((countWords(text) / wordsPerSecond) * 10) / 10;

export function estimateScript(
  scenes: { script: string }[],
  wordsPerSecond: number,
  durationSeconds: number,
) {
  const perScene = scenes.map((scene) => estimateSeconds(scene.script, wordsPerSecond));
  const totalSeconds = Math.round(perScene.reduce((sum, value) => sum + value, 0) * 10) / 10;
  return {
    scenes: perScene,
    totalSeconds,
    /** Segundos por encima de la duración elegida (0 si cabe). */
    overBySeconds: Math.max(0, Math.round((totalSeconds - durationSeconds) * 10) / 10),
  };
}

/** Rol de cada escena: la primera engancha, la última cierra con el llamado a la acción. */
export function sceneRoles(count: number): SceneRole[] {
  if (count === 1) return ['single'];
  return Array.from({ length: count }, (_, index) =>
    index === 0 ? 'hook' : index === count - 1 ? 'cta' : 'development',
  );
}

/**
 * Palabras máximas por escena para que el guion quepa en la duración elegida.
 * El gancho es corto (unos 3 s y algo más), el cierre algo más breve que el desarrollo.
 */
export function wordBudget(roles: SceneRole[], durationSeconds: number, wordsPerSecond: number) {
  const total = Math.floor(durationSeconds * wordsPerSecond);
  if (roles.length === 1) return [total];

  const weights = roles.map((role) => (role === 'hook' ? 0.6 : role === 'cta' ? 0.8 : 1));
  const sum = weights.reduce((a, b) => a + b, 0);
  return weights.map((weight) => Math.max(6, Math.floor((total * weight) / sum)));
}
