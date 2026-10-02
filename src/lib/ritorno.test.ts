import { describe, it, expect } from 'vitest';
import { destinazioneRitorno } from './ritorno';

describe('rientro al punto di partenza', () => {
  it('solo destinazioni note', () => {
    expect(destinazioneRitorno('X', 3, 'valutazione')?.url).toBe(
      '/spazio/X/scenari/3/proposta#valutazione'
    );
    expect(destinazioneRitorno('X', 3, 'lavorazione')?.url).toBe(
      '/spazio/X/scenari/3/proposta#stato'
    );
    expect(destinazioneRitorno('X', 3, 'https://altrove.example')).toBeNull();
    expect(destinazioneRitorno('X', 3, undefined)).toBeNull();
  });
});
