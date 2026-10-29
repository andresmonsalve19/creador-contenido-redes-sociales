import { promises as fs } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { InlineImage } from '../ai/providers/types.js';
import { DATA_DIR } from '../config/paths.js';
import {
  formatIdentityForPrompt,
  readIdentity,
  readPartnerLogos,
  restoreIdentityFile,
  type PartnerUsage,
} from './identityStore.js';
import { backupCurrent, readVersion } from './brandHistory.js';
import { notReady } from '../http/errors.js';

const BRAND_DIR = path.join(DATA_DIR, 'brand');
const META_FILE = path.join(BRAND_DIR, 'meta.json');
const COMPANY_FILE = path.join(BRAND_DIR, 'company.md');
const DESIGN_FILE = path.join(BRAND_DIR, 'design.md');
/** Opcional: cómo deben ser los videos de la marca (estilo, guion, presentador…). */
const VIDEO_GUIDELINES_FILE = path.join(BRAND_DIR, 'lineamientos-video.md');

const MARKDOWN_FILES = {
  company: COMPANY_FILE,
  design: DESIGN_FILE,
  videoGuidelines: VIDEO_GUIDELINES_FILE,
} as const;
export type MarkdownKind = keyof typeof MARKDOWN_FILES;

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
  videoGuidelines: fileMetaSchema.optional(),
  logo: fileMetaSchema
    .extend({ mimeType: z.enum(Object.keys(LOGO_TYPES) as [LogoMimeType]) })
    .optional(),
});
export type BrandMeta = z.infer<typeof metaSchema>;

export interface BrandUpload {
  company?: { fileName: string; content: string };
  design?: { fileName: string; content: string };
  videoGuidelines?: { fileName: string; content: string };
  logo?: { fileName: string; mimeType: LogoMimeType; data: Buffer };
}

export interface BrandContext {
  company: string;
  design: string;
  logo: InlineImage;
  /** Slogans, frases, identidad y asociaciones, listo para el prompt (vacío si no hay). */
  identity: string;
  /** Logos de asociaciones que respaldan a la marca. */
  partnerLogos: { name: string; usage: PartnerUsage; image: InlineImage }[];
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

  for (const kind of Object.keys(MARKDOWN_FILES) as MarkdownKind[]) {
    const file = upload[kind];
    if (!file) continue;
    // Copia de la versión anterior: así cualquier cambio (desde la app o Claude) se puede deshacer.
    await backupCurrent(kind, await readMarkdown(kind));
    await fs.writeFile(MARKDOWN_FILES[kind], file.content, 'utf8');
    meta[kind] = { fileName: file.fileName, updatedAt };
  }
  if (upload.logo) {
    if (meta.logo) await fs.rm(logoFile(meta.logo.mimeType), { force: true });
    await fs.writeFile(logoFile(upload.logo.mimeType), upload.logo.data);
    meta.logo = { fileName: upload.logo.fileName, mimeType: upload.logo.mimeType, updatedAt };
  }

  await fs.writeFile(META_FILE, JSON.stringify(meta, null, 2), 'utf8');
  return meta;
}

export async function readMarkdown(kind: MarkdownKind): Promise<string | null> {
  try {
    return await fs.readFile(MARKDOWN_FILES[kind], 'utf8');
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
  const [company, design, logo, identity, partnerLogos] = await Promise.all([
    readMarkdown('company'),
    readMarkdown('design'),
    readLogo(),
    readIdentity(),
    readPartnerLogos(),
  ]);
  if (!company || !design || !logo) {
    throw notReady('Falta cargar el contexto de la empresa, los lineamientos de diseño o el logo.');
  }
  return {
    company,
    design,
    logo: { mimeType: logo.mimeType, data: logo.data.toString('base64') },
    identity: formatIdentityForPrompt(identity),
    partnerLogos: partnerLogos.map((partner) => ({
      name: partner.name,
      usage: partner.usage,
      image: { mimeType: partner.mimeType, data: partner.data.toString('base64') },
    })),
  };
}

/**
 * Reemplaza el contenido de un archivo Markdown de la marca (p. ej. una versión mejorada por
 * Claude). Conserva el nombre de archivo registrado y devuelve el id de la copia anterior.
 */
export async function saveMarkdown(kind: MarkdownKind, content: string): Promise<string | null> {
  await fs.mkdir(BRAND_DIR, { recursive: true });
  const meta = await readMeta();
  const fallbackName: Record<MarkdownKind, string> = {
    company: 'empresa.md',
    design: 'lineamientos-diseno.md',
    videoGuidelines: 'lineamientos-video.md',
  };
  const backupId = await backupCurrent(kind, await readMarkdown(kind));
  await fs.writeFile(MARKDOWN_FILES[kind], content, 'utf8');
  meta[kind] = {
    fileName: meta[kind]?.fileName ?? fallbackName[kind],
    updatedAt: new Date().toISOString(),
  };
  await fs.writeFile(META_FILE, JSON.stringify(meta, null, 2), 'utf8');
  return backupId;
}

/** Vuelve a una versión guardada. La versión actual también queda guardada antes. */
export async function restoreVersion(
  id: string,
): Promise<{ kind: string; backupId: string | null } | null> {
  const version = await readVersion(id);
  if (!version) return null;
  if (version.kind === 'identity') {
    return { kind: 'identity', backupId: await restoreIdentityFile(version.content) };
  }
  return { kind: version.kind, backupId: await saveMarkdown(version.kind, version.content) };
}
