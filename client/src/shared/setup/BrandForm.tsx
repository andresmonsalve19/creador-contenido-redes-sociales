import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { api, errorMessage } from '../api/client';
import type { BrandContextResponse } from '../api/types';
import { setupKeys } from '../hooks/useSetupStatus';
import { Alert } from '../ui/Alert';
import { Actions, Button } from '../ui/Button';
import { FileDrop } from '../ui/FileDrop';
import styles from './Setup.module.css';

const MARKDOWN = /\.(md|markdown)$/i;
const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_MD = 300 * 1024;
const MAX_LOGO = 5 * 1024 * 1024;

interface Files {
  company: File | null;
  design: File | null;
  logo: File | null;
}

function validateFiles({ company, design, logo }: Files): string | null {
  for (const [file, label] of [
    [company, 'La información de la empresa'],
    [design, 'Los lineamientos de diseño'],
  ] as const) {
    if (!file) continue;
    if (!MARKDOWN.test(file.name)) return `${label} debe ser un archivo .md.`;
    if (file.size > MAX_MD) return `${label} supera los 300 KB.`;
  }
  if (logo && !LOGO_TYPES.includes(logo.type)) return 'El logo debe ser PNG, JPG o WebP.';
  if (logo && logo.size > MAX_LOGO) return 'El logo supera los 5 MB.';
  return null;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('No se pudo leer el archivo.'));
    reader.readAsDataURL(file);
  });
}

interface BrandFormProps {
  current: BrandContextResponse | undefined;
  onDone: () => void;
}

export function BrandForm({ current, onDone }: BrandFormProps) {
  const queryClient = useQueryClient();
  const [files, setFiles] = useState<Files>({ company: null, design: null, logo: null });
  const [clientError, setClientError] = useState<string | null>(null);
  const [localLogo, setLocalLogo] = useState<string | null>(null);
  const logoPreview = localLogo ?? current?.logo?.url ?? null;

  const save = useMutation({
    mutationFn: (formData: FormData) =>
      api<{ complete: boolean }>('/context', { method: 'PUT', formData }),
    onSuccess: async ({ complete }) => {
      setFiles({ company: null, design: null, logo: null });
      setLocalLogo(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: setupKeys.status }),
        queryClient.invalidateQueries({ queryKey: setupKeys.context }),
      ]);
      if (complete) onDone();
    },
  });

  const has = {
    company: Boolean(files.company || current?.company),
    design: Boolean(files.design || current?.design),
    logo: Boolean(files.logo || current?.logo),
  };
  const hasChanges = Boolean(files.company || files.design || files.logo);
  const complete = has.company && has.design && has.logo;

  const setFile = (key: keyof Files) => (file: File | null) => {
    setClientError(null);
    setFiles((prev) => ({ ...prev, [key]: file }));
    if (key !== 'logo') return;
    setLocalLogo(null);
    if (file && LOGO_TYPES.includes(file.type)) {
      readAsDataUrl(file).then(setLocalLogo, () => setLocalLogo(null));
    }
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!hasChanges) {
      onDone();
      return;
    }
    const error = validateFiles(files);
    if (error) {
      setClientError(error);
      return;
    }
    const formData = new FormData();
    for (const key of ['company', 'design', 'logo'] as const) {
      const file = files[key];
      if (file) formData.append(key, file);
    }
    save.mutate(formData);
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      <div className={styles.files}>
        <FileDrop
          label="Información de la empresa"
          hint="Markdown con a qué se dedican, servicios, público y tono de voz."
          accept=".md,.markdown,text/markdown"
          file={files.company}
          currentFileName={current?.company?.fileName}
          onChange={setFile('company')}
        />
        <FileDrop
          label="Lineamientos de diseño"
          hint="Markdown con colores (HEX), tipografías y estilo visual."
          accept=".md,.markdown,text/markdown"
          file={files.design}
          currentFileName={current?.design?.fileName}
          onChange={setFile('design')}
        />
        <FileDrop
          label="Logo"
          hint="PNG, JPG o WebP, idealmente con fondo transparente."
          accept="image/png,image/jpeg,image/webp"
          file={files.logo}
          currentFileName={current?.logo?.fileName}
          onChange={setFile('logo')}
          preview={
            logoPreview ? (
              <img src={logoPreview} alt="Vista previa del logo" className={styles.logo} />
            ) : null
          }
        />
      </div>

      {(clientError || save.isError) && <Alert>{clientError ?? errorMessage(save.error)}</Alert>}

      <Actions>
        <Button
          type="submit"
          disabled={!complete}
          loading={save.isPending}
          loadingLabel="Guardando"
        >
          {hasChanges ? 'Guardar marca' : 'Continuar'}
        </Button>
      </Actions>
    </form>
  );
}
