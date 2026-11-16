import { describe, expect, it } from 'vitest';
import { componiPosizione, type DatiPosizione } from './composizione';
import type { Attenzione } from '@/lib/screening/indicatore';
import type { DebitoMemorizzato } from '@/lib/debitiEnte/memorizzazione';
import type { FotografiaVerificaAzienda } from '@/lib/verificaAzienda/fotografia';
import type { LetturaCongruenza } from '@/lib/flussiEnte/leggiCongruenza';
import type { LetturaQualitativa } from '@/lib/checklist/letturaQualitativa';

// La composizione della Posizione è provabile senza database e senza pagina:
// ogni regola (quadratura, prontezza, richieste, invecchiamento, pareggio) ha
// qui il suo caso.

const OGGI = new Date('2026-11-16T10:00:00.000Z');

const attenzione = (patch: Partial<Attenzione> = {}): Attenzione =>
  ({
    esito: 'ATTENZIONE_MINIMA',
    etichetta: 'Nessuna criticità dai dati disponibili',
    fattoreDeterminante: 'Nessuna criticità emersa',
    accertato: ['Esposizione verso l’ente di 152.000 €.'],
    daAccertare: [],
    dimensioniScoperte: [],
    copertura: { determinate: 4, totali: 4 },
    ...patch,
  }) as Attenzione;

const debito = (totale: number | null = 152_000): DebitoMemorizzato | null =>
  totale === null
    ? null
    : ({ totale, contabilizzato: totale, fonte: 'certificazione' } as unknown as DebitoMemorizzato);

const qualitativa = (patch: Partial<LetturaQualitativa> = {}): LetturaQualitativa => ({
  sintesi: null,
  colore: 'verde',
  dettaglio: 'Check list — orientamento sommario: tutte positive.',
  completa: true,
  percentualePesata: null,
  motivo: null,
  ...patch,
});

const fotografia = (patch: Partial<FotografiaVerificaAzienda> = {}): FotografiaVerificaAzienda =>
  ({
    anni: [
      { anno: 2026, tipo: 'CALCOLATO', dati: {}, indici: [], altriIndici: [], severity: 'ok' },
    ],
    annoVerifica: 2026,
    annoUltimoBilancio: 2024,
    credito: 152_000,
    rango: 'CHIROGRAFARIO',
    capacita: {
      credito: 152_000,
      disponibilita: 74_910,
      flusso: 44_910,
      coperturaPct: 49.28,
      scoperto: 77_090,
      anniCopertura: 2,
      esito: 'PARZIALE',
      dettaglio: 'La cassa non copre il credito.',
    },
    scenari: [
      {
        codice: 'ACCORDO',
        nome: 'Accordo',
        percentuale: null,
        recupero: null,
        perdita: null,
        calcolabile: true,
        motivo: null,
        dettaglio: '',
      },
      {
        codice: 'LIQUIDAZIONE',
        nome: 'Liquidazione',
        percentuale: 6.4,
        recupero: 7_782,
        perdita: 144_218,
        calcolabile: true,
        motivo: null,
        dettaglio: '',
      },
      {
        codice: 'CRAM_DOWN',
        nome: 'Cram down',
        percentuale: 20,
        recupero: 30_400,
        perdita: 121_600,
        calcolabile: true,
        motivo: null,
        dettaglio: '',
      },
    ],
    confronto: null,
    avvertenze: [],
    motivo: null,
    ...patch,
  }) as unknown as FotografiaVerificaAzienda;

const congruenza = (patch: Partial<LetturaCongruenza> = {}): LetturaCongruenza =>
  ({
    esiti: [
      {
        ente: 'INPS',
        flusso: 'Contributi',
        etichette: { denuncia: 'UNIEMENS', pagamento: 'F24' },
        dal: '2025-01',
        al: '2025-12',
        attesi: 12,
        sospesi: [],
        denunce: 12,
        deleghe: 12,
        senzaDenuncia: [],
        senzaDelega: [],
        fuoriPerimetro: { denunce: [], deleghe: [] },
        regolarizzati: [],
        scoperte: [],
        completo: true,
        notaRitardi: '',
      },
    ],
    dal: '2025-01',
    al: '2025-12',
    dataVerifica: '2026-11-16',
    periodiInArchivio: 12,
    ...patch,
  }) as unknown as LetturaCongruenza;

const contabile = (
  patch: Partial<{ completa: boolean; visuraIl: string | null; mancanti: string[] }> = {}
) => ({ completa: true, visuraIl: '2026-11-16', mancanti: [], ...patch });

const dati = (patch: Partial<DatiPosizione> = {}): DatiPosizione => ({
  ragioneSociale: 'Tessitura Lario Demo S.p.A.',
  eseguitaIl: '2026-11-16T09:00:00.000Z',
  attenzione: attenzione(),
  debito: debito(),
  debitoMemorizzatoIl: '2026-11-16T08:00:00.000Z',
  certificazioneTotale: 152_000,
  esposizioneContributiva: 80_000,
  qualitativa: qualitativa(),
  fotografia: fotografia(),
  congruenza: congruenza(),
  contabile: contabile(),
  ...patch,
});

