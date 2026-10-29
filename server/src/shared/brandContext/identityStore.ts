import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { dataBlock } from '../ai/promptData.js';
import { DATA_DIR } from '../config/paths.js';
import { backupCurrent } from './brandHistory.js';

const BRAND_DIR = path.join(DATA_DIR, 'brand');
const IDENTITY_FILE = path.join(BRAND_DIR, 'identity.json');
const PARTNERS_DIR = path.join(BRAND_DIR, 'partners');

export const PARTNER_LOGO_TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg' } as const;
export type PartnerLogoType = keyof typeof PARTNER_LOGO_TYPES;
export const isPartnerLogoType = (type: string): type is PartnerLogoType =>
  type in PARTNER_LOGO_TYPES;

/**
 * Dónde va el logo de una asociación:
 * - always: en todas las piezas (imágenes y escenas de video).
 * - closing: solo en el cierre (última imagen o tarjeta final).
 */
export const PARTNER_USAGES = ['always', 'closing'] as const;
export type PartnerUsage = (typeof PARTNER_USAGES)[number];

const partnerSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  usage: z.enum(PARTNER_USAGES),
  mimeType: z.enum(Object.keys(PARTNER_LOGO_TYPES) as [PartnerLogoType]),
  updatedAt: z.string(),
});
export type Partner = z.infer<typeof partnerSchema>;

/** Lo que el usuario edita: slogans, frases e indicaciones de identidad. */
export const identityTextSchema = z.object({
  slogans: z
    .array(z.string().trim().min(2, 'Un slogan está vacío.').max(160))
    .max(20, 'Máximo 20 slogans.'),
  phrases: z
    .array(z.string().trim().min(2, 'Una frase está vacía.').max(300))
    .max(40, 'Máximo 40 frases.'),
  /** Tono, palabras que sí y que no, cómo nombrar a la doctora, etc. */
  notes: z.string().trim().max(3000),
});
export type IdentityText = z.infer<typeof identityTextSchema>;

const identitySchema = identityTextSchema.extend({ partners: z.array(partnerSchema).max(12) });
export type Identity = z.infer<typeof identitySchema>;

const EMPTY: Identity = { slogans: [], phrases: [], notes: '', partners: [] };

const partnerFile = (partner: Pick<Partner, 'id' | 'mimeType'>) =>
  path.join(PARTNERS_DIR, `${partner.id}.${PARTNER_LOGO_TYPES[partner.mimeType]}`);

export async function readIdentity(): Promise<Identity> {
  try {
    const parsed = identitySchema.safeParse(JSON.parse(await fs.readFile(IDENTITY_FILE, 'utf8')));
    return parsed.success ? parsed.data : EMPTY;
  } catch {
    return EMPTY;
  }
}

async function writeIdentity(identity: Identity): Promise<Identity> {
  await fs.mkdir(BRAND_DIR, { recursive: true });
  await fs.writeFile(IDENTITY_FILE, JSON.stringify(identity, null, 2), 'utf8');
  return identity;
}

/** Contenido actual del archivo de identidad, tal cual (para guardar una copia antes de cambiarlo). */
async function readIdentityRaw(): Promise<string | null> {
  try {
    return await fs.readFile(IDENTITY_FILE, 'utf8');
  } catch {
    return null;
  }
}

export async function saveIdentityText(
  text: IdentityText,
): Promise<{ identity: Identity; backupId: string | null }> {
  const backupId = await backupCurrent('identity', await readIdentityRaw());
  return { identity: await writeIdentity({ ...(await readIdentity()), ...text }), backupId };
}

/**
 * Restaura slogans, frases e indicaciones desde una copia. Los logos de asociaciones no cambian
 * (sus archivos no forman parte del historial). Devuelve el id de la copia de lo actual.
 */
export async function restoreIdentityFile(content: string): Promise<string | null> {
  const parsed = identityTextSchema.safeParse(JSON.parse(content));
  if (!parsed.success) throw new Error('La versión guardada de la identidad no es válida.');
  return (await saveIdentityText(parsed.data)).backupId;
}

