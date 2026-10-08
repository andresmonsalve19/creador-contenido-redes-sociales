import { useMutation } from '@tanstack/react-query';
import { api, errorMessage } from '../api/client';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { TextArea } from '../ui/TextArea';
import styles from './TopicInput.module.css';

interface TopicInputProps {
  value: string;
  onChange: (value: string) => void;
  textModel: string;
  /** Formato en palabras, p. ej. "carrusel de 5 imágenes". */
  format: string;
}

/** Campo de temática con sugerencias generadas por IA a partir del contexto de la marca. */
export function TopicInput({ value, onChange, textModel, format }: TopicInputProps) {
  const suggest = useMutation({
    mutationFn: () =>
      api<{ suggestions: string[] }>('/topic-suggestions', {
        method: 'POST',
        json: { textModel, format, hint: value.trim() || undefined },
      }),
  });

  return (
    <div className={styles.topic}>
      <TextArea
        label="Temática"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Ej.: 5 errores comunes al elegir un seguro de salud y cómo evitarlos"
        maxLength={1000}
        rows={3}
        hint="Si escribes una idea a medias, la IA la usa como punto de partida."
      />

      <Button
        variant="secondary"
        onClick={() => suggest.mutate()}
        loading={suggest.isPending}
        loadingLabel="Pensando ideas"
      >
        Sugerir con IA
      </Button>

      {suggest.isError && <Alert>{errorMessage(suggest.error)}</Alert>}

      {suggest.data && (
        <div className={styles.suggestions}>
          <p className={styles.suggestionsTitle}>Elige una idea para usarla</p>
          <ul className={styles.list}>
            {suggest.data.suggestions.map((suggestion) => (
              <li key={suggestion}>
                <button
                  type="button"
                  className={styles.suggestion}
                  aria-pressed={value === suggestion}
                  onClick={() => onChange(suggestion)}
                >
                  {suggestion}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
