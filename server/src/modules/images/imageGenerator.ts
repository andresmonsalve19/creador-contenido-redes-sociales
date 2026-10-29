import { getProvider } from '../../shared/ai/providers/index.js';
import type { InlineImage } from '../../shared/ai/providers/types.js';
import type { BrandContext } from '../../shared/brandContext/contextStore.js';
import { carriesPartnerLogo } from './promptBuilder.js';
import type { GenerateBody } from './schemas.js';

/**
 * Genera una imagen con el logo como referencia. En un carrusel, las imágenes posteriores reciben
 * además la primera como referencia de estilo para mantener la coherencia visual. Si el usuario pide
 * ajustes, se envía también la versión actual para que el modelo la edite en lugar de empezar de cero.
 */
export async function generateBrandImage(
  body: GenerateBody,
  brand: BrandContext,
): Promise<InlineImage> {
  const references: InlineImage[] = [brand.logo];
  const notes = [
    'Imagen de referencia 1: el logo oficial de la marca. Reprodúcelo fielmente (forma, proporciones y colores) en la posición indicada; no inventes otro logo.',
  ];

  for (const partner of brand.partnerLogos) {
    if (!carriesPartnerLogo(partner.usage, body.role)) continue;
    references.push(partner.image);
    notes.push(
      `Imagen de referencia ${references.length}: el logo de ${partner.name}, asociación que respalda a la marca. Inclúyelo pequeño en la franja "Miembro de" que indica el prompt, reproducido fielmente (forma, proporciones y colores), nunca más grande que el logo de la marca.`,
    );
  }

  if (body.styleReference) {
    references.push(body.styleReference);
    notes.push(
      `Imagen de referencia ${references.length}: la primera pieza de este mismo carrusel. Mantén su paleta, tipografía, estilo visual, márgenes, pie de página y ubicación del logo, pero crea una composición nueva con el contenido de este prompt.`,
    );
  }

  let request = `Pieza a crear:\n${body.prompt}`;

  if (body.previousImage && body.feedback) {
    references.push(body.previousImage);
    notes.push(
      `Imagen de referencia ${references.length}: la versión actual de esta pieza. Edítala: conserva su composición, estilo, textos, logo y pie de página, y cambia únicamente lo que piden los comentarios.`,
    );
    request = `Pieza a ajustar (descripción original):\n${body.prompt}\n\nCambios que pide el usuario (aplícalos todos, sin tocar lo demás):\n${body.feedback}`;
  }

  return getProvider().generateImage({
    model: body.imageModel,
    aspectRatio: body.aspectRatio,
    referenceImages: references,
    prompt: `${notes.join('\n')}\n\n${request}`,
  });
}
