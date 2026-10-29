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
import { libraryRouter } from '../shared/library/library.routes.js';
import { videoRouter } from '../shared/video/video.routes.js';
import { errorHandler, notFound } from './middleware/errors.js';
import { serverModules } from './moduleRegistry.js';

const app = express();
app.disable('x-powered-by');
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'same-origin' },
    contentSecurityPolicy: {
      directives: {
        // Las vistas previas de avatares y voces las sirve el CDN del proveedor de video.
        'img-src': ["'self'", 'data:', 'https:'],
        'media-src': ["'self'", 'https:'],
      },
    },
  }),
);

const json = express.json({ limit: '100kb' });

// Módulos de funcionalidad (van primero: cada uno define sus propios límites de body)
for (const module of serverModules) app.use(`/api/${module.id}`, module.router);

// Funciones comunes a todos los módulos
app.use('/api/setup', json, setupRouter);
app.use('/api/context', contextRouter);
app.use('/api/learning', json, learningRouter);
app.use('/api/video', json, videoRouter);
app.use('/api/library', json, libraryRouter);
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
  for (const module of serverModules) {
    module.onStart?.().catch((error: unknown) => {
      console.error(
        `No se pudo iniciar el módulo ${module.id}: ${error instanceof Error ? error.message : 'error desconocido'}`,
      );
    });
  }
});
