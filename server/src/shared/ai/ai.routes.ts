import { Router } from 'express';
import { z } from 'zod';
import { getBrandContext, readMarkdown } from '../brandContext/contextStore.js';
import { validate } from '../http/validate.js';
import { formatRulesForPrompt, readRulesFor } from '../learning/learningStore.js';
import { assertModel, listModels } from './modelService.js';
import { parseModelJson } from './parseModelJson.js';
import { getProvider } from './providers/index.js';
import { readVideoSettings } from '../video/videoSettingsStore.js';
import { dataBlock } from './promptData.js';
import { buildTopicPrompt, topicResponseSchema, TOPIC_JSON_SCHEMA } from './topicPrompt.js';

const modelsQuery = z.object({ kind: z.enum(['text', 'image']) });

const topicBody = z.object({
  textModel: z.string().min(1),
  /** Descripción del formato, p. ej. "carrusel de 5 imágenes" o "reel de 30 segundos". */
  format: z.string().trim().min(1).max(120),
  hint: z.string().trim().max(500).optional(),
  /** Tipo de contenido: decide qué reglas aprendidas aplican. */
  kind: z.enum(['image', 'video']).default('image'),
});

export const aiRouter = Router();

aiRouter.get('/models', async (req, res) => {
  const { kind } = validate(modelsQuery, req.query);
  res.json(await listModels(kind));
});

aiRouter.post('/topic-suggestions', async (req, res) => {
  const { textModel, format, hint, kind } = validate(topicBody, req.body);
  await assertModel(textModel, 'text');
  const brand = await getBrandContext();

  const raw = await getProvider().generateText({
    model: textModel,
    temperature: 1,
    jsonSchema: TOPIC_JSON_SCHEMA,
    ...buildTopicPrompt({
      company: [brand.company, brand.identity].filter(Boolean).join('\n\n'),
      format,
      hint,
      learning: formatRulesForPrompt(await readRulesFor(kind)),
      extra: kind === 'video' ? await videoTopicContext() : undefined,
    }),
  });

  const { suggestions } = parseModelJson(topicResponseSchema, raw);
  res.json({ suggestions });
});

/** Para reels: reglas de cumplimiento y lineamientos de video de la marca, si existen. */
async function videoTopicContext(): Promise<string | undefined> {
  const [settings, guidelines] = await Promise.all([
    readVideoSettings(),
    readMarkdown('videoGuidelines'),
  ]);
  const blocks = [
    settings.complianceRules &&
      `# Reglas de cumplimiento (prioridad máxima)\n${dataBlock('cumplimiento', settings.complianceRules)}`,
    guidelines && `# Lineamientos de video\n${dataBlock('lineamientos_video', guidelines)}`,
  ].filter(Boolean);
  return blocks.length > 0 ? blocks.join('\n\n') : undefined;
}
