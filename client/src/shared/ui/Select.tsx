import { useId, type ReactNode } from 'react';
import styles from './Select.module.css';

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  label: string;
  options: readonly SelectOption[];
  value: string;
  onChange: (value: string) => void;
  /** Texto de ayuda que se muestra debajo. */
  details?: ReactNode;
}

/** Desplegable nativo: accesible por teclado y con el selector del sistema en móvil. */
export function Select({ label, options, value, onChange, details }: SelectProps) {
  const id = useId();
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <div className={styles.control}>
        <select
          id={id}
          className={styles.select}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-describedby={details ? `${id}-details` : undefined}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      {details && (
        <div id={`${id}-details`} className={styles.details}>
          {details}
        </div>
      )}
    </div>
  );
}
