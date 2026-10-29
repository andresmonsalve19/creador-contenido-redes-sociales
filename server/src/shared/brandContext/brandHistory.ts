import { promises as fs } from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from '../config/paths.js';

const HISTORY_DIR = path.join(DATA_DIR, 'brand', 'history');
/** Copias que se conservan por archivo; las más viejas se borran. */
const KEEP_PER_KIND = 20;

/** Archivos de marca con historial: los tres Markdown y la identidad (slogans, frases). */
export const VERSIONED_KINDS = ['company', 'design', 'videoGuidelines', 'identity'] as const;
export type VersionedKind = (typeof VERSIONED_KINDS)[number];

const EXTENSION: Record<VersionedKind, string> = {
  company: 'md',
  design: 'md',
  videoGuidelines: 'md',
  identity: 'json',
};

/** Ids de versión: "<archivo>-<fecha sin dos puntos>.<ext>". Nada de rutas ni caracteres raros. */
const VERSION_ID = /^(company|design|videoGuidelines|identity)-(\d{8}T\d{6}\d{3}Z)\.(md|json)$/;

export interface BrandVersion {
  id: string;
  kind: VersionedKind;
  savedAt: string;
  bytes: number;
}

function parseId(id: string): { kind: VersionedKind; savedAt: string } | null {
  const match = VERSION_ID.exec(id);
  if (!match) return null;
  const stamp = match[2] ?? '';
  const savedAt = `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}T${stamp.slice(9, 11)}:${stamp.slice(11, 13)}:${stamp.slice(13, 15)}.${stamp.slice(15, 18)}Z`;
  return { kind: match[1] as VersionedKind, savedAt };
}

/**
 * Guarda una copia del contenido actual antes de reemplazarlo. Devuelve el id de la copia (para
 * deshacer) o null si no había nada que guardar.
 */
export async function backupCurrent(
  kind: VersionedKind,
  current: string | null,
  dir = HISTORY_DIR,
): Promise<string | null> {
  if (!current?.trim()) return null;
  await fs.mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:.]/g, '');
  const id = `${kind}-${stamp}.${EXTENSION[kind]}`;
  await fs.writeFile(path.join(dir, id), current, 'utf8');

  const old = (await listVersions(dir))
    .filter((version) => version.kind === kind)
    .slice(KEEP_PER_KIND);
  await Promise.all(old.map((version) => fs.rm(path.join(dir, version.id), { force: true })));
  return id;
}

/** Versiones guardadas, las más recientes primero. */
export async function listVersions(dir = HISTORY_DIR): Promise<BrandVersion[]> {
  let names: string[];
  try {
    names = await fs.readdir(dir);
  } catch {
    return [];
  }
  const versions = await Promise.all(
    names.map(async (id) => {
      const parsed = parseId(id);
      if (!parsed) return null;
      const { size } = await fs.stat(path.join(dir, id));
      return { id, ...parsed, bytes: size };
    }),
  );
  return versions
    .filter((version) => version !== null)
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export async function readVersion(
  id: string,
  dir = HISTORY_DIR,
): Promise<{ kind: VersionedKind; content: string } | null> {
  const parsed = parseId(id);
  if (!parsed) return null;
  try {
    return { kind: parsed.kind, content: await fs.readFile(path.join(dir, id), 'utf8') };
  } catch {
    return null;
  }
}
