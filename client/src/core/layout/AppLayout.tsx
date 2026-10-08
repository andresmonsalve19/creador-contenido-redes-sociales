import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { Spinner } from '../../shared/ui/Spinner';
import { Footer } from './Footer';
import { Navbar } from './Navbar';
import styles from './AppLayout.module.css';

export function AppLayout() {
  return (
    <>
      <a href="#contenido" className={styles.skip}>
        Saltar al contenido
      </a>
      <Navbar />
      <main id="contenido" className={styles.main}>
        <Suspense
          fallback={
            <div className={styles.loading}>
              <Spinner label="Cargando" />
            </div>
          }
        >
          <Outlet />
        </Suspense>
      </main>
      <Footer />
    </>
  );
}
