import type { ModelPricing } from '../api/types';

const number = new Intl.NumberFormat('es-CO', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

/** "US$" evita confundir el precio con pesos u otras monedas que usan "$". */
export const formatUsd = (value: number) => `US$ ${number.format(value)}`;

export function formatPricing(pricing: ModelPricing | null): string {
  if (!pricing) return 'Precio no disponible';
  if (pricing.unit === 'image') return `${formatUsd(pricing.perImage)} por imagen`;
  return `${formatUsd(pricing.inputPer1M)} / ${formatUsd(pricing.outputPer1M)} por 1M tokens (entrada / salida)`;
}
