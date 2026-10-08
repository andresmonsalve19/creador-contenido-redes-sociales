import { useMutation } from '@tanstack/react-query';
import { useId, type Dispatch } from 'react';
import { errorMessage } from '../../../shared/api/client';
import { TopicInput } from '../../../shared/topic/TopicInput';
import { Alert } from '../../../shared/ui/Alert';
import { Actions, Button } from '../../../shared/ui/Button';
import { ChoiceGroup } from '../../../shared/ui/ChoiceGroup';
import { Section } from '../../../shared/ui/Page';
import { requestPrompts } from '../api';
import { MAX_SLIDES, MIN_SLIDES, type AspectRatio, type PostFormat } from '../types';
import {
  buildPromptsRequest,
  slideCountFor,
  type WizardAction,
  type WizardState,
} from '../wizardReducer';
import styles from '../images.module.css';

const FORMAT_OPTIONS = [
  {
    value: 'single',
    label: 'Imagen única',
    description: 'Una pieza que comunica la idea completa.',
  },
  {
    value: 'carousel',
    label: 'Carrusel',
    description: 'Varias imágenes: gancho, desarrollo y llamado a la acción.',
  },
] as const;

const RATIO_OPTIONS = [
  {
    value: '4:5',
    label: 'Vertical 4:5',
    description: 'Ocupa más pantalla en el feed (1080 × 1350).',
  },
  { value: '1:1', label: 'Cuadrado 1:1', description: 'Formato clásico (1080 × 1080).' },
  {
    value: '3:4',
    label: 'Vertical 3:4',
    description: 'Un poco más alto que el 4:5 (1080 × 1440).',
  },
  {
    value: '9:16',
    label: 'Pantalla completa 9:16',
    description: 'Historias y portadas de reel (1080 × 1920).',
  },
  {
    value: '16:9',
    label: 'Horizontal 16:9',
    description: 'Panorámico, para YouTube, LinkedIn o web (1920 × 1080).',
  },
] as const;

interface FormatTopicStepProps {
  state: WizardState;
  dispatch: Dispatch<WizardAction>;
}

export function FormatTopicStep({ state, dispatch }: FormatTopicStepProps) {
  const countId = useId();
  const count = slideCountFor(state);
  const formatLabel = state.format === 'single' ? 'imagen única' : `carrusel de ${count} imágenes`;
  const topicReady = state.topic.trim().length >= 3;

  const prompts = useMutation({
    mutationFn: requestPrompts,
    onSuccess: (result) => {
      dispatch({ type: 'setPrompts', prompts: result });
      dispatch({ type: 'goTo', step: 3 });
    },
  });

  const handleContinue = () => {
    if (state.prompts) {
      dispatch({ type: 'goTo', step: 3 });
      return;
    }
    const request = buildPromptsRequest(state);
    if (request) prompts.mutate(request);
  };

  return (
    <Section
      title="Formato y temática"
      description="Define cómo será la publicación y de qué va a hablar."
    >
      <div className={styles.stack}>
        <ChoiceGroup<PostFormat>
          legend="Tipo de publicación con imágenes"
          options={FORMAT_OPTIONS}
          value={state.format}
          onChange={(format) => dispatch({ type: 'setFormat', format })}
        />

        {state.format === 'carousel' && (
          <div className={styles.counter}>
            <label htmlFor={countId} className={styles.counterLabel}>
              Cantidad de imágenes
            </label>
            <div className={styles.counterControl}>
              <button
                type="button"
                onClick={() => dispatch({ type: 'setSlideCount', count: count - 1 })}
                disabled={count <= MIN_SLIDES}
                aria-label="Quitar una imagen"
              >
                −
              </button>
              <output id={countId} aria-live="polite">
                {count}
              </output>
              <button
                type="button"
                onClick={() => dispatch({ type: 'setSlideCount', count: count + 1 })}
                disabled={count >= MAX_SLIDES}
                aria-label="Agregar una imagen"
              >
                +
              </button>
            </div>
            <p className={styles.fine}>
              Entre {MIN_SLIDES} y {MAX_SLIDES}. La primera será el gancho y la última el llamado a
              la acción.
            </p>
          </div>
        )}

        <ChoiceGroup<AspectRatio>
          legend="Proporción"
          layout="list"
          options={RATIO_OPTIONS}
          value={state.aspectRatio}
          onChange={(aspectRatio) => dispatch({ type: 'setAspectRatio', aspectRatio })}
        />

        {state.textModel && (
          <TopicInput
            value={state.topic}
            onChange={(topic) => dispatch({ type: 'setTopic', topic })}
            textModel={state.textModel}
            format={formatLabel}
          />
        )}
      </div>

      {prompts.isError && <Alert>{errorMessage(prompts.error)}</Alert>}

      <Actions>
        <Button
          variant="secondary"
          onClick={() => dispatch({ type: 'goTo', step: 1 })}
          disabled={prompts.isPending}
        >
          Atrás
        </Button>
        <Button
          onClick={handleContinue}
          disabled={!topicReady}
          loading={prompts.isPending}
          loadingLabel="Escribiendo prompts"
        >
          {state.prompts ? 'Ver prompts' : 'Crear prompts'}
        </Button>
      </Actions>
    </Section>
  );
}
