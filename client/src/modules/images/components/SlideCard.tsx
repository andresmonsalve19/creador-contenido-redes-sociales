import { useState, type FormEvent } from 'react';
import { Alert } from '../../../shared/ui/Alert';
import { Button } from '../../../shared/ui/Button';
import { Spinner } from '../../../shared/ui/Spinner';
import { TextArea } from '../../../shared/ui/TextArea';
import { ROLE_LABEL, type AspectRatio, type SlidePrompt, type SlideResult } from '../types';
import type { ReviseMode } from '../useImageGeneration';
import { fileNameFor, toDataUrl } from './download';
import styles from './Gallery.module.css';

interface SlideCardProps {
  index: number;
  slide: SlidePrompt;
  result: SlideResult;
  aspectRatio: AspectRatio;
  /** Hay una generación en curso (de cualquier imagen). */
  busy: boolean;
  onRetry: (index: number) => void;
  /** Devuelve un mensaje si falló, o null si salió bien. */
  onRevise: (index: number, feedback: string, mode: ReviseMode) => Promise<string | null>;
}

const MIN_FEEDBACK = 3;

export function SlideCard({
  index,
  slide,
  result,
  aspectRatio,
  busy,
  onRetry,
  onRevise,
}: SlideCardProps) {
  const [feedback, setFeedback] = useState('');
  const [pending, setPending] = useState<ReviseMode | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canRevise = result.status === 'done' || pending !== null;
  const ready = feedback.trim().length >= MIN_FEEDBACK;

  const revise = async (mode: ReviseMode) => {
    setError(null);
    setPending(mode);
    const failure = await onRevise(index, feedback.trim(), mode);
    setPending(null);
    if (failure) setError(failure);
    else setFeedback('');
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (ready && !busy) void revise('image');
  };

  return (
    <li className={styles.frame}>
      <div className={styles.frameHeader}>
        <span className={styles.frameNumber}>{index + 1}</span>
        <span>{ROLE_LABEL[slide.role]}</span>
      </div>

      <div className={styles.canvas} style={{ aspectRatio: aspectRatio.replace(':', ' / ') }}>
        {result.status === 'done' && (
          <img src={toDataUrl(result.image)} alt={`${ROLE_LABEL[slide.role]}: ${slide.title}`} />
        )}
        {result.status === 'loading' && <Spinner label={`Generando imagen ${index + 1}`} />}
        {result.status === 'idle' && <span className={styles.waiting}>En espera</span>}
        {result.status === 'error' && <p className={styles.error}>{result.error}</p>}
      </div>

      <div className={styles.frameActions}>
        {result.status === 'done' && (
          <a
            className={styles.link}
            href={toDataUrl(result.image)}
            download={fileNameFor(index, slide.role, result.image)}
          >
            Descargar
          </a>
        )}
        {(result.status === 'done' || result.status === 'error') && (
          <button
            type="button"
            className={styles.link}
            onClick={() => onRetry(index)}
            disabled={busy}
          >
            {result.status === 'error' ? 'Reintentar' : 'Regenerar'}
          </button>
        )}
      </div>

      {canRevise && (
        <form className={styles.feedback} onSubmit={handleSubmit}>
          <TextArea
            label={`Comentarios para la imagen ${index + 1}`}
            hideLabel
            value={feedback}
            onChange={(event) => setFeedback(event.target.value)}
            placeholder="¿Qué cambiarías? Ej.: el texto más grande, fondo más oscuro…"
            maxLength={1000}
            rows={3}
            disabled={busy}
          />
          {error && <Alert>{error}</Alert>}
          <Button
            type="submit"
            variant="secondary"
            disabled={!ready || (busy && pending === null)}
            loading={pending === 'image'}
            loadingLabel="Ajustando imagen"
          >
            Regenerar con comentarios
          </Button>
          <Button
            variant="ghost"
            onClick={() => void revise('prompt')}
            disabled={!ready || (busy && pending === null)}
            loading={pending === 'prompt'}
            loadingLabel="Reescribiendo prompt"
          >
            Reescribir prompt y regenerar
          </Button>
        </form>
      )}
    </li>
  );
}
