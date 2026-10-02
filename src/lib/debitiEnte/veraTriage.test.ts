import { describe, it, expect } from 'vitest';
import { estraiRigheVera, eSezioneVersamenti, ritardoDaVera } from './veraImport';

// In fase di triage non si chiede all'operatore di mappare titoli e
// trattamenti: si carica il file per sapere se la posizione vada guardata.
// Con le mappature vuote lo scarto era TOTALE — file caricato e ignorato, e
// l'indicatore che dichiarava l'esposizione non disponibile pur avendola
// appena ricevuta.

const sezioni = [
  {
    titolo: 'CONTRIBUTI',
    righe: [
      { voce: 'Contributi correnti', stato: 'Iscritto a ruolo', importo: 12_000 },
      { voce: 'Contributi', stato: '', importo: 3_000 },
    ],
  },
];

describe('import V.E.R.A. in modalità triage', () => {
  it('senza mappature il comportamento normale scarta TUTTO', () => {
    const { righe } = estraiRigheVera(sezioni as never, {}, {});
    expect(righe).toHaveLength(0);
  });

  it('in triage le righe vengono conservate, con gli importi giusti', () => {
    const { righe } = estraiRigheVera(sezioni as never, {}, {}, true);
    expect(righe).toHaveLength(2);
    expect(righe.reduce((a, r) => a + r.importo, 0)).toBe(15_000);
  });

  it('in triage la categoria resta VUOTA: non si inventa una classificazione', () => {
    const { righe } = estraiRigheVera(sezioni as never, {}, {}, true);
    for (const r of righe) expect(r.categoria).toBe('');
  });

  it('in triage il trattamento è quello suggerito dalla catena natura/stato', () => {
    const { righe } = estraiRigheVera(sezioni as never, {}, {}, true);
    for (const r of righe) expect(r.trattamento).toBeTruthy();
  });

  it('le mappature esistenti hanno comunque la precedenza', () => {
    const { righe } = estraiRigheVera(sezioni as never, { contributi: 'DEBITO' }, {}, true);
    for (const r of righe) expect(r.categoria).toBe('DEBITO');
  });
});

describe('V.E.R.A.: versamenti e cartelle sospese', () => {
  it('la Sezione F24 (versamenti) non è una sezione di debito', () => {
    expect(
      eSezioneVersamenti(['Posizione', 'Tipo Versamento', 'Data Versamento', 'Importo a Debito'])
    ).toBe(true);
    expect(eSezioneVersamenti(['Posizione', 'Natura omissione/Tipologia', 'Totale debito'])).toBe(
      false
    );
  });

  it('una cartella sospesa ha importo noto ed è esclusa dalle somme, non «importo ignoto»', () => {
    const { righe } = estraiRigheVera(
      [{ titolo: 'ADR', righe: [{ voce: 'Adr', stato: 'Sospeso', importo: 6990.45 }] }] as never,
      {},
      {},
      true
    );
    expect(righe[0].trattamento).toBe('ignora');
    expect(righe[0].importo).toBe(6990.45);
  });
});

describe('V.E.R.A.: ritardo oltre 90 giorni dai periodi', () => {
  const sez = [
    {
      titolo: 'GESTIONE LAVORATORI DIPENDENTI PRIVATI',
      righe: [
        { voce: 'TS 27', stato: '', importo: 3404.02, periodo: '202506 - 202506' },
        { voce: 'TS 27', stato: '', importo: 776.22, periodo: '202607 - 202607' },
        { voce: 'TS 27', stato: 'In lavorazione', importo: 100, periodo: '202501 - 202501' },
      ],
    },
    { titolo: 'ADR', righe: [{ voce: 'Adr', stato: '', importo: 1230.6 }] },
  ];

  it('conta solo le partite contabilizzate scadute da oltre 90 giorni', () => {
    const r = ritardoDaVera(sez as never, new Date('2026-09-21T12:00:00Z'));
    expect(r).toEqual({ partite: 1, importo: 3404.02, periodi: ['2025/06'] });
  });

  it('senza periodi il ritardo non si misura', () => {
    expect(ritardoDaVera([sez[1]] as never, new Date('2026-09-21'))).toBeNull();
  });
});
