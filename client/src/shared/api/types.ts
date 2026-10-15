// Contratos de las rutas comunes del backend (server/src/shared).

export interface CredentialStatus {
  key: string;
  label: string;
  description: string;
  helpUrl: string;
  /** Opcional: la app funciona sin ella (p. ej. HeyGen solo habilita los reels). */
  optional: boolean;
  configured: boolean;
}

export interface SetupStatus {
  credentials: CredentialStatus[];
  context: { company: boolean; design: boolean; logo: boolean; videoGuidelines: boolean };
  ready: boolean;
}

interface StoredFile {
  fileName: string;
  updatedAt: string;
}

export interface BrandContextResponse {
  complete: boolean;
  company: (StoredFile & { content: string }) | null;
  design: (StoredFile & { content: string }) | null;
  videoGuidelines: (StoredFile & { content: string }) | null;
  logo: (StoredFile & { mimeType: string; url: string }) | null;
}

export type ModelKind = 'text' | 'image';

export type ModelPricing =
  { unit: 'tokens'; inputPer1M: number; outputPer1M: number } | { unit: 'image'; perImage: number };

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

export interface InlineImage {
  mimeType: string;
  data: string;
}
