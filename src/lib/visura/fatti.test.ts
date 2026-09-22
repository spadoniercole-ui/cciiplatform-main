import { describe, it, expect } from 'vitest';
import {
  normalizzaFattiVisura,
  estraiJson,
  avvisiDaFattiVisura,
  proceduraPendente,
  fattiVisuraPerPrompt,
} from './fatti';

describe('fatti della visura', () => {
  it('normalizza un JSON sporco senza eccezioni: date italiane, importi, campi mancanti', () => {
    const f = normalizzaFattiVisura({
      denominazione: ' Alfa S.r.l. ',
      dataCostituzione: '08/08/2014',
      capitaleSociale: '€ 10.000,00',
      addetti: { numero: '9', riferimento: 'media 2024' },
      procedureConcorsuali: [
        { tipo: 'Concordato preventivo', data: '07/10/2021', stato: 'in corso' },
        { tipo: null },
      ],
      amministratori: [{ nome: 'Rossi Mario' }],
      ignorato: 1,
    });
    expect(f.denominazione).toBe('Alfa S.r.l.');
    expect(f.dataCostituzione).toBe('2014-08-08');
    expect(f.capitaleSociale).toBe(10000);
    expect(f.addetti).toEqual({ numero: 9, riferimento: 'media 2024' });
    expect(f.procedureConcorsuali).toHaveLength(1);
    expect(f.amministratori[0].carica).toBe('carica non indicata');
    expect(normalizzaFattiVisura('spazzatura').codiceFiscale).toBeNull();
  });

  it('estrae il JSON anche con recinti e testo attorno', () => {
    expect(estraiJson('Ecco:\n```json\n{"denominazione":"X"}\n```')).toEqual({
      denominazione: 'X',
    });
    expect(estraiJson('niente')).toBeNull();
  });

  it('una procedura senza stato o «in corso» è pendente; una chiusa no', () => {
    expect(
      proceduraPendente({
        tipo: 'CP',
        data: null,
        stato: 'in corso',
        tribunale: null,
        riferimento: null,
      })
    ).toBe(true);
    expect(
      proceduraPendente({ tipo: 'CP', data: null, stato: null, tribunale: null, riferimento: null })
    ).toBe(true);
    expect(
      proceduraPendente({
        tipo: 'CP',
        data: null,
        stato: 'chiusa',
        tribunale: null,
        riferimento: null,
      })
    ).toBe(false);
  });

  it('gli avvisi rilevano, non accertano, e usano il lessico consentito', () => {
    const f = normalizzaFattiVisura({
      statoAttivita: 'in liquidazione',
      dataVisura: '2026-01-10',
      procedureConcorsuali: [
        {
          tipo: 'Concordato preventivo',
          data: '2021-10-07',
          stato: 'in corso',
          tribunale: 'Tribunale di Milano',
        },
      ],
    });
    const a = avvisiDaFattiVisura(f, '2026-09-22');
    expect(a.map((x) => x.codice)).toEqual(['PROCEDURA_PENDENTE', 'STATO_ATTIVITA', 'DATA_VISURA']);
    expect(a[0].testo).toContain('rilevato, non accertato');
    expect(a[0].testo).not.toMatch(/ricevibil|ammissibil|solid/i);
  });

  it('i fatti per il prompt sono dati, riga per riga', () => {
    const t = fattiVisuraPerPrompt(
      normalizzaFattiVisura({
        denominazione: 'Alfa',
        attiRilevanti: [{ data: '2014-08-08', descrizione: 'affitto di azienda' }],
      })
    );
    expect(t).toContain('- Denominazione: Alfa');
    expect(t).toContain('affitto di azienda');
  });
});
