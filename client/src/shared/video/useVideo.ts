import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { useSetupStatus } from '../hooks/useSetupStatus';
import type { BrandKit, VideoAvatar, VideoSettingsResponse, VideoVoice } from './types';

export const videoKeys = {
  settings: ['video', 'settings'] as const,
  avatars: ['video', 'avatars'] as const,
  voices: (language: string) => ['video', 'voices', language] as const,
};

/** HeyGen es opcional: sin su key, lo relacionado con video se deshabilita. */
export function useVideoConfigured(): boolean | null {
  const status = useSetupStatus();
  if (!status.data) return null;
  return status.data.credentials.some((c) => c.key === 'HEYGEN_API_KEY' && c.configured);
}

export function useVideoSettings() {
  return useQuery({
    queryKey: videoKeys.settings,
    queryFn: ({ signal }) => api<VideoSettingsResponse>('/video/settings', { signal }),
    staleTime: Infinity,
  });
}

export function useAvatars(enabled = true) {
  return useQuery({
    queryKey: videoKeys.avatars,
    queryFn: ({ signal }) =>
      api<{ avatars: VideoAvatar[] }>('/video/avatars', { signal }).then((r) => r.avatars),
    staleTime: 5 * 60 * 1000,
    enabled,
  });
}

export function useBrandKits(enabled = true) {
  return useQuery({
    queryKey: ['video', 'brand-kits'],
    queryFn: ({ signal }) =>
      api<{ brandKits: BrandKit[] }>('/video/brand-kits', { signal }).then((r) => r.brandKits),
    staleTime: 5 * 60 * 1000,
    enabled,
  });
}

export function useVoices(language: string, enabled = true) {
  return useQuery({
    queryKey: videoKeys.voices(language),
    queryFn: ({ signal }) =>
      api<{ voices: VideoVoice[] }>(`/video/voices?language=${encodeURIComponent(language)}`, {
        signal,
      }).then((r) => r.voices),
    staleTime: 5 * 60 * 1000,
    enabled,
  });
}
