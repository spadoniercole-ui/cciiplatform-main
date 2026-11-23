import { describe, expect, it } from 'vitest';
import {
  conRitorno,
  destinazioneAziende,
  destinazionePredefinita,
  etichettaRitorno,
  etichettaUscitaScheda,
  percorsoRitorno,
  percorsoRitornoAziende,
} from './ritorno';

// Il rimando ai Parametri porta con sé la pagina da cui si è partiti; l'uscita
// riporta lì. Le prove che contano sono quelle di sicurezza: un ritorno non
// deve poter portare fuori dallo spazio, né in un altro spazio.

const VERIFICA = '/spazio/enti/verifica-salute?azienda=42';

describe('conRitorno', () => {
  it('conserva la query del link e aggiunge il ritorno', () => {
    expect(conRitorno('/spazio/enti/parametri/materie-lavorazione?materia=3', VERIFICA)).toBe(
      '/spazio/enti/parametri/materie-lavorazione?materia=3&ritorno=%2Fspazio%2Fenti%2Fverifica-salute%3Fazienda%3D42'
    );
  });

  it('funziona anche su un link senza query, e su uno che porta già un ritorno', () => {
    expect(conRitorno('/spazio/enti/parametri/lavorazioni', VERIFICA)).toBe(
      '/spazio/enti/parametri/lavorazioni?ritorno=%2Fspazio%2Fenti%2Fverifica-salute%3Fazienda%3D42'
    );
    expect(conRitorno('/spazio/enti/parametri/lavorazioni?ritorno=%2Faltro', VERIFICA)).toBe(
      '/spazio/enti/parametri/lavorazioni?ritorno=%2Fspazio%2Fenti%2Fverifica-salute%3Fazienda%3D42'
    );
  });

  it('senza ritorno il link resta com’è', () => {
    expect(conRitorno('/spazio/enti/parametri', null)).toBe('/spazio/enti/parametri');
    expect(conRitorno('/spazio/enti/parametri', '')).toBe('/spazio/enti/parametri');
  });
});

describe('percorsoRitorno', () => {
  it('accetta un percorso dello stesso spazio, con la sua query', () => {
    expect(percorsoRitorno(VERIFICA, 'enti')).toBe(VERIFICA);
  });

  it('rifiuta ciò che porterebbe fuori dallo spazio', () => {
    const predefinito = destinazionePredefinita('enti');
    // Un altro spazio.
    expect(percorsoRitorno('/spazio/altro/verifica-salute', 'enti')).toBe(predefinito);
    // Un sito esterno, assoluto o protocollo-relativo.
    expect(percorsoRitorno('https://esempio.it/spazio/enti/x', 'enti')).toBe(predefinito);
    expect(percorsoRitorno('//esempio.it/spazio/enti/x', 'enti')).toBe(predefinito);
    expect(percorsoRitorno('/superadmin/spazi', 'enti')).toBe(predefinito);
    // La dashboard dei Parametri non è un ritorno: sarebbe il giro a vuoto.
    expect(percorsoRitorno('/spazio/enti/parametri', 'enti')).toBe(predefinito);
    // Niente catene di ritorni.
    expect(
      percorsoRitorno(
        `/spazio/enti/verifica-salute?ritorno=${encodeURIComponent(VERIFICA)}`,
        'enti'
      )
    ).toBe(predefinito);
  });

  it('senza ritorno si torna alla dashboard', () => {
    expect(percorsoRitorno(undefined, 'enti')).toBe('/spazio/enti/parametri');
  });
});

describe('percorsoRitornoAziende', () => {
  it('torna dove si è entrati: griglia delle iconografie o elenco Aziende', () => {
    expect(percorsoRitornoAziende('/spazio/enti/ritratti', 'enti')).toBe('/spazio/enti/ritratti');
    expect(percorsoRitornoAziende(destinazioneAziende('enti'), 'enti')).toBe(
      destinazioneAziende('enti')
    );
    // L'origine può portarsi la sua query.
    expect(percorsoRitornoAziende('/spazio/enti/verifica-salute?azienda=42', 'enti')).toBe(
      '/spazio/enti/verifica-salute?azienda=42'
    );
  });

  it('senza origine, o con un’origine illecita, ripiega sull’elenco Aziende', () => {
    const elenco = destinazioneAziende('enti');
    expect(percorsoRitornoAziende(undefined, 'enti')).toBe(elenco);
    expect(percorsoRitornoAziende('', 'enti')).toBe(elenco);
    expect(percorsoRitornoAziende('/spazio/altro/aziende', 'enti')).toBe(elenco);
    expect(percorsoRitornoAziende('https://esempio.it/spazio/enti/ritratti', 'enti')).toBe(elenco);
    expect(percorsoRitornoAziende('/superadmin/spazi', 'enti')).toBe(elenco);
  });
});

describe('etichettaUscitaScheda', () => {
  it('dice dove si torna, e non «indietro»', () => {
    expect(etichettaUscitaScheda(destinazioneAziende('enti'), 'enti')).toBe('Torna alle aziende');
    expect(etichettaUscitaScheda('/spazio/enti/ritratti', 'enti')).toBe('Torna alle iconografie');
    expect(etichettaUscitaScheda('/spazio/enti', 'enti')).toBe('Torna alla dashboard');
    expect(etichettaUscitaScheda('/spazio/enti/verifica-salute?azienda=42', 'enti')).toBe(
      'Torna alla verifica amministrativa'
    );
  });

  it('sull’origine sconosciuta usa il nome del ripiego', () => {
    expect(etichettaUscitaScheda('/spazio/enti/utenti', 'enti')).toBe('Torna alle aziende');
  });
});

describe('etichettaRitorno', () => {
  it('dice dove si torna', () => {
    expect(etichettaRitorno(VERIFICA, 'enti')).toBe('Torna alla verifica');
    expect(etichettaRitorno('/spazio/enti/aziende/42', 'enti')).toBe(
      "Torna alla scheda dell'azienda"
    );
    expect(etichettaRitorno(destinazionePredefinita('enti'), 'enti')).toBe(
      'Torna a Parametri di Spazio'
    );
  });
});
