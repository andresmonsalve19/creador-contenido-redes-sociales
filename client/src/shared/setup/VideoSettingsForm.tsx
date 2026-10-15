import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { api, errorMessage } from '../api/client';
import { Alert } from '../ui/Alert';
import { Actions, Button } from '../ui/Button';
import { ChoiceGroup } from '../ui/ChoiceGroup';
import { FileDrop } from '../ui/FileDrop';
import { Select } from '../ui/Select';
import { Spinner } from '../ui/Spinner';
import { TextArea } from '../ui/TextArea';
import { TextField } from '../ui/TextField';
import { AvatarPicker } from '../video/AvatarPicker';
import { genderOf, suggestVoice } from '../video/gender';
import { DURATION_OPTIONS, RATIO_OPTIONS } from '../video/options';
import {
  VOICE_LANGUAGES,
  requiresAuthorization,
  type AvatarAuthorization,
  type VideoAspectRatio,
  type VideoAvatar,
  type VideoBackgroundSetting,
  type VideoDuration,
  type VideoSettings,
  type VideoSettingsResponse,
} from '../video/types';
import {
  useAvatars,
  useBrandKits,
  useVideoSettings,
  useVoices,
  videoKeys,
} from '../video/useVideo';
import { BrandKitCreator } from './BrandKitCreator';
import { VoicePicker } from '../video/VoicePicker';
import styles from './Setup.module.css';

const BACKGROUND_TYPES = ['image/png', 'image/jpeg'];
const MAX_BACKGROUND = 10 * 1024 * 1024;
const MAX_FAVORITES = 12;

const BACKGROUND_OPTIONS = [
  {
    value: 'avatar',
    label: 'Fondo original del avatar',
    description: 'Funciona con cualquier avatar.',
  },
  { value: 'color', label: 'Color de la marca', description: 'Un color sólido detrás del avatar.' },
  { value: 'image', label: 'Imagen de la marca', description: 'Una imagen que subes aquí.' },
  {
    value: 'generated',
    label: 'Imagen generada con IA',
    description: 'Un fondo nuevo para cada reel, con Nano Banana.',
  },
] as const;

const today = () => new Date().toISOString().slice(0, 10);

interface AuthorizationDraft {
  confirmed: boolean;
  personName: string;
  date: string;
}

interface VideoSettingsFormProps {
  onDone: () => void;
}

/** Configuración técnica de los reels: avatar, voz, fondo, formato y autorizaciones de imagen. */
export function VideoSettingsForm({ onDone }: VideoSettingsFormProps) {
  const settings = useVideoSettings();
  const avatars = useAvatars();

  if (settings.isPending || avatars.isPending) {
    return <Spinner label="Cargando avatares y configuración de video" />;
  }
  if (settings.isError) return <Alert>{errorMessage(settings.error)}</Alert>;
  if (avatars.isError) return <Alert>{errorMessage(avatars.error)}</Alert>;

  return <Form current={settings.data} avatars={avatars.data} onDone={onDone} />;
}

