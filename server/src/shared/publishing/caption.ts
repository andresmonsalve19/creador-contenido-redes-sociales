import type { Contact } from './contact.js';

const toHashtag = (tag: string) => {
  const clean = tag.replace(/[\s#]+/g, '');
  return clean ? `#${clean}` : '';
};

/**
 * Arma el texto final: cuerpo, datos de contacto y hashtags al final.
 * El contacto se agrega aquí (no lo escribe el modelo) para que siempre sea exacto y esté antes de los hashtags.
 */
export function assembleCaption(body: string, hashtags: string[], contact: Contact): string {
  const contactLines = [
    contact.email && `📩 ${contact.email}`,
    contact.website && `🌐 ${contact.website}`,
  ].filter(Boolean);

  const tags = [...new Set(hashtags.map(toHashtag).filter(Boolean))].join(' ');

  return [body.trim(), contactLines.join('\n'), tags].filter(Boolean).join('\n\n');
}
