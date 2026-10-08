import dotenv from 'dotenv';
import { z } from 'zod';
import { ENV_FILE } from './paths.js';

dotenv.config({ path: ENV_FILE, quiet: true });

const serverEnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3001),
  HOST: z.string().default('127.0.0.1'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export const serverEnv = serverEnvSchema.parse(process.env);

/** Lee una credencial en el momento de usarla, para reflejar cambios hechos desde el setup. */
export function readSecret(key: string): string | undefined {
  const value = process.env[key]?.trim();
  return value ? value : undefined;
}
