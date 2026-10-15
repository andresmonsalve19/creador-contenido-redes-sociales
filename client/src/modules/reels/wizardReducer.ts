import type { InlineImage } from '../../shared/api/types';
import {
  EMPTY_CONTACT,
  contactFromValues,
  trimContact,
  type Contact,
} from '../../shared/publishing/contact';
import { DEFAULT_CTA } from '../../shared/publishing/cta';
import type { VideoAspectRatio, VideoDuration, VideoSettings } from '../../shared/video/types';
import type { ScriptRequest } from './api';
import {
  DEFAULT_WORDS_PER_SECOND,
  MAX_SCENES,
  MIN_SCENES,
  type AvatarMode,
  type BrandCards,
  type ReelBackground,
  type ReelScript,
  type SceneBackgroundSpec,
  type SceneDraft,
  type SceneText,
  type ScriptResult,
  type VideoSpec,
  type VideoStyle,
} from './types';

/** Índice dentro de REEL_FLOW_STEPS (0 = tipo de publicación, gestionado fuera del módulo). */
export type WizardStep = 1 | 2 | 3;

export interface WizardState {
  step: WizardStep;
  textModel: string | null;
  /** Avatares elegidos en el paso 2 (el primero es el principal). */
  avatarIds: string[];
  voiceId: string | null;
  /** Voz de cada avatar, del mismo género que él (para no mezclar voces en un mismo reel). */
  voiceByAvatar: Record<string, string>;
  voiceLanguage: string;
  contact: Contact;
  cta: string;
  durationSeconds: VideoDuration;
  aspectRatio: VideoAspectRatio;
  sceneCount: number;
  avatarMode: AvatarMode;
  /** Simple: solo el presentador. Dinámico: con imágenes de apoyo y tarjetas de marca. */
  style: VideoStyle;
  brandCards: BrandCards;
  /** Alternar otras tomas (looks) del mismo presentador entre escenas. */
  varyLooks: boolean;
  /** Edición automática: estilo visual para el agente de HeyGen (editable). */
  styleParagraph: string;
  /** Edición automática: kit de marca de HeyGen. */
  brandKitId: string | null;
  background: ReelBackground;
  /** Vista previa del fondo generado con IA (la imagen queda guardada en el servidor). */
  backgroundPreview: InlineImage | null;
  captions: boolean;
  voiceSpeed: number;
  wordsPerSecond: number;
  topic: string;
  script: ReelScript | null;
  warnings: string[];
  /** Video en curso o recién generado con este guion. */
  jobId: string | null;
  duplicatedFrom: string | null;
}

export type FormatPatch = Partial<
  Pick<
    WizardState,
    | 'durationSeconds'
    | 'aspectRatio'
    | 'sceneCount'
    | 'avatarMode'
    | 'background'
    | 'captions'
    | 'style'
    | 'brandCards'
    | 'varyLooks'
    | 'brandKitId'
  >
>;

export type WizardAction =
  | { type: 'goTo'; step: WizardStep }
  | {
      type: 'setSettings';
      textModel: string;
      avatarIds: string[];
      voiceId: string;
      voiceByAvatar: Record<string, string>;
      voiceLanguage: string;
      contact: Contact;
      cta: string;
    }
  | { type: 'setFormat'; patch: FormatPatch }
  | { type: 'setTopic'; topic: string }
  | { type: 'setScript'; result: ScriptResult }
  | { type: 'editScene'; index: number; patch: Partial<SceneDraft> }
  | { type: 'setCaption'; caption: string }
  | { type: 'setStyleParagraph'; value: string }
  | { type: 'setWordsPerSecond'; value: number }
  | { type: 'setVoiceSpeed'; value: number }
  | { type: 'setBackgroundImage'; imageId: string; image: InlineImage }
  | { type: 'setJob'; jobId: string | null }
  | { type: 'loadDraft'; spec: VideoSpec; duplicatedFrom: string };

