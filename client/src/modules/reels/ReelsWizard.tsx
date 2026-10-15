import { useEffect, useReducer } from 'react';
import { useNavigate } from 'react-router-dom';
import { errorMessage } from '../../shared/api/client';
import { loadContact, saveContact } from '../../shared/publishing/contactStorage';
import { Alert } from '../../shared/ui/Alert';
import { Page } from '../../shared/ui/Page';
import { Spinner } from '../../shared/ui/Spinner';
import { Stepper } from '../../shared/ui/Stepper';
import type { VideoSettings } from '../../shared/video/types';
import { useVideoConfigured, useVideoSettings } from '../../shared/video/useVideo';
import { ConnectHeyGen } from './components/ConnectHeyGen';
import { History } from './components/History';
import { REEL_FLOW_STEPS } from './meta';
import { FormatTopicStep } from './steps/FormatTopicStep';
import { ScriptStep } from './steps/ScriptStep';
import { SettingsStep } from './steps/SettingsStep';
import { initialWizardState, wizardReducer, type WizardStep } from './wizardReducer';
import styles from './reels.module.css';

const TITLE = 'Reel';
const LEAD = 'Un video corto con avatar, con el guion y la voz de tu marca.';

export default function ReelsWizard() {
  const configured = useVideoConfigured();
  const settings = useVideoSettings();

  if (configured === null || (configured && settings.isPending)) {
    return <Spinner label="Cargando configuración de video" />;
  }
  if (!configured) {
    return (
      <Page title={TITLE} lead={LEAD}>
        <ConnectHeyGen />
      </Page>
    );
  }
  if (!settings.data) {
    return (
      <Page title={TITLE} lead={LEAD}>
        <Alert>{errorMessage(settings.error)}</Alert>
      </Page>
    );
  }
  return (
    <Wizard
      settings={settings.data.settings}
      hasBrandImage={Boolean(settings.data.backgroundImage)}
    />
  );
}

function Wizard({ settings, hasBrandImage }: { settings: VideoSettings; hasBrandImage: boolean }) {
  const navigate = useNavigate();
  const [state, dispatch] = useReducer(wizardReducer, settings, (initial) =>
    initialWizardState(initial, loadContact()),
  );

  // Cada paso empieza arriba, no donde quedó el botón del paso anterior.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [state.step]);

  const selectStep = (index: number) => {
    if (index === 0) navigate('/crear');
    else dispatch({ type: 'goTo', step: index as WizardStep });
  };

  return (
    <Page title={TITLE} lead={LEAD} width="wide">
      <Stepper steps={REEL_FLOW_STEPS} current={state.step} onSelect={selectStep} />

      <div className={styles.flow}>
        {state.step === 1 && (
          <SettingsStep
            state={state}
            favoriteAvatarIds={settings.favoriteAvatarIds}
            onBack={() => navigate('/crear')}
            onContinue={(next) => {
              saveContact(next.contact);
              dispatch({ type: 'setSettings', ...next });
              dispatch({ type: 'goTo', step: 2 });
            }}
          />
        )}
        {state.step === 2 && (
          <FormatTopicStep state={state} dispatch={dispatch} hasBrandImage={hasBrandImage} />
        )}
        {state.step === 3 && <ScriptStep state={state} dispatch={dispatch} />}
      </div>

      <History
        onDuplicate={(spec, duplicatedFrom) =>
          dispatch({ type: 'loadDraft', spec, duplicatedFrom })
        }
      />
    </Page>
  );
}
