import { z } from 'zod';
import type { BrandContext } from '../../shared/brandContext/contextStore.js';
import { reviseResponseSchema, type ReviseBody } from './schemas.js';

export const REVISE_JSON_SCHEMA = z.toJSONSchema(reviseResponseSchema);

const SYSTEM = `Eres director de arte. Recibes el prompt que se usó para generar UNA imagen de redes sociales y los comentarios del usuario sobre el resultado.
Devuelve el prompt corregido para volver a generar esa imagen.

Reglas:
- Aplica todos los comentarios del usuario de forma explícita y específica en el prompt.
- Conserva todo lo que el usuario no pidió cambiar: idea, composición, textos entre comillas, colores HEX, tipografía, ubicación del logo y pie de página con el correo y el sitio web (cópialos tal cual).
- Si un comentario contradice un detalle del prompt, gana el comentario.
- Mantén el estilo de redacción: un solo párrafo detallado, en español, autosuficiente.
- No expliques los cambios: devuelve solo el prompt.`;

interface ReviseContext extends Pick<BrandContext, 'design'> {
  /** Bloque de aprendizajes ya formateado (vacío si no hay). */
  learning: string;
}

export function buildRevisionPrompt(body: ReviseBody, { design, learning }: ReviseContext) {
  return {
    system: SYSTEM,
    prompt: `# Lineamientos de diseño
${design}

${learning ? `${learning}\n\n` : ''}# Prompt actual (${body.role})
${body.prompt}

# Comentarios del usuario
${body.feedback}

# Tarea
Devuelve el prompt corregido.`,
  };
}
