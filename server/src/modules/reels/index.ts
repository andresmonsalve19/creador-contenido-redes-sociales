import type { ServerModule } from '../../shared/http/serverModule.js';
import { reelsRouter, resumeReels } from './reels.routes.js';

/**
 * Módulo de reels: guion con IA y video con avatar (HeyGen).
 * Reutiliza de shared/ el contexto de la marca, el texto de la publicación, los aprendizajes y el
 * proveedor de video; nunca importa de otro módulo.
 */
export const reelsModule: ServerModule = {
  id: 'reels',
  router: reelsRouter,
  onStart: resumeReels,
};
