import { useEffect, useReducer } from 'react';
import { useNavigate } from 'react-router-dom';
import { Page } from '../../shared/ui/Page';
import { Stepper } from '../../shared/ui/Stepper';
import { loadContact, saveContact } from '../../shared/publishing/contactStorage';
import { IMAGE_FLOW_STEPS } from './meta';
import { FormatTopicStep } from './steps/FormatTopicStep';
import { PromptReviewStep } from './steps/PromptReviewStep';
import { SettingsStep } from './steps/SettingsStep';
import { initialWizardState, wizardReducer, type WizardStep } from './wizardReducer';
import styles from './images.module.css';

export default function ImagesWizard() {
  const navigate = useNavigate();
  const [state, dispatch] = useReducer(wizardReducer, initialWizardState, (initial) => ({
    ...initial,
    contact: loadContact(),
  }));

  // Cada paso empieza arriba, no donde quedó el botón del paso anterior.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [state.step]);

  const selectStep = (index: number) => {
    if (index === 0) navigate('/crear');
    else dispatch({ type: 'goTo', step: index as WizardStep });
  };

  return (
    <Page
      title="Post en el feed"
      lead="Imágenes diseñadas con la identidad de tu marca, listas para Instagram."
      width="wide"
    >
      <Stepper steps={IMAGE_FLOW_STEPS} current={state.step} onSelect={selectStep} />

      <div className={styles.flow}>
        {state.step === 1 && (
          <SettingsStep
            textModel={state.textModel}
            imageModel={state.imageModel}
            contact={state.contact}
            cta={state.cta}
            onBack={() => navigate('/crear')}
            onContinue={(settings) => {
              saveContact(settings.contact);
              dispatch({ type: 'setSettings', ...settings });
              dispatch({ type: 'goTo', step: 2 });
            }}
          />
        )}
        {state.step === 2 && <FormatTopicStep state={state} dispatch={dispatch} />}
        {state.step === 3 && <PromptReviewStep state={state} dispatch={dispatch} />}
      </div>
    </Page>
  );
}
