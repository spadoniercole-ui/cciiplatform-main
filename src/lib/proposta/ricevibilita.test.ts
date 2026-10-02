import { describe, expect, it } from 'vitest';
import {
  CATEGORIA_RIGA_ENTE,
  MOTIVAZIONE_NESSUN_LIMITE,
  calcolaImportoOfferto,
  costruisciIndiceLimiti,
  selezionaLimite,
  valutaRigaProposta,
  verificaRicevibilitaEnte,
  verificaRicevibilitaRighe,
  type EstrazioneProposta,
  type LimiteCategoriaRicevibilita,
  type LimiteRangoRicevibilita,
  type RigaProposta,
  type SogliaRicevibilita,
} from './ricevibilita';

// Test di caratterizzazione: codificano la semantica della verifica di
// ricevibilità com'era in verificaRicevibilitaProposta prima dell'estrazione.

function soglia(p: Partial<SogliaRicevibilita> = {}): SogliaRicevibilita {
  return {
    percentualeMinima: 0,
    unicaSoluzioneAmmessa: true,
    rateizzazioneAmmessa: true,
    valoreLiquidazioneStimato: null,
    ...p,
  };
}

function limiteCat(
  categoriaCreditore: string,
  p: Partial<LimiteCategoriaRicevibilita> = {}
): LimiteCategoriaRicevibilita {
  return { categoriaCreditore, alias: [], ...soglia(), ...p };
}

function limiteRango(
  rangoLegale: LimiteRangoRicevibilita['rangoLegale'],
  p: Partial<SogliaRicevibilita> = {}
): LimiteRangoRicevibilita {
  return { rangoLegale, ...soglia(p) };
}

function riga(p: Partial<RigaProposta> = {}): RigaProposta {
  return {
    id: 1,
    scenarioId: 10,
    categoriaCreditore: 'Fornitori',
    importoDovuto: 10000,
    percentualeOfferta: 50,
    modalita: 'UNICA_SOLUZIONE',
    numeroRate: null,
    note: null,
    rangoLegale: null,
    rilevantePerEnte: false,
    ...p,
  };
}

function estrazione(p: Partial<EstrazioneProposta> = {}): EstrazioneProposta {
  return {
    estrazioneRiuscita: true,
    importoDovuto: 10000,
    percentualeOfferta: 50,
    modalita: 'UNICA_SOLUZIONE',
    numeroRate: null,
    motivoMancata: null,
    ...p,
  };
}

describe('calcolaImportoOfferto', () => {
  it('calcola dovuto × percentuale / 100', () => {
    expect(calcolaImportoOfferto(10000, 50)).toBe(5000);
    expect(calcolaImportoOfferto(12345.67, 0)).toBe(0);
    expect(calcolaImportoOfferto(1000, 100)).toBe(1000);
  });
});

describe('valore di liquidazione (NON_ENTE)', () => {
  it('offerta esattamente pari al valore di liquidazione → ricevibile', () => {
    const esito = valutaRigaProposta(
      riga({ importoDovuto: 10000, percentualeOfferta: 50 }),
      soglia({ valoreLiquidazioneStimato: 5000 }),
      'categoria'
    );
    expect(esito.ricevibile).toBe(true);
    expect(esito.motivazione).toContain('≥ valore di liquidazione stimato');
    expect(esito.motivazione).toContain('per questa categoria');
  });

  it('offerta di 1 centesimo sotto il valore di liquidazione → non ricevibile', () => {
    // 10000 × 49,9999% = 4999,99
    const esito = valutaRigaProposta(
      riga({ importoDovuto: 10000, percentualeOfferta: 49.9999 }),
      soglia({ valoreLiquidazioneStimato: 5000 }),
      'categoria'
    );
    expect(esito.ricevibile).toBe(false);
    expect(esito.motivazione).toContain('inferiore al valore di liquidazione stimato');
  });

  it('valore di liquidazione 0 viene ignorato', () => {
    const esito = valutaRigaProposta(
      riga({ percentualeOfferta: 1 }),
      soglia({ valoreLiquidazioneStimato: 0 }),
      'categoria'
    );
    expect(esito.ricevibile).toBe(true);
    expect(esito.motivazione).toContain('Nessuna soglia configurata per questa categoria');
  });

  it('valore di liquidazione null viene ignorato (conta solo la % minima)', () => {
    const esito = valutaRigaProposta(
      riga({ percentualeOfferta: 30 }),
      soglia({ valoreLiquidazioneStimato: null, percentualeMinima: 20 }),
      'categoria'
    );
    expect(esito.ricevibile).toBe(true);
    expect(esito.motivazione).toContain('≥ percentuale minima richiesta 20%');
  });

  it('valore di liquidazione soddisfatto ma % sotto il minimo → non ricevibile', () => {
    const esito = valutaRigaProposta(
      riga({ importoDovuto: 10000, percentualeOfferta: 40 }),
      soglia({ valoreLiquidazioneStimato: 1000, percentualeMinima: 50 }),
      'categoria'
    );
    expect(esito.ricevibile).toBe(false);
    expect(esito.motivazione).toBe('offerta 40% sotto il minimo richiesto (50%)');
  });

  it('più motivi sono uniti con "; "', () => {
    const esito = valutaRigaProposta(
      riga({ importoDovuto: 1000, percentualeOfferta: 10, modalita: 'RATEALE' }),
      soglia({
        valoreLiquidazioneStimato: 500,
        percentualeMinima: 20,
        rateizzazioneAmmessa: false,
      }),
      'categoria'
    );
    expect(esito.ricevibile).toBe(false);
    expect(esito.motivazione.split('; ')).toHaveLength(3);
  });
});

