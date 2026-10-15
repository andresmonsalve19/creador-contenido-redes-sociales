import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, errorMessage } from '../../../shared/api/client';
import { Alert } from '../../../shared/ui/Alert';
import { Actions, Button } from '../../../shared/ui/Button';
import { Section } from '../../../shared/ui/Page';
import { Spinner } from '../../../shared/ui/Spinner';
import type { VideoAccount } from '../../../shared/video/types';
import { jobsKey, requestAgentPreview, requestGenerate } from '../api';
import { estimateSeconds } from '../types';
import { activeCards, buildSpec, type WizardState } from '../wizardReducer';
import styles from '../reels.module.css';

interface ApprovalPanelProps {
  state: WizardState;
  disabled: boolean;
  onCreated: (jobId: string) => void;
}

/**
 * Aprobación antes de generar: duración estimada, saldo de la cuenta y confirmación explícita.
 * Nada se envía a HeyGen sin el clic en "Generar video" con la casilla marcada.
 */
export function ApprovalPanel({ state, disabled, onCreated }: ApprovalPanelProps) {
  const queryClient = useQueryClient();
  const [confirmed, setConfirmed] = useState(false);
  const built = buildSpec(state);
  const scenes = state.script?.scenes ?? [];
  const cards = activeCards(state);
  const cardSeconds = (cards.intro ? 2 : 0) + (cards.outro ? 3 : 0);
  const totalSeconds =
    Math.round(
      (scenes.reduce((sum, scene) => sum + estimateSeconds(scene.script, state.wordsPerSecond), 0) +
        cardSeconds) *
        10,
    ) / 10;
  const agent = state.style === 'agent';
  const presenterScenes = scenes.filter((scene) => scene.kind === 'avatar').length;

  // Edición automática: el prompt exacto que recibirá HeyGen, para revisarlo antes de enviar.
  const preview = useQuery({
    queryKey: ['reels', 'agent-preview', 'spec' in built ? built.spec : null],
    queryFn: () => ('spec' in built ? requestAgentPreview(built.spec) : Promise.resolve('')),
    enabled: agent && 'spec' in built,
    staleTime: Infinity,
  });
  const brollScenes = scenes.length - presenterScenes;
  const cardList = [cards.intro && 'apertura', cards.outro && 'cierre'].filter(Boolean).join(' y ');

  // El saldo se consulta una vez (no con cada cambio del guion).
  const account = useQuery({
    queryKey: ['video', 'account'],
    queryFn: ({ signal }) =>
      api<{ account: VideoAccount }>('/video/account', { signal }).then((r) => r.account),
    staleTime: 60_000,
  });

  const generate = useMutation({
    mutationFn: () => {
      if ('missing' in built) throw new Error(built.missing);
      return requestGenerate(built.spec, state.duplicatedFrom);
    },
    onSuccess: async (job) => {
      setConfirmed(false);
      await queryClient.invalidateQueries({ queryKey: jobsKey });
      onCreated(job.id);
    },
  });

  return (
    <Section
      title={agent ? 'Enviar a HeyGen para el storyboard' : 'Aprobación y generación'}
      description={
        agent
          ? 'HeyGen prepara un storyboard con las tomas, textos y estilo. El video se genera solo cuando apruebes ese storyboard.'
          : 'Revisa la duración y el saldo. El video se genera solo cuando lo confirmes.'
      }
    >
      <div className={styles.approval}>
        <dl>
          <dt>Duración estimada</dt>
          <dd>
            {totalSeconds.toLocaleString('es-CO')} s de {state.durationSeconds} s
          </dd>
          <dt>Escenas</dt>
          <dd>
            {presenterScenes} con presentador
            {brollScenes > 0 && ` · ${brollScenes} de apoyo`}
          </dd>
          {agent && (
            <>
              <dt>Edición</dt>
              <dd>Video Agent de HeyGen, con revisión del storyboard</dd>
              <dt>Kit de marca</dt>
              <dd>{state.brandKitId ? 'Seleccionado' : 'Sin kit (logo adjunto)'}</dd>
            </>
          )}
          {cardList && (
            <>
              <dt>Tarjetas con el logo</dt>
              <dd>{cardList}</dd>
            </>
          )}
          <dt>Saldo en HeyGen</dt>
          <dd>
            {account.isPending ? (
              <Spinner size="sm" label="Consultando saldo" />
            ) : account.isError ? (
              'No disponible'
            ) : (
              account.data.summary
            )}
          </dd>
          <dt>Costo estimado</dt>
          <dd>Consulta la tarifa en tu panel de HeyGen</dd>
        </dl>
        <p className={styles.fine}>
          HeyGen no publica en su documentación el precio por segundo de la API; se cobra según la
          duración real del video y el tipo de avatar.
        </p>

        {agent && (
          <details className={styles.promptPreview}>
            <summary>Ver exactamente lo que se enviará a HeyGen</summary>
            {preview.isPending ? (
              <Spinner size="sm" label="Preparando la vista previa" />
            ) : preview.isError ? (
              <Alert>{errorMessage(preview.error)}</Alert>
            ) : (
              <pre>{preview.data}</pre>
            )}
          </details>
        )}

        <Alert tone="info">
          {agent
            ? 'El guion, el avatar, la voz y el logo se envían a HeyGen para preparar el storyboard. El guion y el texto se escribieron con Google Gemini.'
            : 'El guion, los avatares, la voz y los fondos se envían a HeyGen para crear el video. El guion y el texto se escribieron con Google Gemini.'}
        </Alert>

        {'missing' in built && <Alert>{built.missing}</Alert>}

        <label className={styles.check}>
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
            disabled={'missing' in built}
          />
          {agent
            ? 'Confirmo que quiero enviar este guion a HeyGen para preparar el storyboard. El video no se genera hasta que lo apruebe.'
            : 'Confirmo que quiero generar este video en HeyGen. Consume saldo de mi cuenta.'}
        </label>

        {generate.isError && <Alert>{errorMessage(generate.error)}</Alert>}

        <Actions>
          <Button
            disabled={!confirmed || disabled || 'missing' in built}
            loading={generate.isPending}
            loadingLabel="Enviando a HeyGen"
            onClick={() => generate.mutate()}
          >
            {agent ? 'Preparar storyboard en HeyGen' : 'Generar video'}
          </Button>
        </Actions>
      </div>
    </Section>
  );
}
