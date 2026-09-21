import { describe, it, expect } from 'vitest';
import { FONTI, fonte, difettiRegistro, puoSostenereEsito } from './fonti';
import { parametriCramDown63, perimetroTransazioneCN } from './regole';
import { calcolaSoglie25Novies, type DatiSoglie } from '../soglie25novies/calcolo';

describe('registro delle fonti', () => {
  it('è coerente: nessun difetto', () => {
    expect(difettiRegistro()).toEqual([]);
  });

  it('una voce vigente senza atto è un difetto', () => {
    const f = { ...FONTI[0], id: 'X', atto: null };
    expect(difettiRegistro([f])).toContain('X: vigente senza atto');
  });

  it('la data del 12 agosto 2026 per l’art. 63 non esiste più', () => {
    // Era una data di aggiornamento della banca dati di Libra, non di efficacia.
    expect(FONTI.some((f) => f.efficaciaDal === '2026-08-12' || f.id.includes('2026-08-12'))).toBe(
      false
    );
    expect(fonte('CCII-63-vigente')?.efficaciaDal).toBe('2024-09-28');
  });

  it('una fonte abrogata o da verificare non sostiene un esito', () => {
    expect(puoSostenereEsito('CCII-13-c2-originario')).toBe(false);
    expect(puoSostenereEsito('CCII-57-60-61')).toBe(false);
    expect(puoSostenereEsito('CCII-25novies-c1-a')).toBe(true);
  });

  it('ogni riga del motore delle soglie cita una fonte che esiste e regge', () => {
    const dati: DatiSoglie = {
      conLavoratori: true,
      contributiScaduti: 1,
      contributiDovutiAnnoPrecedente: 1,
      annoContributiDovuti: 2025,
      sanzioniPresunte: null,
      premiInail: 1,
      ivaScaduta: 1,
      volumeAffari: 1,
      creditiAffidati: 1,
      formaAER: 'ALTRE_SOCIETA',
      ritardoOltre90Giorni: true,
    };
    const righe = calcolaSoglie25Novies(dati).righe;
    expect(righe.length).toBeGreaterThan(0);
    for (const r of righe) {
      expect(r.fonte, r.ambito).toBeTruthy();
      expect(puoSostenereEsito(r.fonte!), r.fonte).toBe(true);
    }
  });
});

describe('art. 63: la soglia dipende dalla data della proposta', () => {
  it('senza data: bloccato, nessuna soglia scelta', () => {
    const e = parametriCramDown63({ dataProposta: null, quotaAltriAderenti: 0.3 });
    expect(e.esito).toBe('bloccato');
    expect(e.percentualeMinima).toBeUndefined();
  });

  it('senza quota degli altri aderenti: bloccato', () => {
    expect(
      parametriCramDown63({ dataProposta: '2025-03-01', quotaAltriAderenti: null }).esito
    ).toBe('bloccato');
  });

  it('dal 28/09/2024 con aderenti al 25%: 50%', () => {
    const e = parametriCramDown63({ dataProposta: '2024-09-28', quotaAltriAderenti: 0.25 });
    expect(e.percentualeMinima).toBe(50);
    expect(e.fonti).toContain('CCII-63-c4');
  });

  it('dal 28/09/2024 senza aderenti sufficienti: 60% e dieci anni', () => {
    const e = parametriCramDown63({ dataProposta: '2025-06-10', quotaAltriAderenti: 0.1 });
    expect(e.percentualeMinima).toBe(60);
    expect(e.dilazioneMassimaAnni).toBe(10);
  });

  it('il giorno prima: disciplina transitoria, 30% o 40%', () => {
    expect(
      parametriCramDown63({ dataProposta: '2024-09-27', quotaAltriAderenti: 0.4 }).percentualeMinima
    ).toBe(30);
    expect(
      parametriCramDown63({ dataProposta: '2024-09-27', quotaAltriAderenti: 0 }).percentualeMinima
    ).toBe(40);
  });

  it('mai "applicabile": il giudizio resta al tribunale', () => {
    const e = parametriCramDown63({ dataProposta: '2025-01-01', quotaAltriAderenti: 0.5 });
    expect(/cram down (è )?applicabile/i.test(e.perRicevente + e.perRedigente)).toBe(false);
  });

  it('due formule diverse per Ricevente e Redigente', () => {
    const e = parametriCramDown63({ dataProposta: '2025-01-01', quotaAltriAderenti: 0.5 });
    expect(e.perRicevente).not.toBe(e.perRedigente);
  });
});

describe('transazione nella composizione negoziata: INPS e INAIL esclusi', () => {
  it('INPS: escluso, e il Redigente riceve gli strumenti alternativi', () => {
    const e = perimetroTransazioneCN('INPS');
    expect(e.ammesso).toBe(false);
    expect(e.perRicevente).toContain('non rientra');
    expect(e.perRedigente).toContain('art. 63');
  });

  it('INAIL: escluso come assicurativo', () => {
    expect(perimetroTransazioneCN('INAIL').perRicevente).toContain('assicurativo');
  });

  it('Agenzia delle Entrate: ammesso, ma senza omologazione forzosa', () => {
    const e = perimetroTransazioneCN('AGENZIA_ENTRATE');
    expect(e.ammesso).toBe(true);
    expect(e.perRicevente).toContain('non è prevista omologazione forzosa');
  });
});
