import { errorMessage } from '../../../shared/api/client';
import { Alert } from '../../../shared/ui/Alert';
import { Select } from '../../../shared/ui/Select';
import { Spinner } from '../../../shared/ui/Spinner';
import { useBrandKits } from '../../../shared/video/useVideo';
import styles from '../reels.module.css';

const NONE = '__none__';

interface BrandKitFieldProps {
  value: string | null;
  onChange: (id: string | null) => void;
}

/** Kit de marca de HeyGen: colores, fuentes y logo que el agente aplica al video. */
export function BrandKitField({ value, onChange }: BrandKitFieldProps) {
  const kits = useBrandKits();
  if (kits.isPending) return <Spinner label="Cargando kits de marca de HeyGen" />;
  if (kits.isError) return <Alert>{errorMessage(kits.error)}</Alert>;

  const selected = kits.data.find((kit) => kit.id === value);
  // El kit de ejemplo de HeyGen trae otros colores y otro logo.
  const isDemo = selected ? /demo/i.test(selected.name) : false;

  return (
    <div className={styles.group}>
      <Select
        label="Kit de marca de HeyGen"
        options={[
          { value: NONE, label: 'Sin kit (logo y paleta desde los archivos de la marca)' },
          ...kits.data.map((kit) => ({ value: kit.id, label: kit.name })),
        ]}
        value={value ?? NONE}
        onChange={(id) => onChange(id === NONE ? null : id)}
        details="El agente aplica los colores, fuentes y logo del kit. Sin kit, se adjunta tu logo real y la paleta va en el estilo del guion."
      />
      {selected && selected.colors.length > 0 && (
        <p className={styles.fine}>Colores del kit: {selected.colors.join(' · ')}</p>
      )}
      {isDemo && (
        <Alert>
          "{selected?.name}" parece ser el kit de ejemplo de HeyGen, no el de tu marca: el video
          saldría con otros colores y otro logo. Crea el de tu marca en Actualizar marca → Video
          ("Crear kit de marca desde tu sitio web") o elige "Sin kit".
        </Alert>
      )}
    </div>
  );
}
