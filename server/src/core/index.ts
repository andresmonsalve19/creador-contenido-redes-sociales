import { existsSync } from 'node:fs';
import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import { aiRouter } from '../shared/ai/ai.routes.js';
import { contextRouter } from '../shared/brandContext/context.routes.js';
import { serverEnv } from '../shared/config/env.js';
import { CLIENT_DIST } from '../shared/config/paths.js';
import { setupRouter } from '../shared/credentials/setup.routes.js';
import { learningRouter } from '../shared/learning/learning.routes.js';
import { errorHandler, notFound } from './middleware/errors.js';
import { serverModules } from './moduleRegistry.js';

const app = express();
app.disable('x-powered-by');
app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-origin' } }));

const json = express.json({ limit: '100kb' });

// Módulos de funcionalidad (van primero: cada uno define sus propios límites de body)
for (const module of serverModules) app.use(`/api/${module.id}`, module.router);

// Funciones comunes a todos los módulos
app.use('/api/setup', json, setupRouter);
app.use('/api/context', contextRouter);
app.use('/api/learning', json, learningRouter);
app.use('/api', json, aiRouter);

app.use('/api', notFound);

// En producción el mismo servidor entrega el cliente compilado.
if (serverEnv.NODE_ENV === 'production' && existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST, { index: false, maxAge: '1y', immutable: true }));
  app.get('/{*splat}', (_req, res) => res.sendFile(path.join(CLIENT_DIST, 'index.html')));
}

app.use(errorHandler);

app.listen(serverEnv.PORT, serverEnv.HOST, () => {
  console.log(`Servidor listo en http://${serverEnv.HOST}:${serverEnv.PORT}`);
});
