import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { api, errorMessage } from '../api/client';
import { Alert } from '../ui/Alert';
import { Actions, Button } from '../ui/Button';
import { FileDrop } from '../ui/FileDrop';
import { Spinner } from '../ui/Spinner';
import { TextField } from '../ui/TextField';
import { videoKeys } from '../video/useVideo';
import styles from './Setup.module.css';

/** Límite de subida directa de HeyGen. */
const MAX_BYTES = 200 * 1024 * 1024;
const VIDEO_TYPES = ['video/mp4', 'video/webm'];
/** Mientras entrena o espera el consentimiento, se consulta el estado cada 15 s. */
const REFRESH_MS = 15_000;

type TwinStatus = 'processing' | 'pending_consent' | 'completed' | 'failed';

interface Twin {
  lookId: string;
  groupId: string;
  name: string;
  createdAt: string;
  state: {
    status: TwinStatus;
    consentStatus: 'pending' | 'accepted' | 'rejected' | null;
    error: string | null;
    previewImageUrl: string | null;
  } | null;
}

const STATUS_TEXT: Record<TwinStatus, string> = {
  processing: 'HeyGen lo está entrenando (suele tardar unos minutos).',
  pending_consent: 'Falta el consentimiento de la persona.',
  completed: 'Listo: ya aparece en la lista de avatares, con su voz clonada.',
  failed: 'HeyGen no pudo entrenarlo.',
};

const twinsKey = ['video', 'twins'] as const;

/**
 * Gemelo digital: un avatar entrenado con un video de una persona real. HeyGen clona su voz de la
 * misma grabación y pide que la persona grabe su consentimiento antes de usarlo.
 */