describe('percentuale minima (NON_ENTE)', () => {
  it('percentuale esattamente pari al minimo → ricevibile', () => {
    const esito = valutaRigaProposta(
      riga({ percentualeOfferta: 50 }),
      soglia({ percentualeMinima: 50 }),
      'categoria'
    );
    expect(esito.ricevibile).toBe(true);
  });

  it('percentuale appena sotto il minimo → non ricevibile', () => {
    const esito = valutaRigaProposta(
      riga({ percentualeOfferta: 49.99 }),
      soglia({ percentualeMinima: 50 }),
      'categoria'
    );
    expect(esito.ricevibile).toBe(false);
    expect(esito.motivazione).toBe('offerta 49.99% sotto il minimo richiesto (50%)');
  });
});

describe('modalità di pagamento (NON_ENTE)', () => {
  it('unica soluzione ammessa → ricevibile', () => {
    const esito = valutaRigaProposta(riga({ modalita: 'UNICA_SOLUZIONE' }), soglia(), 'categoria');
    expect(esito.ricevibile).toBe(true);
  });

  it('unica soluzione non ammessa → non ricevibile', () => {
    const esito = valutaRigaProposta(
      riga({ modalita: 'UNICA_SOLUZIONE' }),
      soglia({ unicaSoluzioneAmmessa: false }),
      'categoria'
    );
    expect(esito.ricevibile).toBe(false);
    expect(esito.motivazione).toBe("modalità 'unica soluzione' non ammessa per questa categoria");
  });

  it('rateale ammessa → ricevibile', () => {
    const esito = valutaRigaProposta(
      riga({ modalita: 'RATEALE', numeroRate: 12 }),
      soglia({ unicaSoluzioneAmmessa: false }),
      'categoria'
    );
    expect(esito.ricevibile).toBe(true);
  });

  it('rateale non ammessa → non ricevibile', () => {
    const esito = valutaRigaProposta(
      riga({ modalita: 'RATEALE', numeroRate: 12 }),
      soglia({ rateizzazioneAmmessa: false }),
      'categoria'
    );
    expect(esito.ricevibile).toBe(false);
    expect(esito.motivazione).toBe("modalità 'rateale' non ammessa per questa categoria");
  });

  it('numero di rate: nessun limite configurabile, oggi non viene verificato', () => {
    const esito = valutaRigaProposta(
      riga({ modalita: 'RATEALE', numeroRate: 10000 }),
      soglia(),
      'categoria'
    );
    expect(esito.ricevibile).toBe(true);
  });

  it.todo(
    'numero di rate oltre il limite ammesso → non ricevibile (non esiste un limite sul numero di rate né nei parametri né nella verifica)'
  );
});

