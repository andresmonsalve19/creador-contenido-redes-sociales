import type { ErrorRequestHandler, RequestHandler } from 'express';
import { MulterError } from 'multer';
import { AppError } from '../../shared/http/errors.js';

export const notFound: RequestHandler = (_req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Ruta no encontrada.' } });
};

export const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
  if (error instanceof AppError) {
    res.status(error.status).json({ error: { code: error.code, message: error.message } });
    return;
  }
  if (error instanceof MulterError) {
    const message =
      error.code === 'LIMIT_FILE_SIZE' ? 'El archivo supera el tamaño permitido.' : error.message;
    res.status(400).json({ error: { code: error.code, message } });
    return;
  }
  const status = (error as { status?: number }).status;
  if (status === 413) {
    res
      .status(413)
      .json({ error: { code: 'TOO_LARGE', message: 'La petición es demasiado grande.' } });
    return;
  }
  if (status === 400) {
    res
      .status(400)
      .json({ error: { code: 'BAD_REQUEST', message: 'La petición no es un JSON válido.' } });
    return;
  }

  console.error(error);
  res
    .status(500)
    .json({ error: { code: 'INTERNAL', message: 'Ocurrió un error inesperado en el servidor.' } });
};
