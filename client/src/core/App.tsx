import { lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './layout/AppLayout';
import { RequireSetup } from './layout/RequireSetup';
import { ModuleRoute } from './pages/ModuleRoute';

const SetupPage = lazy(() => import('../shared/setup/SetupPage'));
const HomePage = lazy(() => import('./pages/HomePage'));
const CreatePage = lazy(() => import('./pages/CreatePage'));

export function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="setup" element={<SetupPage />} />
        <Route element={<RequireSetup />}>
          <Route index element={<HomePage />} />
          <Route path="crear" element={<CreatePage />} />
          <Route path="crear/:modulePath" element={<ModuleRoute />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
