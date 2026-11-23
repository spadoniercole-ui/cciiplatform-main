import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { analizzaFileXbrl } from '@/lib/xbrl';
import { parseIstanzaXbrl } from '@/lib/xbrl/parser';
import {
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

// IL CHECK COMPLETO DELLA DEMO (0.256.0).
//
// La demo non è un riempitivo: è la prova che lo strumento funziona, e ogni
// sua azione si appoggia a un file. Con tre aziende e tre tappe, «completo»
// vuol dire che ogni tappa consegna i file che le servono — non che tutte le
// aziende hanno tutto. Chi si ferma alla contabile non ha un atto, chi si ferma
// all'amministrativa non ha un bilancio: qui si controlla che il set dica
// esattamente questo e che i file esistano davvero.

const RADICE = join(process.cwd(), 'public');
const AZIENDE = [AZIENDA_MECCANICA, AZIENDA_TESSITURA, AZIENDA_LOGISTICA];
const AZIENDE_CON_BILANCIO = [AZIENDA_MECCANICA, AZIENDA_TESSITURA];

describe('la demo è completa: ogni tappa ha il suo file', () => {
  it('ogni documento dichiarato esiste davvero e non è vuoto', () => {
    for (const d of DOCUMENTI_DEMO) {
      const percorso = join(RADICE, d.percorso);
      expect(existsSync(percorso), `${d.azienda} — ${d.nome}`).toBe(true);
      expect(statSync(percorso).size, `${d.azienda} — ${d.nome}`).toBeGreaterThan(1024);
    }
    expect(existsSync(join(RADICE, PACCHETTO_DOCUMENTI_DEMO))).toBe(true);
  });

  it('il set ha tre aziende: due con bilancio e una ferma all’amministrativa', () => {
    expect(new Set(DOCUMENTI_DEMO.map((d) => d.azienda))).toEqual(new Set(AZIENDE));
    for (const azienda of AZIENDE_CON_BILANCIO) {
      // Fascicolo, bilancio, certificazione e check list: la contabile ha
      // tutto quello che le serve per leggere la posizione.
      const ruoli = ['FASCICOLO', 'BILANCIO', 'CERTIFICAZIONE', 'CHECKLIST'] as const;
      for (const ruolo of ruoli) {
        const trovati = documentiDemoPerAzienda(azienda, null).filter((d) => d.ruolo === ruolo);
        expect(trovati.length, `${azienda} — ${ruolo}`).toBeGreaterThan(0);
      }
      expect(documentiDemoPerAzienda(azienda, '.xbrl').length, azienda).toBe(1);
      expect(documentiDemoPerAzienda(azienda, '.xlsx').length, azienda).toBeGreaterThan(1);
    }

    // Logistica non ha bilancio né atto: la tappa è la verifica
    // amministrativa, e i suoi documenti sono quelli della posizione.
    const logistica = documentiDemoPerAzienda(AZIENDA_LOGISTICA, null);
    expect(logistica.map((d) => d.ruolo).sort()).toEqual([
      'CERTIFICAZIONE',
      'CHECKLIST',
      'DELEGHE',
      'DENUNCE',
      'FASCICOLO',
    ]);
  });

  it('le istanze XBRL portano le note integrative, non solo i numeri di sintesi', async () => {
    for (const azienda of AZIENDE_CON_BILANCIO) {
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
      // chi guarda la demo un passaggio che nel prodotto non c'è.
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
    // scrive, la demo mostra un'azione che non ha materiale.
    for (const azienda of AZIENDE_CON_BILANCIO) {
      const note = noteIntegrativeDemoPer(azienda, 2025);
      expect(note.fatti.length, azienda).toBeGreaterThanOrEqual(6);
      expect(note.impronta, azienda).toMatch(/^[a-f0-9]{64}$/);
      expect(note.nomeFile, azienda).toMatch(/\.xbrl$/);
      expect(note.improntaDalleNote, azienda).toBe(false);

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

  it('un solo atto ha un provvedimento: la Meccanica, che arriva allo scenario', () => {
    const meccanica = PERCORSO_DEMO[0];
    expect(meccanica.ragioneSociale).toBe(AZIENDA_MECCANICA);
    expect(documentiProvvedimentoDemo(meccanica.codiceFiscale, 'PROPOSTA')).toHaveLength(1);
    expect(documentiProvvedimentoDemo(meccanica.codiceFiscale, 'CRAM_DOWN')).toHaveLength(1);

    // Tessitura e Logistica si fermano prima: nessun atto da mostrare.
    for (const a of PERCORSO_DEMO.slice(1)) {
      expect(documentiProvvedimentoDemo(a.codiceFiscale), a.ragioneSociale).toEqual([]);
    }
    expect(documentiProvvedimentoDemo(TRIAGE_DEMO.codiceFiscale)).toEqual([]);
  });

  it('l’accordo della demo ha le sue righe, e una sola riguarda l’ente', () => {
    const conProposta = PERCORSO_DEMO.filter((a) => (a.propostaCreditori ?? []).length > 0);
    expect(conProposta).toHaveLength(1);
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

  it('il set demo dichiara le tappe e non finge i passi che mancano', () => {
    // Una completa: accordo e cram down sulla stessa azienda.
    const completa = PERCORSO_DEMO.filter((a) => a.profondita === 'COMPLETA');
    expect(completa.map((a) => a.ragioneSociale)).toEqual([AZIENDA_MECCANICA]);
    expect(completa[0].scenariAggiuntivi?.[0].tipoIstruttoria).toBe('CRAM_DOWN');

    // Una contabile: le verifiche della contabile sì, la fotografia no.
    const contabile = PERCORSO_DEMO.filter((a) => a.profondita === 'CONTABILE');
    expect(contabile.map((a) => a.ragioneSociale)).toEqual([AZIENDA_TESSITURA]);
    expect(contabile[0].verifiche?.corredoContabile).toBeTruthy();
    expect(contabile[0].verifiche?.baseAziendale).toBe(false);
    expect(contabile[0].scenariAggiuntivi ?? []).toHaveLength(0);

    // La terza resta alla verifica amministrativa, con i suoi documenti di
    // posizione.
    expect(TRIAGE_DEMO.ragioneSociale).toBe(AZIENDA_LOGISTICA);
    expect(documentiDemoPerAzienda(TRIAGE_DEMO.ragioneSociale, '.xlsx').length).toBeGreaterThan(0);
  });
});
