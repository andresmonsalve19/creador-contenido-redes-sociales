import { useMutation } from '@tanstack/react-query';
import { useId, type Dispatch } from 'react';
import { errorMessage } from '../../../shared/api/client';
import { TopicInput } from '../../../shared/topic/TopicInput';
import { Alert } from '../../../shared/ui/Alert';
import { Actions, Button } from '../../../shared/ui/Button';
import { ChoiceGroup } from '../../../shared/ui/ChoiceGroup';
import { Section } from '../../../shared/ui/Page';
import { DURATION_OPTIONS, RATIO_OPTIONS } from '../../../shared/video/options';
import type { VideoAspectRatio, VideoDuration } from '../../../shared/video/types';
import { requestScript } from '../api';
import { BrandKitField } from '../components/BrandKitField';
import {
  MAX_SCENES,
  MIN_SCENES,
  type AvatarMode,
  type ReelBackground,
  type VideoStyle,
} from '../types';
import {
  buildScriptRequest,
  formatLabel,
  type WizardAction,
  type WizardState,
} from '../wizardReducer';
import styles from '../reels.module.css';

const STYLE_OPTIONS = [
  {
    value: 'agent',
    label: 'Edición HeyGen (como en la web)',
    description:
      'El Video Agent de HeyGen edita el reel completo: tomas, gráficos y textos animados, imágenes, música y transiciones. Revisas el storyboard antes de generar. Recomendado.',
  },
  {
    value: 'dynamic',
    label: 'Escenas compuestas por la app',
    description:
      'Alterna el presentador con imágenes de apoyo narradas y tarjetas con el logo. Sin música ni textos animados.',
  },
  {
    value: 'simple',
    label: 'Simple',
    description: 'Solo el presentador hablando a cámara.',
  },
] as const;

const AVATAR_MODE_OPTIONS = [
  {
    value: 'same',
    label: 'Mismo avatar',
    description: 'El avatar principal en todas las escenas.',
  },
  {
    value: 'perScene',
    label: 'Avatar distinto por escena',
    description: 'Alterna los avatares que elegiste en el paso anterior.',
  },
] as const;

const BACKGROUND_OPTIONS = [
  {
    value: 'avatar',
    label: 'Fondo original del avatar',
    description: 'Funciona con cualquier avatar.',
  },
  { value: 'color', label: 'Color de la marca', description: 'Un color sólido detrás del avatar.' },
  {
    value: 'brandImage',
    label: 'Imagen de la marca',
    description: 'La imagen guardada en la configuración de video.',
  },
  {
    value: 'generated',
    label: 'Generar fondo con IA',
    description: 'Nano Banana crea un fondo sin texto ni personas, con tu paleta.',
  },
] as const;

interface FormatTopicStepProps {
  state: WizardState;
  dispatch: Dispatch<WizardAction>;
  hasBrandImage: boolean;
}

