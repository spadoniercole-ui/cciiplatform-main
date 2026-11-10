import { describe, expect, it } from 'vitest';
import { bloccoSituazioneRelazione } from './situazione';

describe('bloccoSituazioneRelazione', () => {
  it('riporta situazione attuale e cronologia con autore e data', () => {
    const blocco = bloccoSituazioneRelazione({
      situazione: 'CRAM_DOWN',
      storico: [
        {
          da: 'PROPOSTA',
          a: 'CRAM_DOWN',
          cambiataIl: '2026-11-10T08:00:00.000Z',
          autore: 'anna@alfa.it',
          annullatoIl: null,
          annullatoDa: null,
        },
      ],
    });

    expect(blocco).toContain('Situazione attuale: Dispositivo di cram down.');
    expect(blocco).toMatch(/da Proposta a Dispositivo di cram down — anna@alfa\.it/);
    expect(blocco).toContain('Riporta questa sezione per intero');
  });

  it('dice anche quando un cambio è stato annullato e da chi', () => {
    const blocco = bloccoSituazioneRelazione({
      situazione: 'PROPOSTA',
      storico: [
        {
          da: 'PROPOSTA',
          a: 'DECRETO_LIQUIDAZIONE',
          cambiataIl: '2026-11-10T08:00:00.000Z',
          autore: 'anna@alfa.it',
          annullatoIl: '2026-11-10T09:00:00.000Z',
          annullatoDa: 'capo@alfa.it',
        },
      ],
    });

    expect(blocco).toContain('(annullato da capo@alfa.it)');
  });

  it('senza cambi lo dichiara, non inventa una storia', () => {
    const blocco = bloccoSituazioneRelazione({ situazione: 'PROPOSTA', storico: [] });
    expect(blocco).toContain('Nessun cambio di situazione registrato.');
  });
});
