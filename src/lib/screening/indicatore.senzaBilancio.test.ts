import { describe, it, expect } from 'vitest';
import { calcolaAttenzione, type IngressoIndicatore } from './indicatore';

//
// IL BILANCIO NON È MATERIA DEL TRIAGE.
//
// Il triage è la visita dell'ente all'azienda: l'unico documento esterno è la
// visura, che dà la storia della società. I bilanci XBRL si chiedono DOPO, a
// chi ha deciso di procedere. Prima, un'impresa costituita nel 2013 senza XBRL
// veniva segnalata per «bilanci non depositati» in una fase in cui nessuno li
// aveva chiesti — e la copertura diceva «1 dimensione su 4» contando una
// dimensione che non si stava guardando.
//
const triage: IngressoIndicatore = {
  annoCostituzione: 2013,
  annoCorrente: 2026,
  xbrlPresente: false,
  patrimonioNetto: null,
  indiciViolati: null,
  sogliaSuperata: false,
  esposizione: 16_756.41,
  sogliaApplicabile: 15_000,
  coloreQualitativo: null,
  senzaBilancio: true,
};

describe('triage: il bilancio non entra nel giudizio', () => {
  it('l’assenza di XBRL non produce né un accertato né una lacuna', () => {
    const a = calcolaAttenzione(triage);
    expect(a.accertato.join(' ')).not.toContain('XBRL');
    expect(a.daAccertare.join(' ')).not.toContain('XBRL');
    expect(a.dimensioniScoperte?.map((x) => x.nome).join(' ')).not.toContain('Equilibrio');
  });

  it('la dimensione esce dal conteggio della copertura: non è «1 su 4»', () => {
    expect(calcolaAttenzione(triage).copertura.totali).toBe(3);
  });

  it('dove il bilancio si legge davvero, la dimensione torna a contare', () => {
    const screening = calcolaAttenzione({ ...triage, senzaBilancio: false });
    expect(screening.copertura.totali).toBe(4);
    expect(screening.accertato.join(' ')).toContain('XBRL');
  });
});
