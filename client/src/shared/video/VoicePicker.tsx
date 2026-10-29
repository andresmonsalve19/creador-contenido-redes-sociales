import { useId, useMemo, useRef, useState } from 'react';
import { Button } from '../ui/Button';
import { TextField } from '../ui/TextField';
import { GENDER_LABEL, voicesForGender, type Gender } from './gender';
import type { VideoVoice } from './types';
import styles from './VideoPickers.module.css';

const PAGE = 20;

interface VoicePickerProps {
  legend: string;
  voices: VideoVoice[];
  value: string | null;
  onChange: (id: string) => void;
  /** Género del avatar: solo se ofrecen voces de ese género para que no queden mezcladas. */
  gender?: Gender;
  /**
   * Voz original del avatar en HeyGen (la que mejor le encaja): se recomienda y se muestra
   * primero, aunque sea de otro idioma.
   */
  original?: VideoVoice | null;
  /** Idioma elegido para las voces: avisa si la voz original es de otro. */
  language?: string;
}

/** Selector de voces con búsqueda y botón para escuchar la muestra del proveedor. */
export function VoicePicker({
  legend,
  voices,
  value,
  onChange,
  gender = 'unknown',
  original = null,
  language,
}: VoicePickerProps) {
  const name = useId();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [query, setQuery] = useState('');
  const [visible, setVisible] = useState(PAGE);
  const [playing, setPlaying] = useState<string | null>(null);

  const filtered = useMemo(() => voicesForGender(voices, gender), [voices, gender]);
  const recommendedId = original?.id ?? null;
  const foreign =
    original && language && original.language?.trim().toLowerCase() !== language.toLowerCase();

  const ordered = useMemo(() => {
    const text = query.trim().toLowerCase();
    const list = original
      ? [original, ...filtered.voices.filter((voice) => voice.id !== original.id)]
      : filtered.voices;
    return list
      .filter((voice) => !text || voice.name.toLowerCase().includes(text))
      .sort(
        (a, b) =>
          Number(b.id === recommendedId) - Number(a.id === recommendedId) ||
          Number(b.id === value) - Number(a.id === value),
      );
  }, [filtered, query, value, original, recommendedId]);

  const play = (voice: VideoVoice) => {
    const audio = audioRef.current;
    if (!audio || !voice.previewAudioUrl) return;
    if (playing === voice.id) {
      audio.pause();
      setPlaying(null);
      return;
    }
    audio.src = voice.previewAudioUrl;
    audio.play().then(
      () => setPlaying(voice.id),
      () => setPlaying(null),
    );
  };

  return (
    <fieldset className={styles.fieldset}>
      <legend className={styles.legend}>{legend}</legend>
      <TextField
        label="Buscar voz"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setVisible(PAGE);
        }}
        placeholder="Nombre de la voz"
      />
      {gender !== 'unknown' && (
        <p className={styles.fine}>
          {filtered.matched
            ? `Voces de ${GENDER_LABEL[gender]}, para que coincidan con el avatar.`
            : `No hay voces de ${GENDER_LABEL[gender]} en este idioma: se muestran todas.`}
        </p>
      )}
      {/* Un solo reproductor para todas las muestras. */}
      <audio ref={audioRef} onEnded={() => setPlaying(null)} preload="none" />

      {ordered.length === 0 ? (
        <p className={styles.empty}>No hay voces que coincidan.</p>
      ) : (
        <ul className={styles.voiceList}>
          {ordered.slice(0, visible).map((voice) => (
            <li
              key={voice.id}
              className={styles.voiceRow}
              data-checked={voice.id === value || undefined}
            >
              <label>
                <input
                  type="radio"
                  name={name}
                  checked={voice.id === value}
                  onChange={() => onChange(voice.id)}
                />
                <span>
                  <strong>{voice.name}</strong>
                  {voice.id === recommendedId && (
                    <span className={styles.recommended}>
                      ★ Recomendada: voz original del avatar
                      {foreign &&
                        ` (catalogada en ${original.language || 'otro idioma'}: dirá el guion en español, pero escúchala; puede tener acento)`}
                    </span>
                  )}
                  <span className={styles.voiceMeta}>
                    {[
                      voice.language,
                      voice.gender,
                      voice.ownership === 'private' ? 'de tu cuenta' : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
              </label>
              {voice.previewAudioUrl && (
                <button
                  type="button"
                  className={styles.listen}
                  onClick={() => play(voice)}
                  aria-pressed={playing === voice.id}
                >
                  {playing === voice.id ? 'Detener' : 'Escuchar'}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {ordered.length > visible && (
        <Button variant="ghost" onClick={() => setVisible((v) => v + PAGE)}>
          Mostrar más voces
        </Button>
      )}
    </fieldset>
  );
}
