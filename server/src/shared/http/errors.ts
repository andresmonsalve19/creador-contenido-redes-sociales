/** Error con un mensaje apto para mostrar al usuario y su código HTTP. */
export class AppError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code = 'APP_ERROR',
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (message: string) => new AppError(400, message, 'BAD_REQUEST');
export const notReady = (message: string) => new AppError(409, message, 'NOT_READY');
