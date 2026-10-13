import { describe, expect, it } from 'vitest';
import { dimensioniRidotte } from '../immagini.js';

describe('dimensioniRidotte', () => {
  it('riduce il lato lungo a 800 mantenendo le proporzioni', () => {
    expect(dimensioniRidotte(4000, 3000)).toEqual({ larghezza: 800, altezza: 600 });
    expect(dimensioniRidotte(3000, 4000)).toEqual({ larghezza: 600, altezza: 800 });
  });
  it('non ingrandisce le foto piccole', () => {
    expect(dimensioniRidotte(640, 480)).toEqual({ larghezza: 640, altezza: 480 });
  });
  it('gestisce dimensioni mancanti', () => {
    expect(dimensioniRidotte(0, 100)).toEqual({ larghezza: 0, altezza: 0 });
  });
});
