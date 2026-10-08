export type ProviderId = 'gemini';
export type ModelKind = 'text' | 'image';

export interface ProviderModel {
  id: string;
  displayName: string;
  kind: ModelKind;
  description?: string;
}

export interface InlineImage {
  mimeType: string;
  /** Contenido en base64. */
  data: string;
}

export interface TextRequest {
  model: string;
  system?: string;
  prompt: string;
  /** JSON Schema que debe cumplir la respuesta; si se omite, se devuelve texto libre. */
  jsonSchema?: object;
  temperature?: number;
}

export const ASPECT_RATIOS = ['1:1', '4:5', '3:4', '9:16', '16:9'] as const;
export type AspectRatio = (typeof ASPECT_RATIOS)[number];

export interface ImageRequest {
  model: string;
  prompt: string;
  aspectRatio: AspectRatio;
  /** Imágenes de referencia (logo, estilo de la primera imagen del carrusel…). */
  referenceImages?: InlineImage[];
}

/** Contrato que debe cumplir cada proveedor de IA. */
export interface AIProvider {
  readonly id: ProviderId;
  validateKey(): Promise<void>;
  listModels(): Promise<ProviderModel[]>;
  generateText(request: TextRequest): Promise<string>;
  generateImage(request: ImageRequest): Promise<InlineImage>;
}
