import { Navigate, Outlet } from 'react-router-dom';
import { errorMessage } from '../../shared/api/client';
import { useSetupStatus } from '../../shared/hooks/useSetupStatus';
import { Alert } from '../../shared/ui/Alert';
import { Page } from '../../shared/ui/Page';
import { Spinner } from '../../shared/ui/Spinner';

/** Mientras falten credenciales o archivos de marca, todo redirige a la configuración. */
export function RequireSetup() {
  const status = useSetupStatus();

  if (status.isPending) return <Spinner label="Cargando" />;
  if (status.isError) {
    return (
      <Page title="Sin conexión">
        <Alert>{errorMessage(status.error)}</Alert>
      </Page>
    );
  }
  if (!status.data.ready) return <Navigate to="/setup" replace />;
  return <Outlet />;
}
