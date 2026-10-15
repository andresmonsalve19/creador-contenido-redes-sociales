import { useMutation, useQuery } from '@tanstack/react-query';
import { useState, type Dispatch } from 'react';
import { errorMessage } from '../../../shared/api/client';
import { LearningBox } from '../../../shared/learning/LearningBox';
import { trimContact } from '../../../shared/publishing/contact';
import { Alert } from '../../../shared/ui/Alert';
import { Actions, Button } from '../../../shared/ui/Button';
import { Section } from '../../../shared/ui/Page';
import { Select } from '../../../shared/ui/Select';
import { TextArea } from '../../../shared/ui/TextArea';
import { TextField } from '../../../shared/ui/TextField';
import { genderOf, suggestVoice, voicesForGender } from '../../../shared/video/gender';
import { useAvatars, useVideoSettings, useVoices } from '../../../shared/video/useVideo';
import { requestBackground, requestBroll, requestCardsPreview, requestScript } from '../api';
import { ApprovalPanel } from '../components/ApprovalPanel';
import { ReelCard } from '../components/ReelCard';
import { ROLE_LABEL, countWords, estimateSeconds } from '../types';
import {
  activeCards,
  buildScriptRequest,
  type WizardAction,
  type WizardState,
} from '../wizardReducer';
import styles from '../reels.module.css';

interface ScriptStepProps {
  state: WizardState;
  dispatch: Dispatch<WizardAction>;
}

const seconds = (value: number) =>
  `${value.toLocaleString('es-CO', { maximumFractionDigits: 1 })} s`;
const toDataUrl = (image: { mimeType: string; data: string }) =>
  `data:${image.mimeType};base64,${image.data}`;
const imageUrl = (imageId: string) => `/api/reels/backgrounds/${imageId}`;

/** Duración de las tarjetas de marca (igual que en el servidor). */
const CARD_SECONDS = { intro: 2, outro: 3 };

