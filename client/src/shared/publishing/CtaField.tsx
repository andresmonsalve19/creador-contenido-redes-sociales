import type { ReactNode } from 'react';
import { Select } from '../ui/Select';
import { TextField } from '../ui/TextField';
import { CTA_OPTIONS, CUSTOM_CTA, type CtaChoice } from './cta';
import styles from './PublishingFields.module.css';

const CTA_SELECT_OPTIONS = [
  ...CTA_OPTIONS.map((option) => ({ value: option, label: option })),
  { value: CUSTOM_CTA, label: 'Otro (escribir el mío)…' },
];

interface CtaFieldProps {
  value: CtaChoice;
  onChange: (value: CtaChoice) => void;
  /** Dónde se usa el llamado a la acción en este formato. */
  details: ReactNode;
}

/** Llamado a la acción: una opción de la lista o una frase propia. */
export function CtaField({ value, onChange, details }: CtaFieldProps) {
  return (
    <div className={`${styles.group} ${styles.narrow}`}>
      <h3>Llamado a la acción</h3>
      <Select
        label="¿Qué quieres que haga tu audiencia?"
        options={CTA_SELECT_OPTIONS}
        value={value.choice}
        onChange={(choice) => onChange({ ...value, choice })}
        details={details}
      />
      {value.choice === CUSTOM_CTA && (
        <TextField
          label="Tu llamado a la acción"
          value={value.custom}
          onChange={(event) => onChange({ ...value, custom: event.target.value })}
          maxLength={80}
          placeholder="Ej.: Agenda tu cita hoy"
          error={value.custom.trim().length < 2 ? 'Escribe el llamado a la acción.' : null}
        />
      )}
    </div>
  );
}
