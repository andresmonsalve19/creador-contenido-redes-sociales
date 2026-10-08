import type { ReactNode } from 'react';
import styles from './Page.module.css';

interface PageProps {
  title: string;
  lead?: ReactNode;
  width?: 'content' | 'wide';
  children: ReactNode;
}

/** Estructura común de página: encabezado centrado y contenido en columna. */
export function Page({ title, lead, width = 'content', children }: PageProps) {
  return (
    <div className={`${styles.page} ${styles[width]}`}>
      <header className={styles.header}>
        <h1>{title}</h1>
        {lead && <p className={styles.lead}>{lead}</p>}
      </header>
      {children}
    </div>
  );
}

/** Bloque de contenido con título opcional, separado visualmente del resto. */
export function Section({
  title,
  description,
  wide = false,
  children,
}: {
  title?: string;
  description?: ReactNode;
  /** Más ancho que el de lectura, para contenido en dos columnas. */
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <section className={`${styles.section} ${wide ? styles.sectionWide : styles.sectionNarrow}`}>
      {(title || description) && (
        <div className={styles.sectionHeader}>
          {title && <h2 className={styles.sectionTitle}>{title}</h2>}
          {description && <p className={styles.sectionDescription}>{description}</p>}
        </div>
      )}
      {children}
    </section>
  );
}
