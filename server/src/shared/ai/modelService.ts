import { MODEL_CATALOG, type ModelPricing } from '../config/modelCatalog.js';
import { badRequest } from '../http/errors.js';
import { getProvider } from './providers/index.js';
import type { AIProvider, ModelKind, ProviderModel } from './providers/types.js';

export interface ModelOption {
  id: string;
  label: string;
  kind: ModelKind;
  pricing: ModelPricing | null;
  note?: string;
}

export interface ModelList {
  models: ModelOption[];
  recommendedId: string | null;
}

const TTL_MS = 10 * 60 * 1000;
const cache = new WeakMap<AIProvider, { expires: number; models: Promise<ProviderModel[]> }>();
const catalogOrder = Object.keys(MODEL_CATALOG);

function availableModels(provider: AIProvider): Promise<ProviderModel[]> {
  const cached = cache.get(provider);
  if (cached && cached.expires > Date.now()) return cached.models;

  const models = provider.listModels();
  cache.set(provider, { expires: Date.now() + TTL_MS, models });
  models.catch(() => cache.delete(provider));
  return models;
}

function rank(id: string): number {
  const index = catalogOrder.indexOf(id);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

/** Quita ids repetidos y nombres repetidos (la API publica alias y versiones del mismo modelo). */
function dedupe(models: ModelOption[]): ModelOption[] {
  const ids = new Set<string>();
  const labels = new Set<string>();
  return models.filter((model) => {
    const label = model.label.trim().toLowerCase();
    if (ids.has(model.id) || labels.has(label)) return false;
    ids.add(model.id);
    labels.add(label);
    return true;
  });
}

export async function listModels(kind: ModelKind): Promise<ModelList> {
  const available = (await availableModels(getProvider())).filter((model) => model.kind === kind);

  const toOption = (model: ProviderModel): ModelOption => {
    const entry = MODEL_CATALOG[model.id];
    return {
      id: model.id,
      kind,
      label: entry?.label ?? model.displayName,
      pricing: entry?.pricing ?? null,
      note: entry?.note,
    };
  };

  // Solo se ofrecen los modelos con precio conocido (los del catálogo). Los alias y versiones
  // que no están en él se omiten; si ninguno coincide (p. ej. Google renombró los modelos),
  // se muestran los disponibles sin repetir para no dejar la app sin opciones.
  const known = available.filter((model) => MODEL_CATALOG[model.id]);
  const models = dedupe((known.length > 0 ? known : available).map(toOption)).sort(
    (a, b) => rank(a.id) - rank(b.id) || a.label.localeCompare(b.label),
  );

  const recommended =
    models.find((model) => MODEL_CATALOG[model.id]?.recommended) ??
    models.find((model) => model.pricing) ??
    models[0];

  return { models, recommendedId: recommended?.id ?? null };
}

/** Comprueba que el modelo exista y sea del tipo esperado antes de usarlo. */
export async function assertModel(id: string, kind: ModelKind): Promise<void> {
  const { models } = await listModels(kind);
  if (!models.some((model) => model.id === id)) {
    throw badRequest(
      `El modelo "${id}" no está disponible como modelo de ${kind === 'text' ? 'texto' : 'imagen'}.`,
    );
  }
}
