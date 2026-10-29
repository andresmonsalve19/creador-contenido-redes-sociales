import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { api, errorMessage } from '../api/client';
import { useBrandContext } from '../hooks/useSetupStatus';
import { Alert } from '../ui/Alert';
import { Actions, Button } from '../ui/Button';
import { FileDrop } from '../ui/FileDrop';
import { Select } from '../ui/Select';
import { Spinner } from '../ui/Spinner';
import { TextArea } from '../ui/TextArea';
import { TextField } from '../ui/TextField';
import {
  LOGO_POSITIONS,
  LOGO_SIZES,
  type LogoPlacement,
  type VideoSettingsResponse,
} from '../video/types';
import { useBrandKits, useVideoConfigured, useVideoSettings, videoKeys } from '../video/useVideo';
import { BrandKitCreator } from './BrandKitCreator';
import styles from './Setup.module.css';

type PartnerUsage = 'always' | 'closing';

interface Partner {
  id: string;
  name: string;
  usage: PartnerUsage;
  logoUrl: string;
}

interface Identity {
  slogans: string[];
  phrases: string[];
  notes: string;
  partners: Partner[];
}

const USAGE_OPTIONS: { value: PartnerUsage; label: string }[] = [
  { value: 'always', label: 'En todas las piezas' },
  { value: 'closing', label: 'Solo en el cierre' },
];

interface PaletteColor {
  label: string;
  hex: string;
}

const identityKey = ['context', 'identity'] as const;
const MAX_LOGO_BYTES = 5 * 1024 * 1024;

const toLines = (text: string) =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

/**
 * Kit de marca en un solo lugar: logo y colores (de los archivos de marca), slogans y frases,
 * logos de asociaciones y, si HeyGen está conectado, su kit de marca y la ubicación del logo.
 */
