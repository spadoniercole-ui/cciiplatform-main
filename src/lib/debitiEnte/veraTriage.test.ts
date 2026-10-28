import { describe, it, expect } from 'vitest';
import {
  chiaveCombinazione,
  estraiRigheVera,
  eSezioneVersamenti,
  eSezioneAgenteRiscossione,
  ritardoDaVera,
  totaliVera,
} from './veraImport';

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

  it('una sezione riconducibile a una materia non è «da mappare»', () => {
    // La vecchia categoria non c’è, ma la sezione ha righe con un codice di
    // partita: la materia esiste già, e chiedere una mappatura sarebbe una
    // domanda senza risposta utile (i documenti si compongono dalla materia).
    const trattamenti = {
      [chiaveCombinazione('Contributi correnti', 'Iscritto a ruolo')]: 'da_contabilizzare' as const,
      [chiaveCombinazione('Contributi', '')]: 'contabilizzato' as const,
    };
    const { righe, titoliNonMappati } = estraiRigheVera(
      sezioni as never,
      {},
      trattamenti,
      false,
      (_sezione, voce) => voce.toLowerCase().includes('contributi')
    );
    expect(titoliNonMappati).toEqual([]);
    expect(righe).toHaveLength(2);
    expect(righe.every((r) => r.categoria === '')).toBe(true);
  });

  it('una sezione senza materia e senza categoria resta da mappare', () => {
    const { righe, titoliNonMappati } = estraiRigheVera(
      [
        { titolo: 'SEZIONE NUOVA', righe: [{ voce: 'Voce misteriosa', stato: '', importo: 10 }] },
      ] as never,
      {},
      {},
      false,
      () => false
    );
    expect(titoliNonMappati).toEqual([{ norm: 'sezione nuova', label: 'SEZIONE NUOVA' }]);
    expect(righe).toHaveLength(0);
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

  it('una cartella sospesa ha un trattamento suo: importo noto, esclusa dalle somme, non «ignoto»', () => {
    const { righe } = estraiRigheVera(
      [{ titolo: 'ADR', righe: [{ voce: 'Adr', stato: 'Sospeso', importo: 6990.45 }] }] as never,
      {},
      {},
      true
    );
    // Non è una colonna da buttare: è una posizione sospesa da un
    // provvedimento, che resta attribuibile a un ufficio.
    expect(righe[0].trattamento).toBe('sospeso');
    expect(righe[0].importo).toBe(6990.45);
  });
});

describe('V.E.R.A.: ambito della sezione e destinazione degli importi', () => {
  it('riconosce le cartelle dell’Agente dalle intestazioni, non solo dal titolo', () => {
    expect(
      eSezioneAgenteRiscossione('SEZIONE SENZA NOME', ['Gestione', 'Estremi cartella / Avviso'])
    ).toBe(true);
    expect(
      eSezioneAgenteRiscossione('CREDITI AFFIDATI PER IL RECUPERO', [
        'Gestione',
        'Residuo',
        'Sospeso',
      ])
    ).toBe(true);
    expect(
      eSezioneAgenteRiscossione('GESTIONE LAVORATORI DIPENDENTI PRIVATI', [
        'Natura omissione/Tipologia',
        'Contributi',
        'Sanzioni',
        'Totale debito',
      ])
    ).toBe(false);
  });

  it('senza riparto esplicito la riga resta contributo, senza inventare sanzioni', () => {
    const { righe } = estraiRigheVera(sezioni as never, {}, {}, true);
    const t = totaliVera(righe);
    expect(t.contributiInps).toBe(15_000);
    expect(t.sanzioni).toBe(0);
    expect(t.creditiAgente).toBe(0);
  });

  it('i crediti dell’Agente non finiscono nella base dei contributi', () => {
    const { righe } = estraiRigheVera(
      [
        {
          titolo: 'ADR',
          ambito: 'AGENTE_RISCOSSIONE',
          righe: [{ voce: 'Adr', stato: '', importo: 23_600.53 }],
        },
      ] as never,
      {},
      {},
      true
    );
    const t = totaliVera(righe);
    expect(t.creditiAgente).toBe(23_600.53);
    expect(t.contributiInps).toBe(0);
    expect(t.quantificato).toBe(23_600.53);
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
