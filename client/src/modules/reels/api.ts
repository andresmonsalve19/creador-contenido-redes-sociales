import { api } from '../../shared/api/client';
import type { InlineImage } from '../../shared/api/types';
import type { ContactValues } from '../../shared/publishing/contact';
import type { VideoAspectRatio, VideoDuration } from '../../shared/video/types';
import type { BrandCards, ReelJob, SceneText, ScriptResult, VideoSpec, VideoStyle } from './types';

export interface ScriptRequest {
  textModel: string;
  topic: string;
  durationSeconds: VideoDuration;
  sceneCount: number;
  aspectRatio: VideoAspectRatio;
  contact: ContactValues;
  cta: string;
  wordsPerSecond: number;
  style: VideoStyle;
  brandCards: BrandCards;
}

export interface ReviseScriptRequest extends Omit<ScriptRequest, 'sceneCount' | 'aspectRatio'> {
  styleParagraph: string;
  concept: string;
  caption: string;
  scenes: SceneText[];
  feedback: string;
}

export const requestScript = (body: ScriptRequest) =>
  api<ScriptResult>('/reels/script', { method: 'POST', json: body });

export const requestScriptRevision = (body: ReviseScriptRequest) =>
  api<ScriptResult>('/reels/revise-script', { method: 'POST', json: body });

export const requestBackground = (body: {
  aspectRatio: VideoAspectRatio;
  topic: string;
  imageModel?: string;
}) =>
  api<{ imageId: string; image: InlineImage }>('/reels/background', { method: 'POST', json: body });

/** Imagen de apoyo de una escena (Nano Banana). */
export const requestBroll = (body: {
  aspectRatio: VideoAspectRatio;
  topic: string;
  visualPrompt: string;
  imageModel?: string;
}) => api<{ imageId: string; image: InlineImage }>('/reels/broll', { method: 'POST', json: body });

/** Vista previa de las tarjetas de apertura y cierre con el logo. */
export const requestCardsPreview = (body: {
  aspectRatio: VideoAspectRatio;
  cta: string;
  contact: ContactValues;
}) =>
  api<{ intro: InlineImage; outro: InlineImage }>('/reels/cards/preview', {
    method: 'POST',
    json: body,
  });

export const requestGenerate = (spec: VideoSpec, duplicatedFrom: string | null) =>
  api<{ job: ReelJob }>('/reels/generate', {
    method: 'POST',
    json: { ...spec, confirmed: true, ...(duplicatedFrom ? { duplicatedFrom } : {}) },
  }).then((r) => r.job);

/** Prompt exacto que se enviaría al agente de HeyGen (no envía nada). */
export const requestAgentPreview = (spec: VideoSpec) =>
  api<{ prompt: string }>('/reels/agent/preview', { method: 'POST', json: spec }).then(
    (r) => r.prompt,
  );

/** Revisión del storyboard: pedir cambios o aprobar y generar. */
export const sendAgentMessage = (
  id: string,
  body: { approve: boolean; message: string; confirmed?: true },
) =>
  api<{ job: ReelJob }>(`/reels/jobs/${id}/agent-message`, { method: 'POST', json: body }).then(
    (r) => r.job,
  );

export const fetchJob = (id: string, signal?: AbortSignal) =>
  api<{ job: ReelJob }>(`/reels/jobs/${id}`, { signal }).then((r) => r.job);

export const fetchJobs = (signal?: AbortSignal) =>
  api<{ jobs: ReelJob[] }>('/reels/jobs', { signal }).then((r) => r.jobs);

export const requestDuplicate = (id: string) =>
  api<{ draft: VideoSpec & { duplicatedFrom: string } }>(`/reels/jobs/${id}/duplicate`, {
    method: 'POST',
  }).then((r) => r.draft);

export const deleteJob = (id: string) => api<null>(`/reels/jobs/${id}`, { method: 'DELETE' });

export const jobsKey = ['reels', 'jobs'] as const;
export const jobKey = (id: string) => ['reels', 'jobs', id] as const;