function Form({
  current,
  avatars,
  onDone,
}: {
  current: VideoSettingsResponse;
  avatars: VideoAvatar[];
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<VideoSettings>(current.settings);
  const [authorizations, setAuthorizations] = useState<Record<string, AuthorizationDraft>>(
    current.settings.authorizations,
  );
  const [backgroundFile, setBackgroundFile] = useState<File | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const voices = useVoices(draft.voiceLanguage);
  const brandKits = useBrandKits();

  const set = <K extends keyof VideoSettings>(key: K, value: VideoSettings[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const selectedIds = [
    ...new Set([draft.defaultAvatarId, ...draft.favoriteAvatarIds].filter(Boolean)),
  ] as string[];
  const needAuthorization = avatars.filter(
    (avatar) => selectedIds.includes(avatar.id) && requiresAuthorization(avatar),
  );

  const save = useMutation({
    mutationFn: async (settings: VideoSettings) => {
      if (backgroundFile) {
        const formData = new FormData();
        formData.append('background', backgroundFile);
        await api('/video/background', { method: 'PUT', formData });
      }
      return api<{ settings: VideoSettings }>('/video/settings', { method: 'PUT', json: settings });
    },
    onSuccess: async () => {
      setBackgroundFile(null);
      await queryClient.invalidateQueries({ queryKey: videoKeys.settings });
      onDone();
    },
  });

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setClientError(null);

    // Solo se guardan las autorizaciones de los avatares que siguen seleccionados.
    const complete: Record<string, AvatarAuthorization> = {};
    for (const avatar of needAuthorization) {
      const auth = authorizations[avatar.id];
      if (!auth?.confirmed || auth.personName.trim().length < 3 || !auth.date) {
        setClientError(
          `Completa la autorización de imagen de ${avatar.name} o quítalo de la selección.`,
        );
        return;
      }
      complete[avatar.id] = {
        confirmed: true,
        personName: auth.personName.trim(),
        date: auth.date,
      };
    }

    if (draft.background.type === 'image' && !backgroundFile && !current.backgroundImage) {
      setClientError('Sube la imagen de fondo o elige otro tipo de fondo.');
      return;
    }
    if (backgroundFile) {
      if (!BACKGROUND_TYPES.includes(backgroundFile.type)) {
        setClientError('El fondo debe ser PNG o JPG.');
        return;
      }
      if (backgroundFile.size > MAX_BACKGROUND) {
        setClientError('La imagen de fondo supera los 10 MB.');
        return;
      }
    }

    save.mutate({ ...draft, authorizations: complete });
  };

  const background = draft.background;

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      <AvatarPicker
        legend="Avatar por defecto"
        avatars={avatars}
        value={draft.defaultAvatarId ? [draft.defaultAvatarId] : []}
        onChange={([id]) => {
          set('defaultAvatarId', id ?? null);
          // La voz por defecto se ajusta para que sea del mismo género que el avatar.
          const avatar = avatars.find((a) => a.id === id);
          set('defaultVoiceId', suggestVoice(avatar, voices.data ?? [], draft.defaultVoiceId));
        }}
        pinnedIds={draft.favoriteAvatarIds}
      />

      <AvatarPicker
        legend="Avatares favoritos de la marca"
        mode="multiple"
        max={MAX_FAVORITES}
        avatars={avatars}
        value={draft.favoriteAvatarIds}
        onChange={(ids) => set('favoriteAvatarIds', ids)}
      />
      <p className={styles.note}>
        Los favoritos aparecen primero al crear un reel. Elige uno para usarlo siempre o varios para
        alternarlos entre escenas.
      </p>

      {needAuthorization.length > 0 && (
        <div className={styles.authorizations}>
          <h3>Autorización de imagen</h3>
          <p className={styles.note}>
            Estos avatares pueden representar a una persona real. Sin autorización escrita no se
            pueden usar. HeyGen además exige su propio consentimiento para los digital twins.
          </p>
          {needAuthorization.map((avatar) => {
            const auth = authorizations[avatar.id] ?? {
              confirmed: false,
              personName: '',
              date: today(),
            };
            const update = (patch: Partial<AuthorizationDraft>) =>
              setAuthorizations((prev) => ({ ...prev, [avatar.id]: { ...auth, ...patch } }));
            return (
              <fieldset key={avatar.id} className={styles.authorization}>
                <legend>{avatar.name}</legend>
                <label className={styles.check}>
                  <input
                    type="checkbox"
                    checked={auth.confirmed}
                    onChange={(event) => update({ confirmed: event.target.checked })}
                  />
                  Cuento con autorización escrita de esta persona para usar su imagen y voz
                </label>
                <TextField
                  label="Nombre de la persona"
                  value={auth.personName}
                  onChange={(event) => update({ personName: event.target.value })}
                  maxLength={120}
                />
                <TextField
                  label="Fecha de la autorización"
                  type="date"
                  value={auth.date}
                  max={today()}
                  onChange={(event) => update({ date: event.target.value })}
                />
              </fieldset>
            );
          })}
        </div>
      )}

      <Select
        label="Idioma de la voz"
        options={VOICE_LANGUAGES}
        value={draft.voiceLanguage}
        onChange={(language) => {
          set('voiceLanguage', language);
          set('defaultVoiceId', null);
        }}
      />

      {voices.isPending ? (
        <Spinner label="Cargando voces" />
      ) : voices.isError ? (
        <Alert>{errorMessage(voices.error)}</Alert>
      ) : (
        <VoicePicker
          legend="Voz por defecto"
          voices={voices.data}
          value={draft.defaultVoiceId}
          onChange={(id) => set('defaultVoiceId', id)}
          gender={genderOf(avatars.find((a) => a.id === draft.defaultAvatarId))}
        />
      )}

      <label className={styles.range}>
        <span>
          Velocidad de la voz: <strong>{draft.voiceSpeed.toFixed(2)}×</strong>
        </span>
        <input
          type="range"
          min={0.5}
          max={1.5}
          step={0.05}
          value={draft.voiceSpeed}
          onChange={(event) => set('voiceSpeed', Number(event.target.value))}
        />
      </label>

      <ChoiceGroup<VideoBackgroundSetting['type']>
        legend="Fondo por defecto"
        layout="list"
        options={BACKGROUND_OPTIONS}
        value={background.type}
        onChange={(type) =>
          set('background', type === 'color' ? { type, color: '#0F2A5F' } : { type })
        }
      />
      {background.type === 'color' && (
        <label className={styles.colorField}>
          Color de fondo
          <input
            type="color"
            value={background.color}
            onChange={(event) => set('background', { type: 'color', color: event.target.value })}
          />
          <code>{background.color.toUpperCase()}</code>
        </label>
      )}
      {background.type === 'image' && (
        <FileDrop
          label="Imagen de fondo"
          hint="PNG o JPG de hasta 10 MB, sin texto, en la proporción del video."
          accept="image/png,image/jpeg"
          file={backgroundFile}
          currentFileName={current.backgroundImage?.fileName}
          onChange={setBackgroundFile}
        />
      )}
      {background.type !== 'avatar' && (
        <p className={styles.note}>
          Para mostrar otro fondo se recorta el avatar. Algunos avatares de video no lo permiten; si
          HeyGen lo rechaza, usa el fondo original del avatar.
        </p>
      )}

      <label className={styles.check}>
        <input
          type="checkbox"
          checked={draft.captions}
          onChange={(event) => set('captions', event.target.checked)}
        />
        Subtítulos activados por defecto
      </label>

      <ChoiceGroup<VideoAspectRatio>
        legend="Formato por defecto"
        layout="list"
        options={RATIO_OPTIONS}
        value={draft.aspectRatio}
        onChange={(aspectRatio) => set('aspectRatio', aspectRatio)}
      />

      <ChoiceGroup<`${VideoDuration}`>
        legend="Duración por defecto"
        options={DURATION_OPTIONS}
        value={`${draft.durationSeconds}`}
        onChange={(value) => set('durationSeconds', Number(value) as VideoDuration)}
      />

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
            value={draft.brandKitId ?? ''}
            onChange={(id) => set('brandKitId', id || null)}
          />
        )}
        <BrandKitCreator onReady={(id) => set('brandKitId', id)} />
      </div>

      <TextArea
        label="Reglas de cumplimiento (opcional)"
        value={draft.complianceRules}
        onChange={(event) => set('complianceRules', event.target.value)}
        maxLength={3000}
        rows={5}
        placeholder="Ej.: No prometer ni garantizar resultados. No usar testimonios de clientes reales. Cerrar siempre invitando a una valoración profesional."
        hint="Tienen prioridad sobre los lineamientos, los aprendizajes y la temática. Si algo se ignora por estas reglas, el guion te lo avisa."
      />

      {(clientError || save.isError) && <Alert>{clientError ?? errorMessage(save.error)}</Alert>}

      <Actions>
        <Button type="submit" loading={save.isPending} loadingLabel="Guardando">
          Guardar configuración de video
        </Button>
      </Actions>
    </form>
  );
}
