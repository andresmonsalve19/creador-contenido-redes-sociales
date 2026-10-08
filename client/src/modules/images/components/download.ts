import type { InlineImage } from '../../../shared/api/types';
import { ROLE_LABEL, type SlideRole } from '../types';

const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

const slug = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export const toDataUrl = (image: InlineImage) => `data:${image.mimeType};base64,${image.data}`;

export const fileNameFor = (index: number, role: SlideRole, image: InlineImage) =>
  `${String(index + 1).padStart(2, '0')}-${slug(ROLE_LABEL[role])}.${EXTENSIONS[image.mimeType] ?? 'png'}`;

function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Descarga todas las imágenes en un ZIP. JSZip se carga solo cuando se necesita. */
export async function downloadZip(files: { name: string; image: InlineImage }[]) {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  for (const file of files) zip.file(file.name, file.image.data, { base64: true });
  saveBlob(await zip.generateAsync({ type: 'blob' }), 'publicacion.zip');
}
