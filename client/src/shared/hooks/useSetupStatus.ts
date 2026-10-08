import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import type { BrandContextResponse, SetupStatus } from '../api/types';

export const setupKeys = {
  status: ['setup', 'status'] as const,
  context: ['setup', 'context'] as const,
};

export function useSetupStatus() {
  return useQuery({
    queryKey: setupKeys.status,
    queryFn: ({ signal }) => api<SetupStatus>('/setup/status', { signal }),
    staleTime: Infinity,
  });
}

export function useBrandContext() {
  return useQuery({
    queryKey: setupKeys.context,
    queryFn: ({ signal }) => api<BrandContextResponse>('/context', { signal }),
    staleTime: Infinity,
  });
}
