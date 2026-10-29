import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { errorMessage } from '../../../shared/api/client';
import { Alert } from '../../../shared/ui/Alert';
import { deleteJob, fetchJobs, jobsKey, requestDuplicate } from '../api';
import { STATUS_LABEL, canEditScenes, isActiveJob, type VideoSpec } from '../types';
import { SceneEditor } from './SceneEditor';
import styles from '../reels.module.css';

const date = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' });

interface HistoryProps {
  onDuplicate: (spec: VideoSpec, duplicatedFrom: string) => void;
}

/** Reels anteriores: guardados con su especificación completa para verlos o duplicarlos. */
export function History({ onDuplicate }: HistoryProps) {
  const queryClient = useQueryClient();
  const jobs = useQuery({
    queryKey: jobsKey,
    queryFn: ({ signal }) => fetchJobs(signal),
    refetchInterval: (query) =>
      query.state.data?.some((job) => isActiveJob(job.status)) ? 10_000 : false,
  });

  const duplicate = useMutation({
    mutationFn: requestDuplicate,
    onSuccess: (draft) => {
      onDuplicate(draft, draft.duplicatedFrom);
      window.scrollTo({ top: 0 });
    },
  });

  const remove = useMutation({
    mutationFn: deleteJob,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: jobsKey }),
  });

  if (!jobs.data || jobs.data.length === 0) return null;

  return (
    <details className={styles.history}>
      <summary>Reels anteriores ({jobs.data.length})</summary>
      <ul className={styles.historyList}>
        {jobs.data.map((job) => (
          <li key={job.id} className={styles.historyItem}>
            <span>
              <strong>{job.spec.title}</strong>
              <small>
                {date.format(new Date(job.createdAt))} · {STATUS_LABEL[job.status]}
                {job.error ? ` · ${job.error.mensaje}` : ''}
              </small>
            </span>
            <span className={styles.cardActions}>
              {job.videoUrl && (
                <a className={styles.link} href={job.videoUrl} target="_blank" rel="noreferrer">
                  Ver
                </a>
              )}
              <button
                type="button"
                className={styles.link}
                onClick={() => duplicate.mutate(job.id)}
                disabled={duplicate.isPending}
              >
                Duplicar
              </button>
              {!isActiveJob(job.status) && (
                <button
                  type="button"
                  className={styles.link}
                  onClick={() => {
                    if (window.confirm(`¿Borrar "${job.spec.title}" y su archivo de video?`)) {
                      remove.mutate(job.id);
                    }
                  }}
                  disabled={remove.isPending}
                >
                  Borrar
                </button>
              )}
            </span>
            {canEditScenes(job) && <SceneEditor job={job} />}
          </li>
        ))}
      </ul>
      {(duplicate.isError || remove.isError) && (
        <Alert>{errorMessage(duplicate.error ?? remove.error)}</Alert>
      )}
    </details>
  );
}
