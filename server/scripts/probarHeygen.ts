/**
 * Verifica la conexión con HeyGen sin gastar saldo: solo lista avatares (lectura).
 * Uso: npm run probar:heygen
 * Lee HEYGEN_API_KEY del archivo .env y nunca la imprime.
 */
import { readSecret } from '../src/shared/config/env.js';
import { VideoProviderError } from '../src/shared/video/errors.js';
import { createVideoProvider } from '../src/shared/video/index.js';

const apiKey = readSecret('HEYGEN_API_KEY');
if (!apiKey) {
  console.error('Falta HEYGEN_API_KEY en el archivo .env (o configúrala desde la app).');
  process.exit(1);
}

try {
  const avatars = await createVideoProvider('heygen', apiKey).listAvatars();
  const own = avatars.filter((avatar) => avatar.ownership === 'private').length;
  console.log(`Conexión correcta con HeyGen: ${avatars.length} avatares (${own} de tu cuenta).`);
  for (const avatar of avatars.slice(0, 5)) {
    console.log(
      `- ${avatar.name} · ${avatar.type} · ${avatar.ownership === 'public' ? 'stock' : 'propio'}`,
    );
  }
} catch (error) {
  const detail =
    error instanceof VideoProviderError
      ? `${error.details.codigo}: ${error.details.mensaje}`
      : error instanceof Error
        ? error.message
        : 'error desconocido';
  console.error(`No se pudo conectar con HeyGen (${detail}).`);
  process.exit(1);
}
