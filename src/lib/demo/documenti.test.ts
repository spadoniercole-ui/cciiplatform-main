import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DOCUMENTI_DEMO,
  PACCHETTO_DOCUMENTI_DEMO,
  bilancioDemoPerCodiceFiscale,
  documentiDemoPerAccettazione,
  documentiProvvedimentoDemo,
  fascicoloDemoPerCodiceFiscale,
} from './documenti';

describe('documenti del percorso demo', () => {
  it('porta tutti i file necessari, nelle tre aziende', () => {
    expect(DOCUMENTI_DEMO.length).toBeGreaterThanOrEqual(13);
    expect(new Set(DOCUMENTI_DEMO.map((d) => d.azienda)).size).toBe(3);
    expect(DOCUMENTI_DEMO.filter((d) => d.formato === 'PDF').length).toBeGreaterThanOrEqual(7);
    expect(DOCUMENTI_DEMO.filter((d) => d.formato === 'EXCEL').length).toBeGreaterThanOrEqual(6);
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
    for (const codiceFiscale of ['00000000101', '00000000102', '00000000103']) {
      expect(fascicoloDemoPerCodiceFiscale(codiceFiscale)?.formato).toBe('PDF');
      expect(bilancioDemoPerCodiceFiscale(codiceFiscale)?.formato).toBe('EXCEL');
    }
    expect(fascicoloDemoPerCodiceFiscale('non-esiste')).toBeNull();
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

  it('il caricamento simulato mostra il tipo di file giusto', () => {
    expect(
      documentiDemoPerAccettazione('.xbrl,.xml').every((d) => d.nome.startsWith('bilancio-'))
    ).toBe(true);
    expect(documentiDemoPerAccettazione('.pdf').every((d) => d.formato === 'PDF')).toBe(true);
    expect(
      documentiDemoPerAccettazione('.xlsx,.xls').every(
        (d) => d.formato === 'EXCEL' && !d.nome.startsWith('bilancio-')
      )
    ).toBe(true);
  });
});
