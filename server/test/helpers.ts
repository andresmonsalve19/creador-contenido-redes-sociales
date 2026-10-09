import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Lee un fixture de HeyGen (datos ficticios, nunca respuestas reales). */
export function fixture(name: string): unknown {
  return JSON.parse(readFileSync(path.join(here, 'fixtures', 'heygen', name), 'utf8'));
}

export const jsonResponse = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });

export interface RecordedCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

/**
 * fetch simulado: responde según la ruta y guarda cada llamada para revisarla.
 * Nunca sale a la red.
 */
export function mockFetch(route: (url: URL, init: RequestInit) => Response | Promise<Response>) {
  const calls: RecordedCall[] = [];
  const fetchImpl = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(String(input));
    const headers = Object.fromEntries(
      Object.entries((init.headers ?? {}) as Record<string, string>).map(([k, v]) => [
        k.toLowerCase(),
        v,
      ]),
    );
    const body =
      typeof init.body === 'string' ? (JSON.parse(init.body) as unknown) : (init.body ?? null);
    calls.push({ url: url.toString(), method: init.method ?? 'GET', headers, body });
    return route(url, init);
  }) as typeof fetch;
  return { fetchImpl, calls };
}
