import { CredentialsForm } from '../../../shared/setup/CredentialsForm';
import { useSetupStatus } from '../../../shared/hooks/useSetupStatus';
import { Actions, ButtonLink } from '../../../shared/ui/Button';
import { Section } from '../../../shared/ui/Page';
import styles from '../reels.module.css';

/**
 * Se muestra cuando falta la key de HeyGen: explica para qué sirve y permite conectarla aquí mismo.
 * Al guardarla, el estado de configuración se actualiza y el asistente de reels aparece solo.
 */
export function ConnectHeyGen() {
  const status = useSetupStatus();
  const heygen = status.data?.credentials.find((c) => c.key === 'HEYGEN_API_KEY');

  return (
    <Section
      title="Conecta HeyGen para crear reels"
      description="Los reels son videos con un avatar que dice el guion que escribe la IA. El video lo genera HeyGen, así que necesitas una API key de HeyGen con saldo."
    >
      <ol className={styles.howTo}>
        <li>
          Crea la key en el{' '}
          <a href="https://app.heygen.com/developers/api" target="_blank" rel="noreferrer">
            panel de la API de HeyGen
          </a>{' '}
          con la cuenta corporativa aprobada.
        </li>
        <li>Pégala aquí. Se valida con HeyGen y se guarda solo en el servidor.</li>
        <li>Luego eliges avatar, voz, duración y temática, y apruebas antes de generar.</li>
      </ol>

      {heygen && (
        // Aquí la key es necesaria: sin ella el botón queda deshabilitado.
        <CredentialsForm credentials={[{ ...heygen, optional: false }]} onDone={() => undefined} />
      )}

      <p className={styles.fine}>
        Los posts con imágenes funcionan sin HeyGen. Generar un reel consume saldo de tu cuenta de
        HeyGen; nada se envía sin tu confirmación.
      </p>
      <Actions>
        <ButtonLink to="/crear" variant="secondary">
          Volver
        </ButtonLink>
      </Actions>
    </Section>
  );
}
