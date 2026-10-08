import type { z } from 'zod';
import { badRequest } from './errors.js';

/** Valida datos externos (body, query, respuesta de un modelo) y lanza un 400 legible. */
export function validate<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  const where = issue?.path.length ? `${issue.path.join('.')}: ` : '';
  throw badRequest(`${where}${issue?.message ?? 'Datos inválidos.'}`);
}
