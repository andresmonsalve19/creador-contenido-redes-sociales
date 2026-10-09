import { z } from 'zod';

/** Datos de contacto que se imprimen al final del texto de la publicación. Pueden quedar vacíos. */
export const contactSchema = z.object({
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
