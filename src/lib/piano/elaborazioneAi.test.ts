import { describe, it, expect } from 'vitest';
import {
  leggiLancio,
  leggiLeve,
  promptElaborazione,
  validaRisposta,
  motivazionePulita,
  testoContesto,
} from './elaborazioneAi';
import type { EsercizioStorico } from './piano';

const S: EsercizioStorico = {
  anno: 2025,
  ricaviVendite: 1_000_000,
  valoreProduzione: 1_050_000,
  costiProduzione: 950_000,
  ammortamenti: 50_000,
  oneriFinanziari: 20_000,
  utileEsercizio: 60_000,
  immobilizzazioni: 400_000,
  creditiClienti: 250_000,
  disponibilitaLiquide: 30_000,
  attivoCircolante: 400_000,
  totaleAttivo: 800_000,
  patrimonioNetto: 100_000,
  debitiBanche: 300_000,
  debitiFornitori: 200_000,
  debitiTributari: 50_000,
  debitiPrevidenziali: 80_000,
  totaleDebiti: 700_000,
};
const BASE = {
  orizzonte: 3,
  storico: [S],
  crescita: { tasso: 2, descrizione: 'Crescita del settore 2%.' },
  rate: { ente: [10_000, 10_000, 10_000], altri: [0, 0, 0] },
};

