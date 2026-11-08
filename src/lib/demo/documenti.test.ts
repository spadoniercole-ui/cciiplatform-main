import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { analizzaFileXbrl } from '@/lib/xbrl';
import { parseIstanzaXbrl } from '@/lib/xbrl/parser';
import {
  AZIENDA_CANTIERI,
  AZIENDA_IMPIANTI,
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
  fascicoloDemoPerCodiceFiscale,
} from './documenti';

describe('documenti del percorso demo', () => {
  it('porta tutti i file necessari, nelle cinque aziende', () => {
    expect(DOCUMENTI_DEMO.length).toBeGreaterThanOrEqual(23);
    expect(new Set(DOCUMENTI_DEMO.map((d) => d.azienda)).size).toBe(5);
    expect(DOCUMENTI_DEMO.filter((d) => d.formato === 'PDF').length).toBeGreaterThanOrEqual(12);
    expect(DOCUMENTI_DEMO.filter((d) => d.formato === 'EXCEL').length).toBeGreaterThanOrEqual(11);
  });

  it('i file esistono davvero in public/demo, compreso il pacchetto', () => {
    for (const documento of DOCUMENTI_DEMO) {
      expect(existsSync(join(process.cwd(), 'public', documento.percorso)), documento.nome).toBe(
        true
      );
    }
    expect(existsSync(join(process.cwd(), 'public', PACCHETTO_DOCUMENTI_DEMO))).toBe(true);
  });

  it('ogni azienda ha il fascicolo storico e il prospetto di bilancio', () => {
    for (const codiceFiscale of ['00000000101', '00000000102', '00000000103', '00000000104']) {
      expect(fascicoloDemoPerCodiceFiscale(codiceFiscale)?.formato).toBe('PDF');
      expect(bilancioDemoPerCodiceFiscale(codiceFiscale)?.formato).toBe('EXCEL');
    }
    expect(fascicoloDemoPerCodiceFiscale('00000000105')?.formato).toBe('PDF');
    expect(fascicoloDemoPerCodiceFiscale('non-esiste')).toBeNull();
  });

  it('la posizione ferma al triage ha visura, bilancio, certificazione, DM10 e deleghe', () => {
    const documenti = documentiDemoPerAzienda(AZIENDA_IMPIANTI, null);
    expect(documenti.map((d) => d.ruolo).sort()).toEqual([
      'BILANCIO',
      'CERTIFICAZIONE',
      'CHECKLIST',
      'DELEGHE',
      'DENUNCE',
      'FASCICOLO',
    ]);
    expect(bilancioDemoPerCodiceFiscale('00000000105')).toBeNull();
    expect(
      documentiDemoSelezionati(
        AZIENDA_IMPIANTI,
        '.pdf,.xlsx',
        'FASCICOLO,CERTIFICAZIONE,DENUNCE,DELEGHE'
      )
    ).toHaveLength(4);
  });

  it('la liquidazione ha decreto e stato passivo, il cram down il dispositivo', () => {
    const liquidazione = documentiProvvedimentoDemo('00000000102');
    const cramDown = documentiProvvedimentoDemo('00000000103');
    expect(liquidazione.map((d) => d.nome)).toEqual([
      'decreto-liquidazione-tessitura-lario.pdf',
      'stato-passivo-tessitura-lario.pdf',
    ]);
    expect(cramDown.map((d) => d.nome)).toEqual(['dispositivo-cram-down-logistica-padana.pdf']);
    expect(documentiProvvedimentoDemo('00000000101')).toHaveLength(0);
  });

  it('la valutazione aperta può ricevere entrambe le varianti del provvedimento', () => {
    expect(
      documentiProvvedimentoDemo('00000000104', 'DECRETO_LIQUIDAZIONE').map((d) => d.nome)
    ).toEqual(['decreto-liquidazione-cantieri-brianza.pdf']);
    expect(documentiProvvedimentoDemo('00000000104', 'CRAM_DOWN').map((d) => d.nome)).toEqual([
      'dispositivo-cram-down-cantieri-brianza.pdf',
    ]);
    expect(documentiProvvedimentoDemo('00000000104')).toHaveLength(2);
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

  it('ogni azienda ha il bilancio XBRL e il file è davvero leggibile', async () => {
    for (const azienda of [
      AZIENDA_MECCANICA,
      AZIENDA_TESSITURA,
      AZIENDA_LOGISTICA,
      AZIENDA_CANTIERI,
      AZIENDA_IMPIANTI,
    ]) {
      const istanze = documentiDemoPerAzienda(azienda, '.xbrl,.xml');
      expect(istanze, azienda).toHaveLength(1);
      const xml = readFileSync(join(process.cwd(), 'public', istanze[0].percorso), 'utf8');
      const estratto = parseIstanzaXbrl(xml);
      expect(estratto.annoBilancio, azienda).toBe(2025);
      expect(estratto.facts.length, azienda).toBeGreaterThan(15);

      // Il file non basta: deve arrivare ai campi del bilancio che il
      // Piano-ponte legge. Un tag scritto male darebbe una demo di zeri.
      const analisi = await analizzaFileXbrl(xml, istanze[0].nome);
      expect(analisi.corrente.totaleAttivo, azienda).toBe(1_100_000);
      expect(analisi.corrente.totaleDebiti, azienda).toBe(900_000);
      expect(analisi.corrente.valoreProduzione, azienda).toBe(1_350_000);
      expect(analisi.note?.fatti.length ?? 0, azienda).toBeGreaterThan(0);
    }
  });

  it('filtra per azienda: nel caricamento di Meccanica non compaiono i documenti di Tessitura', () => {
    const meccanica = documentiDemoPerAzienda(AZIENDA_MECCANICA, '.pdf');
    expect(meccanica.some((d) => d.azienda === AZIENDA_TESSITURA)).toBe(false);
    expect(meccanica.every((d) => d.azienda === AZIENDA_MECCANICA)).toBe(true);
    expect(documentiDemoPerAzienda(null, '.pdf')).toEqual([]);
  });

  it('preseleziona i ruoli del campo e lascia scegliere gli altri documenti dell’azienda', () => {
    const scelti = documentiDemoSelezionati(
      AZIENDA_TESSITURA,
      '.pdf',
      'PROVVEDIMENTO,STATO_PASSIVO'
    );
    expect(scelti.map((d) => d.ruolo)).toEqual(['PROVVEDIMENTO', 'STATO_PASSIVO']);
    const tutti = documentiDemoPerAzienda(AZIENDA_TESSITURA, '.pdf');
    expect(tutti.map((d) => d.ruolo)).toContain('FASCICOLO');
    expect(
      documentiDemoSelezionati(AZIENDA_CANTIERI, '.pdf', 'PROPOSTA').map((d) => d.ruolo)
    ).toEqual(['PROPOSTA']);
  });

  it('se il ruolo richiesto manca, preseleziona i documenti disponibili invece di zero file', () => {
    // Tessitura segue la liquidazione: un campo «proposta» non deve aprire il
    // modale con la selezione vuota e il pulsante disabilitato.
    expect(
      documentiDemoSelezionati(AZIENDA_TESSITURA, '.pdf', 'PROPOSTA').map((d) => d.ruolo)
    ).toEqual(['FASCICOLO', 'PROVVEDIMENTO', 'STATO_PASSIVO']);
  });
});
