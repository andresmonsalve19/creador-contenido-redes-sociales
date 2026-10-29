import { readSecret } from '../config/env.js';
import { notReady } from '../http/errors.js';
import { HeyGenProvider } from './heygen/client.js';
import type { BrandKit, VideoAvatar, VideoProvider, VideoProviderId, VideoVoice } from './types.js';

const factories: Record<
  VideoProviderId,
  { envKey: string; create: (apiKey: string) => VideoProvider }
> = {
  heygen: { envKey: 'HEYGEN_API_KEY', create: (apiKey) => new HeyGenProvider(apiKey) },
};

const cache = new Map<VideoProviderId, { apiKey: string; provider: VideoProvider }>();

export function createVideoProvider(id: VideoProviderId, apiKey: string): VideoProvider {
  return factories[id].create(apiKey);
}

export function isVideoConfigured(id: VideoProviderId = 'heygen'): boolean {
  return Boolean(readSecret(factories[id].envKey));
}

/** Devuelve el proveedor de video configurado en .env; se recrea si la key cambia. */
export function getVideoProvider(id: VideoProviderId = 'heygen'): VideoProvider {
  const { envKey } = factories[id];
  const apiKey = readSecret(envKey);
  if (!apiKey) throw notReady('Configura HeyGen para usar este módulo.');

  const cached = cache.get(id);
  if (cached?.apiKey === apiKey) return cached.provider;

  const provider = createVideoProvider(id, apiKey);
  cache.set(id, { apiKey, provider });
  listCache.clear();
  return provider;
}

// Los listados cambian poco: se guardan unos minutos para no consultar la API en cada paso.
const LIST_TTL_MS = 5 * 60 * 1000;
const listCache = new Map<string, { expires: number; value: Promise<unknown> }>();

function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = listCache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value as Promise<T>;
  const value = load();
  listCache.set(key, { expires: Date.now() + LIST_TTL_MS, value });
  value.catch(() => listCache.delete(key));
  return value;
}

export function listAvatars(): Promise<VideoAvatar[]> {
  const provider = getVideoProvider();
  return cached(`${provider.id}:avatars`, () => provider.listAvatars());
}

/** Olvida la lista de avatares guardada (p. ej. tras crear un gemelo digital). */
export function forgetAvatars(): void {
  for (const key of listCache.keys()) if (key.endsWith(':avatars')) listCache.delete(key);
}

/** Olvida los listados guardados (p. ej. tras crear un kit de marca). */
export function forgetBrandKits(): void {
  for (const key of listCache.keys()) if (key.endsWith(':brand-kits')) listCache.delete(key);
}

export function listBrandKits(): Promise<BrandKit[]> {
  const provider = getVideoProvider();
  return cached(`${provider.id}:brand-kits`, () => provider.listBrandKits());
}

export function listVoices(language?: string): Promise<VideoVoice[]> {
  const provider = getVideoProvider();
  return cached(`${provider.id}:voices:${language ?? '*'}`, () => provider.listVoices(language));
}

export type * from './types.js';
