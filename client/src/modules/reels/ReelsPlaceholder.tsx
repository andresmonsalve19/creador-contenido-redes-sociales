import { ButtonLink, Actions } from '../../shared/ui/Button';
import { Page } from '../../shared/ui/Page';

/** Módulo de reels: pendiente. Su flujo vivirá en esta carpeta, igual que modules/images. */
export default function ReelsPlaceholder() {
  return (
    <Page
      title="Reels"
      lead="La creación de reels llegará pronto. Por ahora puedes crear posts para el feed."
    >
      <Actions>
        <ButtonLink to="/crear">Volver</ButtonLink>
      </Actions>
    </Page>
  );
}
