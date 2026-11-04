import { describe, expect, it } from 'vitest';
import { confrontaProvvedimento, normalizzaVoce, somiglianza } from './confronto';
import type { LetturaProvvedimento } from './lettura';

const lettura = (
  crediti: LetturaProvvedimento['crediti'],
  extra: Partial<LetturaProvvedimento> = {}
): LetturaProvvedimento => ({
  crediti,
  speseProceduraPct: null,
  tempiMesi: null,
  dataAtto: null,
  note: [],
  ...extra,
});

describe('confronto fra provvedimento e posizione debitoria dell’ente', () => {
  it('abbinа descrizioni diverse dello stesso credito e misura la differenza', () => {
    expect(somiglianza('Contributi INPS DM10', 'Contributi INPS')).toBeGreaterThan(0.6);
    expect(normalizzaVoce('Contributi INPS — DM10')).toBe('contributi inps dm10');

    const esito = confrontaProvvedimento(
      [{ voce: 'Contributi INPS DM10', importo: 10_000 }],
      lettura([
        {
          voce: 'Contributi INPS',
          importo: 7_000,
          rango: 'PRIVILEGIATO',
          privilegio: null,
          percentualeRealizzo: 50,
          documento: 'decreto.pdf',
          passo: null,
        },
      ]),
      'DECRETO_LIQUIDAZIONE'
    );

    expect(esito.voci[0].esito).toBe('MINORE');
    expect(esito.voci[0].differenza).toBe(-3_000);
    expect(esito.voci[0].realizzoAtteso).toBe(3_500);
    expect(esito.creditoEnte).toBe(10_000);
    expect(esito.ammessoGiudice).toBe(7_000);
    expect(esito.minoreAmmissione).toBe(3_000);
    expect(esito.recuperoAtteso).toBe(3_500);
    expect(esito.perditaTotale).toBe(6_500);
    expect(esito.elementiContestabili).toHaveLength(1);
  });

  it('un credito non riscontrato concorre alla perdita e alla contestazione', () => {
    const esito = confrontaProvvedimento(
      [{ voce: 'Canoni di locazione', importo: 5_000 }],
      lettura([
        {
          voce: 'Contributi previdenziali',
          importo: 5_000,
          rango: 'PRIVILEGIATO',
          privilegio: null,
          percentualeRealizzo: 40,
          documento: null,
          passo: null,
        },
      ]),
      'CRAM_DOWN'
    );

    expect(esito.voci.map((v) => v.esito)).toEqual([
      'NON_RISCONTRATO',
      'NON_PRESENTE_NEI_DATI_ENTE',
    ]);
    expect(esito.nonAmmessi).toBe(1);
    expect(esito.nonRiscontratiDalGiudice).toBe(1);
    expect(esito.creditoEnte).toBe(5_000);
    expect(esito.ammessoGiudice).toBe(5_000);
    expect(esito.elementiContestabili[0]).toMatchObject({
      voce: 'Canoni di locazione',
      importo: 5_000,
    });
  });

  it('senza la percentuale dell’atto il recupero resta null, non zero', () => {
    const esito = confrontaProvvedimento(
      [{ voce: 'Fornitori', importo: 2_000 }],
      lettura([
        {
          voce: 'Fornitori',
          importo: 2_000,
          rango: 'CHIROGRAFARIO',
          privilegio: null,
          percentualeRealizzo: null,
          documento: null,
          passo: null,
        },
      ]),
      'DECRETO_LIQUIDAZIONE'
    );
    expect(esito.voci[0].esito).toBe('CONFORME');
    expect(esito.recuperoAtteso).toBeNull();
    expect(esito.perditaTotale).toBeNull();
    expect(esito.avvisi.join(' ')).toContain('calcolabil');
  });

  it('totalizza per rango e non confonde un importo maggiore con una perdita', () => {
    const esito = confrontaProvvedimento(
      [
        { voce: 'IVA', importo: 1_000 },
        { voce: 'Contributi INPS', importo: 2_000 },
      ],
      lettura([
        {
          voce: 'IVA',
          importo: 1_000,
          rango: 'PRIVILEGIATO',
          privilegio: null,
          percentualeRealizzo: 30,
          documento: null,
          passo: null,
        },
        {
          voce: 'Contributi INPS',
          importo: 2_500,
          rango: 'PRIVILEGIATO',
          privilegio: null,
          percentualeRealizzo: 30,
          documento: null,
          passo: null,
        },
      ]),
      'CRAM_DOWN'
    );
    expect(esito.voci.find((v) => v.voce === 'Contributi INPS')?.esito).toBe('MAGGIORE');
    expect(esito.elementiContestabili).toHaveLength(0);
    const totale = esito.totaliRango.find((t) => t.rango === 'PRIVILEGIATO');
    expect(totale).toMatchObject({
      importoEnte: 3_000,
      ammessoGiudice: 3_500,
      recuperoAtteso: 1_050,
      perdita: 1_950,
    });
  });

  it('avverte quando il decreto non contiene crediti', () => {
    const esito = confrontaProvvedimento([], lettura([]), 'DECRETO_LIQUIDAZIONE');
    expect(esito.avvisi.join(' ')).toContain('non ha estratto crediti');
    expect(esito.perditaTotale).toBeNull();
  });
});
