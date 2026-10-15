import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, errorMessage } from '../api/client';
import { Alert } from '../ui/Alert';
import { Actions, Button } from '../ui/Button';
import { Spinner } from '../ui/Spinner';
import { TextField } from '../ui/TextField';
import {
  BRAND_COLOR_ROLES,
  COLOR_ROLE_LABEL,
  type BrandColorRole,
  type BrandKitDetail,
  type BrandKitSuggestions,
} from '../video/types';
import styles from './Setup.module.css';

type ColorRoles = Partial<Record<BrandColorRole, string>>;

interface BrandKitCreatorProps {
  /** Al terminar, el kit se puede usar por defecto en los reels. */
  onReady: (id: string) => void;
}

/**
 * Crea un kit de marca en HeyGen importando el sitio web público de la empresa y luego fija los
 * colores exactos de los lineamientos y el logo principal (entre los importados del sitio).
 * La API de HeyGen no permite subir un logo ni fuentes propias: eso se completa en su web.
 */
export function BrandKitCreator({ onReady }: BrandKitCreatorProps) {
  const queryClient = useQueryClient();
  const suggestions = useQuery({
    queryKey: ['video', 'brand-kit-suggestions'],
    queryFn: ({ signal }) => api<BrandKitSuggestions>('/video/brand-kits/suggestions', { signal }),
    staleTime: Infinity,
  });
  const [url, setUrl] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [kitId, setKitId] = useState<string | null>(null);
  const [colors, setColors] = useState<ColorRoles | null>(null);
  const [logoId, setLogoId] = useState<string | null>(null);

  const siteUrl = url ?? suggestions.data?.website ?? '';
  const roles: ColorRoles = colors ?? suggestions.data?.colorRoles ?? {};

  const create = useMutation({
    mutationFn: () =>
      api<{ brandKit: BrandKitDetail }>('/video/brand-kits', {
        method: 'POST',
        json: { url: siteUrl.trim(), name: name.trim() || 'Kit de marca' },
      }),
    onSuccess: ({ brandKit }) => setKitId(brandKit.id),
  });

  // La importación del sitio tarda (normalmente menos de 2 minutos): se consulta hasta que termine.
  const kit = useQuery({
    queryKey: ['video', 'brand-kit', kitId],
    queryFn: ({ signal }) =>
      api<{ brandKit: BrandKitDetail }>(`/video/brand-kits/${kitId}`, { signal }).then(
        (r) => r.brandKit,
      ),
    enabled: Boolean(kitId),
    refetchInterval: (query) => (query.state.data?.status === 'loading' ? 3000 : false),
  });

  const save = useMutation({
    mutationFn: () =>
      api<{ brandKit: BrandKitDetail }>(`/video/brand-kits/${kitId}`, {
        method: 'PATCH',
        json: {
          colorRoles: roles,
          ...(logoId || kit.data?.primaryLogoId
            ? { primaryLogoId: logoId ?? kit.data?.primaryLogoId }
            : {}),
        },
      }),
    onSuccess: async ({ brandKit }) => {
      queryClient.setQueryData(['video', 'brand-kit', brandKit.id], brandKit);
      await queryClient.invalidateQueries({ queryKey: ['video', 'brand-kits'] });
      onReady(brandKit.id);
    },
  });

  const detail = kit.data;
  const selectedLogo = logoId ?? detail?.primaryLogoId ?? null;

  return (
    <div className={styles.kitCreator}>
      <h3>Crear kit de marca desde tu sitio web</h3>
      <p className={styles.note}>
        HeyGen visita tu sitio público e importa logos, colores y fuentes. Después la app fija los
        colores exactos de tus lineamientos. Al crearlo confirmas que tienes derecho a usar esos
        recursos en HeyGen.
      </p>

      {!kitId && (
        <>
          <TextField
            label="Sitio web de la empresa"
            type="url"
            value={siteUrl}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://www.empresa-ejemplo.com"
          />
          <TextField
            label="Nombre del kit"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ej.: Marca principal"
            maxLength={256}
          />
          {create.isError && <Alert>{errorMessage(create.error)}</Alert>}
          <Actions>
            <Button
              variant="secondary"
              disabled={!/^https?:\/\/\S+\.\S+/.test(siteUrl.trim())}
              loading={create.isPending}
              loadingLabel="Creando kit"
              onClick={() => create.mutate()}
            >
              Crear kit desde mi sitio web
            </Button>
          </Actions>
        </>
      )}

      {kitId && !detail && <Spinner label="Consultando el kit" />}
      {kit.isError && <Alert>{errorMessage(kit.error)}</Alert>}

      {detail?.status === 'loading' && (
        <Spinner label="HeyGen está importando tu sitio web. Suele tardar menos de 2 minutos." />
      )}

      {detail && detail.status !== 'loading' && (
        <>
          {detail.status === 'error' && (
            <Alert tone="info">
              La importación no terminó del todo; se conserva lo que llegó. Puedes completar el kit
              en la web de HeyGen.
            </Alert>
          )}

          <fieldset className={styles.authorization}>
            <legend>Logo principal (importado del sitio)</legend>
            {detail.logos.length === 0 ? (
              <p className={styles.note}>
                No se encontraron logos en el sitio. Súbelo en la sección Brand Kit de la web de
                HeyGen; mientras tanto la app adjunta tu logo en cada video.
              </p>
            ) : (
              <div className={styles.kitLogos}>
                {detail.logos.map((logo) => (
                  <label
                    key={logo.id}
                    className={styles.kitLogo}
                    data-checked={selectedLogo === logo.id || undefined}
                  >
                    <input
                      type="radio"
                      name="kit-logo"
                      className="visually-hidden"
                      checked={selectedLogo === logo.id}
                      onChange={() => setLogoId(logo.id)}
                    />
                    {logo.url ? <img src={logo.url} alt={logo.name ?? 'Logo'} /> : logo.name}
                  </label>
                ))}
              </div>
            )}
          </fieldset>

          <fieldset className={styles.authorization}>
            <legend>Colores (de tus lineamientos de diseño)</legend>
            {BRAND_COLOR_ROLES.map((role) => (
              <label key={role} className={styles.colorField}>
                {COLOR_ROLE_LABEL[role]}
                <input
                  type="color"
                  value={roles[role] ?? '#000000'}
                  onChange={(event) =>
                    setColors({ ...roles, [role]: event.target.value.toUpperCase() })
                  }
                />
                <code>{(roles[role] ?? '—').toUpperCase()}</code>
              </label>
            ))}
            {detail.colors.length > 0 && (
              <p className={styles.note}>Importados del sitio: {detail.colors.join(' · ')}</p>
            )}
          </fieldset>

          <p className={styles.note}>
            Fuentes importadas:{' '}
            {detail.fonts.length > 0
              ? detail.fonts.map((font) => font.name ?? font.id).join(', ')
              : 'ninguna'}
            . Las fuentes propias solo se pueden subir en la web de HeyGen.
          </p>

          {save.isError && <Alert>{errorMessage(save.error)}</Alert>}
          <Actions>
            <Button
              loading={save.isPending}
              loadingLabel="Guardando kit"
              onClick={() => save.mutate()}
            >
              Guardar colores y logo, y usar este kit
            </Button>
          </Actions>
          {save.isSuccess && (
            <Alert tone="info">Kit listo y elegido por defecto para los reels.</Alert>
          )}
        </>
      )}
    </div>
  );
}
