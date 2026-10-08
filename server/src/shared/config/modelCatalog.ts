import type { ModelKind } from '../ai/providers/types.js';

export type ModelPricing =
  { unit: 'tokens'; inputPer1M: number; outputPer1M: number } | { unit: 'image'; perImage: number };

export interface CatalogEntry {
  label: string;
  kind: ModelKind;
  pricing: ModelPricing;
  /** Mejor relación calidad/precio para su tipo: se preselecciona en la interfaz. */
  recommended?: boolean;
  note?: string;
}

/**
 * Precios en USD del nivel de pago de la API de Gemini (contextos ≤ 200k tokens; imágenes a 1K).
 * Fuente: https://ai.google.dev/gemini-api/docs/pricing — revisada en octubre de 2026.
 * Google publica cambios de precio a partir del 1 de enero de 2027: actualiza esta tabla cuando ocurra.
 *
 * Solo se muestran los modelos que la API key tenga disponibles. Si aparece un modelo que no
 * está aquí, se lista igual pero sin precio.
 */
export const MODEL_CATALOG: Record<string, CatalogEntry> = {
  // Texto
  'gemini-3.8-flash': {
    label: 'Gemini 3.8 Flash',
    kind: 'text',
    pricing: { unit: 'tokens', inputPer1M: 0.75, outputPer1M: 3.75 },
    recommended: true,
    note: 'Rápido y de alta calidad. El más equilibrado para escribir prompts.',
  },
  'gemini-3.7-flash': {
    label: 'Gemini 3.7 Flash',
    kind: 'text',
    pricing: { unit: 'tokens', inputPer1M: 0.75, outputPer1M: 3.75 },
  },
  'gemini-3.5-flash-lite': {
    label: 'Gemini 3.5 Flash-Lite',
    kind: 'text',
    pricing: { unit: 'tokens', inputPer1M: 0.3, outputPer1M: 2.5 },
    note: 'Más económico, con algo menos de creatividad.',
  },
  'gemini-3.1-flash-lite': {
    label: 'Gemini 3.1 Flash-Lite',
    kind: 'text',
    pricing: { unit: 'tokens', inputPer1M: 0.25, outputPer1M: 1.5 },
  },
  'gemini-3.1-pro-preview': {
    label: 'Gemini 3.1 Pro (preview)',
    kind: 'text',
    pricing: { unit: 'tokens', inputPer1M: 2, outputPer1M: 12 },
    note: 'Máxima calidad de razonamiento, el más costoso.',
  },
  'gemini-2.5-pro': {
    label: 'Gemini 2.5 Pro',
    kind: 'text',
    pricing: { unit: 'tokens', inputPer1M: 1.25, outputPer1M: 10 },
  },
  'gemini-2.5-flash': {
    label: 'Gemini 2.5 Flash',
    kind: 'text',
    pricing: { unit: 'tokens', inputPer1M: 0.3, outputPer1M: 2.5 },
  },
  'gemini-2.5-flash-lite': {
    label: 'Gemini 2.5 Flash-Lite',
    kind: 'text',
    pricing: { unit: 'tokens', inputPer1M: 0.1, outputPer1M: 0.4 },
  },

  // Imagen
  'gemini-nano-banana-2.1': {
    label: 'Nano Banana 2.1',
    kind: 'image',
    pricing: { unit: 'image', perImage: 0.0336 },
    recommended: true,
    note: 'Buena fidelidad al logo y al texto, al menor precio.',
  },
  'gemini-3.1-flash-lite-image': {
    label: 'Nano Banana 2 Lite',
    kind: 'image',
    pricing: { unit: 'image', perImage: 0.0336 },
  },
  'gemini-3.1-flash-image': {
    label: 'Nano Banana 2',
    kind: 'image',
    pricing: { unit: 'image', perImage: 0.067 },
  },
  'gemini-3-pro-image': {
    label: 'Nano Banana Pro',
    kind: 'image',
    pricing: { unit: 'image', perImage: 0.134 },
    note: 'La mejor calidad y tipografía, el más costoso.',
  },
};
