import { describe, expect, it } from 'vitest';
import { PREFISSO_ARCHIVIO_AI, nomeArchivioElaborazione } from './variantiPiano';
import { VARIANTE_AI } from './elaborazioneAi';

describe('nomeArchivioElaborazione', () => {
  it('parte dal primo numero libero', () => {
    expect(nomeArchivioElaborazione([])).toBe(`${VARIANTE_AI}-archiviata-1`);
  });

  it('salta i nomi già usati', () => {
    const esistenti = ['base', VARIANTE_AI, `${PREFISSO_ARCHIVIO_AI}1`];
    expect(nomeArchivioElaborazione(esistenti)).toBe(`${PREFISSO_ARCHIVIO_AI}2`);
  });

  it('resta dentro i limiti del salvataggio anche con i numeri esauriti', () => {
    const esistenti = Array.from({ length: 99 }, (_, i) => `${PREFISSO_ARCHIVIO_AI}${i + 1}`);
    const nome = nomeArchivioElaborazione(esistenti);
    expect(esistenti).not.toContain(nome);
    expect(nome.length).toBeLessThanOrEqual(30);
    expect(nome).toMatch(/^[a-z0-9_-]+$/);
  });
});
