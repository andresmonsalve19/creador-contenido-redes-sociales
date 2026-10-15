export type ContactField = 'email' | 'website' | 'whatsapp';
export const CONTACT_FIELDS: readonly ContactField[] = ['email', 'website', 'whatsapp'];

/** Lo que recibe el servidor: un dato vacío no se incluye en ninguna parte. */
export interface ContactValues {
  email: string;
  website: string;
  whatsapp: string;
}

/** Contacto guardado: los tres datos y cuáles no salen en esta publicación. */
export interface Contact extends ContactValues {
  /** Datos que no se incluyen en esta publicación (siguen guardados para las próximas). */
  excluded: ContactField[];
}

export const EMPTY_CONTACT: Contact = { email: '', website: '', whatsapp: '', excluded: [] };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Número con indicativo: dígitos, espacios, guiones, paréntesis y un "+" inicial; 7 a 15 dígitos. */
const isPhone = (value: string) => {
  const digits = value.replace(/\D/g, '');
  return /^\+?[\d\s().-]+$/.test(value) && digits.length >= 7 && digits.length <= 15;
};

export function validateContact({ email, website, whatsapp }: ContactValues) {
  return {
    email: email.trim() && !EMAIL.test(email.trim()) ? 'Escribe un correo válido.' : null,
    website: /\s/.test(website.trim()) ? 'El sitio web no puede tener espacios.' : null,
    whatsapp:
      whatsapp.trim() && !isPhone(whatsapp.trim())
        ? 'Escribe el número con indicativo, por ejemplo +57 300 000 0000.'
        : null,
  };
}

/** Datos que salen en la publicación: los marcados y con valor, sin espacios sobrantes. */
export const trimContact = (contact: Contact): ContactValues => ({
  email: contact.excluded.includes('email') ? '' : contact.email.trim(),
  website: contact.excluded.includes('website') ? '' : contact.website.trim(),
  whatsapp: contact.excluded.includes('whatsapp') ? '' : contact.whatsapp.trim(),
});

/**
 * Contacto a partir de lo que se usó en una publicación (p. ej. al duplicar un video): conserva
 * los datos guardados y deja excluidos los que esa publicación no llevaba.
 */
export function contactFromValues(values: Partial<ContactValues>, saved: Contact): Contact {
  const excluded = CONTACT_FIELDS.filter((field) => !values[field]);
  return {
    email: values.email || saved.email,
    website: values.website || saved.website,
    whatsapp: values.whatsapp || saved.whatsapp,
    excluded,
  };
}