export function FormatTopicStep({ state, dispatch, hasBrandImage }: FormatTopicStepProps) {
  const countId = useId();
  const topicReady = state.topic.trim().length >= 3;
  const count = state.sceneCount;

  const script = useMutation({
    mutationFn: requestScript,
    onSuccess: (result) => {
      dispatch({ type: 'setScript', result });
      dispatch({ type: 'goTo', step: 3 });
    },
  });

  const handleContinue = () => {
    if (state.script) {
      dispatch({ type: 'goTo', step: 3 });
      return;
    }
    const request = buildScriptRequest(state);
    if (request) script.mutate(request);
  };

  const setBackground = (type: ReelBackground['type']) => {
    const background: ReelBackground =
      type === 'color'
        ? { type, color: state.background.type === 'color' ? state.background.color : '#0F2A5F' }
        : type === 'generated'
          ? { type, imageId: null }
          : { type };
    dispatch({ type: 'setFormat', patch: { background } });
  };

  const backgroundOptions = BACKGROUND_OPTIONS.map((option) =>
    option.value === 'brandImage' && !hasBrandImage
      ? { ...option, disabled: true, description: 'Súbela en Actualizar marca → Video.' }
      : option,
  );

  return (
    <Section
      title="Formato y temática"
      description="Define cómo será el reel y de qué va a hablar."
    >
      <div className={styles.stack}>
        <ChoiceGroup<VideoStyle>
          legend="Estilo del video"
          options={STYLE_OPTIONS}
          value={state.style}
          onChange={(style) => dispatch({ type: 'setFormat', patch: { style } })}
        />

        {state.style === 'dynamic' && (
          <fieldset className={styles.options}>
            <legend>Elementos del estilo dinámico</legend>
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={state.brandCards.intro}
                onChange={(event) =>
                  dispatch({
                    type: 'setFormat',
                    patch: { brandCards: { ...state.brandCards, intro: event.target.checked } },
                  })
                }
              />
              Apertura con el logo (2 s)
            </label>
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={state.brandCards.outro}
                onChange={(event) =>
                  dispatch({
                    type: 'setFormat',
                    patch: { brandCards: { ...state.brandCards, outro: event.target.checked } },
                  })
                }
              />
              Cierre con el logo, el llamado a la acción y el contacto (3 s)
            </label>
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={state.varyLooks}
                onChange={(event) =>
                  dispatch({ type: 'setFormat', patch: { varyLooks: event.target.checked } })
                }
              />
              Variar tomas del presentador (otra pose o vestuario del mismo avatar, si las tiene)
            </label>
            <p className={styles.fine}>
              Con 3 o más escenas, las del medio se alternan con imágenes de apoyo: la voz sigue
              hablando mientras se ve una imagen que ilustra lo que dice.
            </p>
          </fieldset>
        )}

        <ChoiceGroup<`${VideoDuration}`>
          legend="Duración"
          options={DURATION_OPTIONS}
          value={`${state.durationSeconds}`}
          onChange={(value) =>
            dispatch({
              type: 'setFormat',
              patch: { durationSeconds: Number(value) as VideoDuration },
            })
          }
        />

        <ChoiceGroup<VideoAspectRatio>
          legend="Proporción"
          layout="list"
          options={RATIO_OPTIONS}
          value={state.aspectRatio}
          onChange={(aspectRatio) => dispatch({ type: 'setFormat', patch: { aspectRatio } })}
        />

        <div className={styles.counter}>
          <label htmlFor={countId} className={styles.counterLabel}>
            Número de escenas
          </label>
          <div className={styles.counterControl}>
            <button
              type="button"
              onClick={() => dispatch({ type: 'setFormat', patch: { sceneCount: count - 1 } })}
              disabled={count <= MIN_SCENES}
              aria-label="Quitar una escena"
            >
              −
            </button>
            <output id={countId} aria-live="polite">
              {count}
            </output>
            <button
              type="button"
              onClick={() => dispatch({ type: 'setFormat', patch: { sceneCount: count + 1 } })}
              disabled={count >= MAX_SCENES}
              aria-label="Agregar una escena"
            >
              +
            </button>
          </div>
          <p className={styles.fine}>
            Entre {MIN_SCENES} y {MAX_SCENES}. La primera engancha en los primeros 3 segundos y la
            última cierra con el llamado a la acción.
          </p>
        </div>

        {count > 1 && state.style !== 'agent' && (
          <ChoiceGroup<AvatarMode>
            legend="Modo de avatar"
            options={AVATAR_MODE_OPTIONS.map((option) =>
              option.value === 'perScene' && state.avatarIds.length < 2
                ? {
                    ...option,
                    disabled: true,
                    description: 'Elige al menos 2 avatares en el paso anterior.',
                  }
                : option,
            )}
            value={state.avatarMode}
            onChange={(avatarMode) => dispatch({ type: 'setFormat', patch: { avatarMode } })}
          />
        )}

        {state.style === 'agent' ? (
          <BrandKitField
            value={state.brandKitId}
            onChange={(brandKitId) => dispatch({ type: 'setFormat', patch: { brandKitId } })}
          />
        ) : (
          <>
            <ChoiceGroup<ReelBackground['type']>
              legend="Fondo"
              layout="list"
              options={backgroundOptions}
              value={state.background.type}
              onChange={setBackground}
            />
            {state.background.type === 'color' && (
              <label className={styles.colorField}>
                Color de fondo
                <input
                  type="color"
                  value={state.background.color}
                  onChange={(event) =>
                    dispatch({
                      type: 'setFormat',
                      patch: { background: { type: 'color', color: event.target.value } },
                    })
                  }
                />
                <code>{state.background.color.toUpperCase()}</code>
              </label>
            )}
            {state.background.type === 'generated' && (
              <p className={styles.fine}>
                Generarás el fondo en el siguiente paso, cuando ya tengas el guion.
              </p>
            )}
          </>
        )}

        <label className={styles.check}>
          <input
            type="checkbox"
            checked={state.captions}
            onChange={(event) =>
              dispatch({ type: 'setFormat', patch: { captions: event.target.checked } })
            }
          />
          Subtítulos en el video
        </label>

        {state.textModel && (
          <TopicInput
            value={state.topic}
            onChange={(topic) => dispatch({ type: 'setTopic', topic })}
            textModel={state.textModel}
            format={formatLabel(state)}
            kind="video"
          />
        )}
      </div>

      {script.isError && <Alert>{errorMessage(script.error)}</Alert>}

      <Actions>
        <Button
          variant="secondary"
          onClick={() => dispatch({ type: 'goTo', step: 1 })}
          disabled={script.isPending}
        >
          Atrás
        </Button>
        <Button
          onClick={handleContinue}
          disabled={!topicReady}
          loading={script.isPending}
          loadingLabel="Escribiendo guion"
        >
          {state.script ? 'Ver guion' : 'Escribir guion'}
        </Button>
      </Actions>
    </Section>
  );
}
