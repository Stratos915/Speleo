import { describe, expect, it } from 'vitest';
import { contaFoto, isFotoApp, miniaturaFoto, testoFoto } from '../fotoUscite.js';

const foto = 'https://x.supabase.co/storage/v1/object/public/uscite-foto/abc/1-IMG.jpg';
const album = 'https://photos.app.goo.gl/xyz';

describe('foto delle uscite', () => {
  it('riconosce le foto dell\'app e i link esterni', () => {
    expect(isFotoApp(foto)).toBe(true);
    expect(isFotoApp(album)).toBe(false);
  });
  it('costruisce la miniatura ridimensionata dal server', () => {
    expect(miniaturaFoto(foto)).toBe(
      'https://x.supabase.co/storage/v1/render/image/public/uscite-foto/abc/1-IMG.jpg?width=480&quality=70',
    );
    expect(miniaturaFoto(album)).toBeNull();
  });
  it('conta foto e album per gli elenchi', () => {
    expect(contaFoto([foto, foto, album])).toEqual({ foto: 2, album: 1 });
    expect(testoFoto([foto, foto, album])).toBe('📷 2 foto · album');
    expect(testoFoto(null)).toBe('');
  });
});