export function initialWizardState(
  settings: VideoSettings,
  contact: Contact = EMPTY_CONTACT,
): WizardState {
  const avatarIds = settings.defaultAvatarId ? [settings.defaultAvatarId] : [];
  return {
    step: 1,
    textModel: null,
    avatarIds,
    voiceId: settings.defaultVoiceId,
    voiceByAvatar:
      settings.defaultAvatarId && settings.defaultVoiceId
        ? { [settings.defaultAvatarId]: settings.defaultVoiceId }
        : {},
    voiceLanguage: settings.voiceLanguage,
    contact,
    cta: DEFAULT_CTA,
    durationSeconds: settings.durationSeconds,
    aspectRatio: settings.aspectRatio,
    sceneCount: 5,
    avatarMode: 'same',
    style: 'agent',
    brandCards: { intro: true, outro: true },
    varyLooks: false,
    styleParagraph: '',
    brandKitId: settings.brandKitId ?? null,
    background: toReelBackground(settings.background),
    backgroundPreview: null,
    captions: settings.captions,
    voiceSpeed: settings.voiceSpeed,
    wordsPerSecond: DEFAULT_WORDS_PER_SECOND,
    topic: '',
    script: null,
    warnings: [],
    jobId: null,
    duplicatedFrom: null,
  };
}

function toReelBackground(setting: VideoSettings['background']): ReelBackground {
  switch (setting.type) {
    case 'avatar':
      return { type: 'avatar' };
    case 'color':
      return { type: 'color', color: setting.color };
    case 'image':
      return { type: 'brandImage' };
    case 'generated':
      return { type: 'generated', imageId: null };
  }
}

/** Avatar de la n-ésima escena con presentador: el mismo en todas, o alternando entre los elegidos. */
export function avatarForScene(
  state: Pick<WizardState, 'avatarIds' | 'avatarMode'>,
  avatarOrdinal: number,
) {
  const { avatarIds, avatarMode } = state;
  if (avatarIds.length === 0) return '';
  return avatarMode === 'same'
    ? (avatarIds[0] ?? '')
    : (avatarIds[avatarOrdinal % avatarIds.length] ?? '');
}

/** Voz de una escena: la asignada a su avatar o, si no hay, la voz principal. */
const voiceForAvatar = (state: Pick<WizardState, 'voiceByAvatar' | 'voiceId'>, avatarId: string) =>
  state.voiceByAvatar[avatarId] ?? state.voiceId ?? '';

/**
 * Asigna avatar y voz a cada escena. Los avatares se alternan solo entre escenas con presentador;
 * las escenas de apoyo no tienen avatar y su voz en off es la del presentador anterior.
 */
function assignCast(
  state: Pick<WizardState, 'avatarIds' | 'avatarMode' | 'voiceByAvatar' | 'voiceId'>,
  scenes: (SceneText & Partial<Pick<SceneDraft, 'imageId'>>)[],
  keep?: SceneDraft[],
): SceneDraft[] {
  let ordinal = 0;
  let lastVoice = state.voiceId ?? '';
  return scenes.map((scene, index) => {
    const previous = keep?.[index];
    if (scene.kind === 'broll') {
      const voiceId = previous?.kind === 'broll' ? previous.voiceId : lastVoice;
      return {
        ...scene,
        avatarId: '',
        voiceId,
        imageId: scene.imageId ?? previous?.imageId ?? null,
      };
    }
    const sameKind = previous?.kind === 'avatar' ? previous : undefined;
    const avatarId = sameKind?.avatarId || avatarForScene(state, ordinal);
    ordinal += 1;
    const voiceId = sameKind?.voiceId || voiceForAvatar(state, avatarId);
    lastVoice = voiceId;
    return { ...scene, avatarId, voiceId, imageId: null };
  });
}

/** Cambiar el encargo invalida el guion y el video generados con él. */
const resetOutput = { script: null, warnings: [], jobId: null } satisfies Partial<WizardState>;

