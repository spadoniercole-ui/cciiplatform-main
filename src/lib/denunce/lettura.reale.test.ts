import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { analizzaDenunce } from './analisi';
import { leggiElencoDenunce } from './lettura';

// Test sul file VERO del Cassetto Previdenziale.
//
// Il file non sta nel repository: contiene i dati di un'azienda. Si passa da
// `ELENCO_DENUNCE_FILE`, oppure lo si appoggia in
// `src/lib/denunce/__fixtures__/elenco-denunce.xlsx`. Se non c'è, il test si
// salta con un messaggio: un file assente non è un rosso.
//
// Serve perché i test costruiti in memoria verificano la forma che NOI ci
// aspettiamo dal tracciato — date, importi, intestazioni. Solo il file vero
// dice se quella forma è anche quella dell'istituto: è la differenza che ha
// fatto sembrare vuoto un Elenco denunce pieno.

const percorso = process.env.ELENCO_DENUNCE_FILE
  ? process.env.ELENCO_DENUNCE_FILE
  : fileURLToPath(new URL('./__fixtures__/elenco-denunce.xlsx', import.meta.url));
const presente = existsSync(percorso);

describe.skipIf(!presente)('Elenco denunce reale del Cassetto', () => {
  it('legge i periodi e ricava i contributi dovuti per anno', async () => {
    const file = new File([readFileSync(percorso)], 'elenco-denunce.xlsx');
    const esito = await leggiElencoDenunce(file);

    expect(esito.colonneMancanti).toBeUndefined();
    expect(esito.righe.length).toBeGreaterThan(0);

    for (const r of esito.righe) {
      expect(r.periodo).toMatch(/^\d{2}\/\d{4}$/);
      expect(Number.isFinite(r.saldo)).toBe(true);
    }

    // La verifica cade subito dopo l'ultimo periodo del file: così tutti i
    // periodi sono esigibili e il dovuto per anno è la somma dei saldi,
    // ricontrollabile a mano.
    const periodi = esito.righe.map((r) => {
      const [mese, anno] = r.periodo.split('/').map(Number);
      return { anno, mese };
    });
    const ultimo = periodi.reduce((a, b) =>
      b.anno > a.anno || (b.anno === a.anno && b.mese > a.mese) ? b : a
    );
    const verifica = new Date(Date.UTC(ultimo.anno, ultimo.mese + 1, 1));

    const analisi = analizzaDenunce(esito.righe, verifica);

    const totaleFile = esito.righe.reduce((s, r) => s + r.saldo, 0);
    const totaleAnni = Object.values(analisi.dovutoPerAnno).reduce((s, v) => s + v, 0);
    expect(Object.keys(analisi.dovutoPerAnno).length).toBeGreaterThan(0);
    expect(totaleAnni).toBeCloseTo(totaleFile, 2);

    // Gli anni del dovuto sono quelli scritti nel file, senza aggiunte.
    const anniFile = [...new Set(periodi.map((p) => p.anno))].sort((a, b) => a - b);
    expect(
      Object.keys(analisi.dovutoPerAnno)
        .map(Number)
        .sort((a, b) => a - b)
    ).toEqual(anniFile);
  });

  it('non dichiara denunce mancanti quando i periodi si sono letti', async () => {
    const file = new File([readFileSync(percorso)], 'elenco-denunce.xlsx');
    const esito = await leggiElencoDenunce(file);
    const ultimo = esito.righe
      .map((r) => {
        const [mese, anno] = r.periodo.split('/').map(Number);
        return anno * 12 + mese;
      })
      .reduce((a, b) => Math.max(a, b));
    const anno = Math.floor((ultimo - 1) / 12);
    const mese = ((ultimo - 1) % 12) + 1;

    // Dentro la finestra del file i periodi letti non possono risultare
    // mancanti: è il controllo che smaschera un parser che perde righe.
    const analisi = analizzaDenunce(esito.righe, new Date(Date.UTC(anno, mese + 1, 1)));
    const presenti = new Set(esito.righe.map((r) => r.periodo));
    expect(analisi.periodiMancanti.some((p) => presenti.has(p))).toBe(false);
  });
});
