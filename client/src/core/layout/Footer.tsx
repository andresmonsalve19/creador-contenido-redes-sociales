import styles from './Footer.module.css';

export function Footer() {
  return (
    <footer className={styles.footer}>
      <p>© {new Date().getFullYear()} Creador de contenido. Todos los derechos reservados.</p>
    </footer>
  );
}
