import { describe, expect, it } from 'vitest';
import { chiaveMateria, instradaPerMateria, type RigaInstradabile } from './instradamentoMateria';
import type { LavorazioneConfig } from './comunicazioni';
import type { LavorazioneMateria } from '@/lib/titoliEnte/lavorazioniMateria';

const TITOLI = [
  { codice: '27', materiaId: 1 },
  { codice: '18', materiaId: 2 },
];

const MATERIE = [
  { id: 1, nome: 'Flussi Uniemens', codiciIndicativi: '27', stato: 'CONFERMATA' as const },
  { id: 2, nome: 'Verbali di accertamento', codiciIndicativi: '18', stato: 'CONFERMATA' as const },
];

const LAVORAZIONI: LavorazioneMateria[] = [
  {
    id: 1,
    materiaId: 1,
    tipologia: 'Emissione diffida',
    dipendenza: 'Ufficio Recupero Crediti',
    procedura: '1. Verifica\n2. Diffida',
    esito: 'Diffida',
    ordine: 1,
  },
  {
    id: 2,
    materiaId: 1,
    tipologia: 'Verifica del flusso',
    dipendenza: 'Ufficio Recupero Crediti',
    procedura: null,
    esito: null,
    ordine: 2,
  },
];

function riga(over: Partial<RigaInstradabile> = {}): RigaInstradabile {
  return {
    sezione: 'Gestione lavoratori dipendenti privati',
    voce: 'TS 27 - flusso Uniemens non versato',
    categoria: '',
    importo: 1200,
    stato: 'Non versato',
    periodo: '202506 - 202506',
    trattamento: 'da_contabilizzare',
    ...over,
  };
}

describe('instradamento delle posizioni V.E.R.A. per materia', () => {
  it('manda la posizione all’ufficio della materia, con le sue lavorazioni', () => {
    const esito = instradaPerMateria([riga()], {
      titoli: TITOLI,
      materie: MATERIE,
      lavorazioni: LAVORAZIONI,
    });

    expect(esito.righe[0].categoria).toBe(chiaveMateria(1));
    expect(esito.etichette[chiaveMateria(1)]).toBe('Flussi Uniemens');
    expect(esito.lavorazioni).toEqual([
      {
        categoria: chiaveMateria(1),
        lavorazione: 'Emissione diffida',
        destinatario: 'Ufficio Recupero Crediti',
        attivo: true,
      },
      {
        categoria: chiaveMateria(1),
        lavorazione: 'Verifica del flusso',
        destinatario: 'Ufficio Recupero Crediti',
        attivo: true,
      },
    ]);
    expect(esito.perMateria).toEqual([
      { materiaId: 1, nome: 'Flussi Uniemens', righe: 1, totale: 1200 },
    ]);
    expect(esito.senzaDestinazione).toEqual({ righe: 0, totale: 0 });
  });

  it('la materia già risolta sulla riga vince sul codice e sulla vecchia categoria', () => {
    const esito = instradaPerMateria(
      [riga({ categoria: 'CONTRIBUTI', materia: { id: 2, nome: 'Verbali di accertamento' } })],
      { titoli: TITOLI, materie: MATERIE, lavorazioni: LAVORAZIONI }
    );

    // La materia 2 non ha lavorazioni: non può instradare, quindi resta la
    // categoria vecchia. Nessun ufficio inventato.
    expect(esito.righe[0].categoria).toBe('CONTRIBUTI');
    expect(esito.senzaDestinazione).toEqual({ righe: 0, totale: 0 });
  });

  it('la materia scelta sulla sezione è un ripiego, non un ordine', () => {
    const lavorazioni: LavorazioneMateria[] = [
      ...LAVORAZIONI,
      {
        id: 3,
        materiaId: 2,
        tipologia: 'Emissione del verbale',
        dipendenza: 'Ufficio Verbali',
        procedura: null,
        esito: null,
        ordine: 1,
      },
    ];

    // La sezione contributiva è mappata sui flussi, ma la voce nomina un
    // verbale: va ai verbali (e al loro ufficio).
    const conVoce = instradaPerMateria(
      [riga({ sezione: 'FLUSSI UNIEMENS', voce: 'Verbale Evasione', categoria: chiaveMateria(1) })],
      { titoli: TITOLI, materie: MATERIE, lavorazioni }
    );
    expect(conVoce.righe[0].categoria).toBe(chiaveMateria(2));
    expect(conVoce.perMateria).toEqual([
      { materiaId: 2, nome: 'Verbali di accertamento', righe: 1, totale: 1200 },
    ]);
    expect(conVoce.lavorazioni.some((l) => l.destinatario === 'Ufficio Verbali')).toBe(true);

    // Dove il file non identifica niente, la scelta sulla sezione vale.
    const senzaVoce = instradaPerMateria(
      [riga({ sezione: 'SEZIONE NUOVA', voce: 'Voce misteriosa', categoria: chiaveMateria(2) })],
      { titoli: TITOLI, materie: MATERIE, lavorazioni }
    );
    expect(senzaVoce.righe[0].categoria).toBe(chiaveMateria(2));
  });

  it('senza materia resta la categoria vecchia, con le sue lavorazioni', () => {
    const vecchie: LavorazioneConfig[] = [
      {
        categoria: 'CONTRIBUTI',
        lavorazione: 'Recupero contributi',
        destinatario: 'Sportello Entrate',
        attivo: true,
      },
    ];
    const esito = instradaPerMateria(
      [riga({ voce: 'Voce senza codice', categoria: 'CONTRIBUTI' })],
      {
        titoli: [],
        materie: MATERIE,
        lavorazioni: LAVORAZIONI,
        lavorazioniCategoria: vecchie,
        etichetteCategoria: { CONTRIBUTI: 'Contributi INPS' },
      }
    );

    expect(esito.righe[0].categoria).toBe('CONTRIBUTI');
    // Le lavorazioni vecchie restano disponibili: la riga ci si aggancia.
    expect(esito.lavorazioni[0]).toEqual(vecchie[0]);
    expect(esito.etichette.CONTRIBUTI).toBe('Contributi INPS');
    expect(esito.perMateria).toEqual([]);
  });

  it('una materia senza ufficio non instrada: la posizione resta dov’era', () => {
    const esito = instradaPerMateria([riga({ categoria: 'CONTRIBUTI' })], {
      titoli: TITOLI,
      materie: MATERIE,
      // La lavorazione della materia non dice chi la compie.
      lavorazioni: [{ ...LAVORAZIONI[0], dipendenza: '   ' }],
    });

    expect(esito.righe[0].categoria).toBe('CONTRIBUTI');
    expect(esito.lavorazioni).toEqual([]);
  });

  it('una posizione senza materia e senza categoria si conta, non si attribuisce', () => {
    const esito = instradaPerMateria([riga({ voce: 'Voce misteriosa', importo: 300 })], {
      titoli: TITOLI,
      materie: MATERIE,
      lavorazioni: LAVORAZIONI,
    });

    expect(esito.righe[0].categoria).toBe('');
    expect(esito.senzaDestinazione).toEqual({ righe: 1, totale: 300 });
  });
});
