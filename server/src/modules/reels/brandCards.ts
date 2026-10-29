import sharp from 'sharp';
import type { Contact } from '../../shared/publishing/contact.js';
import type { VideoAspectRatio } from '../../shared/video/types.js';

/** Tamaño de las tarjetas según la proporción del video (1080p). */
const SIZES: Record<VideoAspectRatio, [number, number]> = {
  '9:16': [1080, 1920],
  '4:5': [1080, 1350],
  '1:1': [1080, 1080],
  '16:9': [1920, 1080],
};

const DEFAULT_COLOR = '#0F2A5F';
const FONT = "'DejaVu Sans', 'Segoe UI', Arial, Helvetica, sans-serif";

export interface CardInput {
  aspectRatio: VideoAspectRatio;
  /** Color de fondo de la marca (HEX). */
  color: string;
  /** Logo de la marca (PNG, JPG o WebP), sin alterar. */
  logo: Buffer;
}

/** Primer color HEX de los lineamientos de diseño, o el de respaldo. */
export function brandColorFrom(design: string, preferred?: string | null): string {
  if (preferred && /^#[0-9a-f]{6}$/i.test(preferred)) return preferred;
  return /#[0-9a-f]{6}\b/i.exec(design)?.[0] ?? DEFAULT_COLOR;
}

/** Texto oscuro sobre fondos claros y blanco sobre fondos oscuros. */
function textColorFor(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [
    number,
    number,
    number,
  ];
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.55 ? '#111111' : '#FFFFFF';
}

const escapeXml = (text: string) =>
  text.replace(
    /[<>&'"]/g,
    (char) =>
      ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[char] ?? char,
  );

/** Parte un texto en líneas de como máximo `maxChars` caracteres, sin cortar palabras. */
export function wrapText(text: string, maxChars: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (line && `${line} ${word}`.length > maxChars) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

interface TextLine {
  text: string;
  size: number;
  weight: 400 | 700;
  /** Distancia desde la línea anterior (o desde `top` en la primera). */
  gap: number;
}

function textSvg(width: number, height: number, top: number, lines: TextLine[], color: string) {
  let y = top;
  const nodes = lines.map((line) => {
    y += line.gap;
    return `<text x="${width / 2}" y="${y}" font-size="${line.size}" font-weight="${line.weight}" text-anchor="middle" fill="${color}" font-family="${FONT}">${escapeXml(line.text)}</text>`;
  });
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${nodes.join('')}</svg>`,
  );
}

/** Logo centrado sobre un panel blanco redondeado, para que se vea sobre cualquier color. */
async function logoPanel(logo: Buffer, maxWidth: number, maxHeight: number) {
  const padding = Math.round(maxWidth * 0.1);
  const resized = await sharp(logo)
    .resize({
      width: maxWidth - padding * 2,
      height: maxHeight - padding * 2,
      fit: 'inside',
      withoutEnlargement: false,
    })
    .png()
    .toBuffer({ resolveWithObject: true });

  const width = resized.info.width + padding * 2;
  const height = resized.info.height + padding * 2;
  const radius = Math.round(Math.min(width, height) * 0.08);
  const panel = await sharp(
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" rx="${radius}" fill="#FFFFFF"/></svg>`,
    ),
  )
    .composite([{ input: resized.data, left: padding, top: padding }])
    .png()
    .toBuffer();
  return { panel, width, height };
}

/**
 * Franja blanca con los logos de las asociaciones, uno al lado del otro y sin alterarlos. Así
 * aparecen exactos en el cierre, sin depender de que la IA los dibuje.
 */
async function partnersStrip(logos: Buffer[], maxWidth: number, logoHeight: number) {
  const padding = Math.round(logoHeight * 0.35);
  const gap = Math.round(logoHeight * 0.5);
  const slot = Math.floor((maxWidth - padding * 2 - gap * (logos.length - 1)) / logos.length);
  const resized = await Promise.all(
    logos.map((logo) =>
      sharp(logo)
        .resize({ width: slot, height: logoHeight, fit: 'inside' })
        .png()
        .toBuffer({ resolveWithObject: true }),
    ),
  );
  const width =
    resized.reduce((sum, logo) => sum + logo.info.width, 0) +
    gap * (logos.length - 1) +
    padding * 2;
  const height = logoHeight + padding * 2;
  const radius = Math.round(height * 0.2);
  let left = padding;
  const layers = resized.map((logo) => {
    const layer = {
      input: logo.data,
      left,
      top: padding + Math.round((logoHeight - logo.info.height) / 2),
    };
    left += logo.info.width + gap;
    return layer;
  });
  const strip = await sharp(
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" rx="${radius}" fill="#FFFFFF"/></svg>`,
    ),
  )
    .composite(layers)
    .png()
    .toBuffer();
  return { strip, width, height };
}

