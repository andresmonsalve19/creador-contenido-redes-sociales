import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId, useState, type FormEvent } from 'react';
import { api, errorMessage } from '../api/client';
import type { CredentialStatus } from '../api/types';
import { Alert } from '../ui/Alert';
import { Actions, Button } from '../ui/Button';
import styles from './Setup.module.css';

interface CredentialsFormProps {
  credentials: CredentialStatus[];
  onDone: () => void;
}

export function CredentialsForm({ credentials, onDone }: CredentialsFormProps) {
  const queryClient = useQueryClient();
  const [values, setValues] = useState<Record<string, string>>({});

  const save = useMutation({
    mutationFn: (payload: Record<string, string>) =>
      api<{ saved: string[] }>('/setup/credentials', { method: 'POST', json: { values: payload } }),
    onSuccess: async () => {
      setValues({});
      await queryClient.invalidateQueries({ queryKey: ['setup'] });
      await queryClient.invalidateQueries({ queryKey: ['models'] });
      onDone();
    },
  });

  const filled = Object.fromEntries(Object.entries(values).filter(([, value]) => value.trim()));
  const missing = credentials.some((c) => !c.optional && !c.configured && !filled[c.key]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (Object.keys(filled).length === 0) {
      onDone();
      return;
    }
    save.mutate(filled);
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      {credentials.map((credential) => (
        <SecretField
          key={credential.key}
          credential={credential}
          value={values[credential.key] ?? ''}
          onChange={(value) => setValues((prev) => ({ ...prev, [credential.key]: value }))}
        />
      ))}

      <p className={styles.note}>
        Las claves se validan con el proveedor y se guardan en el archivo <code>.env</code> del
        servidor. Nunca se envían de vuelta al navegador.
      </p>

      {save.isError && <Alert>{errorMessage(save.error)}</Alert>}

      <Actions>
        <Button type="submit" disabled={missing} loading={save.isPending} loadingLabel="Validando">
          {Object.keys(filled).length > 0 ? 'Validar y guardar' : 'Continuar'}
        </Button>
      </Actions>
    </form>
  );
}

interface SecretFieldProps {
  credential: CredentialStatus;
  value: string;
  onChange: (value: string) => void;
}

function SecretField({ credential, value, onChange }: SecretFieldProps) {
  const id = useId();
  const [visible, setVisible] = useState(false);

  return (
    <div className={styles.secret}>
      <label htmlFor={id} className={styles.secretLabel}>
        {credential.label}
        {credential.configured && <span className={styles.ok}>Configurada</span>}
        {!credential.configured && credential.optional && (
          <span className={styles.optional}>Opcional</span>
        )}
      </label>
      <p id={`${id}-desc`} className={styles.secretDescription}>
        {credential.description}{' '}
        <a href={credential.helpUrl} target="_blank" rel="noreferrer">
          Obtener la clave
        </a>
      </p>
      <div className={styles.secretInput}>
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={
            credential.configured
              ? 'Escribe una nueva solo si quieres reemplazarla'
              : 'Pega aquí tu API key'
          }
          autoComplete="off"
          spellCheck={false}
          aria-describedby={`${id}-desc`}
        />
        <button
          type="button"
          className={styles.reveal}
          onClick={() => setVisible((v) => !v)}
          aria-pressed={visible}
        >
          {visible ? 'Ocultar' : 'Mostrar'}
        </button>
      </div>
    </div>
  );
}
