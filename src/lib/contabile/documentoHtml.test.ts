import { describe, it, expect } from 'vitest';
import { htmlSezioniContabili, type BilancioDocumento } from './documentoHtml';
import { componiProiezione } from './proiezione';
import type { DatiFinanziariPeriodo, IndiceCcii } from '@/lib/xbrl/types';

const dati = (anno: number): DatiFinanziariPeriodo => ({
  ricaviVendite: 1_000_000 + anno * 10_000,
  valoreProduzione: 1_100_000 + anno * 10_000,
  costiProduzione: 1_000_000 + anno * 12_000,
  ebit: 100_000 - anno * 2_000,
  ammortamenti: 10_000,
  ebitda: 110_000 - anno * 2_000,
  oneriFinanziari: 5_000,
  utileEsercizio: -20_000,
  totaleAttivo: 1_500_000,
  attivoCircolante: 900_000,
  disponibilitaLiquide: 30_000,
  immobilizzazioni: 600_000,
  patrimonioNetto: -50_000,
  totaleDebiti: 1_400_000,
  debitiBanche: 500_000,
  debitiFornitori: 400_000,
  debitiTributari: 200_000,
  debitiPrevidenziali: 100_000,
  passivoCorrente: 800_000,
  creditiClienti: 300_000,
});

const indice = (
  codice: string,
  esito: IndiceCcii['esito'],
  valore: number | 'N/D'
): IndiceCcii => ({
  codice,
  nome: `${codice} — indice di prova`,
  valore,
  soglia: '< 0.80',
  esito,
});

const bilanci: BilancioDocumento[] = [
  {
    annoBilancio: 2023,
    datiFinanziari: dati(0),
    indici: [indice('C1', 'OK', 0.6)],
    altriIndici: [indice('ROE', 'OK', 0.1)],
  },
  {
    annoBilancio: 2024,
    datiFinanziari: dati(1),
    indici: [indice('C1', 'VIOLATO', 4.52)],
    altriIndici: [indice('ROE', 'NON_CALCOLABILE', 'N/D')],
  },
];

describe('tabelle contabili nel documento della verifica', () => {
  it('porta prospetto, indici e proiezione, ciascuno con la sua nota', () => {
    const proiezione = componiProiezione({
      bilanci: [
        { anno: 2022, dati: dati(0) },
        { anno: 2023, dati: dati(1) },
        { anno: 2024, dati: dati(2) },
      ],
      annoVerifica: 2026,
    });
    const sezioni = htmlSezioniContabili({
      storico: bilanci,
      proiezione,
      indiciAbilitati: ['C1', 'ROE', 'DSCR'],
    });

    expect(sezioni.map((s) => s.titolo)).toEqual([
      'Prospetto contabile depositato',
      'Indici diagnostici per annualità',
      'Differenziali e proiezione fino all’anno della verifica',
    ]);

    // 1. Prospetto: colonne depositate e voci forti.
    const prospetto = sezioni[0].corpo;
    expect(prospetto).toContain('2023');
    expect(prospetto).toContain('2024');
    expect(prospetto).toContain('Posizione finanziaria netta');
    expect(prospetto).toContain('470.000 €');
    expect(prospetto).toContain('senza riclassifiche');

    // 2. Indici: soglia, esito oltre soglia, n/d dichiarato col motivo.
    const indici = sezioni[1].corpo;
    expect(indici).toContain('C1');
    expect(indici).toContain('4,52 (oltre soglia)');
    expect(indici).toContain('n/d');
    expect(indici).toContain('DSCR');
    expect(indici).toContain('non è calcolabile');
    expect(indici).toContain('non parametri normativi');

    // 3. Proiezione: anni calcolati, metodo e limiti.
    const proiezioneHtml = sezioni[2].corpo;
    expect(proiezioneHtml).toContain('calcolato');
    expect(proiezioneHtml).toContain('storico');
    expect(proiezioneHtml).toContain('«Calcolato» non è «previsto»');
    expect(proiezioneHtml).toContain('Limiti della proiezione');
    expect(proiezioneHtml).toContain('ipotesi dichiarata');
    expect(proiezioneHtml).not.toContain('<script');
  });

  it('senza bilanci le sezioni lo dichiarano invece di restare mute', () => {
    const sezioni = htmlSezioniContabili({
      storico: [],
      proiezione: null,
      indiciAbilitati: [],
    });
    expect(sezioni).toHaveLength(3);
    for (const s of sezioni) expect(s.corpo).toContain('Nessun bilancio');
  });
});