export async function addPartner(input: {
  name: string;
  usage: PartnerUsage;
  mimeType: PartnerLogoType;
  data: Buffer;
}): Promise<Identity> {
  const identity = await readIdentity();
  if (identity.partners.length >= 12) throw new Error('Máximo 12 logos de asociaciones.');
  const partner: Partner = {
    id: randomUUID(),
    name: input.name,
    usage: input.usage,
    mimeType: input.mimeType,
    updatedAt: new Date().toISOString(),
  };
  await fs.mkdir(PARTNERS_DIR, { recursive: true });
  await fs.writeFile(partnerFile(partner), input.data);
  return writeIdentity({ ...identity, partners: [...identity.partners, partner] });
}

export async function updatePartner(
  id: string,
  patch: { name: string; usage: PartnerUsage },
): Promise<Identity | null> {
  const identity = await readIdentity();
  if (!identity.partners.some((partner) => partner.id === id)) return null;
  return writeIdentity({
    ...identity,
    partners: identity.partners.map((partner) =>
      partner.id === id ? { ...partner, ...patch, updatedAt: new Date().toISOString() } : partner,
    ),
  });
}

export async function removePartner(id: string): Promise<Identity> {
  const identity = await readIdentity();
  const partner = identity.partners.find((p) => p.id === id);
  if (partner) await fs.rm(partnerFile(partner), { force: true });
  return writeIdentity({ ...identity, partners: identity.partners.filter((p) => p.id !== id) });
}

export async function readPartnerLogo(
  partner: Pick<Partner, 'id' | 'mimeType'>,
): Promise<Buffer | null> {
  try {
    return await fs.readFile(partnerFile(partner));
  } catch {
    return null;
  }
}

/** Logos de asociaciones con su contenido, listos para enviarlos como referencia. */
export async function readPartnerLogos(): Promise<
  (Pick<Partner, 'name' | 'usage' | 'mimeType'> & { data: Buffer })[]
> {
  const { partners } = await readIdentity();
  const logos = await Promise.all(
    partners.map(async (partner) => {
      const data = await readPartnerLogo(partner);
      return data
        ? { name: partner.name, usage: partner.usage, mimeType: partner.mimeType, data }
        : null;
    }),
  );
  return logos.filter((logo) => logo !== null);
}

const USAGE_TEXT: Record<PartnerUsage, string> = {
  always: 'su logo va en todas las piezas',
  closing: 'su logo va solo en el cierre',
};

/**
 * Bloque de identidad para los prompts: slogans y frases textuales, indicaciones de identidad y
 * respaldo institucional. Vacío si la marca no cargó nada.
 */
export function formatIdentityForPrompt(identity: Identity): string {
  if (
    identity.slogans.length === 0 &&
    identity.phrases.length === 0 &&
    !identity.notes &&
    identity.partners.length === 0
  ) {
    return '';
  }
  const quote = (text: string) => `- "${text.replace(/"/g, "'")}"`;
  const parts = [
    '# Identidad de la marca (obligatorio)',
    identity.slogans.length > 0
      ? 'Slogans oficiales: cópialos textualmente, letra por letra, sin cambiar ni una palabra. Usa como máximo uno por pieza, cuando encaje con el tema.'
      : '',
    identity.slogans.length > 0 ? dataBlock('slogans', identity.slogans.map(quote).join('\n')) : '',
    identity.phrases.length > 0
      ? 'Frases representativas: úsalas textualmente cuando encajen. No inventes slogans nuevos.'
      : '',
    identity.phrases.length > 0 ? dataBlock('frases', identity.phrases.map(quote).join('\n')) : '',
    identity.notes ? 'Indicaciones de identidad y tono:' : '',
    identity.notes ? dataBlock('identidad', identity.notes) : '',
    identity.partners.length > 0
      ? 'Respaldo institucional: la marca es miembro de estas asociaciones. Nómbralas solo con su nombre exacto y no inventes otras.'
      : '',
    identity.partners.length > 0
      ? dataBlock(
          'asociaciones',
          identity.partners.map((p) => `- ${p.name} (${USAGE_TEXT[p.usage]})`).join('\n'),
        )
      : '',
  ];
  return parts.filter(Boolean).join('\n');
}
