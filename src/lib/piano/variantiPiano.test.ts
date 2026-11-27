import { describe, expect, it } from 'vitest';
import {
  PREFISSO_ARCHIVIO_AI,
  eVarianteDellAnalisi,
  nomeArchivioElaborazione,
  nomeVariantePiano,
} from './variantiPiano';
import { VARIANTE_AI } from './elaborazioneAi';

describe('nomeArchivioElaborazione', () => {
  it('parte dal primo numero libero', () => {
    expect(nomeArchivioElaborazione([])).toBe(`${VARIANTE_AI}-archiviata-1`);
  });

  it('salta i nomi già usati', () => {
    const esistenti = ['base', VARIANTE_AI, `${PREFISSO_ARCHIVIO_AI}1`];
    expect(nomeArchivioElaborazione(esistenti)).toBe(`${PREFISSO_ARCHIVIO_AI}2`);
  });

  it('resta nel limite del salvataggio e, se non c’è posto, lo dice', () => {
    const ultimo = `${PREFISSO_ARCHIVIO_AI}999`;
    expect(ultimo.length).toBeLessThanOrEqual(30);
    const esistenti = Array.from({ length: 999 }, (_, i) => `${PREFISSO_ARCHIVIO_AI}${i + 1}`);
    expect(nomeArchivioElaborazione(esistenti)).toBeNull();
  });
});

describe('nomi delle varianti', () => {
  it('riconosce la variante dell’analisi e le sue versioni messe da parte', () => {
    expect(eVarianteDellAnalisi(VARIANTE_AI)).toBe(true);
    expect(eVarianteDellAnalisi(`${PREFISSO_ARCHIVIO_AI}3`)).toBe(true);
    expect(eVarianteDellAnalisi('base')).toBe(false);
    expect(eVarianteDellAnalisi('elaborazione-ai-mia')).toBe(false);
  });

  it('distingue le versioni messe da parte con il loro numero', () => {
    expect(nomeVariantePiano('base')).toBe('Piano base');
    expect(nomeVariantePiano(VARIANTE_AI)).toBe('Piano AI');
    expect(nomeVariantePiano(`${PREFISSO_ARCHIVIO_AI}2`)).toBe('Piano AI messo da parte (2)');
    expect(nomeVariantePiano('prova')).toBe('Variante prova');
  });
});
