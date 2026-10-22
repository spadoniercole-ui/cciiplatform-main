import { describe, expect, it } from 'vitest';
import {
  MEZZI_INVIO,
  consegnaDaRiga,
  etichettaMezzo,
  riassumiConsegne,
  statoConsegnaReparto,
  validaConfermaInvio,
  validaConsegna,
  type ConsegnaRegistrata,
  type ConsegnaRepartoInput,
} from './consegne';

const valida: ConsegnaRepartoInput = {
  reparto: 'Ufficio contributi',
  dataVerifica: '2026-10-19',
  versione: '1-3f9a1c2b',
  nomeFile: 'comunica_reparti_alfa_srl_ufficio_contributi.pdf',
  righe: 2,
  totale: 15_000,
  posizioniDaContabilizzare: 1,
  importoDaContabilizzare: 3_000,
};

const consegna = (id: number, over: Partial<ConsegnaRegistrata> = {}): ConsegnaRegistrata => ({
  ...valida,
  id,
  consegnatoIl: '2026-10-20T09:00:00.000Z',
  consegnatoDa: 'mario.rossi@ente.it',
  invio: null,
  ...over,
});

describe('validaConsegna', () => {
  it('accetta una consegna completa e normalizza il reparto', () => {
    const esito = validaConsegna({ ...valida, reparto: '  Ufficio   contributi ' });
    expect(esito.ok).toBe(true);
    if (esito.ok) expect(esito.dati.reparto).toBe('Ufficio contributi');
  });

  it('rifiuta un reparto mancante, vuoto o troppo lungo', () => {
    expect(validaConsegna({ ...valida, reparto: '   ' }).ok).toBe(false);
    expect(validaConsegna({ ...valida, reparto: 'x'.repeat(161) }).ok).toBe(false);
    expect(validaConsegna({ ...valida, reparto: 42 }).ok).toBe(false);
  });

  it('rifiuta una data che non esiste, non solo scritta male', () => {
    expect(validaConsegna({ ...valida, dataVerifica: '2026-02-31' }).ok).toBe(false);
    expect(validaConsegna({ ...valida, dataVerifica: '19/10/2026' }).ok).toBe(false);
    expect(validaConsegna({ ...valida, dataVerifica: '2026-02-28' }).ok).toBe(true);
  });

  it('rifiuta una versione che non è un’impronta del documento', () => {
    expect(validaConsegna({ ...valida, versione: 'v1' }).ok).toBe(false);
    expect(validaConsegna({ ...valida, versione: '1-3F9A1C2B' }).ok).toBe(false);
    expect(validaConsegna({ ...valida, versione: '' }).ok).toBe(false);
  });

  it('rifiuta un nome file che non è un PDF', () => {
    expect(validaConsegna({ ...valida, nomeFile: 'documento.docx' }).ok).toBe(false);
    expect(validaConsegna({ ...valida, nomeFile: `${'a'.repeat(300)}.pdf` }).ok).toBe(false);
  });

  it('rifiuta numeri impossibili: importi negativi, posizioni frazionarie, totali incoerenti', () => {
    expect(validaConsegna({ ...valida, totale: -1 }).ok).toBe(false);
    expect(validaConsegna({ ...valida, totale: Number.NaN }).ok).toBe(false);
    expect(validaConsegna({ ...valida, righe: 1.5 }).ok).toBe(false);
    expect(validaConsegna({ ...valida, posizioniDaContabilizzare: 5 }).ok).toBe(false);
    expect(validaConsegna({ ...valida, importoDaContabilizzare: 20_000 }).ok).toBe(false);
  });

  it('rifiuta un corpo che non è un oggetto', () => {
    expect(validaConsegna(null).ok).toBe(false);
    expect(validaConsegna('ciao').ok).toBe(false);
    expect(validaConsegna(undefined).ok).toBe(false);
  });
});

describe('riassumiConsegne', () => {
  it('senza consegne non inventa reparti', () => {
    expect(riassumiConsegne([])).toEqual([]);
  });

  it('tiene l’ultima consegna e conta gli scaricamenti', () => {
    const riepilogo = riassumiConsegne([
      consegna(1, { consegnatoIl: '2026-10-18T08:00:00.000Z', versione: '1-aaaaaaaa' }),
      consegna(2, { consegnatoIl: '2026-10-21T10:15:00.000Z', versione: '1-bbbbbbbb' }),
      consegna(3, { consegnatoIl: '2026-10-19T12:00:00.000Z', versione: '1-cccccccc' }),
    ]);

    expect(riepilogo).toHaveLength(1);
    expect(riepilogo[0].scaricamenti).toBe(3);
    expect(riepilogo[0].ultima.id).toBe(2);
    expect(riepilogo[0].ultima.versione).toBe('1-bbbbbbbb');
  });

  it('raggruppa lo stesso reparto scritto con maiuscole diverse', () => {
    const riepilogo = riassumiConsegne([
      consegna(1, { reparto: 'Ufficio contributi' }),
      consegna(2, { reparto: 'ufficio contributi', consegnatoIl: '2026-10-22T09:00:00.000Z' }),
    ]);

    expect(riepilogo).toHaveLength(1);
    expect(riepilogo[0].reparto).toBe('ufficio contributi');
    expect(riepilogo[0].scaricamenti).toBe(2);
    expect(riepilogo[0].ultima.id).toBe(2);
  });

  it('a parità di istante vince l’id più alto', () => {
    const riepilogo = riassumiConsegne([
      consegna(7, { consegnatoIl: '2026-10-21T10:15:00.000Z', versione: '1-aaaaaaaa' }),
      consegna(9, { consegnatoIl: '2026-10-21T10:15:00.000Z', versione: '1-bbbbbbbb' }),
    ]);

    expect(riepilogo[0].ultima.id).toBe(9);
    expect(riepilogo[0].scaricamenti).toBe(2);
  });

  it('ordina i reparti per nome e ignora le righe senza reparto', () => {
    const riepilogo = riassumiConsegne([
      consegna(1, { reparto: 'Ufficio riscossione' }),
      consegna(2, { reparto: 'Amministrazione' }),
      consegna(3, { reparto: '   ' }),
    ]);

    expect(riepilogo.map((r) => r.reparto)).toEqual(['Amministrazione', 'Ufficio riscossione']);
  });
});

