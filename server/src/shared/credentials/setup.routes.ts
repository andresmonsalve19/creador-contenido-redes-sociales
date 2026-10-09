import { Router } from 'express';
import { z } from 'zod';
import { isComplete, readMeta } from '../brandContext/contextStore.js';
import { readSecret } from '../config/env.js';
import { badRequest } from '../http/errors.js';
import { localOnly } from '../http/localOnly.js';
import { validate } from '../http/validate.js';
import { CREDENTIALS } from './definitions.js';
import { upsertEnv } from './envStore.js';

const credentialsBody = z.object({
  values: z.record(
    z.string(),
    z.string().trim().min(1, 'La credencial no puede estar vacía.').max(500),
  ),
});

export const setupRouter = Router();

setupRouter.get('/status', async (_req, res) => {
  const meta = await readMeta();
  const credentials = CREDENTIALS.map(({ key, label, description, helpUrl, optional }) => ({
    key,
    label,
    description,
    helpUrl,
    optional,
    configured: Boolean(readSecret(key)),
  }));
  const context = {
    company: Boolean(meta.company),
    design: Boolean(meta.design),
    logo: Boolean(meta.logo),
    videoGuidelines: Boolean(meta.videoGuidelines),
  };

  res.json({
    credentials,
    context,
    // Las credenciales opcionales (p. ej. HeyGen) no bloquean el uso del resto de la app.
    ready: credentials.every((c) => c.optional || c.configured) && isComplete(meta),
  });
});

setupRouter.post('/credentials', localOnly, async (req, res) => {
  const { values } = validate(credentialsBody, req.body);
  const entries = Object.entries(values);
  if (entries.length === 0) throw badRequest('No se recibieron credenciales.');

  for (const [key, value] of entries) {
    const definition = CREDENTIALS.find((c) => c.key === key);
    if (!definition) throw badRequest(`Credencial desconocida: ${key}.`);
    await definition.validate(value);
  }

  await upsertEnv(values);
  res.json({ saved: entries.map(([key]) => key) });
});
