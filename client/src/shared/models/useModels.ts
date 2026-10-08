import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import type { ModelKind, ModelList } from '../api/types';

export function useModels(kind: ModelKind) {
  return useQuery({
    queryKey: ['models', kind],
    queryFn: ({ signal }) => api<ModelList>(`/models?kind=${kind}`, { signal }),
    staleTime: 10 * 60 * 1000,
  });
}
