import { z } from 'zod';

export const topicResponseSchema = z.object({
  suggestions: z.array(z.string().min(1)).min(1).max(5),
});

export const TOPIC_JSON_SCHEMA = z.toJSONSchema(topicResponseSchema);

interface TopicInput {
  company: string;
  format: string;
  hint?: string;
  /** Bloque de aprendizajes ya formateado (vacío si no hay). */
  learning?: string;
}

export function buildTopicPrompt({ company, format, hint, learning }: TopicInput) {
  return {
    system: [
      'Eres estratega de contenido para redes sociales de habla hispana.',
      'Propones temáticas concretas, útiles para la audiencia de la marca y alineadas con sus servicios.',
      'Cada temática es una sola frase de máximo 20 palabras, en español, sin hashtags ni emojis.',
    ].join(' '),
    prompt: [
      '# Información de la empresa',
      company,
      '',
      learning ?? '',
      '',
      `# Tarea`,
      `Sugiere 3 temáticas distintas para una publicación de Instagram en formato: ${format}.`,
      'Varía el enfoque: una educativa, una que muestre un servicio o caso, y una de tendencia o temporada.',
      hint ? `Ten en cuenta esta idea del usuario: ${hint}` : '',
    ].join('\n'),
  };
}
