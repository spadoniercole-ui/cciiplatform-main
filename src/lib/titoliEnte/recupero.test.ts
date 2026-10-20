import { describe, it, expect } from 'vitest';
import {
  MASSIMO_CARATTERI_ATTIVITA_RECUPERO,
  MASSIMO_CARATTERI_DIPENDENZA,
  normalizzaAttivitaRecupero,
  normalizzaDipendenza,
  passiAttivitaRecupero,
  riassuntoAttivitaRecupero,
  validaAttivitaRecupero,
  validaDipendenza,
} from './recupero';

// La procedura di esempio è quella indicata dall'ente per le diffide emesse e
// non ancora contabilizzate: se il parser la legge male, la fase successiva al
// triage mostrerebbe all'operatore una sequenza sbagliata.
const DIFFIDA = `1. Verificare la notifica del provvedimento; se correttamente notificato passare al punto 2, altrimenti procedere alle attività di notifica. Una volta ottenuta una notifica corretta passare al punto 2
2. Modifica del conto del lavoratore in base a quanto indicato in diffida
3. Verifica della proposta VIG generata dal sistema nel quantum, nel periodo e, soprattutto, nel codice fiscale del lavoratore
4. Conferma della proposta e contabilizzazione del credito
`;

describe('attività di recupero del credito', () => {
  it('legge i quattro passi della diffida, senza la numerazione', () => {
    const passi = passiAttivitaRecupero(DIFFIDA);
    expect(passi).toHaveLength(4);
    expect(passi[0]).toMatch(/^Verificare la notifica del provvedimento/);
    expect(passi[1]).toMatch(/^Modifica del conto del lavoratore/);
    expect(passi[2]).toMatch(/^Verifica della proposta VIG/);
    expect(passi[3]).toBe('Conferma della proposta e contabilizzazione del credito');
  });

  it('accetta numerazioni e trattini diversi, e scarta le righe vuote', () => {
    const passi = passiAttivitaRecupero('1) Uno\r\n\r\n  - Due\r\n• Tre\r\n2. Quattro');
    expect(passi).toEqual(['Uno', 'Due', 'Tre', 'Quattro']);
  });

  it('un testo su una riga sola resta un passo solo', () => {
    expect(passiAttivitaRecupero('Verificare la notifica')).toEqual(['Verificare la notifica']);
  });

  it('vuoto, spazi e null sono «nessuna procedura»', () => {
    for (const v of [null, undefined, '', '   ', '\r\n\r\n', ' - ']) {
      expect(normalizzaAttivitaRecupero(v)).toBeNull();
      expect(passiAttivitaRecupero(v)).toEqual([]);
      expect(validaAttivitaRecupero(v)).toBeNull();
      expect(riassuntoAttivitaRecupero(v)).toBe('');
    }
  });

  it('normalizza i CR di Windows e toglie gli spazi ai bordi', () => {
    expect(normalizzaAttivitaRecupero('  Uno\r\nDue  \r\n')).toBe('Uno\nDue');
  });

  it('rifiuta una procedura oltre il limite, accettandola al limite', () => {
    const alLimite = 'a'.repeat(MASSIMO_CARATTERI_ATTIVITA_RECUPERO);
    expect(validaAttivitaRecupero(alLimite)).toBeNull();
    expect(validaAttivitaRecupero(`${alLimite}b`)).toContain('caratteri');
  });

  it('riassume il numero di passi configurati', () => {
    expect(riassuntoAttivitaRecupero('Uno')).toBe('1 passo');
    expect(riassuntoAttivitaRecupero(DIFFIDA)).toBe('4 passi');
    expect(riassuntoAttivitaRecupero(null)).toBe('');
  });
});

// La dipendenza è l'ufficio a cui si indirizza la comunicazione con cui si
// chiede all'azienda il pagamento: è un recapito, e resta su una riga sola.
describe('dipendenza a cui indirizzare la comunicazione', () => {
  it('tiene il nome dell’ufficio così com’è scritto', () => {
    expect(normalizzaDipendenza('Ufficio Recupero Crediti — Sede di Milano')).toBe(
      'Ufficio Recupero Crediti — Sede di Milano'
    );
  });

  it('spazi, a capo e bordi diventano un nome su una riga', () => {
    expect(normalizzaDipendenza('  Ufficio   Recupero\r\nCrediti  ')).toBe(
      'Ufficio Recupero Crediti'
    );
  });

  it('vuoto, spazi e null sono «dipendenza non indicata»', () => {
    for (const v of [null, undefined, '', '   ', '\r\n']) {
      expect(normalizzaDipendenza(v)).toBeNull();
      expect(validaDipendenza(v)).toBeNull();
    }
  });

  it('rifiuta una dipendenza oltre il limite, accettandola al limite', () => {
    const alLimite = 'a'.repeat(MASSIMO_CARATTERI_DIPENDENZA);
    expect(validaDipendenza(alLimite)).toBeNull();
    expect(validaDipendenza(`${alLimite}b`)).toContain('caratteri');
  });

  it('conta la lunghezza dopo aver normalizzato, non prima', () => {
    const conSpazi = `  ${'a'.repeat(MASSIMO_CARATTERI_DIPENDENZA)}  `;
    expect(validaDipendenza(conSpazi)).toBeNull();
  });
});
