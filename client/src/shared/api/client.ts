export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  json?: unknown;
  formData?: FormData;
  signal?: AbortSignal;
}

/** Cliente tipado para el backend. Las credenciales nunca pasan por aquí salvo al guardarlas. */
export async function api<T>(
  path: string,
  { method = 'GET', json, formData, signal }: RequestOptions = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      signal,
      headers: json === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: formData ?? (json === undefined ? undefined : JSON.stringify(json)),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError(
      'No hay conexión con el servidor. Verifica que esté en ejecución.',
      0,
      'NETWORK',
    );
  }

  const body: unknown = response.status === 204 ? null : await response.json().catch(() => null);

  if (!response.ok) {
    const error = (body as { error?: { message?: string; code?: string } } | null)?.error;
    throw new ApiError(
      error?.message ?? `Error ${response.status} del servidor.`,
      response.status,
      error?.code ?? 'UNKNOWN',
    );
  }
  return body as T;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Ocurrió un error inesperado.';
}
