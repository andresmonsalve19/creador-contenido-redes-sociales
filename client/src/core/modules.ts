import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import { IMAGE_FLOW_STEPS } from '../modules/images/meta';
import { IMAGE_EDIT_STEPS } from '../modules/imageEdit/meta';
import { REEL_FLOW_STEPS } from '../modules/reels/meta';

export interface ClientModule {
  id: string;
  /** Segmento de la URL: /crear/<path>. */
  path: string;
  label: string;
  description: string;
  enabled: boolean;
  /** Pasos del flujo, empezando por "Tipo de publicación". */
  steps: readonly string[];
  Page: LazyExoticComponent<ComponentType>;
}

/**
 * Tipos de publicación disponibles en el paso 1 de "Crear contenido".
 * Para agregar uno nuevo: crea src/modules/<id>/index.ts con un export default de su página
 * y regístralo aquí. Cada módulo se carga por separado (code-splitting).
 */
export const clientModules: readonly ClientModule[] = [
  {
    id: 'images',
    path: 'imagenes',
    label: 'Post en el feed',
    description: 'Una imagen o un carrusel de imágenes.',
    enabled: true,
    steps: IMAGE_FLOW_STEPS,
    Page: lazy(() => import('../modules/images')),
  },
  {
    id: 'imageEdit',
    path: 'editar-imagen',
    label: 'Editar una imagen tuya',
    description: 'Sube una foto o imagen y dile a la IA qué cambiar, con tu marca.',
    enabled: true,
    steps: IMAGE_EDIT_STEPS,
    Page: lazy(() => import('../modules/imageEdit')),
  },
  {
    id: 'reels',
    path: 'reels',
    label: 'Reel',
    description: 'Video corto con avatar (requiere HeyGen).',
    enabled: true,
    steps: REEL_FLOW_STEPS,
    Page: lazy(() => import('../modules/reels')),
  },
];
