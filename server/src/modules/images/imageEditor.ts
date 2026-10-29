import sharp from 'sharp';
import { dataBlock } from '../../shared/ai/promptData.js';
import { getProvider } from '../../shared/ai/providers/index.js';
import {
  ASPECT_RATIOS,
  type AspectRatio,
  type InlineImage,
} from '../../shared/ai/providers/types.js';
import type { BrandContext } from '../../shared/brandContext/contextStore.js';

/** Los lineamientos pueden ser largos: para editar basta con su inicio (paleta y tipografía). */
const MAX_DESIGN_CHARS = 4000;

/** Proporción admitida más cercana a la de la imagen (para "mantener la original"). */
export async function closestAspectRatio(image: InlineImage): Promise<AspectRatio> {
  const { width, height } = await sharp(Buffer.from(image.data, 'base64')).metadata();
  if (!width || !height) return '1:1';
  const ratio = width / height;
  const value = (option: AspectRatio) => {
    const [w, h] = option.split(':').map(Number);
    return (w ?? 1) / (h ?? 1);
  };
  return ASPECT_RATIOS.reduce((best, option) =>
    Math.abs(Math.log(value(option) / ratio)) < Math.abs(Math.log(value(best) / ratio))
      ? option
      : best,
  );
}

/** Texto para el modelo de imagen: editar la imagen recibida aplicando solo lo pedido. */
export function buildEditPrompt(
  instructions: string,
  brand: Pick<BrandContext, 'design' | 'identity'> | null,
): string {
  return [
    'Imagen de referencia 1: la imagen que el usuario quiere editar. Edítala aplicando únicamente las instrucciones. Conserva todo lo demás tal como está: personas y rostros (sin cambiar rasgos, cuerpo ni piel), composición, objetos, textos existentes y estilo.',
    brand
      ? 'Imagen de referencia 2: el logo oficial de la marca. Si las instrucciones piden el logo, o agregas textos o elementos gráficos, inclúyelo pequeño en una esquina sobre una zona limpia, reproducido fielmente (forma, proporciones y colores).'
      : '',
    brand
      ? `Lo que agregues (textos, fondos, formas) debe seguir la paleta y la tipografía de la marca:\n${dataBlock('lineamientos', brand.design.slice(0, MAX_DESIGN_CHARS))}`
      : '',
    brand?.identity ?? '',
    'Escribe cualquier texto en español, sin errores ortográficos y exactamente como lo piden las instrucciones. Nada de marcas de agua ni texto de relleno.',
    `Instrucciones del usuario (aplícalas todas, sin tocar lo demás):\n${dataBlock('instrucciones', instructions)}`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

export async function editImage(input: {
  model: string;
  image: InlineImage;
  instructions: string;
  aspectRatio: AspectRatio;
  brand: BrandContext | null;
}): Promise<InlineImage> {
  return getProvider().generateImage({
    model: input.model,
    aspectRatio: input.aspectRatio,
    referenceImages: input.brand ? [input.image, input.brand.logo] : [input.image],
    prompt: buildEditPrompt(input.instructions, input.brand),
  });
}