describe('scelta del limite: categoria → alias → rango → Generale → nessuno', () => {
  const generale = limiteCat('Generale', { percentualeMinima: 5 });
  const inps = limiteCat('INPS', { percentualeMinima: 40, alias: ['Enti previdenziali', '  '] });
  const chiro = limiteRango('CHIROGRAFARIO', { percentualeMinima: 20 });
  const indice = costruisciIndiceLimiti([generale, inps], [chiro]);

  it('categoria esatta', () => {
    const r = selezionaLimite(riga({ categoriaCreditore: 'INPS' }), indice);
    expect(r).toEqual({ limite: inps, livelloMatch: 'categoria' });
  });

  it('categoria esatta è case-sensitive: "inps" non combacia per nome', () => {
    const r = selezionaLimite(riga({ categoriaCreditore: 'inps' }), indice);
    expect(r).toEqual({ limite: generale, livelloMatch: 'generale' });
  });

  it('alias, confrontato senza maiuscole e spazi ai bordi', () => {
    const r = selezionaLimite(riga({ categoriaCreditore: '  ENTI previdenziali ' }), indice);
    expect(r).toEqual({ limite: inps, livelloMatch: 'alias' });
  });

  it('alias vuoti vengono scartati', () => {
    const r = selezionaLimite(riga({ categoriaCreditore: '   ' }), indice);
    expect(r.livelloMatch).toBe('generale');
  });

  it('la categoria prevale sul rango', () => {
    const r = selezionaLimite(
      riga({ categoriaCreditore: 'INPS', rangoLegale: 'CHIROGRAFARIO' }),
      indice
    );
    expect(r.livelloMatch).toBe('categoria');
  });

  it('rango legale se la categoria non ha limiti', () => {
    const r = selezionaLimite(
      riga({ categoriaCreditore: 'Fornitori', rangoLegale: 'CHIROGRAFARIO' }),
      indice
    );
    expect(r).toEqual({ limite: chiro, livelloMatch: 'rango' });
  });

  it('rango senza limite configurato → Generale', () => {
    const r = selezionaLimite(
      riga({ categoriaCreditore: 'Fornitori', rangoLegale: 'POSTERGATO' }),
      indice
    );
    expect(r).toEqual({ limite: generale, livelloMatch: 'generale' });
  });

  it('nessun limite e nessuna soglia Generale → nessuno', () => {
    const vuoto = costruisciIndiceLimiti([inps], []);
    const r = selezionaLimite(riga({ categoriaCreditore: 'Fornitori' }), vuoto);
    expect(r).toEqual({ limite: undefined, livelloMatch: 'nessuno' });
  });

  it('alias null tollerato', () => {
    const i = costruisciIndiceLimiti([limiteCat('Banche', { alias: null })], []);
    expect(selezionaLimite(riga({ categoriaCreditore: 'banche' }), i).livelloMatch).toBe('nessuno');
  });

  it('nessun limite → ricevibile con avvertenza', () => {
    const esito = valutaRigaProposta(riga({ percentualeOfferta: 0 }), undefined, 'nessuno');
    expect(esito.ricevibile).toBe(true);
    expect(esito.motivazione).toBe(MOTIVAZIONE_NESSUN_LIMITE);
  });

  it('la motivazione cita il rango legale quando il limite viene dal rango', () => {
    const esito = valutaRigaProposta(
      riga({ rangoLegale: 'CHIROGRAFARIO', percentualeOfferta: 30 }),
      soglia({ percentualeMinima: 20 }),
      'rango'
    );
    expect(esito.motivazione).toContain('per il rango legale "Chirografario"');
  });

  it('livello alias: la motivazione indica la categoria trovata tramite alias', () => {
    const inps = limiteCat('INPS', { percentualeMinima: 40, alias: ['Enti previdenziali'] });
    const esito = valutaRigaProposta(
      riga({ categoriaCreditore: 'Enti previdenziali', percentualeOfferta: 50 }),
      inps,
      'alias'
    );
    expect(esito.ricevibile).toBe(true);
    expect(esito.motivazione).toContain(
      'per la categoria "INPS", trovata tramite alias di "Enti previdenziali"'
    );
    expect(esito.motivazione).not.toContain('soglia Generale');
    expect(esito.motivazione).not.toContain('nessuna soglia specifica');
  });

  it('livello alias con una soglia senza nome di categoria: esito invariato', () => {
    const esito = valutaRigaProposta(
      riga({ percentualeOfferta: 30 }),
      soglia({ percentualeMinima: 40 }),
      'alias'
    );
    expect(esito.ricevibile).toBe(false);
  });
});

