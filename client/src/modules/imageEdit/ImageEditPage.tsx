import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { errorMessage } from '../../shared/api/client';
import type { InlineImage } from '../../shared/api/types';
import { ModelSelector } from '../../shared/models/ModelSelector';
import { Alert } from '../../shared/ui/Alert';
import { Actions, Button } from '../../shared/ui/Button';
import { FileDrop } from '../../shared/ui/FileDrop';
import { Page, Section } from '../../shared/ui/Page';
import { Select } from '../../shared/ui/Select';
import { Stepper } from '../../shared/ui/Stepper';
import { TextArea } from '../../shared/ui/TextArea';
import { TextField } from '../../shared/ui/TextField';
import { readImageFile, requestEdit, type EditAspectRatio, type EditRequest } from './api';
import { IMAGE_EDIT_STEPS } from './meta';
import styles from './imageEdit.module.css';

const TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_BYTES = 15 * 1024 * 1024;

const ASPECTS: { value: EditAspectRatio; label: string }[] = [
  { value: 'original', label: 'Mantener la original' },
  { value: '1:1', label: 'Cuadrada (1:1)' },
  { value: '4:5', label: 'Vertical para el feed (4:5)' },
  { value: '9:16', label: 'Historia o reel (9:16)' },
  { value: '16:9', label: 'Horizontal (16:9)' },
];

const toDataUrl = (image: InlineImage) => `data:${image.mimeType};base64,${image.data}`;

/**
 * Editar una imagen propia con instrucciones (Nano Banana). La imagen puede venir de un archivo
 * o de "Mis contenidos" (?pieza=<id>&imagen=<n>). Cada resultado se guarda en la biblioteca;
 * "Seguir ajustando" parte del último resultado y reemplaza la versión guardada.
 */
export default function ImageEditPage() {
  const [params] = useSearchParams();
  const fromLibrary = params.get('pieza');
  const fromIndex = Number(params.get('imagen') ?? 0);

  const [file, setFile] = useState<File | null>(null);
  const [original, setOriginal] = useState<InlineImage | null>(null);
  const [imageModel, setImageModel] = useState<string | null>(null);
  const [instructions, setInstructions] = useState('');
  const [applyBrand, setApplyBrand] = useState(true);
  const [aspectRatio, setAspectRatio] = useState<EditAspectRatio>('original');
  const [title, setTitle] = useState('');
  const [result, setResult] = useState<InlineImage | null>(null);
  const [libraryId, setLibraryId] = useState<string | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);

  const edit = useMutation({
    mutationFn: (body: EditRequest) => requestEdit(body),
    onSuccess: (response) => {
      setResult(response.image);
      setLibraryId(response.libraryId);
      setInstructions('');
    },
  });

  const chooseFile = async (next: File | null) => {
    setFile(next);
    setResult(null);
    setLibraryId(null);
    setClientError(null);
    if (!next) return setOriginal(null);
    if (!TYPES.includes(next.type)) return setClientError('La imagen debe ser PNG, JPG o WebP.');
    if (next.size > MAX_BYTES) return setClientError('La imagen supera los 15 MB.');
    try {
      setOriginal(await readImageFile(next));
    } catch (error) {
      setClientError(errorMessage(error));
    }
  };

  /** La primera edición parte del original; las siguientes, del último resultado. */
  const source = (): EditRequest['image'] | null => {
    if (result) return { type: 'upload', image: result };
    if (original) return { type: 'upload', image: original };
    if (fromLibrary) return { type: 'library', id: fromLibrary, index: fromIndex };
    return null;
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const image = source();
    if (!image) return setClientError('Elige la imagen que quieres editar.');
    setClientError(null);
    edit.mutate({
      ...(imageModel ? { imageModel } : {}),
      image,
      instructions: instructions.trim(),
      applyBrand,
      aspectRatio,
      title: title.trim(),
      ...(libraryId ? { libraryId } : {}),
    });
  };

  const hasSource = Boolean(original || fromLibrary);
  const before = original
    ? toDataUrl(original)
    : fromLibrary
      ? `/api/library/${fromLibrary}/${fromIndex}`
      : null;

  return (
    <Page title="Editar una imagen" lead="Sube una imagen y dile a la IA qué cambiar.">
      <Stepper steps={IMAGE_EDIT_STEPS} current={1} />
      <Section>
        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          {!fromLibrary && (
            <FileDrop
              label="Imagen"
              hint="PNG, JPG o WebP de hasta 15 MB."
              accept="image/png,image/jpeg,image/webp"
              file={file}
              onChange={(next) => void chooseFile(next)}
            />
          )}
          {fromLibrary && (
            <p className={styles.fine}>
              Editando una imagen de <Link to="/biblioteca">Mis contenidos</Link>.
            </p>
          )}

          <Alert tone="info">
            La IA vuelve a generar la imagen: puede cambiar detalles pequeños (rasgos, letras
            pequeñas). Con fotos de pacientes: solo con su consentimiento escrito, sin datos que los
            identifiquen y nunca para alterar resultados de antes y después. La imagen se envía a
            Google (Gemini) para editarla.
          </Alert>

          <TextArea
            label={result ? '¿Qué más cambiarías?' : '¿Qué quieres cambiar?'}
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
            rows={3}
            maxLength={2000}
            placeholder='Ej.: cambia el fondo por uno crema liso, agrega abajo el texto "Agenda tu valoración" y pon el logo arriba a la derecha.'
          />
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={applyBrand}
              onChange={(event) => setApplyBrand(event.target.checked)}
            />
            Aplicar mi marca: logo, colores, tipografía y slogans en lo que se agregue.
          </label>
          <Select
            label="Formato"
            options={ASPECTS}
            value={aspectRatio}
            onChange={(value) => setAspectRatio(value as EditAspectRatio)}
          />
          <TextField
            label="Nombre en Mis contenidos (opcional)"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={200}
          />
          <details className={styles.advanced}>
            <summary>Modelo de imagen</summary>
            <ModelSelector
              kind="image"
              legend="Modelo de imagen"
              value={imageModel}
              onChange={setImageModel}
            />
          </details>

          {(clientError ?? edit.error) && <Alert>{clientError ?? errorMessage(edit.error)}</Alert>}
          <Actions>
            <Button
              type="submit"
              disabled={!hasSource || instructions.trim().length < 3}
              loading={edit.isPending}
              loadingLabel="Editando la imagen"
            >
              {result ? 'Seguir ajustando' : 'Editar imagen'}
            </Button>
          </Actions>
        </form>

        {(before || result) && (
          <div className={styles.compare}>
            {before && (
              <figure>
                <img src={before} alt="Imagen original" />
                <figcaption>Original</figcaption>
              </figure>
            )}
            {result && (
              <figure>
                <img src={toDataUrl(result)} alt="Imagen editada" />
                <figcaption>
                  Editada ·{' '}
                  <a
                    href={toDataUrl(result)}
                    download={`imagen-editada.${result.mimeType.split('/')[1]?.replace('jpeg', 'jpg') ?? 'png'}`}
                  >
                    Descargar
                  </a>{' '}
                  · Guardada en <Link to="/biblioteca">Mis contenidos</Link>
                </figcaption>
              </figure>
            )}
          </div>
        )}
      </Section>
    </Page>
  );
}
