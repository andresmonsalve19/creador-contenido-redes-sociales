import { z } from 'zod';
import { contactSchema } from '../../shared/publishing/contact.js';
import { VIDEO_ASPECT_RATIOS, VIDEO_ENGINES } from '../../shared/video/types.js';
import { VIDEO_DURATIONS, hexColor } from '../../shared/video/videoSettings.schema.js';

export const MAX_SCENES = 7;
/** Ritmo de lectura usado para estimar la duración del guion. */
export const DEFAULT_WORDS_PER_SECOND = 2.5;
/** HeyGen admite hasta 5.000 caracteres de guion por avatar. */
const MAX_SCRIPT_CHARS = 5000;

export const sceneRoleSchema = z.enum(['single', 'hook', 'development', 'cta']);
export type SceneRole = z.infer<typeof sceneRoleSchema>;

/**
 * Tipo de escena:
 * - avatar: el presentador habla a cámara.
 * - broll: imagen de apoyo a pantalla completa mientras la misma voz sigue hablando.
 */
export const sceneKindSchema = z.enum(['avatar', 'broll']);
export type SceneKind = z.infer<typeof sceneKindSchema>;

/**
 * Simple: solo el presentador. Dinámico: escenas compuestas por la app (presentador, imágenes de
 * apoyo y tarjetas). Agente: el Video Agent de HeyGen edita el video completo (gráficos, textos,
 * música y transiciones) a partir del guion, con revisión del storyboard antes de generar.
 */
export const videoStyleSchema = z.enum(['agent', 'dynamic', 'simple']);
export type VideoStyle = z.infer<typeof videoStyleSchema>;

const durationSchema = z.union(VIDEO_DURATIONS.map((value) => z.literal(value)));
const aspectRatioSchema = z.enum(VIDEO_ASPECT_RATIOS);
const wordsPerSecondSchema = z.number().min(1.5).max(4).default(DEFAULT_WORDS_PER_SECOND);
const ctaSchema = z.string().trim().min(2, 'Elige un llamado a la acción.').max(80);

/** Escena tal como la ve y edita el usuario. */
const sceneDraftSchema = z.object({
  role: sceneRoleSchema,
  kind: sceneKindSchema.default('avatar'),
  title: z.string().trim().min(1).max(120),
  script: z.string().trim().min(3, 'Una escena no tiene texto hablado.').max(MAX_SCRIPT_CHARS),
  subtitleNotes: z.string().trim().max(500).default(''),
  backgroundNote: z.string().trim().max(500).default(''),
  /** Escenas de apoyo: qué muestra la imagen. */
  visualPrompt: z.string().trim().max(1000).default(''),
  /** Escenas del presentador: gestos sugeridos (se usan si el avatar los admite). */
  gestures: z.string().trim().max(500).default(''),
  /** Texto que aparece en pantalla (gancho, palabra clave…). */
  onScreenText: z.string().trim().max(200).default(''),
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
  style: videoStyleSchema.default('simple'),
  /** Las tarjetas de marca restan tiempo al guion hablado. */
  brandCards: z
    .object({ intro: z.boolean(), outro: z.boolean() })
    .default({ intro: false, outro: false }),
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
        visualPrompt: z.string(),
        gestures: z.string(),
        onScreenText: z.string(),
      }),
    )
    .min(1)
    .max(MAX_SCENES),
  /** Partes de la temática, los lineamientos o los aprendizajes que se ignoraron por cumplimiento. */
  ignoredByCompliance: z.array(z.string()).max(6),
  /** Edición automática: párrafo de estilo visual (paleta, tipografías, movimiento, música). */
  styleParagraph: z.string(),
});
export type ScriptResponse = z.infer<typeof scriptResponseSchema>;

export const reviseScriptBody = z.object({
  textModel: z.string().min(1),
  topic: z.string().trim().min(3).max(1000),
  durationSeconds: durationSchema,
  contact: contactSchema,
  cta: ctaSchema,
  wordsPerSecond: wordsPerSecondSchema,
  brandCards: z
    .object({ intro: z.boolean(), outro: z.boolean() })
    .default({ intro: false, outro: false }),
  style: videoStyleSchema.default('simple'),
  styleParagraph: z.string().trim().max(3000).default(''),
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

/** Imagen de apoyo de una escena (b-roll). */
export const brollBody = z.object({
  imageModel: z.string().min(1).optional(),
  aspectRatio: aspectRatioSchema,
  topic: z.string().trim().min(3).max(1000),
  visualPrompt: z.string().trim().min(3, 'Describe qué debe mostrar la imagen.').max(1000),
});

/** Vista previa de las tarjetas de apertura y cierre con el logo. */
export const cardsPreviewBody = z.object({
  aspectRatio: aspectRatioSchema,
  cta: ctaSchema,
  contact: contactSchema,
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
  /** Presentador de la escena (vacío en las escenas de apoyo). */
  avatarId: z.string().trim().max(200).default(''),
  voiceId: z.string().trim().min(1, 'Elige una voz para cada escena.').max(200),
  background: sceneBackgroundSchema,
  /** Escenas de apoyo: imagen generada para la escena. */
  imageId: z.uuid().nullish(),
  /** Lo completa el servidor al generar, según los motores que admite el avatar. */
  engine: z.enum(VIDEO_ENGINES).nullish(),
  /** Lo completa el servidor si el avatar admite gestos. */
  motionPrompt: z.string().max(500).nullish(),
});
export type SceneSpec = z.infer<typeof sceneSpecSchema>;

const scenesSpecSchema = z
  .array(sceneSpecSchema)
  .min(1)
  .max(MAX_SCENES)
  .superRefine((scenes, ctx) => {
    scenes.forEach((scene, index) => {
      if (scene.kind === 'avatar' && !scene.avatarId) {
        ctx.addIssue({
          code: 'custom',
          path: [index, 'avatarId'],
          message: 'Elige un avatar para cada escena.',
        });
      }
    });
    if (!scenes.some((scene) => scene.kind === 'avatar')) {
      ctx.addIssue({
        code: 'custom',
        message: 'El video necesita al menos una escena con el presentador.',
      });
    }
  });

/** Tarjetas de marca con el logo (estilo dinámico). */
const brandCardsSchema = z.object({ intro: z.boolean(), outro: z.boolean() });

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
  scenes: scenesSpecSchema,
  style: videoStyleSchema.default('simple'),
  brandCards: brandCardsSchema.default({ intro: false, outro: false }),
  /** Alternar otras tomas (looks) del mismo presentador entre escenas, si las tiene. */
  varyLooks: z.boolean().default(false),
  /** Para la tarjeta de cierre. */
  cta: ctaSchema.optional(),
  contact: contactSchema.optional(),
  /** Edición automática: párrafo de estilo y kit de marca del proveedor. */
  styleParagraph: z.string().trim().max(3000).default(''),
  brandKitId: z.string().trim().max(200).nullish(),
  /** Las completa el servidor al generar: imágenes de las tarjetas de apertura y cierre. */
  cards: z
    .object({ introImageId: z.uuid().nullable(), outroImageId: z.uuid().nullable() })
    .nullish(),
});
export type VideoSpec = z.infer<typeof videoSpecSchema>;

export const generateBody = videoSpecSchema.extend({
  /** Nada se envía a HeyGen sin esta confirmación explícita del usuario. */
  confirmed: z.literal(true, { message: 'Confirma la generación del video.' }),
  /** Id del video del que se duplicó, si aplica. */
  duplicatedFrom: z.uuid().optional(),
});
