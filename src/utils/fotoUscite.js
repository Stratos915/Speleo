// Foto delle uscite salvate nell'archivio dell'app (Supabase Storage, bucket pubblico).
const SEGNO_ORIGINALE = '/storage/v1/object/public/';
const SEGNO_MINIATURA = '/storage/v1/render/image/public/';

/** true se l'indirizzo è una foto caricata dall'app (non un link a un album esterno). */
export function isFotoApp(url) {
  return typeof url === 'string' && url.includes(SEGNO_ORIGINALE);
}

/**
 * Anteprima leggera della foto: il server la ridimensiona (circa 250 KB invece di 3-5 MB).
 * Per i link esterni restituisce null.
 */
export function miniaturaFoto(url, larghezza = 480) {
  if (!isFotoApp(url)) return null;
  const [base] = url.split('?');
  return `${base.replace(SEGNO_ORIGINALE, SEGNO_MINIATURA)}?width=${larghezza}&quality=70`;
}

/** Quante foto e quanti link ad album ha un'uscita. */
export function contaFoto(urls) {
  const elenco = Array.isArray(urls) ? urls.filter(Boolean) : [];
  const foto = elenco.filter(isFotoApp).length;
  return { foto, album: elenco.length - foto };
}

/** Testo breve per gli elenchi: «📷 42 foto», «📷 3 foto · album». */
export function testoFoto(urls) {
  const { foto, album } = contaFoto(urls);
  if (!foto && !album) return '';
  const parti = [];
  if (foto) parti.push(`${foto} foto`);
  if (album) parti.push(album === 1 ? 'album' : `${album} album`);
  return `📷 ${parti.join(' · ')}`;
}
