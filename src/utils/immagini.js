// Riduzione delle foto prima del caricamento: una foto del telefono pesa
// 3-5 MB, per l'inventario bastano 800 px (circa 80-150 KB).

export const LATO_MASSIMO = 800;

/** Dimensioni ridotte mantenendo le proporzioni, senza mai ingrandire. */
export function dimensioniRidotte(larghezza, altezza, lato = LATO_MASSIMO) {
  if (!larghezza || !altezza) return { larghezza: 0, altezza: 0 };
  const scala = Math.min(1, lato / Math.max(larghezza, altezza));
  return { larghezza: Math.round(larghezza * scala), altezza: Math.round(altezza * scala) };
}

/** Restituisce un JPEG ridotto; se il browser non ci riesce, il file originale. */
export async function riduciFoto(file, lato = LATO_MASSIMO, qualita = 0.82) {
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return file;
  let bitmap;
  try {
    // from-image: rispetta la rotazione salvata dal telefono
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return file;
  }
  const { larghezza, altezza } = dimensioniRidotte(bitmap.width, bitmap.height, lato);
  const canvas = document.createElement('canvas');
  canvas.width = larghezza;
  canvas.height = altezza;
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, larghezza, altezza);
  ctx.drawImage(bitmap, 0, 0, larghezza, altezza);
  bitmap.close?.();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', qualita));
  return blob ?? file;
}
