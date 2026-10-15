import { useState } from 'react';
import { ModelSelector } from '../../../shared/models/ModelSelector';
import { useModels } from '../../../shared/models/useModels';
import { Actions, Button } from '../../../shared/ui/Button';
import { Section } from '../../../shared/ui/Page';
import { validateContact, type Contact } from '../../../shared/publishing/contact';
import { ContactFields } from '../../../shared/publishing/ContactFields';
import { ctaChoiceFrom, ctaFrom } from '../../../shared/publishing/cta';
import { CtaField } from '../../../shared/publishing/CtaField';
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
  const [ctaChoice, setCtaChoice] = useState(() => ctaChoiceFrom(initialCta));

  // Sin elección explícita se usa el modelo recomendado.
  const selectedText = text ?? texts.data?.recommendedId ?? null;
  const selectedImage = image ?? images.data?.recommendedId ?? null;
  const cta = ctaFrom(ctaChoice);
  const errors = validateContact(contact);
  const valid = !errors.email && !errors.website && !errors.whatsapp && cta.length >= 2;

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

        <CtaField
          value={ctaChoice}
          onChange={setCtaChoice}
          details="Se usa en la última imagen del carrusel (o en la imagen única) y en el cierre del texto."
        />

        <ContactFields
          value={contact}
          onChange={setContact}
          note='Los datos marcados van en el pie de página de cada imagen, destacados en la última, y al final del texto, antes de los hashtags. Los tres se guardan para tus próximas publicaciones; desmarca "Incluir" en los que no quieras mostrar esta vez.'
        />
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
