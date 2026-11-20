import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { analizzaFileXbrl } from '@/lib/xbrl';
import { parseIstanzaXbrl } from '@/lib/xbrl/parser';
import {
  AZIENDA_CANTIERI,
  AZIENDA_IMPIANTI,
  AZIENDA_LOGISTICA,
  AZIENDA_MECCANICA,
  AZIENDA_TESSITURA,
  DOCUMENTI_DEMO,
  PACCHETTO_DOCUMENTI_DEMO,
  documentiDemoPerAzienda,
  documentiProvvedimentoDemo,
} from './documenti';
import { PERCORSO_DEMO, TRIAGE_DEMO } from './percorsoEnte';
import { noteIntegrativeDemoPer } from './noteXbrl';

// IL CHECK COMPLETO DELLA DEMO (0.232.0).
//
// La demo non è un riempitivo: è la prova che lo strumento funziona, e ogni
// sua azione si appoggia a un file. Se manca un documento, o un'istanza XBRL
// arriva senza note integrative, l'azione non fallisce in modo visibile —
// funziona «zoppa»: la lettura del bilancio non ha materiale, la simulazione mostra
// indicatori che non spiegano nulla, la verifica amministrativa parte senza
// certificazione. Qui si controlla, azienda per azienda, che cosa la demo
// mette in mano a chi la guarda.

const RADICE = join(process.cwd(), 'public');
const AZIENDE = [
  AZIENDA_MECCANICA,
  AZIENDA_TESSITURA,
  AZIENDA_LOGISTICA,
  AZIENDA_CANTIERI,
  AZIENDA_IMPIANTI,
];

