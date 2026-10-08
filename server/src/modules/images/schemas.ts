import { z } from 'zod';
import { ASPECT_RATIOS } from '../../shared/ai/providers/types.js';

export const MAX_SLIDES = 10;

export const slideRoleSchema = z.enum(['single', 'hook', 'development', 'cta']);
export type SlideRole = z.infer<typeof slideRoleSchema>;

const aspectRatioSchema = z.enum(ASPECT_RATIOS);

/** Datos de contacto que se imprimen al final del texto de la publicación. Pueden quedar vacíos. */
const contactSchema = z.object({
  email: z
    .string()
    .trim()
    .max(120)
    .refine((value) => value === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), {
      message: 'Escribe un correo válido.',
    }),
  website: z
    .string()
    .trim()
    .max(200)
    .refine((value) => !/\s/.test(value), { message: 'El sitio web no puede tener espacios.' }),
});
export type Contact = z.infer<typeof contactSchema>;

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
