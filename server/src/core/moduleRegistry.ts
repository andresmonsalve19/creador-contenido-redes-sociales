import { imagesModule } from '../modules/images/index.js';
import type { ServerModule } from '../shared/http/serverModule.js';

/**
 * Módulos de funcionalidad activos. Para agregar uno nuevo, crea modules/<id>/index.ts
 * y regístralo aquí (p. ej. reelsModule cuando esté implementado).
 */
export const serverModules: ServerModule[] = [imagesModule];
