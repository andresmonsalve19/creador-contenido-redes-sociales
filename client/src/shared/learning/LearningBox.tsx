import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { api, errorMessage } from '../api/client';
import { Alert } from '../ui/Alert';
import { Actions, Button } from '../ui/Button';
import { TextArea } from '../ui/TextArea';
import styles from './LearningBox.module.css';

interface LearningResponse {
  rules: string[];
}

interface SaveResponse extends LearningResponse {
  added: string[];
}

const learningKey = ['learning'] as const;

interface LearningBoxProps {
  textModel: string | null;
}

/**
 * Comentarios del usuario sobre lo generado. La IA los convierte en reglas claras que se guardan en
 * learning.md y se consultan antes de cada generación futura.
 */
export function LearningBox({ textModel }: LearningBoxProps) {
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState('');

  const saved = useQuery({
    queryKey: learningKey,
    queryFn: ({ signal }) => api<LearningResponse>('/learning', { signal }),
  });

  const save = useMutation({
    mutationFn: (text: string) =>
      api<SaveResponse>('/learning', {
        method: 'POST',
        json: { textModel, feedback: text },
      }),
    onSuccess: ({ rules }) => {
      setFeedback('');
      queryClient.setQueryData<LearningResponse>(learningKey, { rules });
    },
  });

  const remove = useMutation({
    mutationFn: (index: number) =>
      api<LearningResponse>(`/learning/${index}`, { method: 'DELETE' }),
    onSuccess: (data) => queryClient.setQueryData<LearningResponse>(learningKey, data),
  });

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (feedback.trim() && textModel) save.mutate(feedback.trim());
  };

  const rules = saved.data?.rules ?? [];

  return (
    <section className={styles.box} aria-labelledby="comentarios">
      <div className={styles.header}>
        <h2 id="comentarios">Comentarios y sugerencias</h2>
        <p>
          Cuéntanos qué mejorarías. La IA lo redacta como una regla clara y la tendrá en cuenta en
          todas las próximas publicaciones.
        </p>
      </div>

      <form className={styles.form} onSubmit={handleSubmit}>
        <TextArea
          label="Tu comentario"
          hideLabel
          value={feedback}
          onChange={(event) => setFeedback(event.target.value)}
          placeholder="Ej.: el logo se ve muy pequeño y me gustan los fondos más oscuros con acentos amarillos"
          maxLength={1500}
          rows={4}
        />

        {save.isError && <Alert>{errorMessage(save.error)}</Alert>}

        {save.isSuccess && (
          <Alert tone="info">
            {save.data.added.length > 0 ? (
              <>
                Aprendido y guardado:
                <ul className={styles.added}>
                  {save.data.added.map((rule) => (
                    <li key={rule}>{rule}</li>
                  ))}
                </ul>
              </>
            ) : (
              'Eso ya estaba cubierto por lo que la app tiene guardado.'
            )}
          </Alert>
        )}

        <Actions>
          <Button
            type="submit"
            disabled={!feedback.trim() || !textModel}
            loading={save.isPending}
            loadingLabel="Mejorando y guardando"
          >
            Guardar comentario
          </Button>
        </Actions>
      </form>

      {rules.length > 0 && (
        <details className={styles.saved}>
          <summary>Lo que la app ya aprendió ({rules.length})</summary>
          <ul className={styles.rules}>
            {rules.map((rule, index) => (
              <li key={`${index}-${rule}`}>
                <span>{rule}</span>
                <button
                  type="button"
                  onClick={() => remove.mutate(index)}
                  disabled={remove.isPending}
                  aria-label={`Eliminar: ${rule}`}
                >
                  Eliminar
                </button>
              </li>
            ))}
          </ul>
          {remove.isError && <Alert>{errorMessage(remove.error)}</Alert>}
        </details>
      )}
    </section>
  );
}