export function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case 'goTo':
      return { ...state, step: action.step };
    case 'setSettings': {
      const textChanged =
        // Solo cuenta lo que sale en la publicación (datos marcados y con valor).
        JSON.stringify(trimContact(action.contact)) !==
          JSON.stringify(trimContact(state.contact)) || action.cta !== state.cta;
      const next: WizardState = {
        ...state,
        textModel: action.textModel,
        avatarIds: action.avatarIds,
        voiceId: action.voiceId,
        voiceByAvatar: action.voiceByAvatar,
        voiceLanguage: action.voiceLanguage,
        contact: action.contact,
        cta: action.cta,
      };
      // El avatar y la voz no cambian el texto: se reasignan sin perder el guion.
      const script = next.script && {
        ...next.script,
        scenes: assignCast(next, next.script.scenes),
      };
      return textChanged ? { ...next, ...resetOutput } : { ...next, script, jobId: null };
    }
    case 'setFormat': {
      const patch = { ...action.patch };
      if (patch.sceneCount !== undefined) {
        patch.sceneCount = Math.min(MAX_SCENES, Math.max(MIN_SCENES, Math.round(patch.sceneCount)));
      }
      const next = { ...state, ...patch };
      // El agente de HeyGen usa un solo presentador.
      if (patch.style === 'agent') next.avatarMode = 'same';
      const changed = <K extends keyof FormatPatch>(key: K) =>
        patch[key] !== undefined && JSON.stringify(patch[key]) !== JSON.stringify(state[key]);
      // Estos cambios alteran la estructura o la duración del guion: hay que reescribirlo.
      const textChanged =
        changed('durationSeconds') ||
        changed('sceneCount') ||
        changed('aspectRatio') ||
        changed('style') ||
        changed('brandCards');
      if (textChanged) return { ...next, ...resetOutput, backgroundPreview: null };
      if (patch.avatarMode && next.script) {
        next.script = { ...next.script, scenes: assignCast(next, next.script.scenes) };
      }
      if (patch.background) next.backgroundPreview = null;
      return { ...next, jobId: null };
    }
    case 'setTopic':
      return { ...state, topic: action.topic, ...resetOutput };
    case 'setScript':
      return {
        ...state,
        script: {
          concept: action.result.concept,
          caption: action.result.caption,
          scenes: assignCast(state, action.result.scenes, state.script?.scenes),
        },
        warnings: action.result.warnings,
        styleParagraph: action.result.styleParagraph || state.styleParagraph,
        jobId: null,
      };
    case 'editScene': {
      if (!state.script) return state;
      const scenes = state.script.scenes.map((scene, index) =>
        index === action.index ? { ...scene, ...action.patch } : scene,
      );
      return { ...state, script: { ...state.script, scenes }, jobId: null };
    }
    case 'setCaption':
      return state.script
        ? { ...state, script: { ...state.script, caption: action.caption }, jobId: null }
        : state;
    case 'setStyleParagraph':
      return { ...state, styleParagraph: action.value, jobId: null };
    case 'setWordsPerSecond':
      return { ...state, wordsPerSecond: action.value };
    case 'setVoiceSpeed':
      return { ...state, voiceSpeed: action.value, jobId: null };
    case 'setBackgroundImage':
      return {
        ...state,
        background: { type: 'generated', imageId: action.imageId },
        backgroundPreview: action.image,
        jobId: null,
      };
    case 'setJob':
      return { ...state, jobId: action.jobId };
    case 'loadDraft': {
      const { spec } = action;
      const avatarScenes = spec.scenes.filter((scene) => scene.kind !== 'broll');
      const avatarIds = [...new Set(avatarScenes.map((scene) => scene.avatarId))];
      const first = avatarScenes[0];
      const background: ReelBackground =
        first?.background.type === 'generated'
          ? { type: 'generated', imageId: first.background.imageId }
          : (first?.background ?? { type: 'avatar' });
      return {
        ...state,
        step: 3,
        avatarIds,
        voiceId: first?.voiceId ?? state.voiceId,
        voiceByAvatar: Object.fromEntries(
          avatarScenes.map((scene) => [scene.avatarId, scene.voiceId]),
        ),
        durationSeconds: spec.durationSeconds,
        aspectRatio: spec.aspectRatio,
        sceneCount: spec.scenes.length,
        avatarMode: avatarIds.length > 1 ? 'perScene' : 'same',
        // Los videos anteriores a estas opciones no las traen.
        style: spec.style ?? 'simple',
        brandCards: spec.brandCards ?? { intro: false, outro: false },
        varyLooks: spec.varyLooks ?? false,
        styleParagraph: spec.styleParagraph ?? '',
        brandKitId: spec.brandKitId ?? state.brandKitId,
        cta: spec.cta ?? state.cta,
        contact: spec.contact ? contactFromValues(spec.contact, state.contact) : state.contact,
        background,
        backgroundPreview: null,
        captions: spec.captions,
        voiceSpeed: spec.voiceSpeed,
        wordsPerSecond: spec.wordsPerSecond,
        topic: spec.topic,
        script: {
          concept: spec.concept,
          caption: spec.caption,
          scenes: spec.scenes.map((scene) => ({
            role: scene.role,
            kind: scene.kind ?? 'avatar',
            title: scene.title,
            script: scene.script,
            subtitleNotes: scene.subtitleNotes,
            backgroundNote: scene.backgroundNote,
            visualPrompt: scene.visualPrompt ?? '',
            gestures: scene.gestures ?? '',
            onScreenText: scene.onScreenText ?? '',
            avatarId: scene.avatarId,
            voiceId: scene.voiceId,
            imageId: scene.imageId ?? null,
          })),
        },
        warnings: [],
        jobId: null,
        duplicatedFrom: action.duplicatedFrom,
      };
    }
  }
}

