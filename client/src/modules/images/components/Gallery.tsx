import { useEffect, useRef, useState } from 'react';
import { Alert } from '../../../shared/ui/Alert';
import { Actions, Button } from '../../../shared/ui/Button';
import type { AspectRatio, SlidePrompt, SlideResult } from '../types';
import type { ReviseMode } from '../useImageGeneration';
import { downloadZip, fileNameFor } from './download';
import { SlideCard } from './SlideCard';
import styles from './Gallery.module.css';

interface GalleryProps {
  slides: SlidePrompt[];
  results: SlideResult[];
  aspectRatio: AspectRatio;
  busy: boolean;
  onRetry: (index: number) => void;
  onRevise: (index: number, feedback: string, mode: ReviseMode) => Promise<string | null>;
}

/** Hoja de contactos con las piezas generadas, en el orden en que se publicarán. */
export function Gallery({ slides, results, aspectRatio, busy, onRetry, onRevise }: GalleryProps) {
  const [zipError, setZipError] = useState<string | null>(null);
  const [zipping, setZipping] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);

  // Al empezar a generar, lleva la vista a los resultados.
  useEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    sectionRef.current?.scrollIntoView({
      behavior: reduceMotion ? 'auto' : 'smooth',
      block: 'start',
    });
  }, []);

  const done = results.flatMap((result, index) => {
    const slide = slides[index];
    return result.status === 'done' && slide
      ? [{ name: fileNameFor(index, slide.role, result.image), image: result.image }]
      : [];
  });
  const finished = results.filter((r) => r.status === 'done' || r.status === 'error').length;

  const handleZip = async () => {
    setZipError(null);
    setZipping(true);
    try {
      await downloadZip(done);
    } catch {
      setZipError('No se pudo crear el archivo ZIP. Descarga las imágenes una por una.');
    } finally {
      setZipping(false);
    }
  };

  return (
    <section ref={sectionRef} className={styles.gallery} aria-labelledby="imagenes-generadas">
      <div className={styles.header}>
        <h2 id="imagenes-generadas">Imágenes generadas</h2>
        <p className={styles.progress} aria-live="polite">
          {finished} de {results.length} {busy ? 'listas, generando…' : 'listas'}
        </p>
      </div>

      <ol className={styles.sheet} data-count={results.length}>
        {results.map((result, index) => {
          const slide = slides[index];
          if (!slide) return null;
          return (
            <SlideCard
              key={index}
              index={index}
              slide={slide}
              result={result}
              aspectRatio={aspectRatio}
              busy={busy}
              onRetry={onRetry}
              onRevise={onRevise}
            />
          );
        })}
      </ol>

      {zipError && <Alert>{zipError}</Alert>}

      {done.length > 1 && (
        <Actions>
          <Button
            onClick={handleZip}
            loading={zipping}
            loadingLabel="Preparando ZIP"
            disabled={busy}
          >
            Descargar todas
          </Button>
        </Actions>
      )}
    </section>
  );
}
