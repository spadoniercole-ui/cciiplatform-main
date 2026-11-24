import { describe, expect, it } from 'vitest';
import { congruenzaFlussi } from './congruenza';
import {
  dataLeggibile,
  periodoLeggibile,
  raggruppaProspettoPerAnno,
  type GruppoAnnoProspetto,
} from './prospetto';
import { PROFILI_PREDEFINITI, type ProfiloFlusso } from './profilo';

const inps: ProfiloFlusso = { ...PROFILI_PREDEFINITI[0], id: 1, enteId: 1, enteNome: 'INPS' };

const base = {
  profilo: inps,
  dal: '2024-11',
  al: '2025-02',
  dataVerifica: '2026-11-14',
};

describe('prospetto degli adempimenti — una riga per periodo e famiglia', () => {
  it('mette denuncia e pagamento di ogni periodo, in ordine cronologico', () => {
    const esito = congruenzaFlussi({
      ...base,
      righe: [
        { periodo: '202411 - 202411', voce: 'Denunce non trasmesse' },
        { periodo: '202411 - 202411', voce: 'F24 non presentato' },
      ],
    });
    // Il profilo INPS non prevede undici periodi all'anno: le righe sono due
    // per ogni periodo atteso, qualunque sia il numero dei periodi.
    expect(esito.prospetto.length).toBe(esito.attesi * 2);
    expect(esito.prospetto[0]).toMatchObject({ periodo: '2024-11', tipo: 'DENUNCIA' });
    expect(esito.prospetto[0].stato).toBe('TRASMESSO');
    expect(esito.prospetto[1]).toMatchObject({ periodo: '2024-11', tipo: 'PAGAMENTO' });
    expect(esito.prospetto[1].stato).toBe('TRASMESSO');
    expect(esito.prospetto[2].stato).toBe('SCOPERTA');
  });

  it('dichiara il ritardo solo dove il file non dà la data: i trasmessi restano senza', () => {
    const esito = congruenzaFlussi({
      ...base,
      righe: [{ periodo: '202411 - 202411', voce: 'Denunce non trasmesse' }],
    });
    const trasmessa = esito.prospetto.find((r) => r.periodo === '2024-11' && r.tipo === 'DENUNCIA');
    expect(trasmessa?.ritardo).toBeNull();
    const scoperta = esito.prospetto.find((r) => r.periodo === '2025-01' && r.tipo === 'DENUNCIA');
    expect(scoperta?.ritardo).toBeGreaterThan(0);
  });

  it('porta la voce che copre un periodo regolarizzato', () => {
    const esito = congruenzaFlussi({
      ...base,
      righe: [
        // La voce nomina l'Uniemens: la famiglia è la denuncia, e la partita
        // copre quel periodo invece di lasciarlo scoperto.
        { periodo: '202501 - 202501', voce: 'TS 27 - flusso Uniemens non versato' },
      ],
    });
    const riga = esito.prospetto.find((r) => r.periodo === '2025-01' && r.tipo === 'DENUNCIA');
    expect(riga?.stato).toBe('REGOLARIZZATA');
    expect(riga?.copertura).toContain('TS 27');
  });

  it('tiene anche i periodi fuori dall’arco, dichiarandoli tali', () => {
    const esito = congruenzaFlussi({
      ...base,
      righe: [{ periodo: '202301 - 202301', voce: 'F24 non presentato' }],
    });
    const fuori = esito.prospetto.find((r) => r.periodo === '2023-01');
    expect(fuori?.stato).toBe('FUORI_PERIMETRO');
    expect(fuori?.ritardo).toBeNull();
  });
});

describe('raggruppamento per anno', () => {
  const righe = congruenzaFlussi({
    ...base,
    righe: [{ periodo: '202411 - 202411', voce: 'Denunce non trasmesse' }],
  }).prospetto;

  const anni = (gruppi: GruppoAnnoProspetto[]) => gruppi.map((g) => g.anno);

  it('fa un nodo per anno, dal più recente', () => {
    expect(anni(raggruppaProspettoPerAnno(righe))).toEqual([2025, 2024]);
  });

  it('conta le posizioni e le scoperte di ogni anno, e il ritardo più alto', () => {
    const gruppi = raggruppaProspettoPerAnno(righe);
    const venticinque = gruppi.find((g) => g.anno === 2025);
    const ventiquattro = gruppi.find((g) => g.anno === 2024);
    // 2025: due periodi per due famiglie, tutte scoperte; 2024: la denuncia
    // risulta trasmessa e il pagamento no.
    expect(venticinque?.righe.length).toBe(4);
    expect(venticinque?.scoperte).toBe(4);
    expect(ventiquattro?.righe.length).toBe(2);
    expect(ventiquattro?.scoperte).toBe(1);
    expect(ventiquattro?.ritardoMassimo).toBeGreaterThan(0);
  });

  it('il filtro delle sole scoperte non lascia nodi vuoti', () => {
    const gruppi = raggruppaProspettoPerAnno(righe, { soloScoperte: true });
    expect(gruppi.every((g) => g.righe.every((r) => r.stato === 'SCOPERTA'))).toBe(true);
    expect(gruppi.every((g) => g.righe.length > 0)).toBe(true);
  });

  it('il filtro per fonte tiene una famiglia sola', () => {
    const gruppi = raggruppaProspettoPerAnno(righe, { fonte: 'PAGAMENTO' });
    expect(gruppi.flatMap((g) => g.righe).every((r) => r.tipo === 'PAGAMENTO')).toBe(true);
  });

  it('scrive periodi e date come li legge un ufficio', () => {
    expect(periodoLeggibile('2025-02')).toBe('02/2025');
    expect(dataLeggibile('2025-03-31')).toBe('31/03/2025');
    expect(dataLeggibile(null)).toBe('—');
  });
});
