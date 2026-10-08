import { useState } from 'react';
import { ModelSelector } from '../../../shared/models/ModelSelector';
import { useModels } from '../../../shared/models/useModels';
import { Actions, Button } from '../../../shared/ui/Button';
import { Section } from '../../../shared/ui/Page';
import { Select } from '../../../shared/ui/Select';
import { TextField } from '../../../shared/ui/TextField';
import { CTA_OPTIONS, DEFAULT_CONTACT, type Contact } from '../types';
import styles from '../images.module.css';

interface SettingsStepProps {
  textModel: string | null;
  imageModel: string | null;
  contact: Contact;
  cta: string;
  onBack: () => void;
  onContinue: (settings: {
    textModel: string;
    imageModel: string;
    contact: Contact;
    cta: string;
  }) => void;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CUSTOM_CTA = '__custom__';

const CTA_SELECT_OPTIONS = [
  ...CTA_OPTIONS.map((option) => ({ value: option, label: option })),
  { value: CUSTOM_CTA, label: 'Otro (escribir el mío)…' },
];

const isPresetCta = (cta: string) => (CTA_OPTIONS as readonly string[]).includes(cta);

function validateContact({ email, website }: Contact) {
  return {
    email: email.trim() && !EMAIL.test(email.trim()) ? 'Escribe un correo válido.' : null,
    website: /\s/.test(website.trim()) ? 'El sitio web no puede tener espacios.' : null,
  };
}

export function SettingsStep({
  textModel,
  imageModel,
  contact: initialContact,
  cta: initialCta,
  onBack,
  onContinue,
}: SettingsStepProps) {
  const texts = useModels('text');
  const images = useModels('image');
  const [text, setText] = useState(textModel);
  const [image, setImage] = useState(imageModel);
  const [contact, setContact] = useState(initialContact);
  const [ctaChoice, setCtaChoice] = useState(isPresetCta(initialCta) ? initialCta : CUSTOM_CTA);
  const [customCta, setCustomCta] = useState(isPresetCta(initialCta) ? '' : initialCta);

  // Sin elección explícita se usa el modelo recomendado.
  const selectedText = text ?? texts.data?.recommendedId ?? null;
  const selectedImage = image ?? images.data?.recommendedId ?? null;
  const cta = (ctaChoice === CUSTOM_CTA ? customCta : ctaChoice).trim();
  const errors = validateContact(contact);
  const valid = !errors.email && !errors.website && cta.length >= 2;

  return (
    <Section
      wide
      title="Configuraciones iniciales"
      description="Elige los modelos de IA, el llamado a la acción y los datos de contacto que aparecerán en las imágenes y en el texto de la publicación."
    >
      <div className={styles.stack}>
        <div className={styles.group}>
          <h3>Modelos de IA</h3>
          <div className={styles.models}>
            <ModelSelector
              kind="text"
              legend="Modelo de texto"
              value={selectedText}
              onChange={setText}
            />
            <ModelSelector
              kind="image"
              legend="Modelo de imagen"
              value={selectedImage}
              onChange={setImage}
            />
          </div>
          <p className={styles.fine}>
            Preseleccionamos los de mejor relación calidad/precio. Precios en dólares, según la
            tarifa pública de Google.
          </p>
        </div>

        <div className={`${styles.group} ${styles.narrow}`}>
          <h3>Llamado a la acción</h3>
          <Select
            label="¿Qué quieres que haga tu audiencia?"
            options={CTA_SELECT_OPTIONS}
            value={ctaChoice}
            onChange={setCtaChoice}
            details="Se usa en la última imagen del carrusel (o en la imagen única) y en el cierre del texto."
          />
          {ctaChoice === CUSTOM_CTA && (
            <TextField
              label="Tu llamado a la acción"
              value={customCta}
              onChange={(event) => setCustomCta(event.target.value)}
              maxLength={80}
              placeholder="Ej.: Agenda tu cita hoy"
              error={customCta.trim().length < 2 ? 'Escribe el llamado a la acción.' : null}
            />
          )}
        </div>

        <div className={styles.group}>
          <h3>Datos de contacto</h3>
          <div className={styles.contactFields}>
            <TextField
              label="Correo electrónico"
              type="email"
              inputMode="email"
              autoComplete="off"
              value={contact.email}
              onChange={(event) => setContact({ ...contact, email: event.target.value })}
              error={errors.email}
            />
            <TextField
              label="Sitio web"
              type="text"
              inputMode="url"
              autoComplete="off"
              value={contact.website}
              onChange={(event) => setContact({ ...contact, website: event.target.value })}
              error={errors.website}
            />
          </div>
          <div className={styles.inlineAction}>
            <Button
              variant="ghost"
              onClick={() => setContact(DEFAULT_CONTACT)}
              disabled={
                contact.email === DEFAULT_CONTACT.email &&
                contact.website === DEFAULT_CONTACT.website
              }
            >
              Restablecer valores predeterminados
            </Button>
          </div>
          <p className={styles.fine}>
            Van en el pie de página de cada imagen, destacados en la última, y al final del texto,
            antes de los hashtags. Déjalos vacíos para no incluirlos.
          </p>
        </div>
      </div>

      <Actions>
        <Button variant="secondary" onClick={onBack}>
          Atrás
        </Button>
        <Button
          disabled={!selectedText || !selectedImage || !valid}
          onClick={() =>
            selectedText &&
            selectedImage &&
            onContinue({ textModel: selectedText, imageModel: selectedImage, contact, cta })
          }
        >
          Continuar
        </Button>
      </Actions>
    </Section>
  );
}
