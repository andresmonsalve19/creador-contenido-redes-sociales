import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { errorMessage } from '../api/client';
import { useBrandContext, useSetupStatus } from '../hooks/useSetupStatus';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Page, Section } from '../ui/Page';
import { Spinner } from '../ui/Spinner';
import { Stepper } from '../ui/Stepper';
import { BrandForm } from './BrandForm';
import { CredentialsForm } from './CredentialsForm';
import { VideoSettingsForm } from './VideoSettingsForm';

const STEPS = ['Credenciales', 'Marca', 'Video'] as const;
const VIDEO_STEP = 2;
/** Permite abrir un paso concreto desde otra pantalla, p. ej. /setup?paso=credenciales. */
const STEP_PARAM: Record<string, number> = { credenciales: 0, marca: 1, video: VIDEO_STEP };

export default function SetupPage() {
  const navigate = useNavigate();
  const status = useSetupStatus();
  const brand = useBrandContext();
  const [searchParams] = useSearchParams();
  const [chosenStep, setChosenStep] = useState<number | null>(
    () => STEP_PARAM[searchParams.get('paso') ?? ''] ?? null,
  );

  if (status.isPending) return <Spinner label="Cargando configuración" />;
  if (status.isError) {
    return (
      <Page title="Configuración">
        <Alert>{errorMessage(status.error)}</Alert>
      </Page>
    );
  }

  const credentialsReady = status.data.credentials.every((c) => c.optional || c.configured);
  const videoConfigured = status.data.credentials.some(
    (c) => c.key === 'HEYGEN_API_KEY' && c.configured,
  );
  const step = chosenStep ?? (credentialsReady ? 1 : 0);

  return (
    <Page
      title={status.data.ready ? 'Tu marca' : 'Prepara tu estudio'}
      lead={
        status.data.ready
          ? 'Actualiza las credenciales o reemplaza los archivos de marca cuando lo necesites.'
          : 'Conecta tu proveedor de IA y carga la identidad de tu marca. Solo lo harás una vez.'
      }
    >
      {/* Con la marca lista se puede ir a cualquier paso, incluido "Video" (opcional). */}
      <Stepper
        steps={STEPS}
        current={step}
        onSelect={setChosenStep}
        freeNavigation={status.data.ready}
      />

      {step === 0 ? (
        <Section
          title="Conecta la IA"
          description="Usaremos estas credenciales para generar los textos y las imágenes."
        >
          <CredentialsForm credentials={status.data.credentials} onDone={() => setChosenStep(1)} />
        </Section>
      ) : step === 1 ? (
        <Section
          title="Carga tu marca"
          description="Con estos archivos cada pieza respeta lo que hace tu empresa, sus colores, su tipografía y su logo."
        >
          {brand.isPending ? (
            <Spinner label="Cargando archivos de marca" />
          ) : (
            <BrandForm
              current={brand.data}
              onDone={() => (videoConfigured ? setChosenStep(VIDEO_STEP) : navigate('/'))}
            />
          )}
        </Section>
      ) : (
        <Section
          title="Video"
          description="Opcional. Cómo serán los reels: avatar, voz, fondo, formato y autorizaciones de imagen."
        >
          {videoConfigured ? (
            <VideoSettingsForm onDone={() => navigate('/')} />
          ) : (
            <>
              <Alert tone="info">
                Configura HeyGen en el paso de credenciales para crear reels con avatar.
              </Alert>
              <Button variant="secondary" onClick={() => setChosenStep(0)}>
                Ir a credenciales
              </Button>
            </>
          )}
          <Button variant="ghost" onClick={() => navigate('/')}>
            {videoConfigured ? 'Omitir por ahora' : 'Volver al inicio'}
          </Button>
        </Section>
      )}
    </Page>
  );
}
