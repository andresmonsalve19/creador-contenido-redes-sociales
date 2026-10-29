import type { ContactValues } from '../../shared/publishing/contact';
import type { VideoAspectRatio, VideoDuration } from '../../shared/video/types';

export type SceneRole = 'single' | 'hook' | 'development' | 'cta';
export type AvatarMode = 'same' | 'perScene';
/** avatar: el presentador a cámara. broll: imagen de apoyo con la voz en off. */
export type SceneKind = 'avatar' | 'broll';
/**
 * agent: el Video Agent de HeyGen edita el video completo (gráficos, textos, música, tomas) con
 * revisión del storyboard. dynamic: escenas compuestas por la app. simple: solo el presentador.
 */
export type VideoStyle = 'agent' | 'dynamic' | 'simple';

export interface BrandCards {
  /** Apertura con el logo. */
  intro: boolean;
  /** Cierre con el logo, el llamado a la acción y el contacto. */
  outro: boolean;
}

/** Fondo del reel. `generated` necesita una imagen generada antes de enviar el video. */
export type ReelBackground =
  | { type: 'avatar' }
  | { type: 'color'; color: string }
  | { type: 'brandImage' }
  | { type: 'generated'; imageId: string | null };

/** Fondo tal como lo recibe el servidor (los generados siempre con imagen). */
export type SceneBackgroundSpec =
  | { type: 'avatar' }
  | { type: 'color'; color: string }
  | { type: 'brandImage' }
  | { type: 'generated'; imageId: string };

export interface SceneText {
  role: SceneRole;
  kind: SceneKind;
  title: string;
  script: string;
  subtitleNotes: string;
  backgroundNote: string;
  /** Escenas de apoyo: qué muestra la imagen. */
  visualPrompt: string;
  /** Escenas del presentador: gestos sugeridos. */
  gestures: string;
  /** Texto que aparece en pantalla (gancho, palabra clave…). */
  onScreenText: string;
}

export interface SceneDraft extends SceneText {
  /** Vacío en las escenas de apoyo. */
  avatarId: string;
  voiceId: string;
  /** Escenas de apoyo: imagen generada. */
  imageId: string | null;
}

export interface ScriptResult {
  concept: string;
  caption: string;
  scenes: SceneText[];
  /** Lo que se ignoró por las reglas de cumplimiento. */
  warnings: string[];
  /** Edición automática: estilo visual para el agente de HeyGen. */
  styleParagraph: string;
}

export interface ReelScript {
  concept: string;
  caption: string;
  scenes: SceneDraft[];
}

/** Especificación completa que se envía a generar (y que se guarda en el historial). */
export interface VideoSpec {
  title: string;
  topic: string;
  concept: string;
  caption: string;
  aspectRatio: VideoAspectRatio;
  durationSeconds: VideoDuration;
  wordsPerSecond: number;
  captions: boolean;
  voiceSpeed: number;
  scenes: (SceneDraft & { background: SceneBackgroundSpec })[];
  style: VideoStyle;
  brandCards: BrandCards;
  varyLooks: boolean;
  cta: string;
  contact: ContactValues;
  styleParagraph: string;
  brandKitId: string | null;
}

export type JobStatus =
  'queued' | 'drafting' | 'reviewing' | 'pending' | 'processing' | 'completed' | 'failed';

export interface AgentState {
  sessionId: string | null;
  prompt: string;
  progress: number | null;
  /** Más recientes primero. */
  messages: { role: 'user' | 'model'; content: string; createdAt: number | null }[];
  storyboard: { id: string; type: string; url: string | null; thumbnailUrl: string | null }[];
  /** Cambios por escena pedidos sobre el video terminado (los más recientes primero). */
  edits?: { at: string; items: { scene: number; text: string }[] }[];
}

/** Escenas de un video terminado del agente, para pedir cambios por escena. */
export interface VideoScenes {
  videoId: string;
  editVersion: string;
  scenes: { id: string; script: string; hasPresenter: boolean }[];
}

export interface ReelJob {
  id: string;
  createdAt: string;
  updatedAt: string;
  spec: VideoSpec;
  status: JobStatus;
  providerVideoId: string | null;
  estimatedSeconds: number;
  durationSeconds: number | null;
  file: string | null;
  videoUrl: string | null;
  error: { codigo: string; mensaje: string } | null;
  duplicatedFrom: string | null;
  agent?: AgentState | null;
}

export const ROLE_LABEL: Record<SceneRole, string> = {
  single: 'Escena única',
  hook: 'Gancho',
  development: 'Desarrollo',
  cta: 'Cierre con llamado a la acción',
};

export const STATUS_LABEL: Record<JobStatus, string> = {
  queued: 'Pendiente (en cola)',
  drafting: 'HeyGen está preparando el storyboard',
  reviewing: 'Storyboard listo: revisa y aprueba',
  pending: 'Pendiente',
  processing: 'Procesando',
  completed: 'Completado',
  failed: 'Error',
};

/** Estados que avanzan solos (la app consulta su progreso). `reviewing` espera al usuario. */
export const isActiveJob = (status: JobStatus) =>
  status === 'queued' || status === 'drafting' || status === 'pending' || status === 'processing';

export const MIN_SCENES = 1;
export const MAX_SCENES = 7;
/** Ritmo de lectura de referencia para estimar la duración. */
export const DEFAULT_WORDS_PER_SECOND = 2.5;
export const MAX_AVATARS = 5;

export const countWords = (text: string) => text.split(/\s+/).filter(Boolean).length;
export const estimateSeconds = (text: string, wordsPerSecond: number) =>
  Math.round((countWords(text) / wordsPerSecond) * 10) / 10;

/** Un video del agente terminado admite cambios por escena. */
export const canEditScenes = (job: ReelJob) =>
  job.spec.style === 'agent' && job.status === 'completed' && Boolean(job.agent?.sessionId);
