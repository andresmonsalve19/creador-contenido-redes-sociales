import { z } from 'zod';
import type { BrandContext } from '../../shared/brandContext/contextStore.js';
import {
  promptsResponseSchema,
  type Contact,
  type PromptsBody,
  type SlideRole,
} from './schemas.js';

export const PROMPTS_JSON_SCHEMA = z.toJSONSchema(promptsResponseSchema);

interface SlideContext {
  cta: string;
  contact: Contact;
}

/** Texto de contacto tal como debe aparecer, entre comillas, para que el modelo lo copie sin alterarlo. */
function contactList({ email, website, whatsapp }: Contact): string {
  return [
    email && `el correo "${email}"`,
    website && `el sitio web "${website}"`,
    whatsapp && `el WhatsApp "${whatsapp}"`,
  ]
    .filter(Boolean)
    .join(', ');
}

const ROLE_GUIDE: Record<SlideRole, (ctx: SlideContext) => string> = {
  single: ({ cta }) =>
    `Pieza única: debe detener el scroll y comunicar la idea completa con un titular claro, una o dos líneas de apoyo (máximo 20 palabras en total) y el llamado a la acción "${cta}" bien visible.`,
  hook: () =>
    'Gancho: titular corto y provocador (pregunta, dato sorprendente o promesa) con la composición más llamativa del carrusel. Invita a deslizar. Máximo 12 palabras.',
  development: () =>
    'Desarrollo: es la imagen más informativa. Combina un subtítulo claro con 2 a 4 líneas o viñetas de contenido concreto (datos, pasos, ejemplos, beneficios o comparaciones) que expliquen a fondo UN subtema distinto de la temática, con 30 a 60 palabras de texto jerarquizado. Acompáñalo de una ilustración, infografía, esquema o ícono que muestre ese punto en detalle. No repitas lo que dicen las otras imágenes.',
  cta: ({ cta, contact }) => {
    const contactText = contactList(contact);
    return [
      `Llamado a la acción: cierra la idea con una frase de resumen y el llamado "${cta}" como protagonista, en un botón o bloque destacado (máximo 14 palabras de texto, sin contar los datos de contacto).`,
      contactText
        ? `Muestra ${contactText} de forma destacada y grande, con íconos minimalistas, dentro de la composición principal (además del pie de página).`
        : '',
      'El logo debe estar bien visible.',
    ]
      .filter(Boolean)
      .join(' ');
  },
};

/** Imágenes que llevan los logos de asociaciones: todas, o solo la de cierre. */
export const carriesPartnerLogo = (usage: 'always' | 'closing', role: SlideRole) =>
  usage === 'always' || role === 'cta' || role === 'single';

/** Indicaciones para ubicar los logos de asociaciones que el modelo de imagen recibirá. */
function partnerBlock(partners: PromptContext['partnerLogos'], roles: SlideRole[]): string {
  if (partners.length === 0) return '';
  const lines = partners.map((partner) => {
    const where = roles
      .map((role, index) => (carriesPartnerLogo(partner.usage, role) ? index + 1 : null))
      .filter((index) => index !== null);
    return `- ${partner.name}: imagen(es) ${where.join(', ')}`;
  });
  return `# Logos de asociaciones (respaldo institucional)
El modelo de imagen recibirá estos logos como referencia. En el prompt de cada imagen indicada, pide que aparezcan pequeños y juntos, en una franja discreta "Miembro de" cerca del pie de página o del logo de la marca, reproducidos fielmente a partir de sus imágenes de referencia (sin deformarlos ni cambiar sus colores) y nunca más grandes que el logo de la marca:
${lines.join('\n')}

`;
}

/** Rol de cada imagen según su posición: primera = gancho, última = llamado a la acción. */
export function slideRoles(format: PromptsBody['format'], count: number): SlideRole[] {
  if (format === 'single') return ['single'];
  return Array.from({ length: count }, (_, index) =>
    index === 0 ? 'hook' : index === count - 1 ? 'cta' : 'development',
  );
}

const ORIENTATION: Record<PromptsBody['aspectRatio'], string> = {
  '1:1': 'cuadrada',
  '4:5': 'vertical',
  '3:4': 'vertical',
  '9:16':
    'vertical alta, pensada para pantalla completa (historias y reels); deja libre el 14 % superior e inferior',
  '16:9': 'horizontal panorámica; compón de lado a lado y reparte el texto en el ancho',
};

