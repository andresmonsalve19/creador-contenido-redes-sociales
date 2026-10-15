import { z } from 'zod';

/** Número con indicativo: dígitos, espacios, guiones, paréntesis y un "+" inicial; 7 a 15 dígitos. */
export const isPhone = (value: string) => {
  const digits = value.replace(/\D/g, '');
  return /^\+?[\d\s().-]+$/.test(value) && digits.length >= 7 && digits.length <= 15;
};

/**
 * Datos de contacto de una publicación. Un dato vacío no se incluye en ninguna parte: así el
 * usuario decide en cada publicación cuáles salen.
 */
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
  whatsapp: z
    .string()
    .trim()
    .max(30)
    .refine((value) => value === '' || isPhone(value), {
      message: 'Escribe el WhatsApp con indicativo, por ejemplo +57 300 000 0000.',
    })
    .default(''),
});
export type Contact = z.infer<typeof contactSchema>;
