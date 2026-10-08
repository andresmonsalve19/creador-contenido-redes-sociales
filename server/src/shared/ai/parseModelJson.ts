import type { z } from 'zod';
import { AppError } from '../http/errors.js';

/** Interpreta la respuesta JSON de un modelo; un formato inesperado es un fallo del proveedor, no del usuario. */
export function parseModelJson<T extends z.ZodType>(schema: T, raw: string): z.infer<T> {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new AppError(
      502,
      'El modelo de texto respondió en un formato inesperado. Inténtalo de nuevo.',
    );
  }
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new AppError(
      502,
      'La respuesta del modelo de texto está incompleta. Inténtalo de nuevo.',
    );
  }
  return result.data;
}
