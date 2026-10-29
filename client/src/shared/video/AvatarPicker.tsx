import { useId, useMemo, useState } from 'react';
import { Button } from '../ui/Button';
import { TextField } from '../ui/TextField';
import { genderOf } from './gender';
import { useAvatarRecommendations } from './recommend';
import { AVATAR_TYPE_LABEL, requiresAuthorization, type VideoAvatar } from './types';
import styles from './VideoPickers.module.css';

const PAGE = 24;
type Filter = 'all' | 'private' | 'public';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'private', label: 'De mi cuenta' },
  { value: 'public', label: 'De stock' },
];

type TypeFilter = 'all' | 'studio_avatar' | 'photo_avatar';

const TYPE_FILTERS: { value: TypeFilter; label: string }[] = [
  { value: 'all', label: 'Todos los tipos' },
  { value: 'studio_avatar', label: 'De estudio (video)' },
  { value: 'photo_avatar', label: 'Photo avatar (foto animada)' },
];

type GenderFilter = 'all' | 'female' | 'male' | 'unknown';

const GENDER_FILTERS: { value: GenderFilter; label: string }[] = [
  { value: 'all', label: 'Todos los géneros' },
  { value: 'female', label: 'Mujer' },
  { value: 'male', label: 'Hombre' },
  { value: 'unknown', label: 'Sin especificar' },
];

interface AvatarPickerProps {
  legend: string;
  avatars: VideoAvatar[];
  /** Ids seleccionados. En modo "single" tiene como máximo uno. */
  value: string[];
  onChange: (ids: string[]) => void;
  mode?: 'single' | 'multiple';
  /** Ids que se muestran primero (p. ej. los favoritos de la marca). */
  pinnedIds?: string[];
  max?: number;
}

