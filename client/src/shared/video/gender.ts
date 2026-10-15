import type { VideoAvatar, VideoVoice } from './types';

export type Gender = 'female' | 'male' | 'unknown';

export const GENDER_LABEL: Record<Gender, string> = {
  female: 'mujer',
  male: 'hombre',
  unknown: 'sin especificar',
};

/** HeyGen informa "female" o "male"; cualquier otro valor o la ausencia cuentan como sin especificar. */
export function genderOf(item: { gender: string | null } | null | undefined): Gender {
  const gender = item?.gender?.trim().toLowerCase();
  return gender === 'female' || gender === 'male' ? gender : 'unknown';
}

/**
 * Voces que corresponden a un género. Si el género no se conoce, o no hay ninguna voz de ese
 * género en el idioma elegido, se devuelven todas (`matched: false`) para no dejar la lista vacía.
 */
export function voicesForGender(voices: VideoVoice[], gender: Gender) {
  if (gender === 'unknown') return { voices, matched: false };
  const matching = voices.filter((voice) => genderOf(voice) === gender);
  return matching.length > 0 ? { voices: matching, matched: true } : { voices, matched: false };
}

/**
 * Voz adecuada para un avatar:
 * 1. la actual, si ya es del mismo género;
 * 2. la voz por defecto del avatar, si está en la lista y es del mismo género;
 * 3. la primera voz del mismo género;
 * 4. si nada coincide, la actual (o null).
 */
export function suggestVoice(
  avatar: VideoAvatar | undefined,
  voices: VideoVoice[],
  currentId: string | null,
): string | null {
  const gender = genderOf(avatar);
  const current = voices.find((voice) => voice.id === currentId);
  if (gender === 'unknown') return currentId;
  if (current && genderOf(current) === gender) return current.id;

  const byDefault = voices.find((voice) => voice.id === avatar?.defaultVoiceId);
  if (byDefault && genderOf(byDefault) === gender) return byDefault.id;

  return voices.find((voice) => genderOf(voice) === gender)?.id ?? currentId;
}

/** Una voz por avatar, cada una del género de su avatar. La primera usa la voz elegida si encaja. */
export function voicesByAvatar(
  avatarIds: string[],
  avatars: VideoAvatar[],
  voices: VideoVoice[],
  chosenVoiceId: string | null,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const id of avatarIds) {
    const voice = suggestVoice(
      avatars.find((avatar) => avatar.id === id),
      voices,
      chosenVoiceId,
    );
    if (voice) result[id] = voice;
  }
  return result;
}
