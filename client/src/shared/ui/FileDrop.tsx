import { useId, useState, type DragEvent, type ReactNode } from 'react';
import styles from './FileDrop.module.css';

interface FileDropProps {
  label: string;
  hint: string;
  accept: string;
  file: File | null;
  /** Nombre del archivo ya guardado en el servidor, si existe. */
  currentFileName?: string;
  onChange: (file: File | null) => void;
  preview?: ReactNode;
}

export function FileDrop({
  label,
  hint,
  accept,
  file,
  currentFileName,
  onChange,
  preview,
}: FileDropProps) {
  const id = useId();
  const [dragging, setDragging] = useState(false);

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragging(false);
    const dropped = event.dataTransfer.files[0];
    if (dropped) onChange(dropped);
  };

  const status = file
    ? `Seleccionado: ${file.name}`
    : currentFileName
      ? `Guardado: ${currentFileName}`
      : 'Ningún archivo seleccionado';

  return (
    <div className={styles.field}>
      <label
        htmlFor={id}
        className={styles.zone}
        data-dragging={dragging || undefined}
        data-filled={Boolean(file || currentFileName) || undefined}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        {preview}
        <span className={styles.label}>{label}</span>
        <span className={styles.hint}>{hint}</span>
        <span className={styles.status}>{status}</span>
        <span className={styles.cta}>
          {file || currentFileName ? 'Cambiar archivo' : 'Elegir archivo'}
        </span>
      </label>
      <input
        id={id}
        type="file"
        accept={accept}
        className="visually-hidden"
        onChange={(event) => onChange(event.target.files?.[0] ?? null)}
      />
    </div>
  );
}