const SYSTEM = `Eres director de arte y copywriter senior de una agencia de redes sociales.
Escribes prompts para un modelo de generación de imágenes que recibirá, junto a cada prompt, el logo real de la marca como imagen de referencia. También escribes el texto (copy) de la publicación.

Reglas para cada prompt de imagen:
- Es autosuficiente: el modelo de imagen no ve los otros prompts ni el contexto, así que describe todo en cada uno.
- Describe la escena completa: sujeto, entorno, composición y encuadre, estilo (fotografía, ilustración 3D, flat…), iluminación, atmósfera y jerarquía visual.
- Adapta la composición a la proporción pedida.
- Usa los colores exactos de los lineamientos con su código HEX y nombra el rol de cada color (fondo, acento, texto).
- Describe la tipografía según los lineamientos (familia o estilo, peso, tamaño relativo) y escribe entre comillas el texto exacto que debe aparecer en la imagen, en español y sin errores ortográficos. Respeta el máximo de palabras que indica el rol de cada imagen.
- Logo: indica dónde va (en una esquina superior, o integrado a la izquierda del pie de página), pequeño, sobre una zona limpia, y que debe reproducirse fielmente a partir de la imagen de referencia, sin deformarlo ni cambiar sus colores. Nunca debe tapar texto ni el pie de página.
- Deja márgenes de seguridad: nada importante a menos del 8 % del borde.
- Nada de marcas de agua, marcos de teléfono, interfaces de Instagram ni texto de relleno.
- Escribe los prompts en español, en un solo párrafo detallado de 120 a 240 palabras.

Pie de página (en TODAS las imágenes, cuando hay datos de contacto):
- Describe una franja inferior estilizada de alrededor del 8 al 10 % del alto, coherente con la paleta de la marca: color sólido o degradado sutil, con una línea fina de acento en el borde superior.
- Dentro del pie van SOLO los datos de contacto que se te dan (correo, sitio web y/o WhatsApp), cada uno con su ícono minimalista (sobre, globo, ícono de WhatsApp), en tipografía pequeña pero muy legible, centrados o separados por un divisor vertical (apilados si la proporción es estrecha). No agregues datos que no se te den.
- Escribe cada dato entre comillas, exactamente como se te da, letra por letra y dígito por dígito, sin cambiarlo ni agregar "https://".
- El pie es sobrio y elegante: no compite con el titular y ningún elemento importante lo invade.

Reglas para el texto de la publicación ("captionBody"):
- Empieza con un gancho de una línea que haga querer seguir leyendo.
- Escribe párrafos cortos de 1 a 2 líneas separados por una línea en blanco; usa saltos de línea reales (\\n), no todo en un bloque.
- Usa emojis relevantes con naturalidad: uno al inicio de cada párrafo o idea, y alguno dentro del texto. Sin saturar.
- Si enumeras puntos, ponlos en líneas separadas con un emoji como viñeta.
- Cierra con el llamado a la acción elegido por el usuario, dicho de forma amable y natural.
- Entre 60 y 120 palabras, en el tono de la marca.
- NO incluyas correo, sitio web, teléfono ni hashtags en "captionBody": el sistema los agrega después.
- "hashtags": entre 4 y 8, sin el símbolo #, sin espacios ni tildes, mezcla de marca, tema y sector.`;

interface PromptContext extends Pick<BrandContext, 'company' | 'design' | 'identity'> {
  partnerLogos: Pick<BrandContext['partnerLogos'][number], 'name' | 'usage'>[];
  /** Bloque de aprendizajes ya formateado (vacío si no hay). */
  learning: string;
}

export function buildImagePrompts(body: PromptsBody, brand: PromptContext) {
  const roles = slideRoles(body.format, body.slideCount);
  const formatLabel =
    body.format === 'single'
      ? 'una sola imagen para el feed de Instagram'
      : `un carrusel de ${body.slideCount} imágenes para el feed de Instagram`;

  const ctx: SlideContext = { cta: body.cta, contact: body.contact };
  const plan = roles.map((role, index) => `${index + 1}. ${ROLE_GUIDE[role](ctx)}`).join('\n');

  const contactBlock = contactList(body.contact)
    ? `# Datos de contacto (cópialos tal cual en el pie de página)\n${[
        body.contact.email && `- Correo: "${body.contact.email}"`,
        body.contact.website && `- Sitio web: "${body.contact.website}"`,
        body.contact.whatsapp && `- WhatsApp: "${body.contact.whatsapp}"`,
      ]
        .filter(Boolean)
        .join('\n')}`
    : '# Datos de contacto\nNo hay datos de contacto: no incluyas pie de página de contacto en las imágenes.';

  const prompt = `# Información de la empresa
${brand.company}

# Lineamientos de diseño
${brand.design}

${brand.identity ? `${brand.identity}\n\n` : ''}${partnerBlock(brand.partnerLogos, roles)}${brand.learning ? `${brand.learning}\n\n` : ''}${contactBlock}

# Llamado a la acción elegido
"${body.cta}"

# Encargo
Crea ${formatLabel} en proporción ${body.aspectRatio} (${ORIENTATION[body.aspectRatio]}) sobre esta temática:
"${body.topic}"

${body.format === 'carousel' ? 'Todas las imágenes comparten la misma línea gráfica (paleta, tipografía, estilo visual, pie de página y posición del logo) y cuentan una historia continua.\n' : ''}
Estructura (devuelve exactamente ${roles.length} elemento(s) en "slides", en este orden):
${plan}

Además devuelve:
- "concept": la idea creativa en una o dos frases.
- "captionBody" y "hashtags": el texto de la publicación según las reglas.
- En cada slide, "title" es un nombre corto para identificarla y "prompt" el prompt completo para el modelo de imagen.`;

  return { system: SYSTEM, prompt, roles };
}
