import { useMemo } from 'react';
import { errorMessage } from '../api/client';
import type { ModelKind } from '../api/types';
import { Alert } from '../ui/Alert';
import { ChoiceGroup, type Choice } from '../ui/ChoiceGroup';
import { Spinner } from '../ui/Spinner';
import { formatPricing } from './pricing';
import { useModels } from './useModels';

interface ModelSelectorProps {
  kind: ModelKind;
  legend: string;
  /** null = usar el recomendado. */
  value: string | null;
  onChange: (id: string) => void;
}

/** Lista los modelos del proveedor con su precio y marca el recomendado. */
export function ModelSelector({ kind, legend, value, onChange }: ModelSelectorProps) {
  const query = useModels(kind);

  const options = useMemo<Choice<string>[]>(
    () =>
      (query.data?.models ?? []).map((model) => ({
        value: model.id,
        label: model.label,
        description: model.note,
        aside: formatPricing(model.pricing),
        badge: model.id === query.data?.recommendedId ? 'Recomendado' : undefined,
      })),
    [query.data],
  );

  if (query.isPending)
    return <Spinner label={`Cargando modelos de ${kind === 'text' ? 'texto' : 'imagen'}`} />;
  if (query.isError) return <Alert>{errorMessage(query.error)}</Alert>;
  if (options.length === 0) {
    return (
      <Alert>
        Tu API key no tiene modelos de {kind === 'text' ? 'texto' : 'imagen'} disponibles.
      </Alert>
    );
  }

  return (
    <ChoiceGroup
      legend={legend}
      layout="list"
      options={options}
      value={value ?? query.data.recommendedId}
      onChange={onChange}
    />
  );
}
