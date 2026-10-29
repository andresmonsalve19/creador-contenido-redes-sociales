import { api } from '../../shared/api/client';
import type { InlineImage } from '../../shared/api/types';

export type EditAspectRatio = 'original' | '1:1' | '4:5' | '3:4' | '9:16' | '16:9';

export interface EditRequest {
  imageModel?: string;
  image: { type: 'upload'; image: InlineImage } | { type: 'library'; id: string; index: number };
  instructions: string;
  applyBrand: boolean;
  aspectRatio: EditAspectRatio;
  title: string;
  libraryId?: string;
}

export const requestEdit = (body: EditRequest) =>
  api<{ image: InlineImage; libraryId: string; aspectRatio: string }>('/images/edit', {
    method: 'POST',
    json: body,
  });

/** Lee un archivo del navegador como imagen en base64. */
export function readImageFile(file: File): Promise<InlineImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      resolve({ mimeType: file.type, data: result.slice(result.indexOf(',') + 1) });
    };
    reader.onerror = () => reject(new Error('No se pudo leer la imagen.'));
    reader.readAsDataURL(file);
  });
}