describe('consegnaDaRiga', () => {
  it('traduce la riga del database, importi compresi', () => {
    const consegnaLetta = consegnaDaRiga({
      id: '7',
      reparto: 'Ufficio contributi',
      data_verifica: '2026-10-19',
      versione: '1-aaaaaaaa',
      nome_file: 'comunica_reparti_alfa_srl_ufficio_contributi.pdf',
      righe: '2',
      totale: '15000.00',
      posizioni_da_contabilizzare: '1',
      importo_da_contabilizzare: '3000.00',
      consegnato_il: new Date('2026-10-21T13:14:30.057Z'),
      consegnato_da: 'mario.rossi@ente.it',
    });

    expect(consegnaLetta).toEqual({
      id: 7,
      reparto: 'Ufficio contributi',
      dataVerifica: '2026-10-19',
      versione: '1-aaaaaaaa',
      nomeFile: 'comunica_reparti_alfa_srl_ufficio_contributi.pdf',
      righe: 2,
      totale: 15_000,
      posizioniDaContabilizzare: 1,
      importoDaContabilizzare: 3_000,
      consegnatoIl: '2026-10-21T13:14:30.057Z',
      consegnatoDa: 'mario.rossi@ente.it',
      invio: null,
    });
  });

  it('legge la data come giorno locale quando arriva come Date', () => {
    // `pg` rende una DATE come Date a mezzanotte locale: il giorno è quello,
    // anche in un fuso a est di UTC dove toISOString() lo arretrerebbe.
    const locale = new Date(2026, 9, 19);
    const consegnaLetta = consegnaDaRiga({
      id: 1,
      data_verifica: locale,
      consegnato_il: '2026-10-21 13:14:30+02',
    });
    expect(consegnaLetta.dataVerifica).toBe('2026-10-19');
    expect(consegnaLetta.consegnatoIl).not.toBe('');
  });

  it('regge valori mancanti senza inventare importi', () => {
    const consegnaLetta = consegnaDaRiga({ id: 1 });
    expect(consegnaLetta.reparto).toBe('');
    expect(consegnaLetta.totale).toBe(0);
    expect(consegnaLetta.righe).toBe(0);
    expect(consegnaLetta.consegnatoDa).toBeNull();
    expect(consegnaLetta.dataVerifica).toBe('');
    expect(consegnaLetta.invio).toBeNull();
  });

  it('legge la conferma d’invio quando c’è tutta', () => {
    const consegnaLetta = consegnaDaRiga({
      id: 7,
      data_verifica: '2026-10-19',
      consegnato_il: '2026-10-20T09:00:00.000Z',
      inviata_il: '2026-10-21',
      mezzo_invio: 'PEC',
      note_invio: '  protocollo n. 1234 ',
      invio_confermato_il: new Date('2026-10-21T13:14:30.057Z'),
      invio_confermato_da: 'mario.rossi@ente.it',
    });

    expect(consegnaLetta.invio).toEqual({
      inviataIl: '2026-10-21',
      mezzo: 'PEC',
      note: 'protocollo n. 1234',
      confermatoIl: '2026-10-21T13:14:30.057Z',
      confermatoDa: 'mario.rossi@ente.it',
    });
  });

  it('una conferma senza il mezzo non è una conferma', () => {
    // Una riga con la data ma senza il come direbbe «inviato» senza dire
    // «come»: meglio leggerla come non confermata.
    const consegnaLetta = consegnaDaRiga({
      id: 7,
      inviata_il: '2026-10-21',
      invio_confermato_il: '2026-10-21T13:14:30.057Z',
    });
    expect(consegnaLetta.invio).toBeNull();
  });

  it('senza note non inventa testo, e una nota vuota vale come nessuna', () => {
    const base = {
      id: 7,
      inviata_il: '2026-10-21',
      mezzo_invio: 'EMAIL',
      invio_confermato_il: '2026-10-21T13:14:30.057Z',
      invio_confermato_da: 'anna@alfa.it',
    };
    expect(consegnaDaRiga(base).invio?.note).toBeNull();
    expect(consegnaDaRiga({ ...base, note_invio: '   ' }).invio?.note).toBeNull();
  });
});

