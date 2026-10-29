import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type Dispatch, type FormEvent } from 'react';
import { errorMessage } from '../../../shared/api/client';
import { trimContact } from '../../../shared/publishing/contact';
import { Alert } from '../../../shared/ui/Alert';
import { Button } from '../../../shared/ui/Button';
import { Spinner } from '../../../shared/ui/Spinner';
import { TextArea } from '../../../shared/ui/TextArea';
import { fetchJob, jobKey, jobsKey, requestScriptRevision } from '../api';
import { STATUS_LABEL, canEditScenes, isActiveJob } from '../types';
import { SceneEditor } from './SceneEditor';
import { StoryboardReview } from './StoryboardReview';
import { activeCards, type WizardAction, type WizardState } from '../wizardReducer';
import styles from '../reels.module.css';

/** Cada cuánto el navegador pregunta al servidor por el estado (el servidor consulta a HeyGen). */
const REFRESH_MS = 4_000;
const MIN_FEEDBACK = 3;

interface ReelCardProps {
  jobId: string;
  state: WizardState;
  dispatch: Dispatch<WizardAction>;
}

/** Estado en vivo del video y, al terminar, reproductor, descarga y acciones. */
export function ReelCard({ jobId, state, dispatch }: ReelCardProps) {
  const queryClient = useQueryClient();
  const sectionRef = useRef<HTMLElement>(null);
  const [feedback, setFeedback] = useState('');
  const [copied, setCopied] = useState(false);

  const job = useQuery({
    queryKey: jobKey(jobId),
    queryFn: ({ signal }) => fetchJob(jobId, signal),
    refetchInterval: (query) =>
      query.state.data && !isActiveJob(query.state.data.status) ? false : REFRESH_MS,
  });

  const status = job.data?.status;
  // Al terminar (bien o mal), el historial se actualiza.
  useEffect(() => {
    if (status && !isActiveJob(status)) void queryClient.invalidateQueries({ queryKey: jobsKey });
  }, [status, queryClient]);

  // Al empezar a generar, lleva la vista al resultado.
  useEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    sectionRef.current?.scrollIntoView({
      behavior: reduceMotion ? 'auto' : 'smooth',
      block: 'start',
    });
  }, []);

  /** Reescribe el guion con los comentarios; el video nuevo necesita una nueva aprobación. */
  const revise = useMutation({
    mutationFn: () => {
      const script = state.script;
      if (!script || !state.textModel) throw new Error('Falta el guion o el modelo de texto.');
      return requestScriptRevision({
        textModel: state.textModel,
        topic: state.topic.trim(),
        durationSeconds: state.durationSeconds,
        contact: trimContact(state.contact),
        cta: state.cta.trim(),
        wordsPerSecond: state.wordsPerSecond,
        concept: script.concept,
        caption: script.caption,
        brandCards: activeCards(state),
        style: state.style,
        styleParagraph: state.styleParagraph,
        scenes: script.scenes.map((scene) => ({
          role: scene.role,
          kind: scene.kind,
          title: scene.title,
          script: scene.script,
          subtitleNotes: scene.subtitleNotes,
          backgroundNote: scene.backgroundNote,
          visualPrompt: scene.visualPrompt,
          gestures: scene.gestures,
          onScreenText: scene.onScreenText,
        })),
        feedback: feedback.trim(),
      });
    },
    onSuccess: (result) => {
      setFeedback('');
      dispatch({ type: 'setScript', result });
      window.scrollTo({ top: 0 });
    },
  });

  const copyCaption = async () => {
    try {
      await navigator.clipboard.writeText(job.data?.spec.caption ?? '');
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const handleRevise = (event: FormEvent) => {
    event.preventDefault();
    if (feedback.trim().length >= MIN_FEEDBACK) revise.mutate();
  };

  const data = job.data;
  const ratio = (data?.spec.aspectRatio ?? state.aspectRatio).replace(':', ' / ');

  return (
    <section ref={sectionRef} className={styles.result} aria-labelledby="video-generado">
      <h2 id="video-generado">Video</h2>

      <div className={styles.reelCard}>
        {job.isPending ? (
          <Spinner label="Consultando el estado del video" />
        ) : job.isError ? (
          <Alert>{errorMessage(job.error)}</Alert>
        ) : (
          <>
            <p className={styles.status} aria-live="polite">
              <span className={styles.statusDot} data-status={data?.status} aria-hidden="true" />
              {data ? STATUS_LABEL[data.status] : ''}
            </p>

            <div className={styles.player} style={{ aspectRatio: ratio }}>
              {data?.status === 'completed' && data.videoUrl ? (
                <video src={data.videoUrl} controls playsInline preload="metadata" />
              ) : data?.status === 'drafting' ? (
                <Spinner
                  label={`HeyGen está preparando el storyboard${data.agent?.progress != null ? ` (${data.agent.progress} %)` : ''}. Puede tardar unos minutos.`}
                />
              ) : data?.status === 'reviewing' ? (
                <p className={styles.fine}>
                  Revisa el storyboard y apruébalo para generar el video.
                </p>
              ) : data && isActiveJob(data.status) ? (
                <Spinner label="HeyGen está generando el video. Puede tardar varios minutos." />
              ) : (
                <p className={styles.fine}>Sin video</p>
              )}
            </div>

            {data?.status === 'failed' && data.error && <Alert>{data.error.mensaje}</Alert>}
            {data?.status === 'reviewing' && <StoryboardReview job={data} />}
            {data && isActiveJob(data.status) && (
              <p className={styles.fine}>
                Puedes salir de esta página: el video se sigue generando y aparecerá en "Reels
                anteriores".
              </p>
            )}

            <div className={styles.cardActions}>
              {data?.status === 'completed' && data.videoUrl && (
                <a className={styles.link} href={`${data.videoUrl}?download=1`} download>
                  Descargar MP4
                </a>
              )}
              {data?.status === 'completed' && (
                <button type="button" className={styles.link} onClick={copyCaption}>
                  {copied ? 'Texto copiado' : 'Copiar texto'}
                </button>
              )}
              {data && !isActiveJob(data.status) && data.status !== 'reviewing' && (
                <button
                  type="button"
                  className={styles.link}
                  onClick={() =>
                    dispatch({ type: 'loadDraft', spec: data.spec, duplicatedFrom: data.id })
                  }
                >
                  Duplicar
                </button>
              )}
            </div>

            {data && canEditScenes(data) && <SceneEditor job={data} />}

            {data && !isActiveJob(data.status) && data.status !== 'reviewing' && (
              <form className={styles.feedback} onSubmit={handleRevise}>
                <TextArea
                  label="Comentarios para ajustar el guion"
                  hideLabel
                  value={feedback}
                  onChange={(event) => setFeedback(event.target.value)}
                  placeholder="¿Qué cambiarías? Ej.: el gancho más directo, cerrar invitando a escribir por WhatsApp…"
                  maxLength={1500}
                  rows={3}
                />
                {revise.isError && <Alert>{errorMessage(revise.error)}</Alert>}
                <Button
                  type="submit"
                  variant="secondary"
                  disabled={feedback.trim().length < MIN_FEEDBACK || !state.textModel}
                  loading={revise.isPending}
                  loadingLabel="Reescribiendo guion"
                >
                  Ajustar con comentarios
                </Button>
                <p className={styles.fine}>
                  Reescribe el guion; luego revisas y apruebas de nuevo antes de generar.
                </p>
              </form>
            )}
          </>
        )}
      </div>
    </section>
  );
}
