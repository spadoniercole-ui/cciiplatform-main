import { describe, expect, it } from 'vitest';
import {
  LANCIO_PREDEFINITO,
  lancioDaSalvato,
  lancioPianoValido,
  testoAttenzioneContabile,
  testoLancio,
  vincoliDaAttenzioneContabile,
} from './contestoContabile';
import type { Attenzione } from '@/lib/screening/indicatore';

const GIUDIZIO = {
  etichetta: 'Criticità rilevante',
  fattoreDeterminante: 'Indici diagnostici di bilancio oltre la soglia di riferimento',
} as unknown as Attenzione;

const ESITO = {
  giudizio: GIUDIZIO,
  dimensioni: [
    {
      dimensione: 'A' as const,
      punteggio: 60,
      motivi: ['INPS: presupposti oggettivi rilevati'],
      lacune: [],
    },
    {
      dimensione: 'B' as const,
      punteggio: 10,
      motivi: [],
      lacune: ['nessun bilancio XBRL caricato'],
    },
    {
      dimensione: 'D' as const,
      punteggio: 70,
      motivi: ['1 importi non noti nel fascicolo'],
      lacune: ['fatti della visura non estratti'],
    },
  ],
  determinanti: [],
};

describe('attenzione della contabile come contesto della simulazione', () => {
  it('porta nel testo solo le dimensioni sopra soglia, con intensità e lacune', () => {
    const t = testoAttenzioneContabile({ esito: ESITO, debitoInBilancio: null });
    expect(t).toContain('Criticità rilevante');
    expect(t).toContain('- A (intensità 60)');
    expect(t).toContain('- D (intensità 70)');
    expect(t).toContain('Lacune: fatti della visura non estratti');
    expect(t).not.toContain('- B (');
  });

  it('la soglia è quella dello spazio', () => {
    const t = testoAttenzioneContabile({ esito: ESITO, debitoInBilancio: null }, 5);
    expect(t).toContain('- B (intensità 10)');
    expect(t).toContain('nessun bilancio XBRL caricato');
  });

  it('senza dimensioni accese e senza debito da iscrivere il testo è vuoto', () => {
    const t = testoAttenzioneContabile({
      esito: { ...ESITO, dimensioni: [] },
      debitoInBilancio: null,
    });
    expect(t).toBe('');
  });

  it('un vincolo per ogni dimensione accesa, e uno per il debito non iscritto', () => {
    const vincoli = vincoliDaAttenzioneContabile({
      esito: ESITO,
      debitoInBilancio: {
        stato: 'NON_CONTABILIZZATO',
        esposizione: 194_712,
        inBilancio: 0,
        voce: null,
        testo: 'Il debito accertato non risulta iscritto in bilancio.',
      },
    });
    expect(vincoli).toHaveLength(3);
    expect(vincoli.join(' ')).toContain('L’esposizione verso l’ente è accesa');
    expect(vincoli.join(' ')).toContain('L’affidabilità dei dati è bassa');
    expect(vincoli.join(' ')).toContain('non è iscritto in bilancio');
  });

  it('i parametri di lancio dicono procedura, impostazione e offerta', () => {
    const t = testoLancio({
      ...LANCIO_PREDEFINITO,
      procedura: 'CRAM_DOWN',
      percentualeOfferta: 40,
      prudenza: 'NEUTRA',
    });
    expect(t).toContain('cram down');
    expect(t).toContain('neutra');
    expect(t).toContain('40%');
    expect(testoLancio(LANCIO_PREDEFINITO)).not.toContain('OFFERTA IPOTIZZATA');
  });
  it('gli anni di restituzione entrano nel testo del lancio', () => {
    expect(testoLancio({ ...LANCIO_PREDEFINITO, anniRientro: 5 })).toContain('in 5 anni');
  });
});

describe('lancioPianoValido', () => {
  it('tiene solo i valori ammessi, e riporta agli anni dentro l’orizzonte', () => {
    const l = lancioPianoValido({
      procedura: 'CRAM_DOWN',
      percentualeOfferta: 42.567,
      prudenza: 'NEUTRA',
      anniRientro: 99,
    });
    expect(l).toEqual({
      procedura: 'CRAM_DOWN',
      percentualeOfferta: 42.57,
      prudenza: 'NEUTRA',
      anniRientro: 10,
    });
  });

  it('un valore che non si riconosce non fa fallire il salvataggio', () => {
    const l = lancioPianoValido({ procedura: 'FALLIMENTO', prudenza: 'OTTIMISTA' });
    expect(l.procedura).toBe('ACCORDO');
    expect(l.prudenza).toBe('PRUDENTE');
    expect(l.percentualeOfferta).toBeNull();
    expect(l.anniRientro).toBeNull();
  });

  it('null quando la variante non ha un lancio salvato', () => {
    expect(lancioDaSalvato(null)).toBeNull();
    expect(lancioDaSalvato('x')).toBeNull();
  });
});
