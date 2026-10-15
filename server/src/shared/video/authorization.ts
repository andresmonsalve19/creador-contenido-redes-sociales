import { AppError } from '../http/errors.js';
import { getVideoProvider, listAvatars } from './index.js';
import type { VideoAvatar } from './types.js';
import { requiresAuthorization, type VideoSettings } from './videoSettings.schema.js';

/**
 * Comprueba con el proveedor el tipo real de cada avatar y bloquea los que representan a una
 * persona real (digital twin o photo avatar) sin autorización escrita registrada.
 * Se valida en el servidor, no solo en la interfaz.
 */
export async function assertAvatarsAuthorized(
  avatarIds: readonly string[],
  authorizations: VideoSettings['authorizations'],
): Promise<VideoAvatar[]> {
  const provider = getVideoProvider();
  const unique = [...new Set(avatarIds)];
  // El listado (en caché) dice si el avatar es propio o de stock. Si no aparece en él, se consulta
  // el tipo y, por seguridad, se trata como propio.
  const known = new Map((await listAvatars()).map((avatar) => [avatar.id, avatar]));
  const avatars = await Promise.all(
    unique.map(async (id) => known.get(id) ?? provider.getAvatar(id)),
  );

  const blocked = avatars.filter(
    (avatar) => requiresAuthorization(avatar.type, avatar.ownership) && !authorizations[avatar.id],
  );
  if (blocked.length > 0) {
    throw new AppError(
      403,
      `Falta la autorización de imagen para: ${blocked.map((a) => a.name).join(', ')}. Regístrala en Actualizar marca → Video.`,
      'AVATAR_NOT_AUTHORIZED',
    );
  }
  return avatars;
}
