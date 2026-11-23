import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AZIENDA_LOGISTICA,
  AZIENDA_MECCANICA,
  AZIENDA_TESSITURA,
  DOCUMENTI_DEMO,
  PACCHETTO_DOCUMENTI_DEMO,
  bilancioDemoPerCodiceFiscale,
  documentiDemoPerAccettazione,
  documentiDemoPerAzienda,
  documentiDemoSelezionati,
  documentiProvvedimentoDemo,
  eDocumentoDemo,
  fascicoloDemoPerCodiceFiscale,
} from './documenti';

describe('documenti del percorso demo', () => {
  it('porta i file delle tre aziende, e nessun’altra', () => {
    expect(DOCUMENTI_DEMO.length).toBeGreaterThanOrEqual(14);
    expect(new Set(DOCUMENTI_DEMO.map((d) => d.azienda))).toEqual(
      new Set([AZIENDA_MECCANICA, AZIENDA_TESSITURA, AZIENDA_LOGISTICA])
    );
    expect(DOCUMENTI_DEMO.filter((d) => d.formato === 'PDF').length).toBeGreaterThanOrEqual(5);
    expect(DOCUMENTI_DEMO.filter((d) => d.formato === 'EXCEL').length).toBeGreaterThanOrEqual(8);
  });

  it('i file esistono davvero in public/demo, compreso il pacchetto', () => {
    for (const documento of DOCUMENTI_DEMO) {
      expect(existsSync(join(process.cwd(), 'public', documento.percorso)), documento.nome).toBe(
        true
      );
    }
    expect(existsSync(join(process.cwd(), 'public', PACCHETTO_DOCUMENTI_DEMO))).toBe(true);
  });

  it('tutte hanno il fascicolo, solo quelle con bilancio ce l’hanno', () => {
    for (const codiceFiscale of ['00000000101', '00000000102', '00000000103']) {
      expect(fascicoloDemoPerCodiceFiscale(codiceFiscale)?.formato).toBe('PDF');
    }
    expect(fascicoloDemoPerCodiceFiscale('non-esiste')).toBeNull();

    for (const codiceFiscale of ['00000000101', '00000000102']) {
      expect(bilancioDemoPerCodiceFiscale(codiceFiscale)?.formato).toBe('EXCEL');
    }
    // Logistica si ferma all'amministrativa: nessun bilancio, e la funzione lo
    // dice invece di restituire un file che quella tappa non ha.
    expect(bilancioDemoPerCodiceFiscale('00000000103')).toBeNull();
  });

  it('la posizione ferma all’amministrativa ha visura, certificazione, DM10 e deleghe', () => {
    const documenti = documentiDemoPerAzienda(AZIENDA_LOGISTICA, null);
    expect(documenti.map((d) => d.ruolo).sort()).toEqual([
      'CERTIFICAZIONE',
      'CHECKLIST',
      'DELEGHE',
      'DENUNCE',
      'FASCICOLO',
    ]);
    expect(
      documentiDemoSelezionati(
        AZIENDA_LOGISTICA,
        '.pdf,.xlsx',
        'FASCICOLO,CERTIFICAZIONE,DENUNCE,DELEGHE'
      )
    ).toHaveLength(4);
  });

  it('solo la Meccanica ha atti, e il documento segue la natura dello scenario', () => {
    expect(documentiProvvedimentoDemo('00000000101', 'PROPOSTA').map((d) => d.nome)).toEqual([
      'proposta-meccanica-valsesia.pdf',
    ]);
    expect(documentiProvvedimentoDemo('00000000101', 'CRAM_DOWN').map((d) => d.nome)).toEqual([
      'dispositivo-cram-down-meccanica-valsesia.pdf',
    ]);
    expect(documentiProvvedimentoDemo('00000000101')).toHaveLength(2);

    // Tessitura e Logistica non hanno uno scenario: nessun atto da mostrare.
    expect(documentiProvvedimentoDemo('00000000102')).toEqual([]);
    expect(documentiProvvedimentoDemo('00000000103')).toEqual([]);
    expect(documentiProvvedimentoDemo('non-esiste')).toEqual([]);
  });

  it('il caricamento simulato mostra il tipo di file giusto', () => {
    expect(documentiDemoPerAccettazione('.xbrl,.xml').every((d) => d.formato === 'XBRL')).toBe(
      true
    );
    expect(documentiDemoPerAccettazione('.pdf').every((d) => d.formato === 'PDF')).toBe(true);
    expect(
      documentiDemoPerAccettazione('.xlsx,.xls').every(
        (d) => d.formato === 'EXCEL' && !d.nome.startsWith('bilancio-')
      )
    ).toBe(true);
  });

  it('filtra per azienda: nel caricamento di Meccanica non compaiono i documenti di Tessitura', () => {
    const meccanica = documentiDemoPerAzienda(AZIENDA_MECCANICA, '.pdf');
    expect(meccanica.some((d) => d.azienda === AZIENDA_TESSITURA)).toBe(false);
    expect(meccanica.every((d) => d.azienda === AZIENDA_MECCANICA)).toBe(true);
    expect(documentiDemoPerAzienda(null, '.pdf')).toEqual([]);
  });

  it('preseleziona i ruoli del campo e lascia scegliere gli altri documenti dell’azienda', () => {
    const scelti = documentiDemoSelezionati(AZIENDA_MECCANICA, '.pdf', 'PROPOSTA');
    expect(scelti.map((d) => d.ruolo)).toEqual(['PROPOSTA']);
    const tutti = documentiDemoPerAzienda(AZIENDA_TESSITURA, '.pdf');
    expect(tutti.map((d) => d.ruolo)).toEqual(['FASCICOLO']);
  });

  it('se il ruolo richiesto manca, preseleziona i documenti disponibili invece di zero file', () => {
    // Tessitura non ha un atto: un campo «provvedimento» non deve aprire il
    // modale con la selezione vuota e il pulsante disabilitato.
    expect(
      documentiDemoSelezionati(AZIENDA_TESSITURA, '.pdf', 'PROVVEDIMENTO').map((d) => d.ruolo)
    ).toEqual(['FASCICOLO']);
  });

  it('riconosce il set demo dal nome del file, e solo quello', () => {
    // IL MARCHIO DEL SET (0.256.0): la guardia dell'upload si appoggia a
    // questo, quindi il test guarda sia il nome esatto sia ciò che non deve
    // passare.
    expect(eDocumentoDemo('proposta-meccanica-valsesia.pdf')).toBe(true);
    expect(eDocumentoDemo('FASCICOLO-STORICO-LOGISTICA-PADANA.PDF')).toBe(true);
    expect(eDocumentoDemo('C:\\temp\\fascicolo-storico-tessitura-lario.pdf')).toBe(true);
    expect(eDocumentoDemo('fattura-mia.pdf')).toBe(false);
    expect(eDocumentoDemo('fascicolo-storico-cantieri-brianza.pdf')).toBe(false);
    expect(eDocumentoDemo(null)).toBe(false);
  });
});
