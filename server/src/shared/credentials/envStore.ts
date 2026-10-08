import { promises as fs } from 'node:fs';
import { ENV_FILE } from '../config/paths.js';

const LINE_KEY = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/;

function serialize(value: string): string {
  return /[\s#"'=]/.test(value) ? JSON.stringify(value) : value;
}

/**
 * Crea o actualiza variables en .env preservando el resto del archivo,
 * y las aplica al proceso actual para no tener que reiniciar el servidor.
 */
export async function upsertEnv(values: Record<string, string>): Promise<void> {
  let content = '';
  try {
    content = await fs.readFile(ENV_FILE, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }

  const pending = new Map(Object.entries(values));
  const lines = content.length > 0 ? content.split(/\r?\n/) : [];

  const updated = lines.map((line) => {
    const key = LINE_KEY.exec(line)?.[1];
    if (!key || !pending.has(key)) return line;
    const next = `${key}=${serialize(pending.get(key) ?? '')}`;
    pending.delete(key);
    return next;
  });

  while (updated.length > 0 && updated.at(-1) === '') updated.pop();
  for (const [key, value] of pending) updated.push(`${key}=${serialize(value)}`);

  await fs.writeFile(ENV_FILE, `${updated.join('\n')}\n`, { encoding: 'utf8', mode: 0o600 });

  for (const [key, value] of Object.entries(values)) process.env[key] = value;
}
