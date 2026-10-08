import { api } from '../../shared/api/client';
import type { InlineImage } from '../../shared/api/types';
import type { AspectRatio, Contact, PostFormat, PromptsResult, SlideRole } from './types';

export interface PromptsRequest {
  textModel: string;
  format: PostFormat;
  slideCount: number;
  topic: string;
  aspectRatio: AspectRatio;
  contact: Contact;
  cta: string;
}

export interface GenerateRequest {
  imageModel: string;
  aspectRatio: AspectRatio;
  role: SlideRole;
  prompt: string;
  styleReference?: InlineImage;
  /** Para ajustar una imagen ya generada con los comentarios del usuario. */
  previousImage?: InlineImage;
  feedback?: string;
}

export interface ReviseRequest {
  textModel: string;
  role: SlideRole;
  prompt: string;
  feedback: string;
}

export const requestPromptRevision = (body: ReviseRequest) =>
  api<{ prompt: string }>('/images/revise-prompt', { method: 'POST', json: body }).then(
    (r) => r.prompt,
  );

export const requestPrompts = (body: PromptsRequest) =>
  api<PromptsResult>('/images/prompts', { method: 'POST', json: body });

export const requestImage = (body: GenerateRequest, signal?: AbortSignal) =>
  api<{ image: InlineImage }>('/images/generate', { method: 'POST', json: body, signal }).then(
    (r) => r.image,
  );