describe('composizione della posizione', () => {
  it('tutto coerente e completo: pronta, credito quadrato, nessuna richiesta', () => {
    const p = componiPosizione(dati(), OGGI);
    expect(p.prontezza.grado).toBe('PRONTA');
    expect(p.quadratura.esito).toBe('COERENTE');
    expect(p.quadratura.voci).toHaveLength(3);
    expect(p.richieste).toHaveLength(0);
    expect(p.credito).toBe(152_000);
    expect(p.coperturaTesto).toBe('4/4');
    expect(p.validita.stato).toBe('recente');
    expect(p.piano.stato).toBe('RISPETTATO');
  });

  it('certificazione diversa dal debito accertato: blocco sulla quadratura', () => {
    const p = componiPosizione(dati({ certificazioneTotale: 154_500 }), OGGI);
    expect(p.quadratura.esito).toBe('DIVERGENTE');
    expect(p.quadratura.dettaglio).toContain('154.500 €');
    expect(p.prontezza.grado).toBe('BLOCCATA');
    expect(p.prontezza.blocchi.join(' ')).toContain('non quadrano');
    expect(p.prontezza.prossimoAtto?.testo).toContain('Allineare il credito');
  });

  it('check list incompleta: il quadro resta fuori e diventa una richiesta', () => {
    const p = componiPosizione(
      dati({
        qualitativa: qualitativa({
          sintesi: {
            mancanze: ['Check list dei prodotti: rispondere a «Il DURC risulta regolare?»'],
          } as never,
          colore: null,
          dettaglio: null,
          completa: false,
          motivo:
            'La check list dei prodotti non è completa (0/4 risposte): il quadro resta fuori.',
        }),
      }),
      OGGI
    );
    // Il quadro qualitativo si legge dentro il confronto: è lì che la pagina
    // lo rende, e non esiste una seconda copia da tenere allineata.
    const checkList = p.confronto.letture.find((l) => l.nome === 'Check list');
    expect(checkList?.esito).toBe('non valutabile');
    expect(checkList?.dettaglio).toContain('0/4');
    // La mancanza cita il DURC: il dizionario la riconduce al documento, e la
    // frase originale resta come «chiude».
    expect(p.richieste.map((r) => r.documento)).toContain('DURC aggiornato');
    expect(p.testoRichiesta).toContain('Tessitura Lario Demo S.p.A.');
    expect(p.testoRichiesta).toContain('non contiene valutazioni giuridiche');
  });

  it('senza fotografia la posizione è bloccata, col motivo, e i conti sono non calcolabili', () => {
    const p = componiPosizione(dati({ fotografia: null, congruenza: null }), OGGI);
    expect(p.prontezza.grado).toBe('BLOCCATA');
    expect(p.prontezza.blocchi.join(' ')).toContain('non si è potuta leggere');
    expect(p.breakEven.recuperoMinimo).toBeNull();
    expect(p.piano.stato).toBe('NON_DISPONIBILE');
    expect(p.confronto.letture.some((l) => l.nome === 'Fotografia dell’azienda')).toBe(false);
  });

  it('un debito riaccertato dopo la verifica rende la posizione «da ricalcolare»', () => {
    const p = componiPosizione(
      dati({
        debitoMemorizzatoIl: '2026-12-01T08:00:00.000Z',
        eseguitaIl: '2026-11-16T09:00:00.000Z',
      }),
      OGGI
    );
    expect(p.invecchiamento.esito).toBe('DA_RICALCOLARE');
    expect(p.invecchiamento.superati.map((s) => s.fonte)).toContain('debito');
  });

  it('i flussi con periodi scoperti aggiungono l’avvertenza al piano in essere', () => {
    const p = componiPosizione(
      dati({
        congruenza: congruenza({
          esiti: [
            {
              ...congruenza().esiti[0],
              senzaDelega: ['2025-03', '2025-04'],
              completo: false,
            },
          ],
        }),
      }),
      OGGI
    );
    expect(p.piano.stato).toBe('IN_RITARDO');
    expect(p.piano.avvertenza).toContain('non risulta rispettato');
    expect(p.richieste.map((r) => r.documento).join(' ')).toContain('Elenco Deleghe');
  });

  it('una verifica di sette mesi fa è da rivedere, e la prontezza lo dice', () => {
    const p = componiPosizione(dati({ eseguitaIl: '2026-04-16T09:00:00.000Z' }), OGGI);
    expect(p.validita.stato).toBe('da_rivedere');
    expect(p.prontezza.grado).toBe('QUASI');
    expect(p.prontezza.attenzioni.join(' ')).toContain('da rivedere');
  });

  it('senza debito accertato la quadratura resta non verificabile ma il credito resta quello della fotografia', () => {
    const p = componiPosizione(dati({ debito: null, certificazioneTotale: null }), OGGI);
    expect(p.quadratura.esito).toBe('NON_VERIFICABILE');
    expect(p.credito).toBe(152_000);
    // Non è un blocco: la dimensione del credito resta scoperta e viene
    // dichiarata fra le attenzioni, non silenziosamente ignorata.
    expect(p.prontezza.grado).toBe('QUASI');
    expect(p.prontezza.attenzioni.join(' ')).toContain('non è verificabile');
  });

  it('la copertura e il testo delle richieste sono composti qui, non nella pagina', () => {
    const p = componiPosizione(
      dati({
        attenzione: attenzione({
          copertura: { determinate: 3, totali: 4 },
          daAccertare: ['Serve l’Elenco Deleghe (F24), che porta la data di versamento.'],
        }),
      }),
      OGGI
    );
    expect(p.coperturaTesto).toBe('3/4');
    expect(p.richieste[0].documento).toBe('Elenco Deleghe (F24) con le date di versamento');
    expect(p.prontezza.attenzioni.join(' ')).toContain('3 dimensioni su 4');
  });
});
