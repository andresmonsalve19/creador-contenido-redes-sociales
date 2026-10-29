import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { errorMessage } from '../../../shared/api/client';
import { Alert } from '../../../shared/ui/Alert';
import { Actions, Button } from '../../../shared/ui/Button';
import { Spinner } from '../../../shared/ui/Spinner';
import { TextArea } from '../../../shared/ui/TextArea';
import { fetchScenes, jobKey, jobsKey, sendSceneEdits } from '../api';
import type { ReelJob } from '../types';
import styles from '../reels.module.css';

const MIN_TEXT = 3;

/**
 * Cambios por escena ("Edit Scenes" de HeyGen): el cambio se envía una vez por cada escena
 * marcada, así HeyGen no decide a cuáles aplicarlo; las demás escenas quedan exactamente igual.
 */
export function SceneEditor({ job }: { job: ReelJob }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [general, setGeneral] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [specific, setSpecific] = useState<Record<string, string>>({});
  const [confirmed, setConfirmed] = useState(false);

  const scenes = useQuery({
    queryKey: ['reels', 'jobs', job.id, 'scenes', job.providerVideoId],
    queryFn: ({ signal }) => fetchScenes(job.id, signal),
    enabled: open,
    staleTime: Infinity,
  });

  const list = scenes.data?.scenes ?? [];
  const edits = list
    .map((scene, index) => {
      const text = [selected.has(scene.id) ? general.trim() : '', specific[scene.id]?.trim() ?? '']
        .filter((part) => part.length >= MIN_TEXT)
        .join(' ');
      return { sceneId: scene.id, scene: index + 1, text };
    })
    .filter((edit) => edit.text.length >= MIN_TEXT);

  const send = useMutation({
    mutationFn: () => {
      const data = scenes.data;
      if (!data) throw new Error('Carga las escenas primero.');
      return sendSceneEdits(job.id, {
        snapshotVideoId: data.videoId,
        editVersion: data.editVersion,
        edits,
      });
    },
    onSuccess: async (updated) => {
      setGeneral('');
      setSelected(new Set());
      setSpecific({});
      setConfirmed(false);
      setOpen(false);
      queryClient.setQueryData(jobKey(job.id), updated);
      await queryClient.invalidateQueries({ queryKey: jobsKey });
    },
  });

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const allSelected = list.length > 0 && list.every((scene) => selected.has(scene.id));
  const lastEdit = job.agent?.edits?.[0];

  return (
    <details
      className={styles.sceneEditor}
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>Editar escenas</summary>
      <p className={styles.fine}>
        Cada cambio se aplica solo a las escenas que marques; las demás quedan exactamente igual.
        Genera un video nuevo que reemplaza a este (el anterior sigue en tu cuenta de HeyGen).
      </p>
      {lastEdit && (
        <p className={styles.fine}>
          Último cambio: {lastEdit.items.map((item) => `escena ${item.scene}`).join(', ')}.
        </p>
      )}

      {scenes.isPending && open ? (
        <Spinner label="Leyendo las escenas en HeyGen" />
      ) : scenes.isError ? (
        <Alert>{errorMessage(scenes.error)}</Alert>
      ) : list.length > 0 ? (
        <>
          <TextArea
            label="Cambio para las escenas marcadas"
            value={general}
            onChange={(event) => setGeneral(event.target.value)}
            placeholder="Ej.: logo un poco más grande, arriba a la derecha; fondo crema liso."
            maxLength={1000}
            rows={2}
          />
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={allSelected}
              onChange={() =>
                setSelected(allSelected ? new Set() : new Set(list.map((scene) => scene.id)))
              }
            />
            Aplicar a todas las escenas ({list.length})
          </label>

          <ol className={styles.sceneList}>
            {list.map((scene, index) => (
              <li key={scene.id}>
                <label className={styles.check}>
                  <input
                    type="checkbox"
                    checked={selected.has(scene.id)}
                    onChange={() => toggle(scene.id)}
                  />
                  <span>
                    <strong>
                      Escena {index + 1} ·{' '}
                      {scene.hasPresenter ? 'con presentador' : 'sin presentador'}
                    </strong>
                    <small>{scene.script || 'Sin voz (cierre o pausa)'}</small>
                  </span>
                </label>
                <TextArea
                  label={`Cambio solo para la escena ${index + 1} (opcional)`}
                  hideLabel
                  value={specific[scene.id] ?? ''}
                  onChange={(event) =>
                    setSpecific((current) => ({ ...current, [scene.id]: event.target.value }))
                  }
                  placeholder={`Solo escena ${index + 1} (opcional)`}
                  maxLength={1000}
                  rows={1}
                />
              </li>
            ))}
          </ol>

          <label className={styles.check}>
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            Entiendo que aplicar los cambios genera un video nuevo y consume saldo de HeyGen.
          </label>
          <Actions>
            <Button
              disabled={!confirmed || edits.length === 0}
              loading={send.isPending}
              loadingLabel="Enviando cambios"
              onClick={() => send.mutate()}
            >
              {edits.length > 0
                ? `Aplicar cambios en ${edits.length} ${edits.length === 1 ? 'escena' : 'escenas'}`
                : 'Aplicar cambios'}
            </Button>
          </Actions>
          {send.isError && <Alert>{errorMessage(send.error)}</Alert>}
        </>
      ) : scenes.isSuccess ? (
        <p className={styles.fine}>HeyGen no devolvió escenas para este video.</p>
      ) : null}
    </details>
  );
}
