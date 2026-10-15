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
}

/** Selector de voces con búsqueda y botón para escuchar la muestra del proveedor. */
export function VoicePicker({
  legend,
  voices,
  value,
  onChange,
  gender = 'unknown',
}: VoicePickerProps) {
  const name = useId();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [query, setQuery] = useState('');
  const [visible, setVisible] = useState(PAGE);
  const [playing, setPlaying] = useState<string | null>(null);

  const filtered = useMemo(() => voicesForGender(voices, gender), [voices, gender]);

  const ordered = useMemo(() => {
    const text = query.trim().toLowerCase();
    return filtered.voices
      .filter((voice) => !text || voice.name.toLowerCase().includes(text))
      .sort((a, b) => Number(b.id === value) - Number(a.id === value));
  }, [filtered, query, value]);

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
