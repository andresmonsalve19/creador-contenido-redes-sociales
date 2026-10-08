import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { errorMessage } from '../api/client';
import { useBrandContext, useSetupStatus } from '../hooks/useSetupStatus';
import { Alert } from '../ui/Alert';
import { Page, Section } from '../ui/Page';
import { Spinner } from '../ui/Spinner';
import { Stepper } from '../ui/Stepper';
import { BrandForm } from './BrandForm';
import { CredentialsForm } from './CredentialsForm';

const STEPS = ['Credenciales', 'Marca'] as const;

export default function SetupPage() {
  const navigate = useNavigate();
  const status = useSetupStatus();
  const brand = useBrandContext();
  const [chosenStep, setChosenStep] = useState<number | null>(null);

  if (status.isPending) return <Spinner label="Cargando configuración" />;
  if (status.isError) {
    return (
      <Page title="Configuración">
        <Alert>{errorMessage(status.error)}</Alert>
      </Page>
    );
  }

  const credentialsReady = status.data.credentials.every((c) => c.configured);
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
      <Stepper steps={STEPS} current={step} onSelect={setChosenStep} />

      {step === 0 ? (
        <Section
          title="Conecta la IA"
          description="Usaremos estas credenciales para generar los textos y las imágenes."
        >
          <CredentialsForm credentials={status.data.credentials} onDone={() => setChosenStep(1)} />
        </Section>
      ) : (
        <Section
          title="Carga tu marca"
          description="Con estos archivos cada pieza respeta lo que hace tu empresa, sus colores, su tipografía y su logo."
        >
          {brand.isPending ? (
            <Spinner label="Cargando archivos de marca" />
          ) : (
            <BrandForm current={brand.data} onDone={() => navigate('/')} />
          )}
        </Section>
      )}
    </Page>
  );
}
