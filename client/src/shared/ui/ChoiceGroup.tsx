import { useId, type ReactNode } from 'react';
import styles from './ChoiceGroup.module.css';

export interface Choice<T extends string> {
  value: T;
  label: string;
  description?: ReactNode;
  /** Información a la derecha (precio) o debajo en tarjetas. */
  aside?: ReactNode;
  badge?: string;
  disabled?: boolean;
}

interface ChoiceGroupProps<T extends string> {
  legend: string;
  hideLegend?: boolean;
  options: readonly Choice<T>[];
  value: T | null;
  onChange: (value: T) => void;
  layout?: 'cards' | 'list';
}

/** Grupo de opciones exclusivas basado en radios nativos (teclado y lectores de pantalla incluidos). */
export function ChoiceGroup<T extends string>({
  legend,
  hideLegend = false,
  options,
  value,
  onChange,
  layout = 'cards',
}: ChoiceGroupProps<T>) {
  const name = useId();

  return (
    <fieldset className={styles.fieldset}>
      <legend className={hideLegend ? 'visually-hidden' : styles.legend}>{legend}</legend>
      <div className={styles[layout]}>
        {options.map((option) => (
          <label
            key={option.value}
            className={styles.option}
            data-disabled={option.disabled || undefined}
          >
            <input
              type="radio"
              className={styles.radio}
              name={name}
              value={option.value}
              checked={value === option.value}
              disabled={option.disabled}
              onChange={() => onChange(option.value)}
            />
            <span className={styles.body}>
              <span className={styles.title}>
                {option.label}
                {option.badge && <span className={styles.badge}>{option.badge}</span>}
              </span>
              {option.description && (
                <span className={styles.description}>{option.description}</span>
              )}
            </span>
            {option.aside && <span className={styles.aside}>{option.aside}</span>}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
