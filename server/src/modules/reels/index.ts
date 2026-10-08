import { Router } from 'express';
import type { ServerModule } from '../../shared/http/serverModule.js';

/**
 * Módulo de reels (video). Aún no está implementado ni registrado en core/moduleRegistry.ts.
 * Sigue la misma estructura que modules/images: rutas, prompts y generación propios de esta
 * carpeta, reutilizando solo lo que exista en shared/.
 */
export const reelsModule: ServerModule = {
  id: 'reels',
  router: Router(),
};
