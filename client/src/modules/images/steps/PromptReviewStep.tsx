import { useMutation } from '@tanstack/react-query';
import { useState, type Dispatch } from 'react';
import { errorMessage } from '../../../shared/api/client';
import { LearningBox } from '../../../shared/learning/LearningBox';
import { formatUsd } from '../../../shared/models/pricing';
import { useModels } from '../../../shared/models/useModels';
import { Alert } from '../../../shared/ui/Alert';
import { Actions, Button } from '../../../shared/ui/Button';
import { Section } from '../../../shared/ui/Page';
import { TextArea } from '../../../shared/ui/TextArea';
import { requestPrompts } from '../api';
import { Gallery } from '../components/Gallery';
import { ROLE_LABEL } from '../types';
import { useImageGeneration } from '../useImageGeneration';
import { buildPromptsRequest, type WizardAction, type WizardState } from '../wizardReducer';
import styles from '../images.module.css';

interface PromptReviewStepProps {
  state: WizardState;
  dispatch: Dispatch<WizardAction>;
}

export function PromptReviewStep({ state, dispatch }: PromptReviewStepProps) {
  const { running, generate, revise, cancel } = useImageGeneration(state, dispatch);
  const images = useModels('image');
  const [copied, setCopied] = useState(false);

  const regenerate = useMutation({
    mutationFn: requestPrompts,
    onSuccess: (prompts) => dispatch({ type: 'setPrompts', prompts }),
  });

  const { prompts } = state;
  if (!prompts) return null;

  const pricing = images.data?.models.find((m) => m.id === state.imageModel)?.pricing;
  const estimate = pricing?.unit === 'image' ? pricing.perImage * prompts.slides.length : null;
  const busy = running || regenerate.isPending;
  const hasResults = state.results.some((r) => r.status !== 'idle');

  const copyCaption = async () => {
    try {
      await navigator.clipboard.writeText(prompts.caption);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <>
      <Section
        title="Revisa los prompts"
        description="Cada prompt describe la escena completa. Edítalos si quieres cambiar algo antes de generar."
      >
        <div className={styles.concept}>
          <h3>Idea creativa</h3>
          <p>{prompts.concept}</p>
        </div>

        <ol className={styles.prompts}>
          {prompts.slides.map((slide, index) => (
            <li key={index} className={styles.promptItem}>
              <TextArea
                label={`${index + 1}. ${ROLE_LABEL[slide.role]}: ${slide.title}`}
                value={slide.prompt}
                onChange={(event) =>
                  dispatch({ type: 'editPrompt', index, prompt: event.target.value })
                }
                rows={7}
                disabled={busy}
              />
            </li>
          ))}
        </ol>

        <div className={styles.caption}>
          <h3>Texto de la publicación</h3>
          <p>{prompts.caption}</p>
          <Button variant="ghost" onClick={copyCaption}>
            {copied ? 'Texto copiado' : 'Copiar texto'}
          </Button>
        </div>

        {regenerate.isError && <Alert>{errorMessage(regenerate.error)}</Alert>}

        {estimate !== null && (
          <p className={styles.fine}>
            Costo estimado de las imágenes: {formatUsd(estimate)} ({prompts.slides.length}{' '}
            {prompts.slides.length === 1 ? 'imagen' : 'imágenes'}).
          </p>
        )}

        <Actions>
          <Button
            variant="secondary"
            onClick={() => dispatch({ type: 'goTo', step: 2 })}
            disabled={busy}
          >
            Atrás
          </Button>
          <Button
            variant="secondary"
            disabled={busy || !state.textModel}
            loading={regenerate.isPending}
            loadingLabel="Reescribiendo"
            onClick={() => {
              const request = buildPromptsRequest(state);
              if (request) regenerate.mutate(request);
            }}
          >
            Reescribir prompts
          </Button>
          {running ? (
            <Button variant="secondary" onClick={cancel}>
              Detener
            </Button>
          ) : (
            <Button
              disabled={busy}
              onClick={() => generate(prompts.slides.map((_, index) => index))}
            >
              {hasResults ? 'Generar de nuevo' : 'Generar'}
            </Button>
          )}
        </Actions>
      </Section>

      {hasResults && (
        <Gallery
          slides={prompts.slides}
          results={state.results}
          aspectRatio={state.aspectRatio}
          busy={busy}
          onRetry={(index) => generate([index])}
          onRevise={revise}
        />
      )}

      <LearningBox textModel={state.textModel} kind="image" />
    </>
  );
}