function base(width: number, height: number, color: string) {
  return sharp({ create: { width, height, channels: 3, background: color } });
}

/** Tarjeta de apertura: solo el logo, centrado, sobre el color de la marca. */
export async function renderIntroCard({ aspectRatio, color, logo }: CardInput): Promise<Buffer> {
  const [width, height] = SIZES[aspectRatio];
  const {
    panel,
    width: pw,
    height: ph,
  } = await logoPanel(logo, Math.round(width * 0.62), Math.round(height * 0.32));
  return base(width, height, color)
    .composite([
      { input: panel, left: Math.round((width - pw) / 2), top: Math.round((height - ph) / 2) },
    ])
    .png()
    .toBuffer();
}

/** Tarjeta de cierre: logo, llamado a la acción y datos de contacto escritos exactamente. */
export async function renderOutroCard(
  input: CardInput & {
    cta: string;
    contact: Contact;
    /** Logos de asociaciones que respaldan a la marca (opcional). */
    partners?: Buffer[];
  },
): Promise<Buffer> {
  const { aspectRatio, color, logo, cta, contact, partners = [] } = input;
  const [width, height] = SIZES[aspectRatio];
  const landscape = width > height;
  const textColor = textColorFor(color);

  const {
    panel,
    width: pw,
    height: ph,
  } = await logoPanel(
    logo,
    Math.round(width * (landscape ? 0.3 : 0.5)),
    Math.round(height * (landscape ? 0.3 : 0.2)),
  );

  const ctaSize = Math.round(Math.min(width, height) * 0.08);
  const infoSize = Math.round(Math.min(width, height) * 0.042);
  const maxChars = Math.max(10, Math.floor((width * 0.84) / (ctaSize * 0.56)));
  const lines: TextLine[] = [
    ...wrapText(cta, maxChars).map((text, index) => ({
      text,
      size: ctaSize,
      weight: 700 as const,
      gap: index === 0 ? ctaSize : Math.round(ctaSize * 1.2),
    })),
    ...[contact.website, contact.email, contact.whatsapp && `WhatsApp ${contact.whatsapp}`]
      .filter((text): text is string => Boolean(text))
      .map((text, index) => ({
        text,
        size: infoSize,
        weight: 400 as const,
        gap: index === 0 ? Math.round(ctaSize * 1.3) : Math.round(infoSize * 1.6),
      })),
  ];
  const textHeight = lines.reduce((sum, line) => sum + line.gap, 0) + infoSize;

  // Logo arriba, texto y franja de asociaciones debajo; el conjunto centrado verticalmente.
  const spacing = Math.round(height * 0.05);
  const strip =
    partners.length > 0
      ? await partnersStrip(
          partners,
          Math.round(width * 0.84),
          Math.round(Math.min(width, height) * 0.075),
        )
      : null;
  const stripHeight = strip ? spacing + strip.height : 0;
  const blockTop = Math.max(
    0,
    Math.round((height - (ph + spacing + textHeight + stripHeight)) / 2),
  );
  const textTop = blockTop + ph + spacing;

  return base(width, height, color)
    .composite([
      { input: panel, left: Math.round((width - pw) / 2), top: blockTop },
      { input: textSvg(width, height, textTop, lines, textColor), left: 0, top: 0 },
      ...(strip
        ? [
            {
              input: strip.strip,
              left: Math.round((width - strip.width) / 2),
              top: Math.min(height - strip.height, textTop + textHeight + spacing),
            },
          ]
        : []),
    ])
    .png()
    .toBuffer();
}
