import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { riconosciProspetto } from '@/lib/denunce/lettura';
import { analizzaVera, estraiRigheVera, ritardoDaVera, totaliVera } from './veraImport';

// REGRESSIONE SUL FILE V.E.R.A. REALE (export INPS «DettaglioRichiesta», foglio
// «Esito Verifica» + «Dettaglio Verifica»). Il file è anonimo (denominazione e
// indirizzo di esempio) e serve a fissare tre cose che con i dati sintetici
// non si vedono:
//
//  1. le colonne sono SPAZIATE (Posizione, '', Natura, '', Stato…) e la
//     sezione F24 dei versamenti non è un debito;
//  2. la sezione «Crediti affidati per il recupero all'Agente della
//     Riscossione» è un'altra cosa dai contributi INPS, e la sua riga sospesa
//     dal giudice non entra nell'esposizione;
//  3. i totali del dettaglio devono coincidere con i «Totale gestione» che il
//     file stesso dichiara.
const PERCORSO = new URL('./__fixtures__/DettaglioRichiesta-699901.xlsx', import.meta.url);

function fileVera(): File {
  return new File([new Uint8Array(readFileSync(PERCORSO))], 'DettaglioRichiesta-699901.xlsx');
}

describe('V.E.R.A. reale: riconoscimento e lettura', () => {
  it('è riconosciuto come V.E.R.A. dalle intestazioni', async () => {
    expect(await riconosciProspetto(fileVera())).toBe('VERA');
  });

  it('legge il foglio «Dettaglio Verifica», non l’Esito', async () => {
    const a = await analizzaVera(fileVera());
    expect(a.foglioLetto).toBe('Dettaglio Verifica');
    expect(a.sezioni).toHaveLength(2);
  });

  it('separa i contributi INPS dalle cartelle dell’Agente della Riscossione', async () => {
    const a = await analizzaVera(fileVera());
    expect(a.sezioni.map((s) => s.ambito)).toEqual(['INPS', 'AGENTE_RISCOSSIONE']);
  });

  it('scarta la sezione F24 dei versamenti', async () => {
    const a = await analizzaVera(fileVera());
    expect(a.titoli.map((t) => t.label)).toEqual([
      'GESTIONE LAVORATORI DIPENDENTI PRIVATI',
      "CREDITI AFFIDATI PER IL RECUPERO ALL'AGENTE DELLA RISCOSSIONE",
    ]);
  });

  it('i totali di sezione coincidono con i «Totale gestione» del file', async () => {
    const a = await analizzaVera(fileVera());
    const [inps, adr] = a.sezioni;
    // Il file dichiara 18.392,80 per la gestione e 23.600,53 per le cartelle:
    // il secondo è al netto della riga sospesa (6.990,45), che resta in righe
    // ma non nel totale.
    expect(inps.totale).toBeCloseTo(18_392.8, 2);
    expect(adr.totale).toBeCloseTo(23_600.53, 2);
    expect(adr.righe).toHaveLength(5);
  });
});

describe('V.E.R.A. reale: destinazione degli importi', () => {
  it('contributi, sanzioni e crediti dell’Agente restano separati', async () => {
    const a = await analizzaVera(fileVera());
    const { righe } = estraiRigheVera(a.sezioni, {}, {}, true);
    const t = totaliVera(righe);
    expect(t.contributiInps).toBeCloseTo(16_756.41, 2);
    expect(t.sanzioni).toBeCloseTo(1_636.39, 2);
    expect(t.creditiAgente).toBeCloseTo(23_600.53, 2);
    expect(t.quantificato).toBeCloseTo(41_993.33, 2);
  });

  it('la partita sospesa dal giudice è fuori dalle somme', async () => {
    const a = await analizzaVera(fileVera());
    const { righe } = estraiRigheVera(a.sezioni, {}, {}, true);
    const t = totaliVera(righe);
    expect(t.righeIgnorate).toBe(1);
    expect(t.creditiAgente).not.toBeCloseTo(30_590.98, 2);
  });

  it('il ritardo oltre 90 giorni si misura sui periodi dei contributi', async () => {
    const a = await analizzaVera(fileVera());
    const r = ritardoDaVera(a.sezioni, new Date('2026-10-19T12:00:00Z'));
    expect(r?.partite).toBe(13);
    expect(r?.importo).toBeCloseTo(18_392.8, 2);
    expect(r?.periodi).toEqual([
      '2025/06',
      '2025/07',
      '2025/08',
      '2025/09',
      '2025/10',
      '2025/11',
      '2025/12',
      '2026/01',
    ]);
  });
});
