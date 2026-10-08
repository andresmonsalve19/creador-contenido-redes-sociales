import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Actions, Button } from '../../shared/ui/Button';
import { ChoiceGroup } from '../../shared/ui/ChoiceGroup';
import { Page } from '../../shared/ui/Page';
import { Stepper } from '../../shared/ui/Stepper';
import { clientModules } from '../modules';

const options = clientModules.map((module) => ({
  value: module.path,
  label: module.label,
  description: module.description,
  disabled: !module.enabled,
  badge: module.enabled ? undefined : 'Próximamente',
}));

/** Paso 1 común a todos los módulos: qué tipo de publicación se va a crear. */
export default function CreatePage() {
  const navigate = useNavigate();
  const [selected, setSelected] = useState<string | null>(
    () => clientModules.find((module) => module.enabled)?.path ?? null,
  );
  const steps = clientModules.find((module) => module.path === selected)?.steps ?? [
    'Tipo de publicación',
  ];

  return (
    <Page title="Crear contenido" lead="Empieza por el tipo de publicación que quieres hacer.">
      <Stepper steps={steps} current={0} />
      <ChoiceGroup
        legend="¿Qué quieres publicar?"
        options={options}
        value={selected}
        onChange={setSelected}
      />
      <Actions>
        <Button disabled={!selected} onClick={() => selected && navigate(`/crear/${selected}`)}>
          Continuar
        </Button>
      </Actions>
    </Page>
  );
}