describe('validaConfermaInvio', () => {
  const oggi = new Date('2026-10-21T10:00:00.000Z');
  const validaInvio = { inviataIl: '2026-10-21', mezzo: 'PEC', note: '' };

  it('accetta un invio di oggi e normalizza le note', () => {
    const esito = validaConfermaInvio({ ...validaInvio, note: '  protocollo 77 ' }, oggi);
    expect(esito.ok).toBe(true);
    if (esito.ok) {
      expect(esito.dati.inviataIl).toBe('2026-10-21');
      expect(esito.dati.mezzo).toBe('PEC');
      expect(esito.dati.note).toBe('protocollo 77');
    }
  });

  it('le note vuote non sono un errore: diventano «nessuna nota»', () => {
    const esito = validaConfermaInvio({ ...validaInvio, note: '   ' }, oggi);
    expect(esito.ok).toBe(true);
    if (esito.ok) expect(esito.dati.note).toBeNull();
    const senzaNote = validaConfermaInvio({ inviataIl: '2026-10-20', mezzo: 'EMAIL' }, oggi);
    expect(senzaNote.ok).toBe(true);
  });

  it('rifiuta una data che non esiste o scritta male', () => {
    expect(validaConfermaInvio({ ...validaInvio, inviataIl: '2026-02-31' }, oggi).ok).toBe(false);
    expect(validaConfermaInvio({ ...validaInvio, inviataIl: '21/10/2026' }, oggi).ok).toBe(false);
    expect(validaConfermaInvio({ ...validaInvio, inviataIl: '' }, oggi).ok).toBe(false);
  });

  it('rifiuta il futuro, ma tollera domani per il fuso del server', () => {
    expect(validaConfermaInvio({ ...validaInvio, inviataIl: '2026-10-22' }, oggi).ok).toBe(true);
    const esito = validaConfermaInvio({ ...validaInvio, inviataIl: '2026-10-23' }, oggi);
    expect(esito.ok).toBe(false);
    if (!esito.ok) expect(esito.errore).toContain('futuro');
  });

  it('rifiuta un anno troppo indietro', () => {
    expect(validaConfermaInvio({ ...validaInvio, inviataIl: '1999-12-31' }, oggi).ok).toBe(false);
    expect(validaConfermaInvio({ ...validaInvio, inviataIl: '2000-01-01' }, oggi).ok).toBe(true);
  });

  it('rifiuta un mezzo fuori elenco', () => {
    expect(validaConfermaInvio({ ...validaInvio, mezzo: 'TELEGRAMMA' }, oggi).ok).toBe(false);
    expect(validaConfermaInvio({ ...validaInvio, mezzo: '' }, oggi).ok).toBe(false);
    expect(validaConfermaInvio({ ...validaInvio, mezzo: undefined }, oggi).ok).toBe(false);
  });

  it('rifiuta note troppo lunghe o di tipo sbagliato', () => {
    expect(validaConfermaInvio({ ...validaInvio, note: 'x'.repeat(501) }, oggi).ok).toBe(false);
    expect(validaConfermaInvio({ ...validaInvio, note: 'x'.repeat(500) }, oggi).ok).toBe(true);
    expect(validaConfermaInvio({ ...validaInvio, note: 42 }, oggi).ok).toBe(false);
  });

  it('rifiuta un corpo che non è un oggetto', () => {
    expect(validaConfermaInvio(null, oggi).ok).toBe(false);
    expect(validaConfermaInvio('PEC', oggi).ok).toBe(false);
    expect(validaConfermaInvio(undefined, oggi).ok).toBe(false);
  });
});

describe('etichette dei mezzi', () => {
  it('dà un nome leggibile a ogni mezzo previsto', () => {
    for (const m of MEZZI_INVIO) expect(etichettaMezzo(m.valore)).toBe(m.etichetta);
  });

  it('un valore sconosciuto si legge com’è, senza inventare un’etichetta', () => {
    expect(etichettaMezzo('TELEGRAMMA')).toBe('TELEGRAMMA');
  });
});

describe('statoConsegnaReparto', () => {
  const [riepilogo] = riassumiConsegne([consegna(1, { versione: '1-aaaaaaaa' })]);

  it('senza consegne dice che il reparto non ha mai ricevuto il documento', () => {
    expect(statoConsegnaReparto(undefined, '1-aaaaaaaa')).toEqual({ stato: 'mai' });
  });

  it('riconosce la versione attuale', () => {
    expect(statoConsegnaReparto(riepilogo, '1-aaaaaaaa').stato).toBe('allineata');
  });

  it('segnala la versione precedente e riporta quale è stata consegnata', () => {
    const stato = statoConsegnaReparto(riepilogo, '1-bbbbbbbb');
    expect(stato.stato).toBe('superata');
    if (stato.stato === 'superata') {
      expect(stato.consegna.ultima.versione).toBe('1-aaaaaaaa');
    }
  });
});
