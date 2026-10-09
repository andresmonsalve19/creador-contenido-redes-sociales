import type { Router } from 'express';

/** Contrato de un módulo de funcionalidad del servidor. */
export interface ServerModule {
  /** Se monta en /api/<id>. Cada módulo parsea su propio body según lo que necesite. */
  id: string;
  router: Router;
  /** Tareas al arrancar el servidor (p. ej. retomar trabajos en segundo plano). */
  onStart?: () => Promise<void>;
}