export function BrandKitStep() {
  const queryClient = useQueryClient();
  const brand = useBrandContext();
  const videoConfigured = useVideoConfigured();
  const identity = useQuery({
    queryKey: identityKey,
    queryFn: ({ signal }) =>
      api<{ identity: Identity; palette: PaletteColor[] }>('/context/identity', { signal }),
  });

  const setIdentity = (next: Identity) =>
    queryClient.setQueryData(identityKey, (current: { palette: PaletteColor[] } | undefined) => ({
      palette: current?.palette ?? [],
      identity: next,
    }));

  if (identity.isPending) return <Spinner label="Cargando el kit de marca" />;
  if (identity.isError) return <Alert>{errorMessage(identity.error)}</Alert>;

  return (
    <div className={styles.form}>
      <div className={styles.authorizations}>
        <h3>Logo y colores</h3>
        <p className={styles.note}>
          Salen de los archivos de marca. Para cambiarlos, actualiza el logo o los lineamientos de
          diseño en el paso "Marca".
        </p>
        <div className={styles.kitColors}>
          {brand.data?.logo && (
            <img className={styles.kitBrandLogo} src={brand.data.logo.url} alt="Logo de la marca" />
          )}
          {identity.data.palette.length > 0 ? (
            <ul className={styles.swatches}>
              {identity.data.palette.map((color) => (
                <li key={color.hex} title={color.label}>
                  <span style={{ background: color.hex }} aria-hidden="true" />
                  {color.hex}
                  <small>{color.label}</small>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.note}>
              No se encontraron colores HEX en los lineamientos de diseño.
            </p>
          )}
        </div>
      </div>

      <IdentityTextForm identity={identity.data.identity} onSaved={setIdentity} />
      <PartnersSection partners={identity.data.identity.partners} onSaved={setIdentity} />
      {videoConfigured && <HeyGenBrandSection />}
    </div>
  );
}

function IdentityTextForm({
  identity,
  onSaved,
}: {
  identity: Identity;
  onSaved: (identity: Identity) => void;
}) {
  const [slogans, setSlogans] = useState(identity.slogans.join('\n'));
  const [phrases, setPhrases] = useState(identity.phrases.join('\n'));
  const [notes, setNotes] = useState(identity.notes);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const save = useMutation({
    mutationFn: () =>
      api<{ identity: Identity }>('/context/identity', {
        method: 'PUT',
        json: { slogans: toLines(slogans), phrases: toLines(phrases), notes: notes.trim() },
      }),
    onSuccess: ({ identity: next }) => {
      onSaved(next);
      setSavedAt(Date.now());
    },
  });

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate();
  };

  return (
    <form className={styles.authorizations} onSubmit={handleSubmit} noValidate>
      <h3>Slogans e identidad</h3>
      <p className={styles.note}>
        Las imágenes, los guiones de los reels y las sugerencias de temas los usan textualmente, sin
        cambiar ni una palabra.
      </p>
      <TextArea
        label="Slogans oficiales (uno por línea)"
        value={slogans}
        onChange={(event) => setSlogans(event.target.value)}
        rows={3}
        maxLength={3400}
        placeholder="Ej.: Belleza con criterio médico"
      />
      <TextArea
        label="Frases representativas (una por línea)"
        value={phrases}
        onChange={(event) => setPhrases(event.target.value)}
        rows={4}
        maxLength={12000}
        placeholder="Ej.: Tu caso es único y merece una valoración profesional."
      />
      <TextArea
        label="Indicaciones de identidad y tono (opcional)"
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        rows={4}
        maxLength={3000}
        placeholder='Ej.: Llamarla siempre "la doctora". Tono cercano y profesional. Nunca usar "barato" ni "rápido".'
      />
      {save.isError && <Alert>{errorMessage(save.error)}</Alert>}
      {savedAt && !save.isPending && !save.isError && <Alert tone="info">Guardado.</Alert>}
      <Actions>
        <Button type="submit" loading={save.isPending} loadingLabel="Guardando">
          Guardar slogans e identidad
        </Button>
      </Actions>
    </form>
  );
}

function PartnersSection({
  partners,
  onSaved,
}: {
  partners: Partner[];
  onSaved: (identity: Identity) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [usage, setUsage] = useState<PartnerUsage>('closing');
  const [clientError, setClientError] = useState<string | null>(null);

  const add = useMutation({
    mutationFn: (logo: File) => {
      const formData = new FormData();
      formData.append('logo', logo);
      formData.append('name', name.trim());
      formData.append('usage', usage);
      return api<{ identity: Identity }>('/context/identity/partners', {
        method: 'POST',
        formData,
      });
    },
    onSuccess: ({ identity }) => {
      onSaved(identity);
      setFile(null);
      setName('');
    },
  });
  const update = useMutation({
    mutationFn: (partner: Pick<Partner, 'id' | 'name' | 'usage'>) =>
      api<{ identity: Identity }>(`/context/identity/partners/${partner.id}`, {
        method: 'PATCH',
        json: { name: partner.name, usage: partner.usage },
      }),
    onSuccess: ({ identity }) => onSaved(identity),
  });
  const remove = useMutation({
    mutationFn: (id: string) =>
      api<{ identity: Identity }>(`/context/identity/partners/${id}`, { method: 'DELETE' }),
    onSuccess: ({ identity }) => onSaved(identity),
  });

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setClientError(null);
    if (!file) return setClientError('Elige el logo de la asociación.');
    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      return setClientError('El logo debe ser PNG o JPG.');
    }
    if (file.size > MAX_LOGO_BYTES) return setClientError('El logo supera los 5 MB.');
    add.mutate(file);
  };

  const error = clientError ?? add.error ?? update.error ?? remove.error;

  return (
    <div className={styles.authorizations}>
      <h3>Logos de asociaciones y sociedades</h3>
      <p className={styles.note}>
        Respaldo institucional, por ejemplo una sociedad científica de la que la doctora es miembro.
        Usa solo logos de asociaciones a las que pertenece, según sus manuales de uso. En los reels
        se agregan tal cual en la tarjeta de cierre; en las imágenes, la IA los incluye a partir del
        archivo (revisa que no los deforme).
      </p>

      {partners.length > 0 && (
        <ul className={styles.partnerList}>
          {partners.map((partner) => (
            <li key={partner.id} className={styles.partner}>
              <img src={partner.logoUrl} alt={`Logo de ${partner.name}`} />
              <div>
                <strong>{partner.name}</strong>
                <Select
                  label="Dónde va"
                  options={USAGE_OPTIONS}
                  value={partner.usage}
                  onChange={(value) => update.mutate({ ...partner, usage: value as PartnerUsage })}
                />
                <Button
                  variant="ghost"
                  disabled={remove.isPending}
                  onClick={() => {
                    if (window.confirm(`¿Quitar el logo de ${partner.name}?`))
                      remove.mutate(partner.id);
                  }}
                >
                  Quitar
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        <FileDrop
          label="Logo de la asociación"
          hint="PNG o JPG de hasta 5 MB; mejor PNG con fondo transparente."
          accept="image/png,image/jpeg"
          file={file}
          onChange={setFile}
        />
        <TextField
          label="Nombre de la asociación"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={120}
          placeholder="Ej.: Sociedad Colombiana de Cirugía Plástica"
        />
        <Select
          label="Dónde va"
          options={USAGE_OPTIONS}
          value={usage}
          onChange={(value) => setUsage(value as PartnerUsage)}
        />
        {error && <Alert>{typeof error === 'string' ? error : errorMessage(error)}</Alert>}
        <Actions>
          <Button
            type="submit"
            variant="secondary"
            disabled={!file || name.trim().length < 2}
            loading={add.isPending}
            loadingLabel="Guardando logo"
          >
            Agregar logo
          </Button>
        </Actions>
      </form>
    </div>
  );
}

function HeyGenBrandSection() {
  const settings = useVideoSettings();
  if (settings.isPending) return <Spinner label="Cargando la configuración de HeyGen" />;
  if (settings.isError) return <Alert>{errorMessage(settings.error)}</Alert>;
  return (
    <HeyGenBrandForm
      initialKitId={settings.data.settings.brandKitId}
      initialLogo={settings.data.settings.logo}
    />
  );
}

function HeyGenBrandForm({
  initialKitId,
  initialLogo,
}: {
  initialKitId: string | null;
  initialLogo: LogoPlacement;
}) {
  const queryClient = useQueryClient();
  const brandKits = useBrandKits();
  const [brandKitId, setBrandKitId] = useState(initialKitId ?? '');
  const [logo, setLogo] = useState(initialLogo);

  const save = useMutation({
    mutationFn: () =>
      api<{ settings: VideoSettingsResponse['settings'] }>('/video/settings/brand', {
        method: 'PATCH',
        json: { brandKitId: brandKitId || null, logo },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: videoKeys.settings }),
  });

  return (
    <div className={styles.authorizations}>
      <h3>Kit de marca de HeyGen</h3>
      <p className={styles.note}>
        Lo usa la edición automática de HeyGen para aplicar tus colores, fuentes y logo.
      </p>
      {brandKits.isPending ? (
        <Spinner label="Cargando kits de marca" />
      ) : brandKits.isError ? (
        <Alert>{errorMessage(brandKits.error)}</Alert>
      ) : (
        <Select
          label="Kit por defecto para los reels"
          options={[
            { value: '', label: 'Sin kit (se adjunta el logo de la marca)' },
            ...brandKits.data.map((kit) => ({ value: kit.id, label: kit.name })),
          ]}
          value={brandKitId}
          onChange={(id) => setBrandKitId(id)}
        />
      )}
      <BrandKitCreator onReady={(id) => setBrandKitId(id)} />

      <h3>Logo en los videos</h3>
      <p className={styles.note}>
        La edición automática lo pone en todas las escenas, siempre en el mismo lugar y del mismo
        tamaño.
      </p>
      <Select
        label="Posición del logo"
        options={LOGO_POSITIONS}
        value={logo.position}
        onChange={(position) =>
          setLogo({ ...logo, position: position as LogoPlacement['position'] })
        }
      />
      <Select
        label="Tamaño del logo"
        options={LOGO_SIZES}
        value={logo.size}
        onChange={(size) => setLogo({ ...logo, size: size as LogoPlacement['size'] })}
      />
      {save.isError && <Alert>{errorMessage(save.error)}</Alert>}
      {save.isSuccess && <Alert tone="info">Guardado.</Alert>}
      <Actions>
        <Button loading={save.isPending} loadingLabel="Guardando" onClick={() => save.mutate()}>
          Guardar kit de HeyGen y logo
        </Button>
      </Actions>
    </div>
  );
}
