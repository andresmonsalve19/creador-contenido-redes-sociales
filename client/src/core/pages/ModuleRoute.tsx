import { Navigate, useParams } from 'react-router-dom';
import { clientModules } from '../modules';

/** Carga la página del módulo elegido en el paso 1 (solo si está habilitado). */
export function ModuleRoute() {
  const { modulePath } = useParams();
  const module = clientModules.find((m) => m.path === modulePath && m.enabled);
  if (!module) return <Navigate to="/crear" replace />;
  return <module.Page />;
}
