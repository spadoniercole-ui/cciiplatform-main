import { describe, expect, it } from 'vitest';
import { confrontoLetture, indiciDaAccertato } from './divergenze';

// Le letture hanno nature diverse: il punto non è farle coincidere, è spiegare
// perché divergono e quale errore evita la spiegazione.

const base = {
  amministrativa: {
    esito: 'ATTENZIONE_MINIMA',
    etichetta: 'Nessuna criticità dai dati disponibili',
    fattore: 'Nessuna criticità emersa',
    copertura: { determinate: 4, totali: 4 },
  },
  qualitativo: {
    colore: null as 'verde' | 'giallo' | 'rosso' | null,
    dettaglio: null as string | null,
  },
  indiciViolati: 0 as number | null,
  fotografia: {
    capacita: 'INTEGRALE' as 'INTEGRALE' | 'PARZIALE' | 'NON_CALCOLABILE',
    coperturaPct: 120,
    dettaglio: 'La cassa copre il credito.',
  },
  scenari: { calcolabili: 2, totali: 2, liquidazione: 20_000, cramDown: 40_000, credito: 80_000 },
};

describe('indici letti dalla riga accertata', () => {
  it('legge il numero con il singolare e con il plurale', () => {
    expect(indiciDaAccertato(['1 indice diagnostico di bilancio oltre la soglia.'])).toBe(1);
    expect(indiciDaAccertato(['3 indici diagnostici di bilancio oltre la soglia.'])).toBe(3);
  });

  it('senza righe sugli indici non inventa un numero', () => {
    expect(indiciDaAccertato(['Esposizione verso l’ente di 80.000 €.'])).toBeNull();
    expect(indiciDaAccertato(null)).toBeNull();
  });
});

describe('letture a confronto', () => {
  it('elenca la natura di ogni lettura', () => {
    const c = confrontoLetture(base);
    expect(c.letture.map((l) => l.natura)).toEqual([
      'ACCERTATO',
      'DICHIARATO',
      'PROIEZIONE',
      'ARITMETICA',
    ]);
  });

  it('quattro letture e una spiegazione: nessuna viene spenta', () => {
    const c = confrontoLetture(base);
    expect(c.letture).toHaveLength(4);
    expect(c.nota).toContain('va letta per quello che è');
  });

  it('senza divergenze lo dice, e ricorda che le letture non si sommano', () => {
    const c = confrontoLetture({
      ...base,
      fotografia: {
        capacita: 'NON_CALCOLABILE',
        coperturaPct: null,
        dettaglio: 'Il credito vantato non è accertato.',
      },
      scenari: { calcolabili: 0, totali: 0, liquidazione: null, cramDown: null, credito: null },
    });
    expect(c.divergenze).toHaveLength(0);
    expect(c.nota).toContain('non si sommano');
  });

  it('quadro qualitativo sfavorevole con indici in ordine: divergenza spiegata', () => {
    const c = confrontoLetture({
      ...base,
      qualitativo: { colore: 'rosso', dettaglio: 'Oltre i due terzi negativi.' },
    });
    const d = c.divergenze.find((x) => x.tema.includes('qualitativo segnala'));
    expect(d).toBeTruthy();
    expect(d?.perche).toContain('nature diverse');
    expect(d?.rischio).toContain('prova');
  });

  it('indici oltre soglia con quadro favorevole: la dichiarazione non li annulla', () => {
    const c = confrontoLetture({
      ...base,
      qualitativo: { colore: 'verde', dettaglio: 'Tutte positive.' },
      indiciViolati: 3,
    });
    const d = c.divergenze.find((x) => x.tema.includes('indici segnalano'));
    expect(d).toBeTruthy();
    expect(d?.letture.join(' ')).toContain('3 oltre la soglia');
  });

  it('cassa che copre e indicatore rosso: la cassa non cancella il fatto', () => {
    const c = confrontoLetture({
      ...base,
      amministrativa: { ...base.amministrativa, esito: 'ROSSO', etichetta: 'Soglia superata' },
    });
    const d = c.divergenze.find((x) => x.tema.includes('cassa copre'));
    expect(d).toBeTruthy();
    expect(d?.rischio).toContain('non segnalare');
  });

  it('accordo che regge e procedure che rendono meno: due numeri, non uno', () => {
    const c = confrontoLetture(base);
    const d = c.divergenze.find((x) => x.tema.includes('procedura rende meno'));
    expect(d).toBeTruthy();
    expect(d?.letture.join(' ')).toContain('40.000 €');
  });

  it('fotografia non calcolabile: nessuna divergenza inventata', () => {
    const c = confrontoLetture({
      ...base,
      fotografia: {
        capacita: 'NON_CALCOLABILE',
        coperturaPct: null,
        dettaglio: 'Il credito vantato non è accertato.',
      },
      scenari: { calcolabili: 0, totali: 2, liquidazione: null, cramDown: null, credito: null },
    });
    expect(c.divergenze.some((d) => d.tema.includes('cassa copre'))).toBe(false);
    expect(c.nota).toContain('non si contraddicono');
  });
});