describe('elaborazione con l’AI: prompt', () => {
  it('Ricevente: piano dell’azienda e scostamenti nel contesto; Redigente: ipotesi dell’operatore', () => {
    const r = promptElaborazione({
      ...BASE,
      lato: 'RICEVUTA',
      pianoAzienda: { ricaviVendite: { '2026': 1_300_000 } },
      scostamenti: [{ voce: 'Ricavi delle vendite', luce: 'rosso', ottimismoMassimo: 27.5 }],
    });
    expect(r).toMatch(/RICEVUTO/);
    expect(r).toMatch(/ricaviVendite: 1300000 \/ — \/ —/);
    expect(r).toMatch(/fino a \+27.5%/);
    const d = promptElaborazione({
      ...BASE,
      lato: 'DA_DEFINIRE',
      ipotesiCorrenti: { ricaviVendite: [{ tipo: 'pct', valore: 5 }] },
    });
    expect(d).toMatch(/REDIGE/);
    expect(d).toMatch(/ricaviVendite: 5%/);
    expect(d).not.toMatch(/PIANO DELL'AZIENDA/);
  });
  it('contesto compatto: anni del piano dall’ultimo bilancio', () => {
    expect(testoContesto({ ...BASE, lato: 'DA_DEFINIRE' })).toMatch(
      /ANNI DEL PIANO: 2026, 2027, 2028/
    );
  });
});

describe('elaborazione con l’AI: validazione della risposta', () => {
  it('tiene solo righe, tipi e intervalli ammessi, con le motivazioni', () => {
    const e = validaRisposta(
      {
        ipotesi: {
          ricaviVendite: [
            { tipo: 'pct', valore: 3, motivazione: 'In linea con il settore (2%).' },
            null,
            { tipo: 'pct', valore: 80 },
          ],
          investimenti: [{ tipo: 'pct', valore: 40000, motivazione: 'Mantenimento.' }],
          aliquotaImposte: [{ tipo: 'abs', valore: 99 }],
          ebitda: [{ tipo: 'abs', valore: 1 }],
        },
        sintesi: 'Piano prudente.',
      },
      3
    );
    expect(e.ipotesi.ricaviVendite).toEqual([
      { tipo: 'pct', valore: 3, motivazione: 'In linea con il settore (2%).' },
      { tipo: 'pct', valore: 3, motivazione: 'Non indicato dall’AI: come l’anno prima.' },
      { tipo: 'pct', valore: 3, motivazione: 'Non indicato dall’AI: come l’anno prima.' },
    ]);
    expect(e.ipotesi.investimenti?.[0]).toEqual({
      tipo: 'abs',
      valore: 40000,
      motivazione: 'Mantenimento.',
    });
    // Nessuna cella vuota: i valori assoluti proseguono, le righe non toccate sono «invariate».
    expect(e.ipotesi.investimenti?.[2]).toMatchObject({ tipo: 'abs', valore: 40000 });
    expect(e.ipotesi.oneriFinanziari).toEqual([
      { tipo: 'pct', valore: 0 },
      { tipo: 'pct', valore: 0 },
      { tipo: 'pct', valore: 0 },
    ]);
    expect(e.ipotesi.apportiSoci?.every((x) => x?.tipo === 'abs' && x.valore === 0)).toBe(true);
    expect(e.ipotesi.aliquotaImposte).toBeUndefined();
    expect(e.scartati.join(' ')).toMatch(/ebitda/);
    expect(e.scartati.length).toBe(3);
    expect(e.sintesi).toBe('Piano prudente.');
  });
  it('risposta vuota o malformata: nessuna ipotesi, nessuna eccezione', () => {
    expect(validaRisposta(null, 3)).toEqual({ ipotesi: {}, sintesi: '', scartati: [] });
  });
  it('motivazioni ripulite dai termini non ammessi', () => {
    expect(motivazionePulita('La proposta è non ricevibile.')).toBe(
      'La proposta è non coerente con i parametri configurati.'
    );
  });
  it('il piano deve crescere: fatturato, incidenza dei costi, tecnologia, ambiente, rate', () => {
    for (const lato of ['RICEVUTA', 'DA_DEFINIRE'] as const) {
      const p = promptElaborazione({ ...BASE, lato });
      // Un piano che ripete il fatturato per tutti gli anni non è prudente: è
      // un'azienda ferma, e le rate non le paga.
      expect(p).toContain('IL PIANO È IL CAMBIAMENTO, NON LA RIPETIZIONE');
      // L'ordine della simulazione: base contabile, settore, obiettivo, leve,
      // percorso anno per anno, sacrifici, rate.
      expect(p).toContain('BASE CONTABILE');
      expect(p).toContain('IL SETTORE E I MERCATI');
      expect(p).toContain("L'OBIETTIVO");
      expect(p).toContain('IL PERCORSO ANNO PER ANNO');
      expect(p).toContain('I SACRIFICI');
      expect(p).toContain('CHIUDERE SULLE RATE');
      // L'ambiente non sta nei bilanci: si cerca, e ogni ipotesi che ne
      // dipende cita la fonte.
      expect(p).toMatch(/ricerca web/);
      // Ricavi e costi hanno una serie per anno, non un valore ripetuto.
      expect(p).toContain('SCRIVI UNA SERIE');
      // Le leve sono le variabili del piano, non un contorno: le sceglie l'analisi.
      expect(p).toContain('LE CINQUE LEVE LE SCEGLI TU');
      expect(p).not.toContain("LE LEVE LE HA GIÀ SCELTE L'OPERATORE");
    }
  });

  it('le leve toccate dall’operatore non sono più terra dell’analisi', () => {
    const p = promptElaborazione({
      ...BASE,
      lato: 'DA_DEFINIRE',
      leveModificate: true,
      leve: 'PERSONALE 10%',
    });
    expect(p).toContain("LE LEVE LE HA GIÀ SCELTE L'OPERATORE");
    expect(p).not.toContain('LE CINQUE LEVE LE SCEGLI TU');
    // La richiesta delle leve sparisce anche dall'elenco delle scelte, dal
    // contesto e dal modello di risposta: il server conserverà quelle del
    // pannello.
    expect(p).toContain('non fanno parte della risposta');
    expect(p).not.toContain('LEVE CHIESTE AL LANCIO');
    expect(p).not.toContain('attiva true/false, misura');
    expect(p).not.toContain('"leve": {"PERSONALE"');
    expect(p).not.toContain('Non accendere leve');
    expect(p).not.toContain('le leve che scegli');
  });

  it('il prompt chiede anche le scelte che reggono il piano', () => {
    const p = promptElaborazione({
      lato: 'DA_DEFINIRE',
      orizzonte: 3,
      storico: [S],
      crescita: { tasso: 2, descrizione: 'settore in crescita' },
      rate: { ente: [1, 1, 1], altri: [0, 0, 0] },
    });
    expect(p).toContain('LE SCELTE CHE REGGONO IL PIANO');
    expect(p).toMatch(/anniRientro/);
    expect(p).toContain('procedura (ACCORDO, LIQUIDAZIONE o CRAM_DOWN)');
    expect(p).toContain('prudenza (PRUDENTE, NEUTRA o FAVOREVOLE)');
    expect(p).toContain('"procedura": "ACCORDO"');
    expect(p).toContain('"prudenza": "PRUDENTE"');
    expect(p).toContain('attiva true/false, misura');
    expect(p).toContain('"leve": {"PERSONALE"');
  });

  it('non chiede procedura e impostazione già fissate dal server', () => {
    const p = promptElaborazione({
      ...BASE,
      lato: 'DA_DEFINIRE',
      procedura: 'CRAM_DOWN',
      impostazione: 'NEUTRA',
    });
    // Il server le sostituisce con quelle dello scenario e dell’operatore:
    // chiederle all’AI sarebbe una richiesta che finisce nel cestino.
    expect(p).toContain('La procedura è già fissata dallo scenario: non restituirla');
    expect(p).toContain("L'impostazione è già scelta dall'operatore: non restituirla");
    expect(p).not.toContain('procedura (ACCORDO, LIQUIDAZIONE o CRAM_DOWN)');
    expect(p).not.toContain('prudenza (PRUDENTE, NEUTRA o FAVOREVOLE)');
    expect(p).not.toContain('"procedura": "ACCORDO"');
    expect(p).not.toContain('"prudenza": "PRUDENTE"');
    expect(p).toContain('"lancio": {"percentualeOfferta": 40, "anniRientro": 5}');
  });

  it('dice di chi è il debito: ente e Agente della Riscossione', () => {
    const p = promptElaborazione({
      ...BASE,
      lato: 'DA_DEFINIRE',
      ripartoDebito: { ente: 150_000, adr: 44_712 },
    });
    expect(p).toContain('DI CHI È IL DEBITO');
    expect(p).toContain('all’ente 150000');
    expect(p).toContain('Riscossione (AdR');
    expect(p).toContain('44712');
    // Senza una quota a ruolo il piano ha un creditore solo: la riga non si
    // scrive, invece di dire «all’AdR 0 euro».
    const senzaAdr = promptElaborazione({
      ...BASE,
      lato: 'DA_DEFINIRE',
      ripartoDebito: { ente: 150_000, adr: 0 },
    });
    expect(senzaAdr).not.toContain('DI CHI È IL DEBITO');
  });

  it('non chiede gli anni e l’offerta già scritti nel lancio', () => {
    const p = promptElaborazione({
      ...BASE,
      lato: 'DA_DEFINIRE',
      anniFissi: 0,
      offertaFissa: 40,
    });
    // Sono decisioni dell’operatore: il server le impone, chiederle sarebbe
    // una richiesta che finisce nel cestino — e gli anni 0 non sono «meno di
    // un anno», sono l’unica soluzione.
    expect(p).toContain('già decisa dall’operatore');
    expect(p).toContain('in un’unica soluzione');
    expect(p).toContain('Gli anni di restituzione sono già fissati');
    expect(p).toContain("L'offerta è già fissata dall'operatore");
    expect(p).not.toMatch(/anniRientro \(0-10/);
    expect(p).not.toMatch(/percentualeOfferta \(0-100/);
    expect(p).not.toContain('"anniRientro": 5');
    expect(p).not.toContain('"percentualeOfferta": 40');
  });
});

describe('le scelte proposte dall’AI', () => {
  it('leve: solo quando il modello le scrive, e dentro 0-100', () => {
    const leve = leggiLeve({ leve: { PERSONALE: { attiva: true, misura: 250 } } });
    expect(leve?.PERSONALE).toEqual({ attiva: true, misura: 100 });
    expect(leve?.TECNOLOGIA.attiva).toBe(false);
    expect(leggiLeve({ ipotesi: {} })).toBeUndefined();
  });

  it('lancio: procedura, offerta, anni e impostazione ammessi soltanto', () => {
    expect(
      leggiLancio({
        lancio: {
          procedura: 'LIQUIDAZIONE',
          percentualeOfferta: 30,
          anniRientro: 4,
          prudenza: 'PRUDENTE',
        },
      })
    ).toEqual({
      procedura: 'LIQUIDAZIONE',
      percentualeOfferta: 30,
      anniRientro: 4,
      prudenza: 'PRUDENTE',
    });
    expect(leggiLancio({ sintesi: 'niente scelte' })).toBeUndefined();
  });
});