describe('la demo è completa: ogni azione ha il suo file', () => {
  it('ogni documento dichiarato esiste davvero e non è vuoto', () => {
    for (const d of DOCUMENTI_DEMO) {
      const percorso = join(RADICE, d.percorso);
      expect(existsSync(percorso), `${d.azienda} — ${d.nome}`).toBe(true);
      expect(statSync(percorso).size, `${d.azienda} — ${d.nome}`).toBeGreaterThan(1024);
    }
    expect(existsSync(join(RADICE, PACCHETTO_DOCUMENTI_DEMO))).toBe(true);
  });

  it('ogni azienda ha fascicolo, bilancio, certificazione e check list', () => {
    for (const azienda of AZIENDE) {
      const ruoli = ['FASCICOLO', 'BILANCIO', 'CERTIFICAZIONE', 'CHECKLIST'] as const;
      for (const ruolo of ruoli) {
        const trovati = documentiDemoPerAzienda(azienda, null).filter((d) => d.ruolo === ruolo);
        expect(trovati.length, `${azienda} — ${ruolo}`).toBeGreaterThan(0);
      }
      // Il bilancio serve sia come istanza XBRL (motore) sia come prospetto
      // leggibile: con uno solo dei due la dimostrazione resta a metà.
      expect(documentiDemoPerAzienda(azienda, '.xbrl').length, azienda).toBe(1);
      expect(documentiDemoPerAzienda(azienda, '.xlsx').length, azienda).toBeGreaterThan(1);
    }
  });

  it('le istanze XBRL portano le note integrative, non solo i numeri di sintesi', async () => {
    for (const azienda of AZIENDE) {
      const istanza = documentiDemoPerAzienda(azienda, '.xbrl')[0];
      const xml = readFileSync(join(RADICE, istanza.percorso), 'utf8');
      const letto = parseIstanzaXbrl(xml);
      // Le note sono ciò che la verifica azienda legge per allineare il bilancio:
      // con una sola nota l'azione è zoppa.
      expect(letto.factTestuali.length, azienda).toBeGreaterThanOrEqual(6);
      const testo = letto.factTestuali.map((f) => f.testo).join(' ');
      expect(testo, azienda).toMatch(/continuità/i);
      expect(testo, azienda).toMatch(/debiti/i);
      expect(testo, azienda).toMatch(/crediti/i);
      expect(testo, azienda).toMatch(/immobilizzazioni/i);
      expect(testo, azienda).toMatch(/eventi di rilievo/i);
      // Il Piano-ponte non esiste più: una nota che lo citasse mostrerebbe a
      // chi guarda la demo un passaggio che nel prodotto non c'è. Il controllo
      // vale anche per `noteIntegrative.json`, perché il test del seed qui sotto
      // verifica che le due copie dicano la stessa cosa.
      expect(testo, azienda).not.toMatch(/piano[\s-]*ponte/i);

      // E i numeri che la simulazione legge devono esserci davvero: gli
      // ammortamenti a zero sono l'esempio di un dato che rende inutile il
      // confronto EBITDA/EBIT.
      const analisi = await analizzaFileXbrl(xml, istanza.nome);
      expect(analisi.meta.numeroNoteTestuali, azienda).toBeGreaterThanOrEqual(6);
      expect(analisi.corrente.ammortamenti, azienda).toBeGreaterThan(0);
      expect(analisi.corrente.immobilizzazioni, azienda).toBeGreaterThan(0);
      expect(analisi.corrente.patrimonioNetto, azienda).toBeGreaterThan(0);
      expect(analisi.corrente.totaleDebiti, azienda).toBeGreaterThan(0);
      expect(analisi.corrente.debitiBanche, azienda).toBeGreaterThan(0);
      expect(analisi.corrente.debitiPrevidenziali, azienda).toBeGreaterThan(0);
      expect(analisi.precedente.totaleAttivo, azienda).toBeGreaterThan(0);
    }
  });

  it('il seed ha le note da salvare, lette dal file e non inventate', () => {
    // La verifica azienda legge `note_fatti` dal database: se il seed non le
    // scrive, la demo mostra un'azione che non ha materiale. Le note arrivano
    // dallo stesso file che la demo consegna, con la sua impronta.
    for (const azienda of AZIENDE) {
      const note = noteIntegrativeDemoPer(azienda, 2025);
      expect(note.fatti.length, azienda).toBeGreaterThanOrEqual(6);
      expect(note.impronta, azienda).toMatch(/^[a-f0-9]{64}$/);
      expect(note.nomeFile, azienda).toMatch(/\.xbrl$/);
      expect(note.improntaDalleNote, azienda).toBe(false);

      // Le note salvate sono quelle che stanno davvero nel file: se il
      // generatore cambia e il JSON no, questo controllo cade.
      const xml = readFileSync(
        join(RADICE, documentiDemoPerAzienda(azienda, '.xbrl')[0].percorso),
        'utf8'
      );
      const nelFile = parseIstanzaXbrl(xml).factTestuali.map((f) => f.testo);
      expect(
        note.fatti.map((f) => f.testo),
        azienda
      ).toEqual(nelFile);
    }
  });

  it('ogni natura che ne ha bisogno trova il suo provvedimento', () => {
    for (const a of PERCORSO_DEMO) {
      const tipi = [
        a.tipoIstruttoria,
        ...(a.scenariAggiuntivi ?? []).map((s) => s.tipoIstruttoria),
      ];
      for (const tipo of tipi) {
        if (tipo !== 'DECRETO_LIQUIDAZIONE' && tipo !== 'CRAM_DOWN') continue;
        expect(
          documentiProvvedimentoDemo(a.codiceFiscale, tipo).length,
          `${a.ragioneSociale} — ${tipo}`
        ).toBeGreaterThan(0);
      }
      // L'accordo si appoggia alla proposta depositata.
      if (a.tipoIstruttoria === 'PROPOSTA') {
        expect(
          documentiProvvedimentoDemo(a.codiceFiscale, 'PROPOSTA').length,
          a.ragioneSociale
        ).toBeGreaterThan(0);
      }
    }
  });

  it('l’accordo della demo ha le sue righe, e una sola riguarda l’ente', () => {
    const conProposta = PERCORSO_DEMO.filter((a) => (a.propostaCreditori ?? []).length > 0);
    expect(conProposta.length).toBeGreaterThan(0);
    for (const a of conProposta) {
      const righe = a.propostaCreditori!;
      const perEnte = righe.filter((r) => r.rilevanteEnte);
      // Una e una sola: un ente guarda la propria posizione.
      expect(perEnte, a.ragioneSociale).toHaveLength(1);
      // Il dovuto dell'ente è quello delle posizioni demo: niente numeri
      // scollegati dal resto del set.
      const totale = a.debiti.reduce((t, d) => t + d.importo, 0);
      expect(perEnte[0].dovuto, a.ragioneSociale).toBe(totale);
      expect(perEnte[0].offerta, a.ragioneSociale).toBeGreaterThan(0);
      expect(perEnte[0].offerta, a.ragioneSociale).toBeLessThanOrEqual(100);
      expect(righe.length, a.ragioneSociale).toBeGreaterThan(1);
      // L'accordo deve avere anche un termine di confronto: il secondo atto.
      expect((a.scenariAggiuntivi ?? []).length, a.ragioneSociale).toBeGreaterThan(0);
    }
  });

  it('ogni azienda con due atti ha l’accordo e le sue righe', () => {
    const conDueAtti = PERCORSO_DEMO.filter((a) => (a.scenariAggiuntivi ?? []).length > 0).map(
      (a) => a.ragioneSociale
    );
    expect(conDueAtti).toEqual([
      'Meccanica Valsesia Demo S.r.l.',
      'Tessitura Lario Demo S.p.A.',
      'Logistica Padana Demo S.r.l.',
    ]);
    for (const a of PERCORSO_DEMO.filter((x) => (x.scenariAggiuntivi ?? []).length > 0)) {
      const tipi = [a.tipoIstruttoria, ...a.scenariAggiuntivi!.map((s) => s.tipoIstruttoria)];
      // L'accordo c'è, e accanto c'è un atto di natura diversa: senza il
      // secondo termine il confronto non direbbe niente.
      expect(tipi, a.ragioneSociale).toContain('PROPOSTA');
      expect(
        tipi.filter((t) => t !== 'PROPOSTA' && t !== 'DA_CHIEDERE').length,
        a.ragioneSociale
      ).toBeGreaterThan(0);
      expect((a.propostaCreditori ?? []).length, a.ragioneSociale).toBeGreaterThan(1);
    }
  });

  it('il set demo copre le nature e le verifiche che il prodotto distingue', () => {
    const nature = new Set(PERCORSO_DEMO.map((a) => a.tipoIstruttoria));
    expect(nature).toEqual(
      new Set(['PROPOSTA', 'DECRETO_LIQUIDAZIONE', 'CRAM_DOWN', 'DA_CHIEDERE'])
    );
    // Almeno un'azienda senza le verifiche facoltative: serve a mostrare le
    // sezioni dichiarate mancanti.
    expect(PERCORSO_DEMO.filter((a) => a.verifiche?.aziendale === false).length).toBe(1);
    // La quinta resta al triage, con i suoi documenti di posizione.
    expect(documentiDemoPerAzienda(TRIAGE_DEMO.ragioneSociale, '.xlsx').length).toBeGreaterThan(0);
  });
});
