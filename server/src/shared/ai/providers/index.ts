import { readSecret } from '../../config/env.js';
import { notReady } from '../../http/errors.js';
import { GeminiProvider } from './gemini.js';
import type { AIProvider, ProviderId } from './types.js';

const factories: Record<ProviderId, { envKey: string; create: (apiKey: string) => AIProvider }> = {
  gemini: { envKey: 'GEMINI_API_KEY', create: (apiKey) => new GeminiProvider(apiKey) },
};

const cache = new Map<ProviderId, { apiKey: string; provider: AIProvider }>();

export function createProvider(id: ProviderId, apiKey: string): AIProvider {
  return factories[id].create(apiKey);
}

/** Devuelve el proveedor configurado en .env; se recrea si la key cambia. */
export function getProvider(id: ProviderId = 'gemini'): AIProvider {
  const { envKey } = factories[id];
  const apiKey = readSecret(envKey);
  if (!apiKey) throw notReady(`Falta configurar ${envKey}.`);

  const cached = cache.get(id);
  if (cached?.apiKey === apiKey) return cached.provider;

  const provider = createProvider(id, apiKey);
  cache.set(id, { apiKey, provider });
  return provider;
}

export type * from './types.js';