/** Selector de avatares con búsqueda, filtro y vista previa (imagen o video del proveedor). */
export function AvatarPicker({
  legend,
  avatars,
  value,
  onChange,
  mode = 'single',
  pinnedIds = [],
  max,
}: AvatarPickerProps) {
  const name = useId();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [gender, setGender] = useState<GenderFilter>('all');
  const [type, setType] = useState<TypeFilter>('all');
  const [visible, setVisible] = useState(PAGE);
  const [previewId, setPreviewId] = useState<string | null>(value[0] ?? null);

  const recommendations = useAvatarRecommendations(avatars);
  const [onlyRecommended, setOnlyRecommended] = useState(false);

  const ordered = useMemo(() => {
    const pinned = new Set([...value, ...pinnedIds]);
    const text = query.trim().toLowerCase();
    const score = (avatar: VideoAvatar) =>
      (pinned.has(avatar.id) ? 100 : 0) + (recommendations.get(avatar.id)?.score ?? 0);
    return (
      avatars
        .filter((avatar) => !onlyRecommended || recommendations.has(avatar.id))
        .filter((avatar) => filter === 'all' || avatar.ownership === filter)
        .filter((avatar) => gender === 'all' || genderOf(avatar) === gender)
        .filter((avatar) => type === 'all' || avatar.type === type)
        .filter((avatar) => !text || avatar.name.toLowerCase().includes(text))
        // Primero los elegidos y luego los recomendados para español.
        .sort((a, b) => score(b) - score(a))
    );
  }, [avatars, filter, gender, type, query, value, pinnedIds, recommendations, onlyRecommended]);

  // El filtro por tipo solo se muestra si hay avatares de más de un tipo.
  const showTypes = new Set(avatars.map((avatar) => avatar.type)).size > 1;

  // "Sin especificar" solo se ofrece si algún avatar viene sin género.
  const genderOptions = GENDER_FILTERS.filter(
    (option) => option.value !== 'unknown' || avatars.some((a) => genderOf(a) === 'unknown'),
  );

  const preview = avatars.find((avatar) => avatar.id === previewId) ?? null;
  const limitReached = mode === 'multiple' && max !== undefined && value.length >= max;

  const toggle = (id: string) => {
    setPreviewId(id);
    if (mode === 'single') {
      onChange([id]);
      return;
    }
    if (value.includes(id)) onChange(value.filter((v) => v !== id));
    else if (!limitReached) onChange([...value, id]);
  };

  return (
    <fieldset className={styles.fieldset}>
      <legend className={styles.legend}>{legend}</legend>

      <div className={styles.toolbar}>
        <TextField
          label="Buscar avatar"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setVisible(PAGE);
          }}
          placeholder="Nombre del avatar"
        />
        {recommendations.size > 0 && (
          <div className={styles.filters}>
            <button
              type="button"
              className={styles.chip}
              aria-pressed={onlyRecommended}
              onClick={() => {
                setOnlyRecommended((current) => !current);
                setVisible(PAGE);
              }}
            >
              ★ Solo recomendados para español ({recommendations.size})
            </button>
          </div>
        )}
        <div className={styles.filters} role="group" aria-label="Filtrar avatares">
          {FILTERS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={styles.chip}
              aria-pressed={filter === option.value}
              onClick={() => {
                setFilter(option.value);
                setVisible(PAGE);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
        {showTypes && (
          <div className={styles.filters} role="group" aria-label="Filtrar avatares por tipo">
            {TYPE_FILTERS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={styles.chip}
                aria-pressed={type === option.value}
                onClick={() => {
                  setType(option.value);
                  setVisible(PAGE);
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
        <div className={styles.filters} role="group" aria-label="Filtrar avatares por género">
          {genderOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              className={styles.chip}
              aria-pressed={gender === option.value}
              onClick={() => {
                setGender(option.value);
                setVisible(PAGE);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {preview && (
        <div className={styles.preview}>
          {preview.previewVideoUrl ? (
            <video
              key={preview.id}
              src={preview.previewVideoUrl}
              poster={preview.previewImageUrl ?? undefined}
              controls
              playsInline
              preload="none"
            />
          ) : preview.previewImageUrl ? (
            <img src={preview.previewImageUrl} alt={`Vista previa de ${preview.name}`} />
          ) : null}
          <p>
            <strong>{preview.name}</strong> · {AVATAR_TYPE_LABEL[preview.type]}
            {recommendations.has(preview.id) &&
              ` · ★ Recomendado: ${recommendations.get(preview.id)?.reason}`}
            {requiresAuthorization(preview) && ' · requiere autorización de imagen'}
          </p>
        </div>
      )}

      {ordered.length === 0 ? (
        <p className={styles.empty}>No hay avatares que coincidan.</p>
      ) : (
        <ul className={styles.avatarGrid}>
          {ordered.slice(0, visible).map((avatar) => {
            const checked = value.includes(avatar.id);
            return (
              <li key={avatar.id}>
                <label className={styles.avatarCard} data-checked={checked || undefined}>
                  <input
                    type={mode === 'single' ? 'radio' : 'checkbox'}
                    name={name}
                    className="visually-hidden"
                    checked={checked}
                    disabled={!checked && limitReached}
                    onChange={() => toggle(avatar.id)}
                  />
                  {avatar.previewImageUrl ? (
                    <img src={avatar.previewImageUrl} alt="" loading="lazy" />
                  ) : (
                    <span className={styles.noImage} aria-hidden="true" />
                  )}
                  <span className={styles.avatarName}>{avatar.name}</span>
                  <span className={styles.avatarMeta}>
                    {avatar.ownership === 'public' && avatar.type === 'studio_avatar'
                      ? 'Stock'
                      : AVATAR_TYPE_LABEL[avatar.type]}
                    {requiresAuthorization(avatar) && ' · autorización'}
                  </span>
                  {recommendations.has(avatar.id) && (
                    <span className={styles.recommended}>
                      ★ {recommendations.get(avatar.id)?.reason}
                    </span>
                  )}
                </label>
              </li>
            );
          })}
        </ul>
      )}

      {ordered.length > visible && (
        <Button variant="ghost" onClick={() => setVisible((v) => v + PAGE)}>
          Mostrar más avatares
        </Button>
      )}
      {mode === 'multiple' && max !== undefined && (
        <p className={styles.fine}>
          {value.length} de {max} seleccionados.
        </p>
      )}
    </fieldset>
  );
}
