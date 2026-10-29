import { useCallback, useEffect, useRef, useState, type Dispatch } from 'react';
import { errorMessage } from '../../shared/api/client';
import type { InlineImage } from '../../shared/api/types';
import { requestImage, requestPromptRevision } from './api';
import type { SlideResult } from './types';
import type { WizardAction, WizardState } from './wizardReducer';

const isAbort = (error: unknown) => error instanceof DOMException && error.name === 'AbortError';

/** Cómo aplicar los comentarios del usuario a una imagen ya generada. */
export type ReviseMode = 'image' | 'prompt';

/**
 * Genera las imágenes una por una para mostrar el avance y no saturar la cuota.
 * En un carrusel, la primera imagen se usa como referencia de estilo para las demás.
 */
export function useImageGeneration(state: WizardState, dispatch: Dispatch<WizardAction>) {
  const [running, setRunning] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => controllerRef.current?.abort(), []);

  /** Cada imagen se guarda en la biblioteca en cuanto se genera (o se ajusta). */
  const libraryFor = useCallback(
    (index: number) =>
      state.publicationId && state.prompts
        ? {
            publicationId: state.publicationId,
            index,
            format: state.format,
            title: state.topic.trim().slice(0, 200),
            caption: state.prompts.caption,
          }
        : undefined,
    [state.publicationId, state.prompts, state.format, state.topic],
  );

  const generate = useCallback(
    async (indices: number[]) => {
      const { prompts, imageModel, aspectRatio, format, results } = state;
      if (!prompts || !imageModel || indices.length === 0) return;

      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      setRunning(true);

      const first = results[0];
      let styleReference: InlineImage | undefined =
        format === 'carousel' && !indices.includes(0) && first?.status === 'done'
          ? first.image
          : undefined;

      // La primera imagen va antes que el resto para poder usarla como referencia.
      const queue = [...indices].sort((a, b) => a - b);
      for (const index of queue)
        dispatch({ type: 'setResult', index, result: { status: 'loading' } });

      for (const index of queue) {
        const slide = prompts.slides[index];
        if (!slide) continue;
        try {
          const image = await requestImage(
            {
              imageModel,
              aspectRatio,
              role: slide.role,
              prompt: slide.prompt,
              styleReference: index === 0 ? undefined : styleReference,
              library: libraryFor(index),
            },
            controller.signal,
          );
          if (index === 0 && format === 'carousel') styleReference = image;
          dispatch({ type: 'setResult', index, result: { status: 'done', image } });
        } catch (error) {
          if (isAbort(error) || controller.signal.aborted) {
            // Solo limpia si fue una cancelación del usuario, no si otra generación tomó el relevo.
            if (controllerRef.current === null) {
              for (const pending of queue.filter((i) => i >= index)) {
                dispatch({ type: 'setResult', index: pending, result: { status: 'idle' } });
              }
            }
            break;
          }
          dispatch({
            type: 'setResult',
            index,
            result: { status: 'error', error: errorMessage(error) },
          });
        }
      }

      if (controllerRef.current === controller) {
        controllerRef.current = null;
        setRunning(false);
      }
    },
    [state, dispatch, libraryFor],
  );

  /**
   * Ajusta una sola imagen con los comentarios del usuario:
   * - "image": el modelo edita la versión actual aplicando los cambios.
   * - "prompt": el modelo de texto reescribe el prompt con los comentarios (se actualiza en la lista)
   *   y luego se genera la imagen otra vez con ese prompt.
   * Si algo falla se conserva la imagen anterior y se devuelve el mensaje de error.
   */
  const revise = useCallback(
    async (index: number, feedback: string, mode: ReviseMode): Promise<string | null> => {
      const { prompts, imageModel, textModel, aspectRatio, format, results } = state;
      const slide = prompts?.slides[index];
      const current = results[index];
      if (!slide || !imageModel || current?.status !== 'done')
        return 'No hay una imagen para ajustar.';
      if (mode === 'prompt' && !textModel) return 'Falta el modelo de texto.';

      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      setRunning(true);
      dispatch({ type: 'setResult', index, result: { status: 'loading' } });

      const first = results[0];
      const styleReference =
        format === 'carousel' && index > 0 && first?.status === 'done' ? first.image : undefined;

      try {
        let prompt = slide.prompt;
        if (mode === 'prompt' && textModel) {
          prompt = await requestPromptRevision({ textModel, role: slide.role, prompt, feedback });
          dispatch({ type: 'editPrompt', index, prompt });
        }

        const image = await requestImage(
          {
            imageModel,
            aspectRatio,
            role: slide.role,
            prompt,
            styleReference,
            ...(mode === 'image' ? { previousImage: current.image, feedback } : {}),
            library: libraryFor(index),
          },
          controller.signal,
        );
        dispatch({ type: 'setResult', index, result: { status: 'done', image } });
        return null;
      } catch (error) {
        dispatch({ type: 'setResult', index, result: current satisfies SlideResult });
        return isAbort(error) ? null : errorMessage(error);
      } finally {
        if (controllerRef.current === controller) {
          controllerRef.current = null;
          setRunning(false);
        }
      }
    },
    [state, dispatch, libraryFor],
  );

  const cancel = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setRunning(false);
  }, []);

  return { running, generate, revise, cancel };
}