describe('verificaRicevibilitaRighe (NON_ENTE, per categoria)', () => {
  it('applica a ogni riga la soglia della propria categoria', () => {
    const esito = verificaRicevibilitaRighe(
      [
        riga({ id: 1, categoriaCreditore: 'INPS', percentualeOfferta: 30 }),
        riga({ id: 2, categoriaCreditore: 'Fornitori', percentualeOfferta: 30 }),
      ],
      [
        limiteCat('INPS', { percentualeMinima: 40 }),
        limiteCat('Generale', { percentualeMinima: 20 }),
      ],
      []
    );
    expect(esito.righe.map((r) => r.ricevibile)).toEqual([false, true]);
    expect(esito.complessivamenteRicevibile).toBe(false);
  });

  it('tutte le righe ricevibili → complessivamente ricevibile', () => {
    const esito = verificaRicevibilitaRighe([riga()], [limiteCat('Generale')], []);
    expect(esito.complessivamenteRicevibile).toBe(true);
    expect(esito).not.toHaveProperty('datiDisponibili');
  });

  it('nessuna riga → non complessivamente ricevibile', () => {
    const esito = verificaRicevibilitaRighe([], [limiteCat('Generale')], []);
    expect(esito).toEqual({ righe: [], complessivamenteRicevibile: false });
  });

  it('conserva i campi della riga originale', () => {
    const r = riga({ id: 42, note: 'nota', numeroRate: 6, modalita: 'RATEALE' });
    const esito = verificaRicevibilitaRighe([r], [], []);
    expect(esito.righe[0]).toMatchObject(r);
  });
});

describe('verificaRicevibilitaEnte (soglia unica dell’ente)', () => {
  it('nessuna estrazione → dati non disponibili', () => {
    const esito = verificaRicevibilitaEnte(10, null, soglia());
    expect(esito.complessivamenteRicevibile).toBe(false);
    expect(esito.datiDisponibili).toBe(false);
    expect(esito.righe[0]).toMatchObject({
      id: 0,
      scenarioId: 10,
      categoriaCreditore: CATEGORIA_RIGA_ENTE,
      importoDovuto: 0,
      percentualeOfferta: 0,
      modalita: 'UNICA_SOLUZIONE',
      rilevantePerEnte: true,
      ricevibile: false,
    });
  });

  it('importo dovuto non estratto → dati non disponibili', () => {
    const esito = verificaRicevibilitaEnte(10, estrazione({ importoDovuto: null }), soglia());
    expect(esito.datiDisponibili).toBe(false);
    expect(esito.righe[0].motivazione).toContain('Carica ed analizza');
  });

  it('estrazione non riuscita → motivo dell’AI o messaggio di ripiego', () => {
    const conMotivo = verificaRicevibilitaEnte(
      10,
      estrazione({ estrazioneRiuscita: false, motivoMancata: 'PDF illeggibile' }),
      soglia()
    );
    expect(conMotivo.righe[0].motivazione).toBe('PDF illeggibile');
    expect(conMotivo.datiDisponibili).toBe(false);
    const senzaMotivo = verificaRicevibilitaEnte(
      10,
      estrazione({ estrazioneRiuscita: false }),
      soglia()
    );
    expect(senzaMotivo.righe[0].motivazione).toContain("L'AI non è riuscita");
  });

  it('nessuna soglia dell’ente → ricevibile', () => {
    const esito = verificaRicevibilitaEnte(10, estrazione(), undefined);
    expect(esito.complessivamenteRicevibile).toBe(true);
    expect(esito.datiDisponibili).toBe(true);
  });

  it('offerta esattamente pari al valore di liquidazione → ricevibile', () => {
    const esito = verificaRicevibilitaEnte(
      10,
      estrazione({ importoDovuto: 10000, percentualeOfferta: 50 }),
      soglia({ valoreLiquidazioneStimato: 5000 })
    );
    expect(esito.complessivamenteRicevibile).toBe(true);
    expect(esito.righe[0].motivazione).toContain('≥ valore di liquidazione stimato');
  });

  it('offerta di 1 centesimo sotto il valore di liquidazione → non ricevibile', () => {
    const esito = verificaRicevibilitaEnte(
      10,
      estrazione({ importoDovuto: 10000, percentualeOfferta: 49.9999 }),
      soglia({ valoreLiquidazioneStimato: 5000 })
    );
    expect(esito.complessivamenteRicevibile).toBe(false);
    expect(esito.righe[0].motivazione).toContain('otterreste di più in liquidazione giudiziale');
  });

  it('percentuale esattamente pari al minimo → ricevibile', () => {
    const esito = verificaRicevibilitaEnte(
      10,
      estrazione({ percentualeOfferta: 100 }),
      soglia({ percentualeMinima: 100 })
    );
    expect(esito.complessivamenteRicevibile).toBe(true);
  });

  it('modalità non ammessa (messaggio senza "per questa categoria")', () => {
    const esito = verificaRicevibilitaEnte(
      10,
      estrazione({ modalita: 'RATEALE', numeroRate: 60 }),
      soglia({ rateizzazioneAmmessa: false })
    );
    expect(esito.righe[0].motivazione).toBe("modalità 'rateale' non ammessa");
    const esito2 = verificaRicevibilitaEnte(
      10,
      estrazione({ modalita: 'UNICA_SOLUZIONE' }),
      soglia({ unicaSoluzioneAmmessa: false })
    );
    expect(esito2.righe[0].motivazione).toBe("modalità 'unica soluzione' non ammessa");
  });

  it('modalità non estratta → trattata come unica soluzione', () => {
    const esito = verificaRicevibilitaEnte(
      10,
      estrazione({ modalita: null }),
      soglia({ unicaSoluzioneAmmessa: false })
    );
    expect(esito.righe[0].modalita).toBe('UNICA_SOLUZIONE');
    expect(esito.complessivamenteRicevibile).toBe(false);
  });

  it('percentuale non estratta → trattata come 0%', () => {
    const esito = verificaRicevibilitaEnte(
      10,
      estrazione({ percentualeOfferta: null }),
      soglia({ percentualeMinima: 10 })
    );
    expect(esito.righe[0].motivazione).toBe(
      'offerta 0% sul totale (il documento non distingue capitale e accessori), sotto il minimo richiesto (10%)'
    );
  });

  it('valore di liquidazione 0 ignorato; nessun vincolo → conforme per assenza di vincolo', () => {
    const esito = verificaRicevibilitaEnte(
      10,
      estrazione({ percentualeOfferta: 1 }),
      soglia({ valoreLiquidazioneStimato: 0 })
    );
    expect(esito.complessivamenteRicevibile).toBe(true);
    expect(esito.righe[0].motivazione).toContain('conforme per assenza di un vincolo');
  });
});

