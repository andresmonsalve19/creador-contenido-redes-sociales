import { z } from 'zod';
import { contactSchema } from '../../shared/publishing/contact.js';
import { VIDEO_ASPECT_RATIOS } from '../../shared/video/types.js';
import { VIDEO_DURATIONS, hexColor } from '../../shared/video/videoSettings.schema.js';

export const MAX_SCENES = 5;
/** Ritmo de lectura usado para estimar la duración del guion. */
export const DEFAULT_WORDS_PER_SECOND = 2.5;
/** HeyGen admite hasta 5.000 caracteres de guion por avatar. */
const MAX_SCRIPT_CHARS = 5000;

export const sceneRoleSchema = z.enum(['single', 'hook', 'development', 'cta']);
export type SceneRole = z.infer<typeof sceneRoleSchema>;

const durationSchema = z.union(VIDEO_DURATIONS.map((value) => z.literal(value)));
const aspectRatioSchema = z.enum(VIDEO_ASPECT_RATIOS);
const wordsPerSecondSchema = z.number().min(1.5).max(4).default(DEFAULT_WORDS_PER_SECOND);
const ctaSchema = z.string().trim().min(2, 'Elige un llamado a la acción.').max(80);

/** Escena tal como la ve y edita el usuario. */
const sceneDraftSchema = z.object({
  role: sceneRoleSchema,
  title: z.string().trim().min(1).max(120),
  script: z.string().trim().min(3, 'Una escena no tiene texto hablado.').max(MAX_SCRIPT_CHARS),
  subtitleNotes: z.string().trim().max(500).default(''),
  backgroundNote: z.string().trim().max(500).default(''),
});
export type SceneDraft = z.infer<typeof sceneDraftSchema>;

export const scriptBody = z.object({
  textModel: z.string().min(1),
  topic: z.string().trim().min(3, 'Escribe una temática más descriptiva.').max(1000),
  durationSeconds: durationSchema,
  sceneCount: z.number().int().min(1).max(MAX_SCENES),
  aspectRatio: aspectRatioSchema,
  contact: contactSchema,
  cta: ctaSchema,
  wordsPerSecond: wordsPerSecondSchema,
});
export type ScriptBody = z.infer<typeof scriptBody>;

/** Lo que debe devolver el modelo de texto al escribir o reescribir un guion. */
export const scriptResponseSchema = z.object({
  concept: z.string().min(1),
  captionBody: z.string().min(10),
  hashtags: z.array(z.string().min(2)).min(1).max(12),
  scenes: z
    .array(
      z.object({
        title: z.string().min(1),
        script: z.string().min(3),
        subtitleNotes: z.string(),
        backgroundNote: z.string(),
      }),
    )
    .min(1)
    .max(MAX_SCENES),
  /** Partes de la temática, los lineamientos o los aprendizajes que se ignoraron por cumplimiento. */
  ignoredByCompliance: z.array(z.string()).max(6),
});
export type ScriptResponse = z.infer<typeof scriptResponseSchema>;

export const reviseScriptBody = z.object({
  textModel: z.string().min(1),
  topic: z.string().trim().min(3).max(1000),
  durationSeconds: durationSchema,
  contact: contactSchema,
  cta: ctaSchema,
  wordsPerSecond: wordsPerSecondSchema,
  concept: z.string().trim().max(1000),
  caption: z.string().trim().max(5000),
  scenes: z.array(sceneDraftSchema).min(1).max(MAX_SCENES),
  feedback: z.string().trim().min(3, 'Escribe un comentario un poco más detallado.').max(1500),
});
export type ReviseScriptBody = z.infer<typeof reviseScriptBody>;

export const estimateBody = z.object({
  durationSeconds: durationSchema,
  wordsPerSecond: wordsPerSecondSchema,
  scenes: z
    .array(z.object({ script: z.string().max(MAX_SCRIPT_CHARS) }))
    .min(1)
    .max(MAX_SCENES),
});

export const backgroundBody = z.object({
  /** Modelo de imagen; si se omite, se usa el recomendado. */
  imageModel: z.string().min(1).optional(),
  aspectRatio: aspectRatioSchema,
  topic: z.string().trim().min(3).max(1000),
});

/** Fondo de una escena en la especificación del video. */
export const sceneBackgroundSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('avatar') }),
  z.object({ type: z.literal('color'), color: hexColor }),
  /** La imagen de fondo guardada en la configuración de video de la marca. */
  z.object({ type: z.literal('brandImage') }),
  /** Una imagen generada con IA para este reel. */
  z.object({ type: z.literal('generated'), imageId: z.uuid() }),
]);
export type SceneBackgroundSpec = z.infer<typeof sceneBackgroundSchema>;

const sceneSpecSchema = sceneDraftSchema.extend({
  avatarId: z.string().trim().min(1, 'Elige un avatar para cada escena.').max(200),
  voiceId: z.string().trim().min(1, 'Elige una voz para cada escena.').max(200),
  background: sceneBackgroundSchema,
});
export type SceneSpec = z.infer<typeof sceneSpecSchema>;

/** Especificación completa de un video: lo necesario para generarlo, duplicarlo o auditarlo. */
export const videoSpecSchema = z.object({
  title: z.string().trim().min(1).max(120),
  topic: z.string().trim().min(3).max(1000),
  concept: z.string().trim().max(1000),
  caption: z.string().trim().max(5000),
  aspectRatio: aspectRatioSchema,
  durationSeconds: durationSchema,
  wordsPerSecond: wordsPerSecondSchema,
  captions: z.boolean(),
  voiceSpeed: z.number().min(0.5).max(1.5),
  scenes: z.array(sceneSpecSchema).min(1).max(MAX_SCENES),
});
export type VideoSpec = z.infer<typeof videoSpecSchema>;

export const generateBody = videoSpecSchema.extend({
  /** Nada se envía a HeyGen sin esta confirmación explícita del usuario. */
  confirmed: z.literal(true, { message: 'Confirma la generación del video.' }),
  /** Id del video del que se duplicó, si aplica. */
  duplicatedFrom: z.uuid().optional(),
});
