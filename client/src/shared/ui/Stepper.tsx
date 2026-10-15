import styles from './Stepper.module.css';

interface StepperProps {
  steps: readonly string[];
  current: number;
  /** Permite volver a un paso ya completado. */
  onSelect?: (index: number) => void;
  /** Permite ir también a los pasos siguientes (p. ej. al editar una configuración ya completa). */
  freeNavigation?: boolean;
}

export function Stepper({ steps, current, onSelect, freeNavigation = false }: StepperProps) {
  return (
    <nav aria-label="Progreso" className={styles.stepper}>
      <ol className={styles.list}>
        {steps.map((label, index) => {
          const state = index < current ? 'done' : index === current ? 'current' : 'todo';
          const content = (
            <>
              <span className={styles.number} aria-hidden="true">
                {index + 1}
              </span>
              <span className={styles.label}>{label}</span>
            </>
          );
          return (
            <li key={label} className={styles.item} data-state={state}>
              {(state === 'done' || (freeNavigation && state === 'todo')) && onSelect ? (
                <button type="button" className={styles.step} onClick={() => onSelect(index)}>
                  {content}
                  <span className="visually-hidden">
                    {state === 'done' ? '(completado, volver a este paso)' : '(ir a este paso)'}
                  </span>
                </button>
              ) : (
                <span
                  className={styles.step}
                  aria-current={state === 'current' ? 'step' : undefined}
                >
                  {content}
                </span>
              )}
            </li>
          );
        })}
      </ol>
      <p className={styles.mobileLabel} aria-hidden="true">
        Paso {current + 1} de {steps.length}: {steps[current]}
      </p>
    </nav>
  );
}
