import { describe, it, expect } from 'vitest';
import {
  promptElaborazione,
  validaRisposta,
  motivazionePulita,
  testoContesto,
} from './elaborazioneAi';
import type { EsercizioStorico } from './piano';

const S: EsercizioStorico = {
  anno: 2025,
  ricaviVendite: 1_000_000,
  valoreProduzione: 1_050_000,
  costiProduzione: 950_000,
  ammortamenti: 50_000,
  oneriFinanziari: 20_000,
  utileEsercizio: 60_000,
  immobilizzazioni: 400_000,
  creditiClienti: 250_000,
  disponibilitaLiquide: 30_000,
  attivoCircolante: 400_000,
  totaleAttivo: 800_000,
  patrimonioNetto: 100_000,
  debitiBanche: 300_000,
  debitiFornitori: 200_000,
  debitiTributari: 50_000,
  debitiPrevidenziali: 80_000,
  totaleDebiti: 700_000,
};
const BASE = {
  orizzonte: 3,
  storico: [S],
  crescita: { tasso: 2, descrizione: 'Crescita del settore 2%.' },
  rate: { ente: [10_000, 10_000, 10_000], altri: [0, 0, 0] },
};

describe('elaborazione con l’AI: prompt', () => {
  it('Ricevente: piano dell’azienda e scostamenti nel contesto; Redigente: ipotesi dell’operatore', () => {
    const r = promptElaborazione({
      ...BASE,
      lato: 'RICEVUTA',
      pianoAzienda: { ricaviVendite: { '2026': 1_300_000 } },
      scostamenti: [{ voce: 'Ricavi delle vendite', luce: 'rosso', ottimismoMassimo: 27.5 }],
    });
    expect(r).toMatch(/RICEVUTO/);
    expect(r).toMatch(/ricaviVendite: 1300000 \/ — \/ —/);
    expect(r).toMatch(/fino a \+27.5%/);
    const d = promptElaborazione({
      ...BASE,
      lato: 'DA_DEFINIRE',
      ipotesiCorrenti: { ricaviVendite: [{ tipo: 'pct', valore: 5 }] },
    });
    expect(d).toMatch(/REDIGE/);
    expect(d).toMatch(/ricaviVendite: 5%/);
    expect(d).not.toMatch(/PIANO DELL'AZIENDA/);
  });
  it('contesto compatto: anni del piano dall’ultimo bilancio', () => {
    expect(testoContesto({ ...BASE, lato: 'DA_DEFINIRE' })).toMatch(
      /ANNI DEL PIANO: 2026, 2027, 2028/
    );
  });
});

describe('elaborazione con l’AI: validazione della risposta', () => {
  it('tiene solo righe, tipi e intervalli ammessi, con le motivazioni', () => {
    const e = validaRisposta(
      {
        ipotesi: {
          ricaviVendite: [
            { tipo: 'pct', valore: 3, motivazione: 'In linea con il settore (2%).' },
            null,
            { tipo: 'pct', valore: 80 },
          ],
          investimenti: [{ tipo: 'pct', valore: 40000, motivazione: 'Mantenimento.' }],
          aliquotaImposte: [{ tipo: 'abs', valore: 99 }],
          ebitda: [{ tipo: 'abs', valore: 1 }],
        },
        sintesi: 'Piano prudente.',
      },
      3
    );
    expect(e.ipotesi.ricaviVendite).toEqual([
      { tipo: 'pct', valore: 3, motivazione: 'In linea con il settore (2%).' },
      { tipo: 'pct', valore: 0, motivazione: 'Non indicato dall’AI: come l’anno prima.' },
      { tipo: 'pct', valore: 0, motivazione: 'Non indicato dall’AI: come l’anno prima.' },
    ]);
    expect(e.ipotesi.investimenti?.[0]).toEqual({
      tipo: 'abs',
      valore: 40000,
      motivazione: 'Mantenimento.',
    });
    // Nessuna cella vuota: i valori assoluti proseguono, le righe non toccate sono «invariate».
    expect(e.ipotesi.investimenti?.[2]).toMatchObject({ tipo: 'abs', valore: 40000 });
    expect(e.ipotesi.oneriFinanziari).toEqual([
      { tipo: 'pct', valore: 0 },
      { tipo: 'pct', valore: 0 },
      { tipo: 'pct', valore: 0 },
    ]);
    expect(e.ipotesi.apportiSoci?.every((x) => x?.tipo === 'abs' && x.valore === 0)).toBe(true);
    expect(e.ipotesi.aliquotaImposte).toBeUndefined();
    expect(e.scartati.join(' ')).toMatch(/ebitda/);
    expect(e.scartati.length).toBe(3);
    expect(e.sintesi).toBe('Piano prudente.');
  });
  it('risposta vuota o malformata: nessuna ipotesi, nessuna eccezione', () => {
    expect(validaRisposta(null, 3)).toEqual({ ipotesi: {}, sintesi: '', scartati: [] });
  });
  it('motivazioni ripulite dai termini non ammessi', () => {
    expect(motivazionePulita('La proposta è non ricevibile.')).toBe(
      'La proposta è non coerente con i parametri configurati.'
    );
  });
});
