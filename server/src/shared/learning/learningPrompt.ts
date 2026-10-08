import { z } from 'zod';

export const learningResponseSchema = z.object({
  rules: z.array(z.string().trim().min(8).max(300)).max(3),
});

export const LEARNING_JSON_SCHEMA = z.toJSONSchema(learningResponseSchema);

const SYSTEM = `Eres editor de instrucciones para un sistema que genera prompts de imagen y textos de publicaciones para redes sociales.
Conviertes comentarios del usuario, escritos de forma informal, en reglas breves y accionables que otro modelo de IA aplicará siempre.

Cómo escribir cada regla:
- Una sola oración en español, en imperativo y en positivo cuando sea posible ("Usa…", "Evita…", "Incluye…").
- Concreta y verificable: nombra el elemento (logo, tipografía, colores, textos, composición, emojis, tono…) y lo que debe o no debe pasar.
- Sin ambigüedad, sin relleno y sin referirte a "esta imagen" ni a una publicación en particular: debe servir para cualquier publicación futura.
- Máximo 40 palabras. No inventes preferencias que el usuario no expresó.

Entrega entre 1 y 3 reglas. Si el comentario mezcla varias ideas, sepáralas. Si un comentario ya está cubierto por las reglas existentes, no lo repitas. Si es una queja puntual sin enseñanza general, entrega una lista vacía.`;

export function buildLearningPrompt(feedback: string, existing: string[]) {
  const known = existing.length > 0 ? existing.map((rule) => `- ${rule}`).join('\n') : '(ninguna)';
  return {
    system: SYSTEM,
    prompt: `# Reglas ya guardadas\n${known}\n\n# Comentario del usuario\n${feedback}\n\n# Tarea\nEscribe las reglas nuevas que se derivan del comentario.`,
  };
}
