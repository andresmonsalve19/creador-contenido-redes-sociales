import { promises as fs } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { InlineImage } from '../ai/providers/types.js';
import { DATA_DIR } from '../config/paths.js';
import { notReady } from '../http/errors.js';

const BRAND_DIR = path.join(DATA_DIR, 'brand');
const META_FILE = path.join(BRAND_DIR, 'meta.json');
const COMPANY_FILE = path.join(BRAND_DIR, 'company.md');
const DESIGN_FILE = path.join(BRAND_DIR, 'design.md');

export const LOGO_TYPES = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
} as const;
export type LogoMimeType = keyof typeof LOGO_TYPES;

const fileMetaSchema = z.object({ fileName: z.string(), updatedAt: z.string() });
const metaSchema = z.object({
  company: fileMetaSchema.optional(),
  design: fileMetaSchema.optional(),
  logo: fileMetaSchema
    .extend({ mimeType: z.enum(Object.keys(LOGO_TYPES) as [LogoMimeType]) })
    .optional(),
});
export type BrandMeta = z.infer<typeof metaSchema>;

export interface BrandUpload {
  company?: { fileName: string; content: string };
  design?: { fileName: string; content: string };
  logo?: { fileName: string; mimeType: LogoMimeType; data: Buffer };
}

export interface BrandContext {
  company: string;
  design: string;
  logo: InlineImage;
}

const logoFile = (mimeType: LogoMimeType) => path.join(BRAND_DIR, `logo.${LOGO_TYPES[mimeType]}`);

export async function readMeta(): Promise<BrandMeta> {
  try {
    return metaSchema.parse(JSON.parse(await fs.readFile(META_FILE, 'utf8')));
  } catch {
    return {};
  }
}

export function isComplete(meta: BrandMeta): boolean {
  return Boolean(meta.company && meta.design && meta.logo);
}

export async function saveBrand(upload: BrandUpload): Promise<BrandMeta> {
  await fs.mkdir(BRAND_DIR, { recursive: true });
  const meta = await readMeta();
  const updatedAt = new Date().toISOString();

  if (upload.company) {
    await fs.writeFile(COMPANY_FILE, upload.company.content, 'utf8');
    meta.company = { fileName: upload.company.fileName, updatedAt };
  }
  if (upload.design) {
    await fs.writeFile(DESIGN_FILE, upload.design.content, 'utf8');
    meta.design = { fileName: upload.design.fileName, updatedAt };
  }
  if (upload.logo) {
    if (meta.logo) await fs.rm(logoFile(meta.logo.mimeType), { force: true });
    await fs.writeFile(logoFile(upload.logo.mimeType), upload.logo.data);
    meta.logo = { fileName: upload.logo.fileName, mimeType: upload.logo.mimeType, updatedAt };
  }

  await fs.writeFile(META_FILE, JSON.stringify(meta, null, 2), 'utf8');
  return meta;
}

export async function readMarkdown(kind: 'company' | 'design'): Promise<string | null> {
  try {
    return await fs.readFile(kind === 'company' ? COMPANY_FILE : DESIGN_FILE, 'utf8');
  } catch {
    return null;
  }
}

export async function readLogo(): Promise<{ mimeType: LogoMimeType; data: Buffer } | null> {
  const { logo } = await readMeta();
  if (!logo) return null;
  try {
    return { mimeType: logo.mimeType, data: await fs.readFile(logoFile(logo.mimeType)) };
  } catch {
    return null;
  }
}

/** Contexto completo de la marca para los prompts. Falla si aún no se cargó todo. */
export async function getBrandContext(): Promise<BrandContext> {
  const [company, design, logo] = await Promise.all([
    readMarkdown('company'),
    readMarkdown('design'),
    readLogo(),
  ]);
  if (!company || !design || !logo) {
    throw notReady('Falta cargar el contexto de la empresa, los lineamientos de diseño o el logo.');
  }
  return { company, design, logo: { mimeType: logo.mimeType, data: logo.data.toString('base64') } };
}
