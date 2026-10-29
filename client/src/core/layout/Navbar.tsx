import { useEffect, useId, useRef, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useSetupStatus } from '../../shared/hooks/useSetupStatus';
import styles from './Navbar.module.css';

const LINKS = [
  { to: '/', label: 'Inicio', end: true },
  { to: '/crear', label: 'Crear contenido', end: false },
  { to: '/biblioteca', label: 'Mis contenidos', end: false },
] as const;

export function Navbar() {
  const { data } = useSetupStatus();
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);

  // Escape cierra el menú móvil y devuelve el foco al botón.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      toggleRef.current?.focus();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  const ready = data?.ready ?? false;
  const close = () => setOpen(false);

  return (
    <header className={styles.header}>
      <div className={styles.bar}>
        <Link to={ready ? '/' : '/setup'} className={styles.brand} onClick={close}>
          <span className={styles.mark} aria-hidden="true" />
          Creador de contenido
        </Link>

        {ready && (
          <>
            <button
              ref={toggleRef}
              type="button"
              className={styles.toggle}
              aria-expanded={open}
              aria-controls={menuId}
              onClick={() => setOpen((value) => !value)}
            >
              <span className={styles.burger} data-open={open || undefined} aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
              <span className="visually-hidden">{open ? 'Cerrar menú' : 'Abrir menú'}</span>
            </button>

            <nav
              id={menuId}
              className={styles.nav}
              data-open={open || undefined}
              aria-label="Principal"
            >
              <ul className={styles.links}>
                {LINKS.map((link) => (
                  <li key={link.to}>
                    <NavLink to={link.to} end={link.end} className={styles.link} onClick={close}>
                      {link.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </nav>
          </>
        )}
      </div>
    </header>
  );
}
