import type { ProviderId } from '../ai/providers/types.js';

export interface CredentialDefinition {
  /** Nombre de la variable en .env (debe existir también en .env.example). */
  key: string;
  label: string;
  description: string;
  helpUrl: string;
  provider: ProviderId;
}

/**
 * Credenciales que la app necesita. Para soportar otro proveedor, agrega su entrada aquí
 * y su implementación en shared/ai/providers.
 */
export const CREDENTIALS: readonly CredentialDefinition[] = [
  {
    key: 'GEMINI_API_KEY',
    label: 'API key de Google Gemini',
    description: 'Da acceso a los modelos de texto e imagen de Gemini.',
    helpUrl: 'https://aistudio.google.com/apikey',
    provider: 'gemini',
  },
];
