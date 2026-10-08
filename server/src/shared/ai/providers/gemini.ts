import { ApiError, GoogleGenAI, type Part } from '@google/genai';
import { AppError } from '../../http/errors.js';
import type {
  AIProvider,
  ImageRequest,
  InlineImage,
  ModelKind,
  ProviderModel,
  TextRequest,
} from './types.js';

// Modelos que no sirven para este flujo (embeddings, audio, tiempo real, video…).
const EXCLUDED =
  /embedding|tts|live|audio|robotics|computer-use|veo|lyria|aqa|gemma|learnlm|thinking-exp/i;
const IMAGE_MODEL = /image|nano-banana/i;

function classify(id: string): ModelKind | null {
  if (!id.startsWith('gemini') || EXCLUDED.test(id)) return null;
  return IMAGE_MODEL.test(id) ? 'image' : 'text';
}

function toAppError(error: unknown, context: string): never {
  if (error instanceof AppError) throw error;
  if (error instanceof ApiError) {
    if (error.status === 400 && /api key/i.test(error.message)) {
      throw new AppError(401, 'La API key de Gemini no es válida.', 'INVALID_KEY');
    }
    if (error.status === 401 || error.status === 403) {
      throw new AppError(
        401,
        'La API key de Gemini no tiene permisos para este modelo.',
        'INVALID_KEY',
      );
    }
    if (error.status === 404) {
      throw new AppError(
        404,
        `El modelo no está disponible para esta API key (${context}).`,
        'MODEL_NOT_FOUND',
      );
    }
    if (error.status === 429) {
      throw new AppError(
        429,
        'Se alcanzó el límite de uso de Gemini. Espera un momento o revisa tu cuota.',
        'RATE_LIMIT',
      );
    }
  }
  const detail = error instanceof Error ? error.message : String(error);
  throw new AppError(502, `Gemini no pudo completar ${context}: ${detail}`, 'PROVIDER_ERROR');
}

export class GeminiProvider implements AIProvider {
  readonly id = 'gemini' as const;
  private readonly client: GoogleGenAI;

  constructor(apiKey: string) {
    this.client = new GoogleGenAI({ apiKey });
  }

  /** Hace una consulta mínima para confirmar que la key es válida. */
  async validateKey(): Promise<void> {
    try {
      await this.client.models.list({ config: { pageSize: 1 } });
    } catch (error) {
      toAppError(error, 'la validación de la API key');
    }
  }

  async listModels(): Promise<ProviderModel[]> {
    try {
      const models: ProviderModel[] = [];
      const pager = await this.client.models.list({ config: { pageSize: 100 } });
      for await (const model of pager) {
        const id = model.name?.replace(/^models\//, '');
        if (!id || !model.supportedActions?.includes('generateContent')) continue;
        const kind = classify(id);
        if (!kind) continue;
        models.push({
          id,
          kind,
          displayName: model.displayName ?? id,
          description: model.description,
        });
      }
      return models;
    } catch (error) {
      toAppError(error, 'el listado de modelos');
    }
  }

  async generateText({
    model,
    system,
    prompt,
    jsonSchema,
    temperature,
  }: TextRequest): Promise<string> {
    try {
      const response = await this.client.models.generateContent({
        model,
        contents: prompt,
        config: {
          systemInstruction: system,
          temperature,
          ...(jsonSchema && {
            responseMimeType: 'application/json',
            responseJsonSchema: jsonSchema,
          }),
        },
      });
      const text = response.text?.trim();
      if (!text) throw new AppError(502, 'El modelo de texto devolvió una respuesta vacía.');
      return text;
    } catch (error) {
      toAppError(error, 'la generación de texto');
    }
  }

  async generateImage({
    model,
    prompt,
    aspectRatio,
    referenceImages = [],
  }: ImageRequest): Promise<InlineImage> {
    const parts: Part[] = [
      ...referenceImages.map((image) => ({
        inlineData: { mimeType: image.mimeType, data: image.data },
      })),
      { text: prompt },
    ];

    try {
      const response = await this.client.models.generateContent({
        model,
        contents: [{ role: 'user', parts }],
        config: {
          responseModalities: ['IMAGE', 'TEXT'],
          imageConfig: { aspectRatio },
        },
      });

      const candidate = response.candidates?.[0];
      const image = candidate?.content?.parts?.find((part) => part.inlineData?.data)?.inlineData;
      if (!image?.data) {
        const reason =
          candidate?.finishReason ?? response.promptFeedback?.blockReason ?? 'sin imagen';
        throw new AppError(
          502,
          `El modelo no devolvió una imagen (${reason}). Ajusta el prompt e inténtalo de nuevo.`,
        );
      }
      return { mimeType: image.mimeType ?? 'image/png', data: image.data };
    } catch (error) {
      toAppError(error, 'la generación de la imagen');
    }
  }
}
