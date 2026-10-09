import { promises as fs } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { DATA_DIR } from '../config/paths.js';
import {
  DEFAULT_VIDEO_SETTINGS,
  videoSettingsSchema,
  type VideoSettings,
} from './videoSettings.schema.js';

const BRAND_DIR = path.join(DATA_DIR, 'brand');
const SETTINGS_FILE = path.join(BRAND_DIR, 'video.json');
const BACKGROUND_META_FILE = path.join(BRAND_DIR, 'video-background.json');

export const BACKGROUND_TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg' } as const;
export type BackgroundMimeType = keyof typeof BACKGROUND_TYPES;

const backgroundMetaSchema = z.object({
  fileName: z.string(),
  mimeType: z.enum(Object.keys(BACKGROUND_TYPES) as [BackgroundMimeType]),
  updatedAt: z.string(),
});
export type BackgroundMeta = z.infer<typeof backgroundMetaSchema>;

const backgroundFile = (mimeType: BackgroundMimeType) =>
  path.join(BRAND_DIR, `video-background.${BACKGROUND_TYPES[mimeType]}`);

/** Configuración de video de la marca; valores por defecto si aún no se ha guardado. */
export async function readVideoSettings(): Promise<VideoSettings> {
  try {
    const raw: unknown = JSON.parse(await fs.readFile(SETTINGS_FILE, 'utf8'));
    const parsed = videoSettingsSchema.safeParse({
      ...DEFAULT_VIDEO_SETTINGS,
      ...(raw as object),
    });
    return parsed.success ? parsed.data : DEFAULT_VIDEO_SETTINGS;
  } catch {
    return DEFAULT_VIDEO_SETTINGS;
  }
}

export async function saveVideoSettings(settings: VideoSettings): Promise<VideoSettings> {
  await fs.mkdir(BRAND_DIR, { recursive: true });
  await fs.writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8');
  return settings;
}

export async function readBackgroundMeta(): Promise<BackgroundMeta | null> {
  try {
    return backgroundMetaSchema.parse(JSON.parse(await fs.readFile(BACKGROUND_META_FILE, 'utf8')));
  } catch {
    return null;
  }
}

export async function readBackgroundImage(): Promise<{
  mimeType: BackgroundMimeType;
  data: Buffer;
} | null> {
  const meta = await readBackgroundMeta();
  if (!meta) return null;
  try {
    return { mimeType: meta.mimeType, data: await fs.readFile(backgroundFile(meta.mimeType)) };
  } catch {
    return null;
  }
}

export async function saveBackgroundImage(
  fileName: string,
  mimeType: BackgroundMimeType,
  data: Buffer,
): Promise<BackgroundMeta> {
  await fs.mkdir(BRAND_DIR, { recursive: true });
  const previous = await readBackgroundMeta();
  if (previous) await fs.rm(backgroundFile(previous.mimeType), { force: true });
  await fs.writeFile(backgroundFile(mimeType), data);
  const meta: BackgroundMeta = { fileName, mimeType, updatedAt: new Date().toISOString() };
  await fs.writeFile(BACKGROUND_META_FILE, JSON.stringify(meta, null, 2), 'utf8');
  return meta;
}