describe('comportamenti da validare (conservati invariati)', () => {
  it('arrotondamento: 1000 × 2,01% = 20,10 € ma in virgola mobile risulta inferiore a 20,10', () => {
    const esito = valutaRigaProposta(
      riga({ importoDovuto: 1000, percentualeOfferta: 2.01 }),
      soglia({ valoreLiquidazioneStimato: 20.1 }),
      'categoria'
    );
    expect(esito.ricevibile).toBe(false);
  });

  it.todo(
    'arrotondamento: il confronto con il valore di liquidazione dovrebbe avvenire al centesimo (1000 × 2,01% = 20,10 € pari al valore di liquidazione → ricevibile)'
  );
  it.todo(
    'nessun limite configurato (né categoria, né alias, né rango, né Generale): oggi la riga risulta ricevibile — valutare un esito "non verificabile"'
  );
  it.todo(
    'ENTE: modalità non estratta dal documento oggi è assunta "unica soluzione" — valutare un esito "dati incompleti"'
  );
});

describe('verificaRicevibilitaEnte — base dell’art. 63 sul capitale', () => {
  const base: EstrazioneProposta = {
    estrazioneRiuscita: true,
    importoDovuto: 48599.97,
    percentualeOfferta: 93.8,
    modalita: 'RATEALE',
    numeroRate: 60,
    motivoMancata: null,
  };

  it('100% dei contributi con stralcio delle somme aggiuntive: coerente sul capitale', () => {
    const esito = verificaRicevibilitaEnte(
      1,
      { ...base, importoCapitale: 44299.34, percentualeOffertaCapitale: 100 },
      soglia({ percentualeMinima: 100 })
    );
    expect(esito.complessivamenteRicevibile).toBe(true);
    expect(esito.righe[0].motivazione).toContain('sul capitale');
    expect(esito.righe[0].motivazione).toContain('93.8%');
  });

  it('senza distinzione fra capitale e accessori resta il confronto sul totale, dichiarato', () => {
    const esito = verificaRicevibilitaEnte(1, base, soglia({ percentualeMinima: 100 }));
    expect(esito.complessivamenteRicevibile).toBe(false);
    expect(esito.righe[0].motivazione).toContain('sul totale');
  });
});
