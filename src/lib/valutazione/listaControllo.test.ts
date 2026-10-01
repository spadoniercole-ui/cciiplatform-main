import { describe, it, expect } from 'vitest';
import { valutaListaControllo, type InputListaControllo } from './listaControllo';

const BASE: InputListaControllo = {
  propostaSelezionata: true,
  asseverazione: 'caricato',
  pianoAziendale: 'assente_dichiarato',
  posizioniAggiornate: 1,
  posizioneNonPervenutaDichiarata: false,
  settore: { applicabile: true, aggiornatoIl: '2026-09-25T10:00:00Z' },
  pianoSviluppoAttivo: true,
  oggi: '2026-09-30T10:00:00Z',
};

describe('lista di controllo prima della valutazione', () => {
  it('completa: pronta, e il piano di sviluppo è solo ricordato', () => {
    const e = valutaListaControllo(BASE);
    expect(e.pronta).toBe(true);
    expect(e.voci.find((v) => v.id === 'pianoSviluppo')!.informativa).toBe(true);
  });
  it('dati di settore vecchi o mai scaricati bloccano, con il percorso', () => {
    const e = valutaListaControllo({
      ...BASE,
      settore: { applicabile: true, aggiornatoIl: '2026-07-01T10:00:00Z' },
    });
    expect(e.pronta).toBe(false);
    expect(e.mancanti).toContain('Dati di settore ISTAT');
    expect(e.voci.find((v) => v.id === 'settore')!.percorso).toContain('Aggiorna ora');
    expect(
      valutaListaControllo({ ...BASE, settore: { applicabile: true, aggiornatoIl: null } }).pronta
    ).toBe(false);
  });
  it('settore non applicabile non blocca', () => {
    expect(
      valutaListaControllo({ ...BASE, settore: { applicabile: false, motivo: 'ATECO assente' } })
        .pronta
    ).toBe(true);
  });
  it('proposta obbligatoria; documenti facoltativi da caricare o dichiarare assenti; posizione idem', () => {
    expect(valutaListaControllo({ ...BASE, propostaSelezionata: false }).mancanti).toContain(
      'Proposta (PDF)'
    );
    expect(valutaListaControllo({ ...BASE, asseverazione: 'mancante' }).pronta).toBe(false);
    expect(valutaListaControllo({ ...BASE, posizioniAggiornate: 0 }).pronta).toBe(false);
    expect(
      valutaListaControllo({
        ...BASE,
        posizioniAggiornate: 0,
        posizioneNonPervenutaDichiarata: true,
      }).pronta
    ).toBe(true);
  });
});
