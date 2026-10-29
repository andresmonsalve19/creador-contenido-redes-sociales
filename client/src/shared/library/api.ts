import { api } from '../api/client';

export interface LibrarySlide {
  index: number;
  mimeType: string;
  updatedAt: string;
  url: string;
}

export interface LibraryItem {
  id: string;
  kind: 'single' | 'carousel' | 'edit' | 'import';
  source: 'app' | 'import' | 'claude';
  title: string;
  caption: string;
  aspectRatio: string | null;
  createdAt: string;
  updatedAt: string;
  slides: LibrarySlide[];
}

/** Lo mínimo de un reel del historial para mostrarlo en la biblioteca. */
export interface LibraryReel {
  id: string;
  createdAt: string;
  status: string;
  videoUrl: string | null;
  durationSeconds: number | null;
  spec: { title: string; caption: string; aspectRatio: string };
}

export interface AccountVideo {
  id: string;
  title: string | null;
  status: string;
  createdAt: number | null;
  durationSeconds: number | null;
  thumbnailUrl: string | null;
  videoUrl: string | null;
}

export const libraryKey = ['library'] as const;

export const fetchLibrary = (signal?: AbortSignal) =>
  api<{ items: LibraryItem[] }>('/library', { signal }).then((r) => r.items);

export const fetchReels = (signal?: AbortSignal) =>
  api<{ jobs: LibraryReel[] }>('/reels/jobs', { signal }).then((r) => r.jobs);

export const fetchAccountVideos = (signal?: AbortSignal) =>
  api<{ videos: AccountVideo[] }>('/video/account-videos', { signal }).then((r) => r.videos);

export const deleteLibraryItem = (id: string) => api<null>(`/library/${id}`, { method: 'DELETE' });

export function importImages(files: File[]) {
  const formData = new FormData();
  for (const file of files) formData.append('images', file);
  return api<{ items: LibraryItem[] }>('/library/import', { method: 'POST', formData });
}

/** Descarga todas las imágenes de una pieza en un ZIP. JSZip se carga solo cuando se necesita. */
export async function downloadItemZip(item: LibraryItem) {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  for (const slide of item.slides) {
    const blob = await (await fetch(slide.url)).blob();
    const extension = slide.mimeType.split('/')[1]?.replace('jpeg', 'jpg') ?? 'png';
    zip.file(`${String(slide.index + 1).padStart(2, '0')}.${extension}`, blob);
  }
  const url = URL.createObjectURL(await zip.generateAsync({ type: 'blob' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'publicacion.zip';
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