export function ScriptStep({ state, dispatch }: ScriptStepProps) {
  const avatars = useAvatars();
  const voices = useVoices(state.voiceLanguage);
  const videoSettings = useVideoSettings();
  const [copied, setCopied] = useState(false);
  /** Escenas de apoyo cuya imagen se está generando. */
  const [generating, setGenerating] = useState<number[]>([]);
  const [brollError, setBrollError] = useState<string | null>(null);
  const cards = activeCards(state);

  const cardsPreview = useQuery({
    queryKey: ['reels', 'cards', state.aspectRatio, state.cta, state.contact],
    queryFn: () =>
      requestCardsPreview({
        aspectRatio: state.aspectRatio,
        cta: state.cta.trim(),
        contact: trimContact(state.contact),
      }),
    enabled: cards.intro || cards.outro,
    staleTime: Infinity,
  });

  const rewrite = useMutation({
    mutationFn: requestScript,
    onSuccess: (result) => dispatch({ type: 'setScript', result }),
  });
  const background = useMutation({
    mutationFn: requestBackground,
    onSuccess: ({ imageId, image }) => dispatch({ type: 'setBackgroundImage', imageId, image }),
  });

  const { script } = state;
  if (!script) return null;

  const perScene = script.scenes.map((scene) =>
    estimateSeconds(scene.script, state.wordsPerSecond),
  );
  const cardSeconds =
    (cards.intro ? CARD_SECONDS.intro : 0) + (cards.outro ? CARD_SECONDS.outro : 0);
  const total =
    Math.round((perScene.reduce((sum, value) => sum + value, 0) + cardSeconds) * 10) / 10;
  const over = total > state.durationSeconds;
  const busy = rewrite.isPending || background.isPending || generating.length > 0;
  /** Edición automática: HeyGen arma las visuales; aquí se editan guion, tomas y textos. */
  const agent = state.style === 'agent';
  const missingImages = script.scenes
    .map((scene, index) => (scene.kind === 'broll' && !scene.imageId ? index : -1))
    .filter((index) => index >= 0);

  /** Genera (o regenera) la imagen de apoyo de las escenas indicadas, una por una. */
  const generateImages = async (indices: number[]) => {
    setBrollError(null);
    setGenerating(indices);
    for (const index of indices) {
      const scene = script.scenes[index];
      if (!scene) continue;
      try {
        const { imageId } = await requestBroll({
          aspectRatio: state.aspectRatio,
          topic: state.topic,
          visualPrompt: scene.visualPrompt,
        });
        dispatch({ type: 'editScene', index, patch: { imageId } });
      } catch (error) {
        setBrollError(errorMessage(error));
        break;
      } finally {
        setGenerating((current) => current.filter((i) => i !== index));
      }
    }
    setGenerating([]);
  };

  /** Presentador que precede a una escena de apoyo: su voz sigue como voz en off. */
  const presenterBefore = (index: number) =>
    script.scenes
      .slice(0, index)
      .reverse()
      .find((scene) => scene.kind === 'avatar')?.avatarId ??
    state.avatarIds[0] ??
    '';

  const avatarById = (id: string) => avatars.data?.find((a) => a.id === id);
  const avatarName = (id: string) => avatarById(id)?.name ?? id;
  const avatarOptions = state.avatarIds.map((id) => ({ value: id, label: avatarName(id) }));
  /** Solo voces del género del avatar de la escena, para no mezclar voces de hombre y mujer. */
  const voiceOptions = (selected: string, avatarId: string) => {
    const matching = voicesForGender(voices.data ?? [], genderOf(avatarById(avatarId))).voices;
    const list = matching.map((voice) => ({ value: voice.id, label: voice.name }));
    return list.some((option) => option.value === selected)
      ? list
      : [{ value: selected, label: selected || 'Elige una voz' }, ...list];
  };

  const copyCaption = async () => {
    try {
      await navigator.clipboard.writeText(script.caption);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const brandImageUrl = videoSettings.data?.backgroundImage?.url;
  const generatedUrl = state.backgroundPreview
    ? toDataUrl(state.backgroundPreview)
    : state.background.type === 'generated' && state.background.imageId
      ? `/api/reels/backgrounds/${state.background.imageId}`
      : null;

  return (
    <>
      <Section
        title="Revisa el guion"
        description="Cada escena es lo que dirá el avatar. Edita el texto, el avatar o la voz antes de generar."
      >
        <div className={styles.concept}>
          <h3>Idea creativa</h3>
          <p>{script.concept}</p>
        </div>

        {state.warnings.length > 0 && (
          <Alert tone="info">
            Para cumplir las reglas de la marca se ignoró:
            <ul className={styles.warnings}>
              {state.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </Alert>
        )}

        <ol className={styles.prompts}>
          {script.scenes.map((scene, index) => {
            const sceneSeconds = perScene[index] ?? 0;
            return (
              <li key={index} className={styles.sceneItem}>
                <div className={styles.sceneHeader}>
                  <span>
                    {index + 1}. {ROLE_LABEL[scene.role]}: {scene.title}{' '}
                    <span className={styles.sceneKind}>
                      {scene.kind === 'avatar'
                        ? 'Presentador'
                        : agent
                          ? 'Sin presentador'
                          : 'Imagen de apoyo'}
                    </span>
                  </span>
                  <span className={styles.sceneMeta}>
                    ≈ {seconds(sceneSeconds)} · {countWords(scene.script)} palabras
                  </span>
                </div>
                <TextArea
                  label={
                    scene.kind === 'broll'
                      ? `Voz en off de la escena ${index + 1}`
                      : `Texto hablado de la escena ${index + 1}`
                  }
                  hideLabel
                  value={scene.script}
                  onChange={(event) =>
                    dispatch({ type: 'editScene', index, patch: { script: event.target.value } })
                  }
                  rows={4}
                  maxLength={5000}
                  disabled={busy}
                />
                <TextField
                  label="Indicaciones de subtítulo"
                  value={scene.subtitleNotes}
                  onChange={(event) =>
                    dispatch({
                      type: 'editScene',
                      index,
                      patch: { subtitleNotes: event.target.value },
                    })
                  }
                  maxLength={500}
                />
                {agent ? (
                  <>
                    <TextArea
                      label="Indicación de toma"
                      value={scene.visualPrompt}
                      onChange={(event) =>
                        dispatch({
                          type: 'editScene',
                          index,
                          patch: { visualPrompt: event.target.value },
                        })
                      }
                      rows={2}
                      maxLength={1000}
                      hint="Cómo se ve la escena: encuadre, gráfico animado, pantalla de texto o imagen de apoyo."
                    />
                    <TextField
                      label="Texto en pantalla"
                      value={scene.onScreenText}
                      onChange={(event) =>
                        dispatch({
                          type: 'editScene',
                          index,
                          patch: { onScreenText: event.target.value },
                        })
                      }
                      maxLength={200}
                      hint={
                        index === 0
                          ? 'El gancho, en texto grande en los primeros segundos.'
                          : 'Palabra o frase clave de la escena (opcional).'
                      }
                    />
                  </>
                ) : scene.kind === 'broll' ? (
                  <div className={styles.sceneImage}>
                    {scene.imageId ? (
                      <img src={imageUrl(scene.imageId)} alt={`Imagen de apoyo: ${scene.title}`} />
                    ) : (
                      <p className={styles.fine}>Aún no hay imagen para esta escena.</p>
                    )}
                    <TextArea
                      label="Qué muestra la imagen"
                      value={scene.visualPrompt}
                      onChange={(event) =>
                        dispatch({
                          type: 'editScene',
                          index,
                          patch: { visualPrompt: event.target.value },
                        })
                      }
                      rows={2}
                      maxLength={1000}
                    />
                    <Button
                      variant="secondary"
                      loading={generating.includes(index)}
                      loadingLabel="Generando imagen"
                      disabled={busy || scene.visualPrompt.trim().length < 3}
                      onClick={() => void generateImages([index])}
                    >
                      {scene.imageId ? 'Regenerar imagen' : 'Generar imagen'}
                    </Button>
                  </div>
                ) : (
                  <>
                    {scene.backgroundNote && (
                      <p className={styles.fine}>Sugerencia de fondo: {scene.backgroundNote}</p>
                    )}
                    <TextField
                      label="Gestos del presentador"
                      value={scene.gestures}
                      onChange={(event) =>
                        dispatch({
                          type: 'editScene',
                          index,
                          patch: { gestures: event.target.value },
                        })
                      }
                      maxLength={500}
                      hint="Se aplican solo si el avatar los admite (photo avatars o Avatar V)."
                    />
                  </>
                )}
                {!agent && (
                  <div className={styles.sceneControls}>
                    {scene.kind === 'avatar' && (
                      <Select
                        label="Avatar"
                        options={avatarOptions}
                        value={scene.avatarId}
                        onChange={(avatarId) =>
                          dispatch({
                            type: 'editScene',
                            index,
                            patch: {
                              avatarId,
                              // Al cambiar de avatar, la voz pasa a una de su mismo género.
                              voiceId:
                                state.voiceByAvatar[avatarId] ??
                                suggestVoice(
                                  avatarById(avatarId),
                                  voices.data ?? [],
                                  scene.voiceId,
                                ) ??
                                scene.voiceId,
                            },
                          })
                        }
                      />
                    )}
                    <Select
                      label={scene.kind === 'broll' ? 'Voz en off' : 'Voz'}
                      options={voiceOptions(
                        scene.voiceId,
                        scene.kind === 'broll' ? presenterBefore(index) : scene.avatarId,
                      )}
                      value={scene.voiceId}
                      onChange={(voiceId) =>
                        dispatch({ type: 'editScene', index, patch: { voiceId } })
                      }
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ol>

        {!agent && missingImages.length > 0 && (
          <Actions>
            <Button
              loading={generating.length > 1}
              loadingLabel="Generando imágenes de apoyo"
              disabled={busy}
              onClick={() => void generateImages(missingImages)}
            >
              Generar{' '}
              {missingImages.length === 1 ? 'la imagen' : `las ${missingImages.length} imágenes`} de
              apoyo
            </Button>
          </Actions>
        )}
        {brollError && <Alert>{brollError}</Alert>}
        {!agent && script.scenes.some((scene) => scene.kind === 'broll') && (
          <p className={styles.fine}>
            Las imágenes de apoyo se generan con Nano Banana (Google Gemini), sin texto ni logos.
            Revísalas antes de aprobar el video.
          </p>
        )}

        {(cards.intro || cards.outro) && (
          <div className={styles.backgroundPreview}>
            <h3>Tarjetas de marca</h3>
            {cardsPreview.isPending ? (
              <p className={styles.fine}>Preparando la vista previa…</p>
            ) : cardsPreview.isError ? (
              <Alert>{errorMessage(cardsPreview.error)}</Alert>
            ) : (
              <div className={styles.cards}>
                {cards.intro && (
                  <figure>
                    <img src={toDataUrl(cardsPreview.data.intro)} alt="Tarjeta de apertura" />
                    <figcaption>Apertura · {CARD_SECONDS.intro} s</figcaption>
                  </figure>
                )}
                {cards.outro && (
                  <figure>
                    <img src={toDataUrl(cardsPreview.data.outro)} alt="Tarjeta de cierre" />
                    <figcaption>Cierre · {CARD_SECONDS.outro} s</figcaption>
                  </figure>
                )}
              </div>
            )}
          </div>
        )}

        <p className={styles.total}>
          Duración estimada: <strong>{seconds(total)}</strong> de {state.durationSeconds} s
          {cardSeconds > 0 && ` (incluye ${cardSeconds} s de tarjetas)`}
        </p>
        {over && (
          <Alert>
            El guion supera la duración elegida por unos{' '}
            {seconds(Math.round((total - state.durationSeconds) * 10) / 10)}. Acórtalo o usa
            "Reescribir guion".
          </Alert>
        )}

        <label className={styles.range}>
          <span>
            Ritmo para estimar: <strong>{state.wordsPerSecond.toFixed(1)}</strong> palabras por
            segundo
          </span>
          <input
            type="range"
            min={1.5}
            max={4}
            step={0.1}
            value={state.wordsPerSecond}
            onChange={(event) =>
              dispatch({ type: 'setWordsPerSecond', value: Number(event.target.value) })
            }
          />
        </label>

        {!agent && (
          <label className={styles.range}>
            <span>
              Velocidad de la voz: <strong>{state.voiceSpeed.toFixed(2)}×</strong>
            </span>
            <input
              type="range"
              min={0.5}
              max={1.5}
              step={0.05}
              value={state.voiceSpeed}
              onChange={(event) =>
                dispatch({ type: 'setVoiceSpeed', value: Number(event.target.value) })
              }
            />
          </label>
        )}

        {agent ? (
          <div className={styles.caption}>
            <h3>Estilo visual para HeyGen</h3>
            <TextArea
              label="Estilo visual para HeyGen"
              hideLabel
              value={state.styleParagraph}
              onChange={(event) =>
                dispatch({ type: 'setStyleParagraph', value: event.target.value })
              }
              rows={6}
              maxLength={3000}
              hint="Paleta, tipografías, movimiento, transiciones, música y reglas de marca. Lo escribió la IA a partir de tus lineamientos."
            />
          </div>
        ) : (
          <div className={styles.backgroundPreview}>
            <h3>Fondo</h3>
            {state.background.type === 'avatar' && (
              <p className={styles.fine}>Se usa el fondo original de cada avatar.</p>
            )}
            {state.background.type === 'color' && (
              <span
                className={styles.swatch}
                style={{ background: state.background.color }}
                aria-label={`Color ${state.background.color}`}
              />
            )}
            {state.background.type === 'brandImage' && brandImageUrl && (
              <img src={brandImageUrl} alt="Imagen de fondo de la marca" />
            )}
            {state.background.type === 'generated' && (
              <>
                {generatedUrl && <img src={generatedUrl} alt="Fondo generado con IA" />}
                <Button
                  variant="secondary"
                  loading={background.isPending}
                  loadingLabel="Generando fondo"
                  disabled={busy}
                  onClick={() =>
                    background.mutate({ aspectRatio: state.aspectRatio, topic: state.topic })
                  }
                >
                  {generatedUrl ? 'Generar otro fondo' : 'Generar fondo con Nano Banana'}
                </Button>
                <p className={styles.fine}>
                  Sin texto ni personas, con la paleta de tu marca. Lo genera Google Gemini.
                </p>
              </>
            )}
            {background.isError && <Alert>{errorMessage(background.error)}</Alert>}
          </div>
        )}

        <div className={styles.caption}>
          <h3>Texto de la publicación</h3>
          <TextArea
            label="Texto de la publicación"
            hideLabel
            value={script.caption}
            onChange={(event) => dispatch({ type: 'setCaption', caption: event.target.value })}
            rows={8}
            maxLength={5000}
          />
          <Button variant="ghost" onClick={copyCaption}>
            {copied ? 'Texto copiado' : 'Copiar texto'}
          </Button>
        </div>

        {rewrite.isError && <Alert>{errorMessage(rewrite.error)}</Alert>}

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
            loading={rewrite.isPending}
            loadingLabel="Reescribiendo"
            onClick={() => {
              const request = buildScriptRequest(state);
              if (request) rewrite.mutate(request);
            }}
          >
            Reescribir guion
          </Button>
        </Actions>
      </Section>

      {state.jobId ? (
        <ReelCard jobId={state.jobId} state={state} dispatch={dispatch} />
      ) : (
        <ApprovalPanel
          state={state}
          disabled={busy}
          onCreated={(jobId) => dispatch({ type: 'setJob', jobId })}
        />
      )}

      <LearningBox textModel={state.textModel} kind="video" />
    </>
  );
}
