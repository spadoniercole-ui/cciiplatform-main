import { describe, it, expect } from 'vitest';
import { parseIstanzaXbrl, pulisciTag } from './parser';

describe('pulisciTag', () => {
  it('rimuove il prefisso di namespace e mette tutto in minuscolo', () => {
    expect(pulisciTag('itcc-ci:TotaleAttivo')).toBe('totaleattivo');
  });

  it('rimuove caratteri non alfanumerici', () => {
    expect(pulisciTag('itcc-ci:Debiti_Verso-Banche')).toBe('debitiversobanche');
  });

  it('gestisce un tag senza namespace', () => {
    expect(pulisciTag('TotaleAttivo')).toBe('totaleattivo');
  });
});

describe('parseIstanzaXbrl — fact numerici e note', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<xbrli:xbrl xmlns:xbrli="http://www.xbrl.org/2003/instance" xmlns:itcc-ci="http://www.infocamere.it/ci">
  <xbrli:context id="C1">
    <xbrli:entity><xbrli:identifier scheme="http://www.infocamere.it">01234567890</xbrli:identifier></xbrli:entity>
    <xbrli:period><xbrli:endDate>2024-12-31</xbrli:endDate></xbrli:period>
  </xbrli:context>
  <itcc-ci:TotaleAttivo contextRef="C1">1.234,56</itcc-ci:TotaleAttivo>
  <itcc-ci:NotaIntegrativa>La società ha valutato le immobilizzazioni al costo storico e non ha rilevato fatti di rilievo dopo la chiusura dell'esercizio.</itcc-ci:NotaIntegrativa>
  <itcc-ci:NotaCrediti contextRef="C1">I crediti verso clienti sono esposti al netto del fondo svalutazione, stanziato secondo il criterio prudenziale.</itcc-ci:NotaCrediti>
  <itcc-ci:NotaSenzaContesto>Non ci sono impegni fuori bilancio significativi alla data di chiusura.</itcc-ci:NotaSenzaContesto>
  <itcc-ci:CodiceFiscale>01234567890</itcc-ci:CodiceFiscale>
</xbrli:xbrl>`;

  it('non trasforma una nota in uno zero e conserva i fact testuali', () => {
    const dati = parseIstanzaXbrl(xml);
    expect(dati.facts).toHaveLength(1);
    expect(dati.facts[0]).toMatchObject({
      tagPulito: 'totaleattivo',
      contextRef: 'C1',
      valore: 1234.56,
    });
    expect(dati.factTestuali.map((f) => f.tagPulito)).toEqual([
      'notaintegrativa',
      'notacrediti',
      'notasenzacontesto',
    ]);
    expect(dati.factTestuali[2].contextRef).toBe('');
    expect(dati.factTestuali[0].ordine).toBe(0);
  });

  it('conserva le note senza contextRef, che il vecchio parser avrebbe scartato', () => {
    const dati = parseIstanzaXbrl(xml);
    expect(dati.factTestuali.some((f) => f.tagPulito === 'notasenzacontesto')).toBe(true);
    expect(dati.anagraficaGrezza.codiceFiscale).toBe('01234567890');
  });
});
