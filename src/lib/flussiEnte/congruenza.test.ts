import { describe, expect, it } from 'vitest';
import { congruenzaFlussi, famigliaDaVoce, mesiSospesi, periodoDaTesto } from './congruenza';
import { PROFILI_PREDEFINITI, type ProfiloFlusso } from './profilo';

const inps: ProfiloFlusso = { ...PROFILI_PREDEFINITI[0], id: 1, enteId: 1, enteNome: 'INPS' };

describe('righe dei flussi — famiglia e periodo', () => {
  it('riconosce denunce e pagamenti dalla natura della voce', () => {
    expect(famigliaDaVoce('Denunce non trasmesse')).toBe('DENUNCIA');
    expect(famigliaDaVoce('F24 non presentato')).toBe('PAGAMENTO');
    expect(famigliaDaVoce('Interessi di mora')).toBeNull();
  });

  it('legge il periodo nei formati che i file usano davvero', () => {
    expect(periodoDaTesto('202506 - 202506')).toBe('2025-06');
    expect(periodoDaTesto('2025-06')).toBe('2025-06');
    expect(periodoDaTesto('6/2025')).toBe('2025-06');
    expect(periodoDaTesto('')).toBeNull();
    expect(periodoDaTesto('202513')).toBeNull();
  });

  it('le sospensioni coprono tutti i mesi dell’intervallo', () => {
    expect(mesiSospesi([{ dal: '2020-10', al: '2020-12', motivo: 'cessazione attività' }])).toEqual(
      ['2020-10', '2020-11', '2020-12']
    );
  });

  it('una sospensione rovesciata non genera mesi', () => {
    expect(mesiSospesi([{ dal: '2021-01', al: '2020-01', motivo: '' }])).toEqual([]);
  });
});

describe('congruenza dei flussi', () => {
  const base = {
    profilo: inps,
    dal: '2020-09',
    al: '2020-11',
    dataVerifica: '2026-11-14',
  };

  it('conta attesi, denunce e deleghe periodo per periodo', () => {
    const esito = congruenzaFlussi({
      ...base,
      righe: [
        { periodo: '202009 - 202009', voce: 'Denunce non trasmesse' },
        { periodo: '202010 - 202010', voce: 'Denunce non trasmesse' },
        { periodo: '202009 - 202009', voce: 'F24 non presentato' },
      ],
    });
    expect(esito.attesi).toBe(3);
    expect(esito.denunce).toBe(2);
    expect(esito.deleghe).toBe(1);
    expect(esito.senzaDenuncia).toEqual(['2020-11']);
    expect(esito.senzaDelega).toEqual(['2020-10', '2020-11']);
  });

  it('misura il ritardo dei periodi mancanti dalla scadenza alla verifica', () => {
    const esito = congruenzaFlussi({ ...base, righe: [] });
    const novembre = esito.scoperte.find((s) => s.periodo === '2020-11' && s.tipo === 'DENUNCIA');
    // Denuncia di novembre: scadenza 31/12/2020, verifica 14/11/2026.
    expect(novembre?.scadenza).toBe('2020-12-31');
    expect(novembre?.giorni).toBe(2144);
  });

  it('non trasforma in mancanza un periodo coperto da una sospensione', () => {
    const esito = congruenzaFlussi({
      ...base,
      sospensioni: [{ dal: '2020-11', al: '2020-11', motivo: 'sospensione matricola' }],
      righe: [],
    });
    expect(esito.attesi).toBe(2);
    expect(esito.sospesi).toEqual(['2020-11']);
    expect(esito.senzaDenuncia).not.toContain('2020-11');
  });

  it('un periodo finito in TS 27 o all’Agente della Riscossione non è un flusso mai arrivato', () => {
    const esito = congruenzaFlussi({
      ...base,
      righe: [
        { periodo: '202010 - 202010', voce: 'TS 27 - flusso Uniemens non versato' },
        { periodo: '202010', voce: 'F24 non presentato' },
      ],
    });
    expect(esito.senzaDenuncia).not.toContain('2020-10');
    expect(esito.regolarizzati).toContainEqual({
      periodo: '2020-10',
      tipo: 'DENUNCIA',
      voce: 'TS 27 - flusso Uniemens non versato',
    });
  });

  it('segnala i periodi fuori dal perimetro del profilo', () => {
    const esito = congruenzaFlussi({
      ...base,
      righe: [{ periodo: '201903 - 201903', voce: 'Denunce non trasmesse' }],
    });
    expect(esito.fuoriPerimetro.denunce).toEqual(['2019-03']);
    expect(esito.completo).toBe(false);
  });

  it('è completo solo quando ogni periodo atteso ha denuncia e pagamento', () => {
    const righe: { periodo: string; voce: string }[] = [];
    for (const p of ['202009', '202010', '202011']) {
      righe.push({ periodo: p, voce: 'Denunce non trasmesse' });
      righe.push({ periodo: p, voce: 'F24 non presentato' });
    }
    const esito = congruenzaFlussi({ ...base, righe });
    expect(esito.completo).toBe(true);
    expect(esito.senzaDenuncia).toEqual([]);
    expect(esito.senzaDelega).toEqual([]);
  });

  it('dichiara che il ritardo dei flussi presenti non è calcolabile', () => {
    const esito = congruenzaFlussi({ ...base, righe: [] });
    expect(esito.notaRitardi).toMatch(/non porta la data di trasmissione/i);
  });

  it('un periodo illeggibile non entra in nessun conteggio', () => {
    const esito = congruenzaFlussi({
      ...base,
      righe: [{ periodo: '', voce: 'Denunce non trasmesse' }],
    });
    expect(esito.denunce).toBe(0);
    expect(esito.fuoriPerimetro.denunce).toEqual([]);
  });
});
