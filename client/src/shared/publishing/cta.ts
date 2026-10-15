/** Llamados a la acción que se ofrecen en las configuraciones iniciales. */
export const CTA_OPTIONS = [
  'Más información',
  'Contáctanos',
  'Síguenos',
  'Solicita tu diagnóstico',
  'Agenda una reunión',
  'Cotiza tu proyecto',
  'Solicita una demostración',
  'Escríbenos por WhatsApp',
  'Escríbenos por mensaje directo',
  'Visita nuestro sitio web',
  'Descarga la guía gratis',
  'Reserva tu asesoría',
  'Regístrate hoy',
  'Suscríbete',
  'Comparte esta publicación',
  'Guarda este post',
  'Comenta y cuéntanos',
] as const;

export const DEFAULT_CTA = CTA_OPTIONS[0];

export const CUSTOM_CTA = '__custom__';

/** Elección en el desplegable: una opción de la lista o una frase propia. */
export interface CtaChoice {
  choice: string;
  custom: string;
}

const isPresetCta = (cta: string) => (CTA_OPTIONS as readonly string[]).includes(cta);

export const ctaChoiceFrom = (cta: string): CtaChoice =>
  isPresetCta(cta) ? { choice: cta, custom: '' } : { choice: CUSTOM_CTA, custom: cta };

export const ctaFrom = ({ choice, custom }: CtaChoice) =>
  (choice === CUSTOM_CTA ? custom : choice).trim();
