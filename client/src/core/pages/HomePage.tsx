import { Actions, ButtonLink } from '../../shared/ui/Button';
import styles from './HomePage.module.css';

const STEPS = [
  {
    title: 'Elige el formato',
    text: 'Una imagen para el feed o un carrusel de hasta 10 imágenes.',
  },
  {
    title: 'Configura la publicación',
    text: 'Elige los modelos de IA, con su precio a la vista, y los datos de contacto que irán en el texto.',
  },
  {
    title: 'Define la temática',
    text: 'Escríbela tú o pide ideas a la IA basadas en lo que hace tu empresa.',
  },
  {
    title: 'Revisa y genera',
    text: 'Ajusta cada prompt antes de crear las imágenes y descárgalas listas para publicar.',
  },
] as const;

export default function HomePage() {
  return (
    <div className={styles.home}>
      <section className={styles.hero}>
        <div className={styles.heroText}>
          <h1>Publicaciones con la voz y los colores de tu marca</h1>
          <p className={styles.lead}>
            Convierte una idea en piezas para Instagram. La IA lee quién eres, cómo te ves y qué
            ofreces, y diseña cada imagen con tu paleta, tu tipografía y tu logo.
          </p>
          <Actions>
            <ButtonLink to="/crear">Crear contenido</ButtonLink>
            <ButtonLink to="/setup" variant="secondary">
              Actualizar marca
            </ButtonLink>
          </Actions>
        </div>
      </section>

      <section className={styles.how} aria-labelledby="como-funciona">
        <h2 id="como-funciona">Cómo funciona</h2>
        <ol className={styles.steps}>
          {STEPS.map((step, index) => (
            <li key={step.title} className={styles.step}>
              <span className={styles.stepNumber} aria-hidden="true">
                {index + 1}
              </span>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
