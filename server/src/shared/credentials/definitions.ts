import { createProvider } from '../ai/providers/index.js';
import { createVideoProvider } from '../video/index.js';

export interface CredentialDefinition {
  /** Nombre de la variable en .env (debe existir también en .env.example). */
  key: string;
  label: string;
  description: string;
  helpUrl: string;
  /** Si es opcional, la app funciona sin ella y solo se deshabilita lo que la necesita. */
  optional: boolean;
  /** Llamada de solo lectura al proveedor para confirmar que la key es válida. */
  validate: (apiKey: string) => Promise<void>;
}

/**
 * Credenciales que la app necesita. Para soportar otro proveedor, agrega su entrada aquí
 * y su implementación en shared/ai/providers o shared/video.
 */
export const CREDENTIALS: readonly CredentialDefinition[] = [
  {
    key: 'GEMINI_API_KEY',
    label: 'API key de Google Gemini',
    description: 'Da acceso a los modelos de texto e imagen de Gemini.',
    helpUrl: 'https://aistudio.google.com/apikey',
    optional: false,
    validate: (apiKey) => createProvider('gemini', apiKey).validateKey(),
  },
  {
    key: 'HEYGEN_API_KEY',
    label: 'API key de HeyGen',
    description: 'Opcional. Habilita la creación de reels con avatar.',
    helpUrl: 'https://app.heygen.com/developers/api',
    optional: true,
    validate: (apiKey) => createVideoProvider('heygen', apiKey).validateKey(),
  },
];
