import { describe, it, expect } from 'vitest';
import { applicaRettifiche, rettifichePulite, righeDelPianoAzienda } from './rettifiche';
import { validaRettificheAi, validaRisposta, promptElaborazione } from './elaborazioneAi';
import type { IpotesiPiano } from './piano';

const ipAz: IpotesiPiano = {
  ricaviVendite: [
    { tipo: 'abs', valore: 1_290_000 },
    { tipo: 'abs', valore: 1_420_000 },
  ],
  costiOperativi: [
    { tipo: 'abs', valore: 1_163_000 },
    { tipo: 'abs', valore: 1_234_000 },
  ],
};

describe('Ricevente: manopole sul piano dell’azienda', () => {
  it('a manopole ferme le ipotesi sono quelle dell’azienda', () => {
    const e = applicaRettifiche(ipAz, {}, {});
    expect(e.ricaviVendite).toEqual(ipAz.ricaviVendite);
  });

  it('una rettifica vale per tutti gli anni; le righe fuori dal piano restano sulle manopole ordinarie', () => {
    const e = applicaRettifiche(
      ipAz,
      { ricaviVendite: { valore: -10 } },
      {
        ricaviVendite: [{ tipo: 'pct', valore: 50 }],
        debitiBanche: [{ tipo: 'pct', valore: -5 }],
      }
    );
    expect(e.ricaviVendite?.map((x) => x?.valore)).toEqual([1_161_000, 1_278_000]);
    expect(e.costiOperativi?.[0]?.valore).toBe(1_163_000);
    expect(e.debitiBanche?.[0]?.valore).toBe(-5);
    expect([...righeDelPianoAzienda(ipAz)]).toEqual(['ricaviVendite', 'costiOperativi']);
  });

  it('rettifiche ripulite e limitate', () => {
    expect(rettifichePulite({ ricaviVendite: { valore: -200 }, x: 'a' })).toEqual({
      ricaviVendite: { valore: -60 },
    });
  });

  it('AI: rettifiche solo sulle righe del piano dell’azienda, entro ±50%', () => {
    const e = validaRettificheAi(
      {
        rettifiche: {
          ricaviVendite: { valore: -15, motivazione: 'Il piano è oltre il settore del 34%.' },
          debitiBanche: { valore: -5 },
          costiOperativi: { valore: 55 },
        },
        sintesi: 'Ricavi riportati verso il settore.',
      },
      ['ricaviVendite', 'costiOperativi']
    );
    expect(e.rettifiche).toEqual({
      ricaviVendite: { valore: -15, motivazione: 'Il piano è oltre il settore del 34%.' },
    });
    expect(e.scartati.length).toBe(2);
  });

  it('AI: una manopola per riga si estende a tutti gli anni', () => {
    const e = validaRisposta({ ipotesi: { ricaviVendite: { tipo: 'pct', valore: 2 } } }, 3);
    expect(e.ipotesi.ricaviVendite?.map((x) => x?.valore)).toEqual([2, 2, 2]);
  });

  it('prompt: con il piano dell’azienda chiede rettifiche, senza chiede manopole', () => {
    const base = {
      orizzonte: 3,
      storico: [
        {
          anno: 2026,
          ricaviVendite: 1,
          valoreProduzione: 1,
          costiProduzione: 1,
          ammortamenti: 0,
          oneriFinanziari: 0,
          utileEsercizio: 0,
          immobilizzazioni: 0,
          creditiClienti: 0,
          disponibilitaLiquide: 0,
          attivoCircolante: 0,
          totaleAttivo: 0,
          patrimonioNetto: 0,
          debitiBanche: 0,
          debitiFornitori: 0,
          debitiTributari: 0,
          debitiPrevidenziali: 0,
          totaleDebiti: 0,
        },
      ],
      crescita: { tasso: 0, descrizione: '' },
      rate: { ente: [0, 0, 0], altri: [0, 0, 0] },
    };
    expect(
      promptElaborazione({
        ...base,
        lato: 'RICEVUTA',
        pianoAzienda: { ricaviVendite: { '2027': 1_290_000 } },
      })
    ).toMatch(/"rettifiche"/);
    expect(promptElaborazione({ ...base, lato: 'RICEVUTA', pianoAzienda: null })).toMatch(
      /MANOPOLE/
    );
  });
});
