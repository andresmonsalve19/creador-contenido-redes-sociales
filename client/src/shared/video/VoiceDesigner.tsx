import { useMutation, useQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { api, errorMessage } from '../api/client';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Select } from '../ui/Select';
import { TextArea } from '../ui/TextArea';
import type { Gender } from './gender';
import type { VideoVoice } from './types';
import styles from './VideoPickers.module.css';

interface VoiceHint {
  prompt: string;
  gender: 'female' | 'male' | null;
  locale: string | null;
}

const NO_ACCENT = '';
const ACCENTS = [
  { value: NO_ACCENT, label: 'Sin preferencia (latino neutro)' },
  { value: 'es-CO', label: 'Colombia' },
  { value: 'es-MX', label: 'México' },
  { value: 'es-AR', label: 'Argentina' },
  { value: 'es-CL', label: 'Chile' },
  { value: 'es-PE', label: 'Perú' },
  { value: 'es-US', label: 'Estados Unidos (latino)' },
  { value: 'es-ES', label: 'España' },
];
const accentOf = (locale: string | null | undefined) =>
  ACCENTS.some((accent) => accent.value === locale) ? (locale ?? NO_ACCENT) : NO_ACCENT;

interface VoiceDesignerProps {
  /** Género del avatar elegido; si se conoce, manda sobre el de los lineamientos. */
  gender: Gender;
  value: string | null;
  onPick: (voice: VideoVoice) => void;
}

/**
 * "Design a Voice" de HeyGen: CREA 3 voces nuevas en la cuenta a partir de una descripción (no
 * busca en el catálogo). Por eso va plegado, con aviso y confirmación explícita. La descripción
 * se precarga desde los lineamientos de video y el servidor la traduce al inglés.
 */
export function VoiceDesigner({ gender, value, onPick }: VoiceDesignerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [locale, setLocale] = useState<string | null>(null);
  const [seed, setSeed] = useState(0);
  const [confirmed, setConfirmed] = useState(false);
  const [playing, setPlaying] = useState<string | null>(null);

  const hint = useQuery({
    queryKey: ['video', 'voice-hint'],
    queryFn: ({ signal }) => api<VoiceHint>('/video/voices/suggestion', { signal }),
    staleTime: Infinity,
  });

  const description = prompt ?? hint.data?.prompt ?? '';
  const accent = locale ?? accentOf(hint.data?.locale);
  const voiceGender = gender !== 'unknown' ? gender : (hint.data?.gender ?? undefined);

  const design = useMutation({
    mutationFn: (nextSeed: number) =>
      api<{ voices: VideoVoice[]; seed: number; prompt: string }>('/video/voices/design', {
        method: 'POST',
        json: {
          prompt: description.trim(),
          seed: nextSeed,
          ...(voiceGender && { gender: voiceGender }),
          ...(accent && { accent }),
        },
      }),
    onSuccess: (result) => {
      setSeed(result.seed);
      // Cada pedido crea voces: se vuelve a pedir la confirmación para el siguiente.
      setConfirmed(false);
    },
  });

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

  const voices = design.data?.voices ?? [];
  const canCreate = confirmed && description.trim().length >= 3 && !design.isPending;

  return (
    <details className={styles.designer}>
      <summary>Diseñar una voz nueva con IA (avanzado)</summary>
      <div className={styles.recommender}>
        <Alert tone="info">
          Esto no busca en el catálogo: HeyGen <strong>crea 3 voces nuevas en tu cuenta</strong>{' '}
          cada vez que lo pidas. Ocupan cupo de voces personalizadas y se borran desde HeyGen. Usa
          primero la voz recomendada del avatar en la lista de abajo.
        </Alert>
        <TextArea
          label="Describe la voz que buscas"
          value={description}
          onChange={(event) => setPrompt(event.target.value)}
          rows={2}
          maxLength={1000}
          hint="Viene de tus lineamientos de video. Se traduce al inglés antes de enviarla a HeyGen."
        />
        <Select label="Acento" options={ACCENTS} value={accent} onChange={setLocale} />
        <audio ref={audioRef} onEnded={() => setPlaying(null)} preload="none" />

        <label className={styles.confirm}>
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
          />
          Entiendo que se crearán 3 voces nuevas en mi cuenta de HeyGen.
        </label>

        <Button
          variant="secondary"
          disabled={!canCreate}
          loading={design.isPending}
          loadingLabel="Creando voces"
          onClick={() => design.mutate(voices.length > 0 ? seed + 1 : 0)}
        >
          {voices.length > 0 ? 'Crear otras 3 voces' : 'Crear 3 voces'}
        </Button>

        {design.isError && <Alert>{errorMessage(design.error)}</Alert>}
        {design.isSuccess && voices.length === 0 && (
          <p className={styles.empty}>
            HeyGen no creó voces con esa descripción. Prueba con otra o sin acento.
          </p>
        )}

        {voices.length > 0 && (
          <>
            <p className={styles.fine}>
              Descripción enviada: «{design.data?.prompt}». HeyGen las etiqueta como «English»;
              escúchalas antes de usarlas.
            </p>
            <ul className={styles.voiceList}>
              {voices.map((voice) => (
                <li
                  key={voice.id}
                  className={styles.voiceRow}
                  data-checked={voice.id === value || undefined}
                >
                  <span>
                    <strong>{voice.name}</strong>
                    <span className={styles.voiceMeta}>
                      {[voice.language, voice.gender, 'de tu cuenta'].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <span className={styles.filters}>
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
                    <button
                      type="button"
                      className={styles.listen}
                      onClick={() => onPick(voice)}
                      disabled={voice.id === value}
                    >
                      {voice.id === value ? 'Elegida' : 'Usar esta voz'}
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </details>
  );
}
