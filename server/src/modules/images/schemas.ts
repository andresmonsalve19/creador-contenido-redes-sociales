import { z } from 'zod';
import { ASPECT_RATIOS } from '../../shared/ai/providers/types.js';
import { contactSchema } from '../../shared/publishing/contact.js';

export type { Contact } from '../../shared/publishing/contact.js';

export const MAX_SLIDES = 10;

export const slideRoleSchema = z.enum(['single', 'hook', 'development', 'cta']);
export type SlideRole = z.infer<typeof slideRoleSchema>;

const aspectRatioSchema = z.enum(ASPECT_RATIOS);

export const promptsBody = z
  .object({
    textModel: z.string().min(1),
    format: z.enum(['single', 'carousel']),
    slideCount: z.number().int().min(1).max(MAX_SLIDES),
    topic: z.string().trim().min(3, 'Escribe una temática más descriptiva.').max(1000),
    aspectRatio: aspectRatioSchema,
    contact: contactSchema,
    /** Frase exacta del llamado a la acción, elegida en el paso 2 (p. ej. "Contáctanos"). */
    cta: z.string().trim().min(2, 'Elige un llamado a la acción.').max(80),
  })
  .refine((body) => (body.format === 'single' ? body.slideCount === 1 : body.slideCount >= 2), {
    message: 'Un carrusel necesita al menos 2 imágenes y una imagen única exactamente 1.',
    path: ['slideCount'],
  });
export type PromptsBody = z.infer<typeof promptsBody>;

/** Lo que debe devolver el modelo de texto. */
export const promptsResponseSchema = z.object({
  concept: z.string().min(1),
  /** Cuerpo del texto de la publicación, sin contacto ni hashtags (se agregan en el servidor). */
  captionBody: z.string().min(10),
  hashtags: z.array(z.string().min(2)).min(1).max(12),
  slides: z
    .array(
      z.object({
        title: z.string().min(1),
        prompt: z.string().min(20),
      }),
    )
    .min(1)
    .max(MAX_SLIDES),
});
export type PromptsResponse = z.infer<typeof promptsResponseSchema>;

const base64Image = z.object({
  mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp']),
  data: z.string().min(1).max(15_000_000),
});

export const generateBody = z.object({
  imageModel: z.string().min(1),
  aspectRatio: aspectRatioSchema,
  role: slideRoleSchema,
  prompt: z.string().trim().min(20, 'El prompt es demasiado corto.').max(8000),
  /** Primera imagen del carrusel, para mantener la coherencia visual del resto. */
  styleReference: base64Image.optional(),
  /** Para ajustar una imagen ya generada: la versión actual y los cambios que pide el usuario. */
  previousImage: base64Image.optional(),
  feedback: z.string().trim().min(3).max(1000).optional(),
  /** Dónde guardarla en la biblioteca: cada imagen se guarda en cuanto se genera. */
  library: z
    .object({
      publicationId: z.uuid(),
      index: z
        .number()
        .int()
        .min(0)
        .max(MAX_SLIDES - 1),
      format: z.enum(['single', 'carousel']),
      title: z.string().trim().max(200),
      caption: z.string().max(5000),
      source: z.enum(['app', 'claude']).default('app'),
    })
    .optional(),
});
export type GenerateBody = z.infer<typeof generateBody>;

/** Pide reescribir el prompt de una imagen aplicando los comentarios del usuario. */
export const reviseBody = z.object({
  textModel: z.string().min(1),
  role: slideRoleSchema,
  prompt: z.string().trim().min(20).max(8000),
  feedback: z.string().trim().min(3, 'Escribe un comentario un poco más detallado.').max(1000),
});
export type ReviseBody = z.infer<typeof reviseBody>;

export const reviseResponseSchema = z.object({ prompt: z.string().min(20) });

/** Editar una imagen propia (subida o de la biblioteca) con instrucciones. */
export const editBody = z.object({
  /** Si se omite se usa el modelo de imagen recomendado. */
  imageModel: z.string().min(1).optional(),
  image: z.discriminatedUnion('type', [
    z.object({ type: z.literal('upload'), image: base64Image }),
    z.object({
      type: z.literal('library'),
      id: z.uuid(),
      index: z
        .number()
        .int()
        .min(0)
        .max(MAX_SLIDES - 1),
    }),
  ]),
  instructions: z.string().trim().min(3, 'Escribe qué quieres cambiar.').max(2000),
  /** Aplica el logo, la paleta y la identidad de la marca a lo que se agregue. */
  applyBrand: z.boolean(),
  /** "original" mantiene la proporción de la imagen subida (la más cercana admitida). */
  aspectRatio: z.union([aspectRatioSchema, z.literal('original')]),
  title: z.string().trim().max(200).default(''),
  /** Para seguir editando la misma pieza: la versión nueva reemplaza a la anterior. */
  libraryId: z.uuid().optional(),
  source: z.enum(['app', 'claude']).default('app'),
});
export type EditBody = z.infer<typeof editBody>;
