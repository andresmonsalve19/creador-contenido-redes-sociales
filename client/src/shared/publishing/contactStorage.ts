import { CONTACT_FIELDS, EMPTY_CONTACT, type Contact } from './contact';

// Se conserva la clave original para no perder el contacto ya guardado; la comparten todos los módulos.
const STORAGE_KEY = 'images.contact';

const text = (value: unknown) => (typeof value === 'string' ? value : '');

/** Último contacto que el usuario usó al crear una publicación; vacío si nunca lo ha escrito. */
export function loadContact(): Contact {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Record<
      string,
      unknown
    > | null;
    const excluded = Array.isArray(saved?.excluded)
      ? CONTACT_FIELDS.filter((field) => (saved.excluded as unknown[]).includes(field))
      : [];
    return {
      email: text(saved?.email),
      website: text(saved?.website),
      whatsapp: text(saved?.whatsapp),
      excluded,
    };
  } catch {
    return EMPTY_CONTACT;
  }
}

/** Recuerda el contacto (y qué datos se excluyeron) para precargarlo en las próximas publicaciones. */
export function saveContact(contact: Contact): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(contact));
  } catch {
    // Sin almacenamiento disponible (p. ej. navegación privada): solo no se recuerda.
  }
}
