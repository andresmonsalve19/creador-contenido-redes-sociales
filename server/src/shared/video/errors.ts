import { AppError } from '../http/errors.js';
import type { VideoProviderId } from './types.js';

/** Forma normalizada de cualquier error de un proveedor de video. */
export interface VideoErrorDetails {
  proveedor: VideoProviderId;
  codigo: string;
  mensaje: string;
  /** true solo si repetir la misma petición puede funcionar (límite de tasa, caída temporal). */
  reintentable: boolean;
}

/**
 * Error de un proveedor de video. Nunca incluye la API key, las cabeceras ni el cuerpo de la
 * petición: solo el código y el mensaje que devolvió el proveedor.
 */
export class VideoProviderError extends AppError {
  readonly details: VideoErrorDetails;
  /** Segundos que pidió esperar el proveedor antes de reintentar (cabecera Retry-After). */
  readonly retryAfterSeconds: number | null;

  constructor(status: number, details: VideoErrorDetails, retryAfterSeconds: number | null = null) {
    super(status, details.mensaje, `VIDEO_${details.codigo.toUpperCase()}`);
    this.name = 'VideoProviderError';
    this.details = details;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export const isRetryable = (error: unknown): boolean =>
  error instanceof VideoProviderError && error.details.reintentable;