export function formatLabel(state: Pick<WizardState, 'durationSeconds' | 'sceneCount' | 'style'>) {
  const scenes = `${state.sceneCount} ${state.sceneCount === 1 ? 'escena' : 'escenas'}`;
  return `reel ${state.style === 'simple' ? '' : 'dinámico '}de ${state.durationSeconds} segundos con ${scenes}`;
}

/** Petición para escribir el guion a partir del estado; null si falta el modelo de texto. */
export function buildScriptRequest(state: WizardState): ScriptRequest | null {
  if (!state.textModel) return null;
  return {
    textModel: state.textModel,
    topic: state.topic.trim(),
    durationSeconds: state.durationSeconds,
    sceneCount: state.sceneCount,
    aspectRatio: state.aspectRatio,
    contact: trimContact(state.contact),
    cta: state.cta.trim(),
    wordsPerSecond: state.wordsPerSecond,
    style: state.style,
    brandCards: activeCards(state),
  };
}

/** Las tarjetas de marca solo aplican en el estilo dinámico. */
export const activeCards = (state: Pick<WizardState, 'style' | 'brandCards'>): BrandCards =>
  state.style === 'dynamic' ? state.brandCards : { intro: false, outro: false };

function sceneBackground(background: ReelBackground): SceneBackgroundSpec | null {
  if (background.type !== 'generated') return background;
  return background.imageId ? { type: 'generated', imageId: background.imageId } : null;
}

/** Especificación lista para generar; devuelve el motivo si aún falta algo. */
export function buildSpec(state: WizardState): { spec: VideoSpec } | { missing: string } {
  const { script } = state;
  if (!script) return { missing: 'Primero escribe el guion.' };
  const background = sceneBackground(state.background);
  if (!background) return { missing: 'Genera el fondo con IA o elige otro tipo de fondo.' };
  if (script.scenes.some((scene) => scene.kind === 'avatar' && !scene.avatarId)) {
    return { missing: 'Elige un avatar para cada escena con presentador.' };
  }
  // En la edición automática las visuales de las escenas sin presentador las arma HeyGen.
  if (
    state.style !== 'agent' &&
    script.scenes.some((scene) => scene.kind === 'broll' && !scene.imageId)
  ) {
    return { missing: 'Genera la imagen de cada escena de apoyo.' };
  }
  if (script.scenes.some((scene) => !scene.voiceId)) {
    return { missing: 'Elige una voz para cada escena.' };
  }
  if (script.scenes.some((scene) => scene.script.trim().length < 3)) {
    return { missing: 'Hay una escena sin texto hablado.' };
  }
  const title = (state.topic || script.concept).trim().slice(0, 120) || 'Reel';
  return {
    spec: {
      title,
      topic: state.topic.trim(),
      concept: script.concept,
      caption: script.caption,
      aspectRatio: state.aspectRatio,
      durationSeconds: state.durationSeconds,
      wordsPerSecond: state.wordsPerSecond,
      captions: state.captions,
      voiceSpeed: state.voiceSpeed,
      scenes: script.scenes.map((scene) => ({
        ...scene,
        // Las escenas de apoyo muestran su imagen: el fondo no aplica.
        background: scene.kind === 'broll' ? { type: 'avatar' } : background,
      })),
      style: state.style,
      brandCards: activeCards(state),
      varyLooks: state.style === 'dynamic' && state.varyLooks,
      cta: state.cta.trim(),
      contact: trimContact(state.contact),
      styleParagraph: state.style === 'agent' ? state.styleParagraph.trim() : '',
      brandKitId: state.style === 'agent' ? state.brandKitId : null,
    },
  };
}
