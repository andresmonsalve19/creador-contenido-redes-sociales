import type { ReactNode } from 'react';
import { Button } from '../ui/Button';
import { TextField } from '../ui/TextField';
import { EMPTY_CONTACT, validateContact, type Contact, type ContactField } from './contact';
import styles from './PublishingFields.module.css';

interface ContactFieldsProps {
  value: Contact;
  onChange: (value: Contact) => void;
  /** Dónde aparecen los datos de contacto en este formato. */
  note: ReactNode;
}

const FIELDS: {
  key: ContactField;
  label: string;
  type: string;
  inputMode: 'email' | 'url' | 'tel';
  placeholder: string;
}[] = [
  {
    key: 'email',
    label: 'Correo electrónico',
    type: 'email',
    inputMode: 'email',
    placeholder: 'contacto@empresa-ejemplo.com',
  },
  {
    key: 'website',
    label: 'Sitio web',
    type: 'text',
    inputMode: 'url',
    placeholder: 'www.empresa-ejemplo.com',
  },
  {
    key: 'whatsapp',
    label: 'WhatsApp',
    type: 'tel',
    inputMode: 'tel',
    placeholder: '+57 300 000 0000',
  },
];

/**
 * Correo, sitio web y WhatsApp de la publicación. Cada dato tiene una casilla "Incluir": los
 * desmarcados (o vacíos) no salen, pero siguen guardados para las próximas publicaciones.
 */
export function ContactFields({ value, onChange, note }: ContactFieldsProps) {
  const errors = validateContact(value);
  const toggle = (key: ContactField, include: boolean) =>
    onChange({
      ...value,
      excluded: include
        ? value.excluded.filter((field) => field !== key)
        : [...new Set([...value.excluded, key])],
    });

  return (
    <div className={styles.group}>
      <h3>Datos de contacto</h3>
      <div className={styles.contactFields}>
        {FIELDS.map((field) => {
          const filled = Boolean(value[field.key].trim());
          return (
            <div key={field.key} className={styles.contactField}>
              <TextField
                label={field.label}
                type={field.type}
                inputMode={field.inputMode}
                autoComplete="off"
                placeholder={field.placeholder}
                value={value[field.key]}
                onChange={(event) => onChange({ ...value, [field.key]: event.target.value })}
                error={errors[field.key]}
              />
              <label className={styles.include}>
                <input
                  type="checkbox"
                  checked={filled && !value.excluded.includes(field.key)}
                  disabled={!filled}
                  onChange={(event) => toggle(field.key, event.target.checked)}
                />
                Incluir en esta publicación
              </label>
            </div>
          );
        })}
      </div>
      <div className={styles.inlineAction}>
        <Button
          variant="ghost"
          onClick={() => onChange(EMPTY_CONTACT)}
          disabled={!value.email && !value.website && !value.whatsapp}
        >
          Vaciar campos
        </Button>
      </div>
      <p className={styles.fine}>{note}</p>
    </div>
  );
}
