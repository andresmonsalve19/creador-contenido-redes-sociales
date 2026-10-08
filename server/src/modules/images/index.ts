import type { ServerModule } from '../../shared/http/serverModule.js';
import { imagesRouter } from './images.routes.js';

export const imagesModule: ServerModule = {
  id: 'images',
  router: imagesRouter,
};
