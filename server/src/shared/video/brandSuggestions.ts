import type { BrandColorRole } from './types.js';

export interface PaletteColor {
  label: string;
  hex: string;
}

const HEX = /#[0-9a-f]{6}\b/i;

/**
 * Colores de los lineamientos de diseño con su etiqueta. Lee filas de tabla o listas como
 * "| Principal | Caramelo | `#AC704F` |" o "- Primario: #0F2A5F (azul profundo)".
 */
export function paletteFrom(design: string): PaletteColor[] {
  const colors: PaletteColor[] = [];
  for (const line of design.split(/\r?\n/)) {
    const hex = HEX.exec(line)?.[0]?.toUpperCase();
    if (!hex || colors.some((color) => color.hex === hex)) continue;
    const label = line
      .replace(/`?#[0-9a-f]{6}`?/gi, '')
      .split(/[|:–-]/)
      .map((part) => part.replace(/[*`]/g, '').trim())
      .filter(Boolean)
      .join(' · ');
    colors.push({ label: label || hex, hex });
  }
  return colors;
}

const ROLE_HINTS: Record<BrandColorRole, RegExp> = {
  primary: /princip|primari|primary/i,
  secondary: /fondo|claro|secund|secondary|background/i,
  tertiary: /profund|oscuro|terciar|tertiary|dark/i,
  accent: /acento|accent|destac/i,
};

/** Rol sugerido de cada color según su etiqueta; si no hay pistas, en el orden del archivo. */
export function suggestColorRoles(
  palette: PaletteColor[],
): Partial<Record<BrandColorRole, string>> {
  const roles: Partial<Record<BrandColorRole, string>> = {};
  const used = new Set<string>();
  for (const role of Object.keys(ROLE_HINTS) as BrandColorRole[]) {
    const match = palette.find(
      (color) => !used.has(color.hex) && ROLE_HINTS[role].test(color.label),
    );
    if (match) {
      roles[role] = match.hex;
      used.add(match.hex);
    }
  }
  const rest = palette.filter((color) => !used.has(color.hex));
  for (const role of Object.keys(ROLE_HINTS) as BrandColorRole[]) {
    if (!roles[role]) {
      const next = rest.shift();
      if (next) roles[role] = next.hex;
    }
  }
  return roles;
}

/** Primer sitio web que aparece en la información de la empresa, como https://dominio. */
export function websiteFrom(company: string): string | null {
  const match =
    /\b(?:https?:\/\/)?((?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,})(\/[^\s)]*)?/i.exec(
      company.replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, ''),
    );
  return match ? `https://${match[1]}` : null;
}
