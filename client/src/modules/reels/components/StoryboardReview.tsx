import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { errorMessage } from '../../../shared/api/client';
import { Alert } from '../../../shared/ui/Alert';
import { Actions, Button } from '../../../shared/ui/Button';
import { TextArea } from '../../../shared/ui/TextArea';
import { jobKey, jobsKey, sendAgentMessage } from '../api';
import type { ReelJob } from '../types';
import styles from '../reels.module.css';

interface StoryboardReviewProps {
  job: ReelJob;
}

/**
 * Revisión del storyboard del agente de HeyGen: pedir cambios (el agente lo rehace) o aprobarlo
 * para generar el video. Solo la aprobación, con confirmación explícita, consume el render.
 */
export function StoryboardReview({ job }: StoryboardReviewProps) {
  const queryClient = useQueryClient();
  const [changes, setChanges] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const agent = job.agent;
  const lastMessage = agent?.messages.find((message) => message.role === 'model');
  const images = (agent?.storyboard ?? []).filter((item) => item.thumbnailUrl ?? item.url);

  const send = useMutation({
    mutationFn: (body: { approve: boolean; message: string; confirmed?: true }) =>
      sendAgentMessage(job.id, body),
    onSuccess: async (updated) => {
      setChanges('');
      setConfirmed(false);
      queryClient.setQueryData(jobKey(job.id), updated);
      await queryClient.invalidateQueries({ queryKey: jobsKey });
    },
  });

  return (
    <div className={styles.feedback}>
      <h3>Storyboard de HeyGen</h3>
      {lastMessage && <p className={styles.agentMessage}>{lastMessage.content}</p>}
      {images.length > 0 ? (
        <ul className={styles.storyboard}>
          {images.map((item, index) => (
            <li key={item.id}>
              <a href={item.url ?? item.thumbnailUrl ?? '#'} target="_blank" rel="noreferrer">
                <img
                  src={item.thumbnailUrl ?? item.url ?? ''}
                  alt={`Storyboard, imagen ${index + 1}`}
                  loading="lazy"
                />
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.fine}>
          HeyGen no envió imágenes del storyboard; revisa el mensaje del agente.
        </p>
      )}

      <TextArea
        label="¿Qué cambiarías del storyboard?"
        value={changes}
        onChange={(event) => setChanges(event.target.value)}
        placeholder="Ej.: en la escena 2 muestra el texto más grande; usa el fondo crema en el cierre…"
        maxLength={2000}
        rows={3}
      />
      <Actions>
        <Button
          variant="secondary"
          disabled={changes.trim().length < 3 || send.isPending}
          loading={send.isPending && !confirmed}
          loadingLabel="Enviando cambios"
          onClick={() => send.mutate({ approve: false, message: changes.trim() })}
        >
          Pedir cambios
        </Button>
      </Actions>

      <label className={styles.check}>
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(event) => setConfirmed(event.target.checked)}
        />
        Apruebo este storyboard. Generar el video consume saldo de mi cuenta de HeyGen.
      </label>
      <Actions>
        <Button
          disabled={!confirmed || send.isPending}
          loading={send.isPending && confirmed}
          loadingLabel="Aprobando"
          onClick={() => send.mutate({ approve: true, message: '', confirmed: true })}
        >
          Aprobar y generar
        </Button>
      </Actions>
      {send.isError && <Alert>{errorMessage(send.error)}</Alert>}
    </div>
  );
}
