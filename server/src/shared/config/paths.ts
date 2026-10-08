import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Este archivo vive en server/(src|dist)/shared/config, por eso subimos cuatro niveles.
const here = path.dirname(fileURLToPath(import.meta.url));

export const SERVER_ROOT = path.resolve(here, '../../..');
export const PROJECT_ROOT = path.resolve(SERVER_ROOT, '..');
export const ENV_FILE = path.join(PROJECT_ROOT, '.env');
export const DATA_DIR = path.join(SERVER_ROOT, 'data');
export const CLIENT_DIST = path.join(PROJECT_ROOT, 'client', 'dist');
