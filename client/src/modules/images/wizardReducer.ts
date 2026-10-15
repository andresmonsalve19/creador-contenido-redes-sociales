import type { PromptsRequest } from './api';
import type { AspectRatio, Contact, PostFormat, PromptsResult, SlideResult } from './types';
import { EMPTY_CONTACT, trimContact } from '../../shared/publishing/contact';
import { DEFAULT_CTA } from '../../shared/publishing/cta';
import { MAX_SLIDES, MIN_SLIDES } from './types';

/** Índice dentro de IMAGE_FLOW_STEPS (0 = tipo de publicación, gestionado fuera del módulo). */
export type WizardStep = 1 | 2 | 3;

export interface WizardState {
  step: WizardStep;
  textModel: string | null;
  imageModel: string | null;
  format: PostFormat;
  slideCount: number;
  aspectRatio: AspectRatio;
  contact: Contact;
  cta: string;
  topic: string;
  prompts: PromptsResult | null;
  results: SlideResult[];
}

export type WizardAction =
  | { type: 'goTo'; step: WizardStep }
  | { type: 'setSettings'; textModel: string; imageModel: string; contact: Contact; cta: string }
  | { type: 'setFormat'; format: PostFormat }
  | { type: 'setSlideCount'; count: number }
  | { type: 'setAspectRatio'; aspectRatio: AspectRatio }
  | { type: 'setTopic'; topic: string }
  | { type: 'setPrompts'; prompts: PromptsResult }
  | { type: 'editPrompt'; index: number; prompt: string }
  | { type: 'setResult'; index: number; result: SlideResult };

export const initialWizardState: WizardState = {
  step: 1,
  textModel: null,
  imageModel: null,
  format: 'carousel',
  slideCount: 5,
  aspectRatio: '4:5',
  contact: EMPTY_CONTACT,
  cta: DEFAULT_CTA,
  topic: '',
  prompts: null,
  results: [],
};

/** Cambiar el encargo invalida los prompts y las imágenes generadas con él. */
const resetOutput = { prompts: null, results: [] } satisfies Partial<WizardState>;

export function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case 'goTo':
      return { ...state, step: action.step };
    case 'setSettings': {
      const promptInputsChanged =
        // Solo cuenta lo que sale en la publicación (datos marcados y con valor).
        JSON.stringify(trimContact(action.contact)) !==
          JSON.stringify(trimContact(state.contact)) || action.cta !== state.cta;
      return {
        ...state,
        textModel: action.textModel,
        imageModel: action.imageModel,
        contact: action.contact,
        cta: action.cta,
        // El contacto y el llamado a la acción forman parte de los prompts y del texto de la
        // publicación: si cambian, hay que volver a generarlos.
        ...(promptInputsChanged ? resetOutput : {}),
      };
    }
    case 'setFormat':
      return action.format === state.format
        ? state
        : { ...state, format: action.format, ...resetOutput };
    case 'setSlideCount': {
      const count = Math.min(MAX_SLIDES, Math.max(MIN_SLIDES, Math.round(action.count)));
      return count === state.slideCount ? state : { ...state, slideCount: count, ...resetOutput };
    }
    case 'setAspectRatio':
      return { ...state, aspectRatio: action.aspectRatio, ...resetOutput };
    case 'setTopic':
      return { ...state, topic: action.topic, ...resetOutput };
    case 'setPrompts':
      return {
        ...state,
        prompts: action.prompts,
        results: action.prompts.slides.map(() => ({ status: 'idle' })),
      };
    case 'editPrompt': {
      if (!state.prompts) return state;
      const slides = state.prompts.slides.map((slide, index) =>
        index === action.index ? { ...slide, prompt: action.prompt } : slide,
      );
      return { ...state, prompts: { ...state.prompts, slides } };
    }
    case 'setResult':
      return {
        ...state,
        results: state.results.map((result, index) =>
          index === action.index ? action.result : result,
        ),
      };
  }
}

export const slideCountFor = (state: Pick<WizardState, 'format' | 'slideCount'>) =>
  state.format === 'single' ? 1 : state.slideCount;

/** Petición para crear los prompts a partir del estado; null si falta el modelo de texto. */
export function buildPromptsRequest(state: WizardState): PromptsRequest | null {
  if (!state.textModel) return null;
  return {
    textModel: state.textModel,
    format: state.format,
    slideCount: slideCountFor(state),
    topic: state.topic.trim(),
    aspectRatio: state.aspectRatio,
    contact: trimContact(state.contact),
    cta: state.cta.trim(),
  };
}