export function DigitalTwinSection() {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [personName, setPersonName] = useState('');
  const [date, setDate] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);
  const [consentUrls, setConsentUrls] = useState<Record<string, string>>({});

  const twins = useQuery({
    queryKey: twinsKey,
    queryFn: ({ signal }) =>
      api<{ twins: Twin[] }>('/video/twins', { signal }).then((r) => r.twins),
    refetchInterval: (query) =>
      query.state.data?.some(
        (twin) => twin.state && twin.state.status !== 'completed' && twin.state.status !== 'failed',
      )
        ? REFRESH_MS
        : false,
  });

  // Al quedar listo, el avatar se suma a la lista de avatares.
  const readyCount = twins.data?.filter((twin) => twin.state?.status === 'completed').length ?? 0;
  useEffect(() => {
    if (readyCount > 0) void queryClient.invalidateQueries({ queryKey: videoKeys.avatars });
  }, [readyCount, queryClient]);

  const create = useMutation({
    mutationFn: (footage: File) => {
      const formData = new FormData();
      formData.append('footage', footage);
      formData.append('name', name.trim());
      formData.append('personName', personName.trim());
      formData.append('date', date);
      formData.append('confirmed', String(confirmed));
      return api('/video/twins', { method: 'POST', formData });
    },
    onSuccess: async () => {
      setFile(null);
      setName('');
      setPersonName('');
      setDate('');
      setConfirmed(false);
      await queryClient.invalidateQueries({ queryKey: twinsKey });
    },
  });

  const consent = useMutation({
    mutationFn: (groupId: string) =>
      api<{ url: string }>(`/video/twins/${encodeURIComponent(groupId)}/consent`, {
        method: 'POST',
      }),
    onSuccess: ({ url }, groupId) => setConsentUrls((current) => ({ ...current, [groupId]: url })),
  });

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setClientError(null);
    if (!file) return setClientError('Elige el video de la persona.');
    if (!VIDEO_TYPES.includes(file.type)) return setClientError('El video debe ser MP4 o WebM.');
    if (file.size > MAX_BYTES) return setClientError('El video supera los 200 MB.');
    create.mutate(file);
  };

  const canSubmit =
    Boolean(file) &&
    name.trim().length >= 2 &&
    personName.trim().length >= 3 &&
    Boolean(date) &&
    confirmed &&
    !create.isPending;

  return (
    <div className={styles.authorizations}>
      <h3>Tu propio avatar (gemelo digital)</h3>
      <p className={styles.note}>
        Sube un video de una persona real hablando a cámara. HeyGen crea su avatar y clona su voz de
        la misma grabación, así los reels se ven y suenan como ella.
      </p>
      <ul className={styles.note}>
        <li>Entre 15 segundos y 10 minutos. Lo ideal: unos 2 minutos hablando con naturalidad.</li>
        <li>MP4 en 1080p, de hasta 200 MB. Una sola persona, mirando a cámara todo el tiempo.</li>
        <li>
          Lugar silencioso, sin música. Buena luz y la ropa con la que quiere salir en los reels.
        </li>
      </ul>

      {twins.isPending ? (
        <Spinner label="Consultando tus avatares" />
      ) : twins.isError ? (
        <Alert>{errorMessage(twins.error)}</Alert>
      ) : (
        twins.data.length > 0 && (
          <ul className={styles.twinList}>
            {twins.data.map((twin) => {
              const status = twin.state?.status;
              const url = consentUrls[twin.groupId];
              return (
                <li key={twin.lookId} className={styles.twin}>
                  {twin.state?.previewImageUrl && (
                    <img src={twin.state.previewImageUrl} alt="" loading="lazy" />
                  )}
                  <div>
                    <strong>{twin.name}</strong>
                    <p className={styles.note}>
                      {status ? STATUS_TEXT[status] : 'No se pudo consultar el estado en HeyGen.'}
                      {twin.state?.consentStatus === 'rejected' &&
                        ' HeyGen rechazó el consentimiento: genera un enlace nuevo y vuelve a grabarlo.'}
                    </p>
                    {status === 'failed' && twin.state?.error && <Alert>{twin.state.error}</Alert>}
                    {status !== 'failed' && twin.state?.consentStatus !== 'accepted' && (
                      <>
                        <Button
                          variant="secondary"
                          loading={consent.isPending && consent.variables === twin.groupId}
                          loadingLabel="Generando enlace"
                          onClick={() => consent.mutate(twin.groupId)}
                        >
                          {url ? 'Generar otro enlace' : 'Generar enlace de consentimiento'}
                        </Button>
                        {url && (
                          <p className={styles.note}>
                            Envía este enlace a {twin.name}: lo abre en su celular o computador y
                            graba una frase corta con la cámara. Vale 24 horas.{' '}
                            <a href={url} target="_blank" rel="noreferrer">
                              Abrir enlace
                            </a>
                          </p>
                        )}
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )
      )}
      {consent.isError && <Alert>{errorMessage(consent.error)}</Alert>}

      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        <FileDrop
          label="Video de la persona"
          hint="MP4 o WebM, de 15 s a 10 min, hasta 200 MB."
          accept="video/mp4,video/webm"
          file={file}
          onChange={setFile}
        />
        <TextField
          label="Nombre del avatar"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={80}
          placeholder="Ej.: Dra. Ivonne – consultorio"
        />
        <TextField
          label="Persona que autorizó el uso de su imagen y voz"
          value={personName}
          onChange={(event) => setPersonName(event.target.value)}
          maxLength={120}
        />
        <TextField
          label="Fecha de la autorización escrita"
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
        />
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
          />
          Tengo la autorización escrita de esta persona para crear su avatar y clonar su voz. Crear
          el avatar puede consumir saldo de HeyGen.
        </label>
        {(clientError ?? create.error) && (
          <Alert>{clientError ?? errorMessage(create.error)}</Alert>
        )}
        <Actions>
          <Button
            type="submit"
            disabled={!canSubmit}
            loading={create.isPending}
            loadingLabel="Subiendo el video a HeyGen"
          >
            Crear mi avatar
          </Button>
        </Actions>
        {create.isPending && (
          <p className={styles.note}>Puede tardar unos minutos según el tamaño del video.</p>
        )}
      </form>
    </div>
  );
}
