import { useState } from 'react';
import { isFotoApp, miniaturaFoto } from '../utils/fotoUscite.js';

/** Anteprima: se la miniatura non arriva si ripiega sulla foto originale. */
function Anteprima({ url }) {
  const [src, setSrc] = useState(() => miniaturaFoto(url) ?? url);
  return (
    <img
      src={src}
      alt="Foto"
      loading="lazy"
      decoding="async"
      onError={() => {
        if (src !== url) setSrc(url);
      }}
      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
    />
  );
}

/**
 * Galleria delle foto di un'uscita o di un evento, visibile a tutti:
 * un tocco apre la foto originale a piena risoluzione.
 */
export default function GalleriaFoto({ urls = [] }) {
  const foto = urls.filter(isFotoApp);
  const album = urls.filter((url) => url && !isFotoApp(url));
  if (!foto.length && !album.length) return null;
  return (
    <article className="card">
      <h2 style={{ marginBottom: '0.25rem' }}>Foto{foto.length ? ` (${foto.length})` : ''}</h2>
      {foto.length > 0 && (
        <>
          <p style={{ margin: '0 0 0.75rem', color: 'var(--color-muted)' }}>
            Tocca una foto per aprirla a piena risoluzione.
          </p>
          <ul
            style={{
              listStyle: 'none',
              padding: 0,
              margin: 0,
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))',
              gap: '0.5rem',
            }}
          >
            {foto.map((url, index) => (
              <li key={url}>
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Apri la foto ${index + 1}`}
                  style={{
                    display: 'block',
                    aspectRatio: '1 / 1',
                    borderRadius: '0.5rem',
                    overflow: 'hidden',
                    background: '#e9ecef',
                  }}
                >
                  <Anteprima url={url} />
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
      {album.length > 0 && (
        <p style={{ margin: foto.length ? '0.75rem 0 0' : 0 }}>
          {album.map((url, index) => (
            <a key={url} href={url} target="_blank" rel="noopener noreferrer" style={{ marginRight: '1rem' }}>
              🔗 Apri l&apos;album{album.length > 1 ? ` ${index + 1}` : ''}
            </a>
          ))}
        </p>
      )}
    </article>
  );
}
