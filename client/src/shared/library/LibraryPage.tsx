import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { errorMessage } from '../api/client';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Page } from '../ui/Page';
import { Spinner } from '../ui/Spinner';
import { useVideoConfigured } from '../video/useVideo';
import {
  deleteLibraryItem,
  downloadItemZip,
  fetchAccountVideos,
  fetchLibrary,
  fetchReels,
  importImages,
  libraryKey,
  type LibraryItem,
} from './api';
import styles from './Library.module.css';

type Tab = 'images' | 'reels' | 'heygen';

const date = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' });

const KIND_LABEL: Record<LibraryItem['kind'], string> = {
  single: 'Imagen única',
  carousel: 'Carrusel',
  edit: 'Imagen editada',
  import: 'Importada',
};
const SOURCE_LABEL: Record<LibraryItem['source'], string> = {
  app: '',
  import: '',
  claude: 'Creada con Claude',
};

/** Todo lo creado en un solo lugar: imágenes, reels de la app y videos de la cuenta de HeyGen. */
export default function LibraryPage() {
  const [tab, setTab] = useState<Tab>('images');
  const videoConfigured = useVideoConfigured();

  const tabs: { value: Tab; label: string }[] = [
    { value: 'images', label: 'Imágenes' },
    ...(videoConfigured
      ? [
          { value: 'reels' as const, label: 'Reels de la app' },
          { value: 'heygen' as const, label: 'Videos en HeyGen' },
        ]
      : []),
  ];

  return (
    <Page
      title="Mis contenidos"
      lead="Todo lo que creas se guarda aquí automáticamente, aunque no lo descargues."
      width="wide"
    >
      <div className={styles.tabs} role="tablist" aria-label="Tipo de contenido">
        {tabs.map((option) => (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={tab === option.value}
            className={styles.tab}
            onClick={() => setTab(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
      {tab === 'images' && <ImagesTab />}
      {tab === 'reels' && <ReelsTab />}
      {tab === 'heygen' && <HeyGenTab />}
    </Page>
  );
}

function ImagesTab() {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const items = useQuery({ queryKey: libraryKey, queryFn: ({ signal }) => fetchLibrary(signal) });

  const upload = useMutation({
    mutationFn: importImages,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: libraryKey }),
  });
  const remove = useMutation({
    mutationFn: deleteLibraryItem,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: libraryKey }),
  });
  const zip = useMutation({ mutationFn: downloadItemZip });

  const copy = async (item: LibraryItem) => {
    try {
      await navigator.clipboard.writeText(item.caption);
      setCopied(item.id);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      setCopied(null);
    }
  };

  return (
    <section className={styles.panel}>
      <div className={styles.toolbar}>
        <Button
          variant="secondary"
          loading={upload.isPending}
          loadingLabel="Importando"
          onClick={() => inputRef.current?.click()}
        >
          Importar imágenes
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          hidden
          onChange={(event) => {
            const files = [...(event.target.files ?? [])];
            event.target.value = '';
            if (files.length > 0) upload.mutate(files);
          }}
        />
        <p className={styles.fine}>
          Suma imágenes que ya tienes, por ejemplo las que descargaste antes (PNG, JPG o WebP, hasta
          20 a la vez).
        </p>
      </div>
      {(upload.isError || remove.isError || zip.isError) && (
        <Alert>{errorMessage(upload.error ?? remove.error ?? zip.error)}</Alert>
      )}

      {items.isPending ? (
        <Spinner label="Cargando tus imágenes" />
      ) : items.isError ? (
        <Alert>{errorMessage(items.error)}</Alert>
      ) : items.data.length === 0 ? (
        <p className={styles.empty}>
          Aún no hay imágenes. Las que crees desde ahora aparecerán aquí automáticamente.
        </p>
      ) : (
        <ul className={styles.grid}>
          {items.data.map((item) => {
            const cover = item.slides[0];
            const open = openId === item.id;
            return (
              <li key={item.id} className={styles.card} data-open={open || undefined}>
                <button
                  type="button"
                  className={styles.cover}
                  onClick={() => setOpenId(open ? null : item.id)}
                  aria-expanded={open}
                >
                  {cover && <img src={cover.url} alt="" loading="lazy" />}
                  {item.slides.length > 1 && (
                    <span className={styles.count}>{item.slides.length} imágenes</span>
                  )}
                </button>
                <div className={styles.meta}>
                  <strong>{item.title || 'Sin título'}</strong>
                  <small>
                    {[
                      KIND_LABEL[item.kind],
                      SOURCE_LABEL[item.source],
                      date.format(new Date(item.updatedAt)),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </small>
                </div>

                {open && (
                  <div className={styles.detail}>
                    <ul className={styles.slides}>
                      {item.slides.map((slide) => (
                        <li key={slide.index}>
                          <a href={slide.url} target="_blank" rel="noreferrer">
                            <img src={slide.url} alt={`Imagen ${slide.index + 1}`} loading="lazy" />
                          </a>
                          <a className={styles.link} href={`${slide.url}&download=1`} download>
                            Descargar {slide.index + 1}
                          </a>
                          <Link
                            className={styles.link}
                            to={`/crear/editar-imagen?pieza=${item.id}&imagen=${slide.index}`}
                          >
                            Editar
                          </Link>
                        </li>
                      ))}
                    </ul>
                    {item.caption && <p className={styles.caption}>{item.caption}</p>}
                  </div>
                )}

                <div className={styles.actions}>
                  {item.slides.length > 1 ? (
                    <button
                      type="button"
                      className={styles.link}
                      onClick={() => zip.mutate(item)}
                      disabled={zip.isPending}
                    >
                      Descargar todo (ZIP)
                    </button>
                  ) : (
                    cover && (
                      <a className={styles.link} href={`${cover.url}&download=1`} download>
                        Descargar
                      </a>
                    )
                  )}
                  {item.caption && (
                    <button type="button" className={styles.link} onClick={() => void copy(item)}>
                      {copied === item.id ? 'Texto copiado' : 'Copiar texto'}
                    </button>
                  )}
                  <button
                    type="button"
                    className={styles.link}
                    disabled={remove.isPending}
                    onClick={() => {
                      if (
                        window.confirm(`¿Borrar "${item.title || 'esta pieza'}" de la biblioteca?`)
                      ) {
                        remove.mutate(item.id);
                      }
                    }}
                  >
                    Borrar
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function ReelsTab() {
  const reels = useQuery({
    queryKey: ['reels', 'jobs'],
    queryFn: ({ signal }) => fetchReels(signal),
  });
  const done = reels.data?.filter((reel) => reel.status === 'completed' && reel.videoUrl) ?? [];

  if (reels.isPending) return <Spinner label="Cargando tus reels" />;
  if (reels.isError) return <Alert>{errorMessage(reels.error)}</Alert>;
  if (done.length === 0) {
    return <p className={styles.empty}>Aún no hay reels terminados creados desde la app.</p>;
  }
  return (
    <ul className={styles.grid}>
      {done.map((reel) => (
        <li key={reel.id} className={styles.card}>
          <video
            className={styles.video}
            src={reel.videoUrl ?? undefined}
            controls
            playsInline
            preload="metadata"
            style={{ aspectRatio: reel.spec.aspectRatio.replace(':', ' / ') }}
          />
          <div className={styles.meta}>
            <strong>{reel.spec.title}</strong>
            <small>
              {date.format(new Date(reel.createdAt))}
              {reel.durationSeconds ? ` · ${Math.round(reel.durationSeconds)} s` : ''}
            </small>
          </div>
          <div className={styles.actions}>
            <a className={styles.link} href={`${reel.videoUrl}?download=1`} download>
              Descargar MP4
            </a>
          </div>
        </li>
      ))}
    </ul>
  );
}

function HeyGenTab() {
  const videos = useQuery({
    queryKey: ['video', 'account-videos'],
    queryFn: ({ signal }) => fetchAccountVideos(signal),
    // Los enlaces de HeyGen expiran: se piden de nuevo al volver a la pestaña.
    staleTime: 60_000,
  });

  if (videos.isPending) return <Spinner label="Consultando tus videos en HeyGen" />;
  if (videos.isError) return <Alert>{errorMessage(videos.error)}</Alert>;
  if (videos.data.length === 0) {
    return <p className={styles.empty}>Tu cuenta de HeyGen aún no tiene videos.</p>;
  }
  return (
    <>
      <p className={styles.fine}>
        Incluye los videos hechos en la web de HeyGen. Los enlaces son temporales: descarga los que
        quieras conservar.
      </p>
      <ul className={styles.grid}>
        {videos.data.map((video) => (
          <li key={video.id} className={styles.card}>
            {video.videoUrl ? (
              <video
                className={styles.video}
                src={video.videoUrl}
                poster={video.thumbnailUrl ?? undefined}
                controls
                playsInline
                preload="none"
              />
            ) : video.thumbnailUrl ? (
              <img className={styles.video} src={video.thumbnailUrl} alt="" loading="lazy" />
            ) : null}
            <div className={styles.meta}>
              <strong>{video.title || 'Sin título'}</strong>
              <small>
                {[
                  video.createdAt ? date.format(new Date(video.createdAt * 1000)) : null,
                  video.durationSeconds ? `${Math.round(video.durationSeconds)} s` : null,
                  video.status === 'completed' ? null : video.status,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </small>
            </div>
            {video.videoUrl && (
              <div className={styles.actions}>
                <a className={styles.link} href={video.videoUrl} target="_blank" rel="noreferrer">
                  Abrir o descargar
                </a>
              </div>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
