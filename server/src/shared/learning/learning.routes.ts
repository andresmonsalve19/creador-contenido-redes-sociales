import { Router } from 'express';
import { z } from 'zod';
import { assertModel } from '../ai/modelService.js';
import { parseModelJson } from '../ai/parseModelJson.js';
import { getProvider } from '../ai/providers/index.js';
import { validate } from '../http/validate.js';
import {
  LEARNING_JSON_SCHEMA,
  buildLearningPrompt,
  learningResponseSchema,
} from './learningPrompt.js';
import { addRules, readRules, removeRule } from './learningStore.js';

const feedbackBody = z.object({
  textModel: z.string().min(1),
  feedback: z.string().trim().min(5, 'Escribe un comentario un poco más detallado.').max(1500),
  /** Formato sobre el que se hizo el comentario; ayuda a clasificar la regla. */
  kind: z.enum(['image', 'video']).default('image'),
});

const indexParams = z.object({ index: z.coerce.number().int().min(0) });

export const learningRouter = Router();

learningRouter.get('/', async (_req, res) => {
  res.json({ rules: await readRules() });
});

/** Mejora el comentario con IA, lo convierte en reglas claras y las guarda en learning.md. */
learningRouter.post('/', async (req, res) => {
  const { textModel, feedback, kind } = validate(feedbackBody, req.body);
  await assertModel(textModel, 'text');
  const existing = await readRules();

  const raw = await getProvider().generateText({
    model: textModel,
    temperature: 0.3,
    jsonSchema: LEARNING_JSON_SCHEMA,
    ...buildLearningPrompt(feedback, existing, kind),
  });
  const { rules: improved } = parseModelJson(learningResponseSchema, raw);

  res.json(await addRules(improved));
});

learningRouter.delete('/:index', async (req, res) => {
  const { index } = validate(indexParams, req.params);
  res.json({ rules: await removeRule(index) });
});
