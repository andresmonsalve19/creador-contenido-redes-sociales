import { useState } from 'react';
import { Link } from 'react-router-dom';
import { errorMessage } from '../../../shared/api/client';
import { ModelSelector } from '../../../shared/models/ModelSelector';
import { useModels } from '../../../shared/models/useModels';
import { validateContact, type Contact } from '../../../shared/publishing/contact';
import { ContactFields } from '../../../shared/publishing/ContactFields';
import { ctaChoiceFrom, ctaFrom } from '../../../shared/publishing/cta';
import { CtaField } from '../../../shared/publishing/CtaField';
import { Alert } from '../../../shared/ui/Alert';
import { Actions, Button } from '../../../shared/ui/Button';
import { Section } from '../../../shared/ui/Page';
import { Select } from '../../../shared/ui/Select';
import { Spinner } from '../../../shared/ui/Spinner';
import { AvatarPicker } from '../../../shared/video/AvatarPicker';
import { genderOf, suggestVoice, voicesByAvatar } from '../../../shared/video/gender';
import { VOICE_LANGUAGES, type VideoVoice } from '../../../shared/video/types';
import { useAvatars, useVoice, useVoices } from '../../../shared/video/useVideo';
import { VoicePicker } from '../../../shared/video/VoicePicker';
import { VoiceDesigner } from '../../../shared/video/VoiceDesigner';
import { withVoices } from '../../../shared/video/recommend';
import { MAX_AVATARS } from '../types';
import type { WizardState } from '../wizardReducer';
import styles from '../reels.module.css';

interface SettingsStepProps {
  state: WizardState;
  favoriteAvatarIds: string[];
  onBack: () => void;
  onContinue: (settings: {
    textModel: string;
    avatarIds: string[];
    voiceId: string;
    voiceByAvatar: Record<string, string>;
    voiceLanguage: string;
    contact: Contact;
    cta: string;
  }) => void;
}

export function SettingsStep({ state, favoriteAvatarIds, onBack, onContinue }: SettingsStepProps) {
  const texts = useModels('text');
  const avatars = useAvatars();
  const [text, setText] = useState(state.textModel);
  const [avatarIds, setAvatarIds] = useState(state.avatarIds);
  const [voiceLanguage, setVoiceLanguage] = useState(state.voiceLanguage);
  const [voiceId, setVoiceId] = useState(state.voiceId);
  const [contact, setContact] = useState(state.contact);
  const [ctaChoice, setCtaChoice] = useState(() => ctaChoiceFrom(state.cta));
  const voices = useVoices(voiceLanguage);
  /** Voces nuevas diseñadas con HeyGen y elegidas (no están en la lista del idioma). */
  const [pickedVoices, setPickedVoices] = useState<VideoVoice[]>([]);
  const mainAvatar = avatars.data?.find((avatar) => avatar.id === avatarIds[0]);
  /** Voz original del avatar principal: es la que mejor le encaja (1:1). */
  const original = useVoice(mainAvatar?.defaultVoiceId);

  // Sin elección explícita se usa el modelo recomendado.
  const selectedText = text ?? texts.data?.recommendedId ?? null;
  const cta = ctaFrom(ctaChoice);
  const errors = validateContact(contact);
  const valid =
    !errors.email &&
    !errors.website &&
    !errors.whatsapp &&
    cta.length >= 2 &&
    avatarIds.length > 0 &&
    Boolean(voiceId);

  return (
    <Section
      wide
      title="Configuraciones iniciales"
      description="Elige el modelo que escribe el guion, el avatar y la voz, el llamado a la acción y los datos de contacto del texto de la publicación."
    >
      <div className={styles.stack}>
        <div className={`${styles.group} ${styles.narrow}`}>
          <h3>Modelo para el guion</h3>
          <ModelSelector
            kind="text"
            legend="Modelo de texto"
            value={selectedText}
            onChange={setText}
          />
        </div>

        <div className={styles.group}>
          <h3>Avatar</h3>
          {avatars.isPending ? (
            <Spinner label="Cargando avatares de HeyGen" />
          ) : avatars.isError ? (
            <Alert>{errorMessage(avatars.error)}</Alert>
          ) : (
            <AvatarPicker
              legend="Elige uno o varios avatares"
              mode="multiple"
              max={MAX_AVATARS}
              avatars={avatars.data}
              value={avatarIds}
              onChange={(ids) => {
                setAvatarIds(ids);
                // Si cambia el avatar principal, se propone su voz original (o una de su género).
                const main = avatars.data.find((a) => a.id === ids[0]);
                if (main?.id === avatarIds[0]) return;
                setVoiceId(main?.defaultVoiceId ?? suggestVoice(main, voices.data ?? [], voiceId));
              }}
              pinnedIds={favoriteAvatarIds}
            />
          )}
          <p className={styles.fine}>
            El primero es el principal. Con varios, puedes alternarlos entre escenas en el siguiente
            paso.
          </p>
          <p className={styles.fine}>
            ¿Quieres un avatar de una persona real de tu marca, con su propia voz?{' '}
            <Link to="/setup?paso=video" target="_blank" rel="noreferrer">
              Crea tu propio avatar
            </Link>{' '}
            (se abre en otra pestaña; luego vuelve aquí y recarga la lista).
          </p>
        </div>

        <div className={`${styles.group} ${styles.narrow}`}>
          <h3>Voz</h3>
          <Select
            label="Idioma de la voz"
            options={VOICE_LANGUAGES}
            value={voiceLanguage}
            onChange={(language) => {
              setVoiceLanguage(language);
              setVoiceId(null);
            }}
          />
          {voices.isPending ? (
            <Spinner label="Cargando voces" />
          ) : voices.isError ? (
            <Alert>{errorMessage(voices.error)}</Alert>
          ) : (
            <>
              <VoicePicker
                legend="Voz del avatar principal"
                voices={withVoices(voices.data, pickedVoices)}
                value={voiceId}
                onChange={setVoiceId}
                gender={genderOf(mainAvatar)}
                original={original.data}
                language={voiceLanguage}
              />
              <VoiceDesigner
                gender={genderOf(mainAvatar)}
                value={voiceId}
                onPick={(voice) => {
                  setPickedVoices((current) => [voice, ...current]);
                  setVoiceId(voice.id);
                }}
              />
            </>
          )}
          {avatarIds.length > 1 && (
            <p className={styles.fine}>
              Los demás avatares reciben una voz de su mismo género. Puedes cambiarla en cada escena
              del guion.
            </p>
          )}
        </div>

        <CtaField
          value={ctaChoice}
          onChange={setCtaChoice}
          details="El avatar lo dice al cierre del video y también cierra el texto de la publicación."
        />

        <ContactFields
          value={contact}
          onChange={setContact}
          note='Los datos marcados van al cierre del video y al final del texto de la publicación, antes de los hashtags. Los tres se guardan para tus próximas publicaciones; desmarca "Incluir" en los que no quieras mostrar esta vez.'
        />
      </div>

      <Actions>
        <Button variant="secondary" onClick={onBack}>
          Atrás
        </Button>
        <Button
          disabled={!selectedText || !valid}
          onClick={() =>
            selectedText &&
            voiceId &&
            onContinue({
              textModel: selectedText,
              avatarIds,
              voiceId,
              voiceByAvatar: {
                ...voicesByAvatar(avatarIds, avatars.data ?? [], voices.data ?? [], voiceId),
                ...(avatarIds[0] ? { [avatarIds[0]]: voiceId } : {}),
              },
              voiceLanguage,
              contact,
              cta,
            })
          }
        >
          Continuar
        </Button>
      </Actions>
    </Section>
  );
}
