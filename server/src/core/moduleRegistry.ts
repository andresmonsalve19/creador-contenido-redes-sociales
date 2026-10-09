import { imagesModule } from '../modules/images/index.js';
import { reelsModule } from '../modules/reels/index.js';
import type { ServerModule } from '../shared/http/serverModule.js';

/**
 * Módulos de funcionalidad activos. Para agregar uno nuevo, crea modules/<id>/index.ts
 * y regístralo aquí.
 */
export const serverModules: ServerModule[] = [imagesModule, reelsModule];
