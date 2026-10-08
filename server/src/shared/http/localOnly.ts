import type { RequestHandler } from 'express';
import { AppError } from './errors.js';

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/** Solo permite peticiones desde la misma máquina (p. ej. para escribir credenciales). */
export const localOnly: RequestHandler = (req, _res, next) => {
  if (LOOPBACK.has(req.socket.remoteAddress ?? '')) return next();
  next(
    new AppError(
      403,
      'Esta acción solo está permitida desde el equipo donde corre el servidor.',
      'FORBIDDEN',
    ),
  );
};
