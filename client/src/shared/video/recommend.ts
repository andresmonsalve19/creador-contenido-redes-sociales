import { useMemo } from 'react';
import type { VideoAvatar, VideoVoice } from './types';
import { useVoices } from './useVideo';

export interface AvatarRecommendation {
  /** Motivo en pocas palabras, p. ej. "Avatar V · voz en español". */
  reason: string;
  /** Mayor = mejor. Los de estudio (persona grabada en video) van antes que los photo avatars. */
  score: number;
}

/**
 * Avatares recomendados para reels en español, con datos de HeyGen:
 * - admiten Avatar IV o V (mejor sincronía de labios que Avatar III), y
 * - su voz por defecto está en español (el avatar suele estar pensado para ese idioma).
 */
export function recommendAvatars(
  avatars: VideoAvatar[],
  spanishVoiceIds: ReadonlySet<string>,
): Map<string, AvatarRecommendation> {
  const result = new Map<string, AvatarRecommendation>();
  for (const avatar of avatars) {
    const engine = avatar.engines.includes('avatar_v')
      ? 'Avatar V'
      : avatar.engines.includes('avatar_iv')
        ? 'Avatar IV'
        : null;
    const spanish = Boolean(avatar.defaultVoiceId && spanishVoiceIds.has(avatar.defaultVoiceId));
    if (!engine || !spanish) continue;
    result.set(avatar.id, {
      reason: `${engine} · voz en español`,
      score: (avatar.type === 'studio_avatar' ? 2 : 1) + (engine === 'Avatar V' ? 0.5 : 0),
    });
  }
  return result;
}

/** Recomendaciones calculadas con las voces en español del catálogo (en caché). */
export function useAvatarRecommendations(avatars: VideoAvatar[]) {
  const voices = useVoices('Spanish');
  return useMemo(
    () => recommendAvatars(avatars, new Set((voices.data ?? []).map((voice) => voice.id))),
    [avatars, voices.data],
  );
}

/** Suma a la lista del catálogo las voces diseñadas que se eligieron (sin repetir). */
export function withVoices(base: VideoVoice[], extra: VideoVoice[]): VideoVoice[] {
  const ids = new Set(base.map((voice) => voice.id));
  return [...extra.filter((voice) => !ids.has(voice.id)), ...base];
}
