import { describe, it, expect } from 'vitest';
import { CATALOGO_REVISORE } from './catalogo';
import { componiFascicolo } from '@/lib/fascicolo/evidenza';
import { CONTROLLI_ESEGUITI, revisionaTesto } from './revisore';
import { FORMULE_LACUNA, LIVELLI_OUTPUT, formulaLacuna, intestazioneLivello } from './livelli';
import {
  QUALIFICAZIONE_RISCONTRO_PARAMETRI,
  istruzioniLessicoPerPrompt,
} from '@/lib/lessico/lessico';

const esito = (testo: string, id: string) =>
  revisionaTesto(testo, 'RELAZIONE_SCENARIO').risultati.find((r) => r.controllo.id === id)!;

const PULITO = `BOZZA ISTRUTTORIA soggetta a validazione.
L'offerta sulla riga INPS è pari al 40% del dovuto, superiore al parametro configurato dall'ente.
Risultano integrati i presupposti oggettivi rilevati ex art. 25-novies alla data del 30/06/2026.
Il Codice della crisi d'impresa e dell'insolvenza disciplina la composizione negoziata della crisi.`;

describe('catalogo e livelli (Libra, parti D ed E)', () => {
  it('ha i 28 controlli di Libra, con identificativi unici', () => {
    expect(CATALOGO_REVISORE).toHaveLength(28);
    expect(new Set(CATALOGO_REVISORE.map((c) => c.id)).size).toBe(28);
  });

  it('ogni controllo a regola ha la sua verifica, e nessuna verifica è orfana', () => {
    const aRegola = CATALOGO_REVISORE.filter((c) => c.modalita === 'REGOLA_TESTO').map((c) => c.id);
    expect([...aRegola].sort()).toEqual([...CONTROLLI_ESEGUITI].sort());
  });

  it('il livello 4 non è mai emesso dal software', () => {
    expect(LIVELLI_OUTPUT[4].emessoDalSoftware).toBe(false);
    expect([1, 2, 3].every((l) => LIVELLI_OUTPUT[l as 1 | 2 | 3].emessoDalSoftware)).toBe(true);
  });

  it('le formule delle lacune si compilano, e un segnaposto non compilato resta visibile', () => {
    expect(Object.keys(FORMULE_LACUNA)).toHaveLength(6);
    const f = formulaLacuna('LAC-B-001', { 'nome dato': 'data di deposito' });
    expect(f).toContain('data di deposito');
    expect(f).toContain('[source_id]');
  });
});

describe('revisore e registro delle fonti (REV-001)', () => {
  it('una norma citata che non è nel registro blocca; una da verificare segnala', () => {
    expect(esito('L’obbligo Uniemens discende dal D.M. 26 ottobre 2009.', 'REV-001').esito).toBe(
      'BLOCCO'
    );
    expect(
      esito('L’obbligo Uniemens discende dal D.L. 269/2003, art. 44, comma 9.', 'REV-001').esito
    ).toBe('PASS');
    expect(esito('Rilevano gli artt. 2482-bis e 2482-ter c.c.', 'REV-001').esito).toBe('PASS');
    // fonte abrogata citata COME abrogata: citazione corretta
    expect(
      esito(
        'Il sistema dell’originario art. 13 CCII è stato abrogato dal D.Lgs. 83/2022.',
        'REV-001'
      ).esito
    ).toBe('PASS');
    expect(esito('Ai sensi dell’art. 13 CCII gli indici sono superati.', 'REV-001').esito).toBe(
      'SEGNALAZIONE'
    );
    // il regime transitorio del cram down e' ancora da verificare
    expect(esito('Si applica il D.L. 69/2023, art. 1-bis.', 'REV-001').esito).toBe('SEGNALAZIONE');
  });
});

describe('revisore e fascicolo di evidenza', () => {
  const fascicolo = componiFascicolo({
    proposta: [
      {
        id: 1,
        categoriaCreditore: 'INPS',
        importoDovuto: 120_000,
        percentualeOfferta: 40,
        rangoLegale: null,
        documento: null,
      },
    ],
    posizioneEnte: [],
    vera: [],
  });
  it('REV-010: con il fascicolo, un importo senza evidenza è segnalato (non bloccato)', () => {
    const t = `${PULITO}\nL’INPS vanta € 120.000 e l’offerta è di € 48.000. Le banche vantano € 777.000.`;
    const r = revisionaTesto(t, 'RELAZIONE_SCENARIO', { fascicolo });
    const c = r.risultati.find((x) => x.controllo.id === 'REV-010')!;
    expect(c.esito).toBe('SEGNALAZIONE');
    expect(c.rilievi.map((x) => x.trovato)).toEqual(['€ 777.000']);
    expect(r.consegnabile).toBe(true);
  });
  it('REV-010: senza fascicolo non risulta superato', () => {
    expect(esito('L’INPS vanta € 120.000.', 'REV-010').esito).toBe('NON_VERIFICATO');
  });
});

describe('revisore a regole', () => {
  it('un testo pulito è consegnabile; i controlli non eseguibili risultano NON verificati, mai superati', () => {
    const r = revisionaTesto(PULITO, 'RELAZIONE_SCENARIO');
    expect(r.consegnabile).toBe(true);
    expect(r.conteggi.BLOCCO).toBe(0);
    expect(r.conteggi.NON_VERIFICATO).toBe(
      // senza fascicolo anche REV-010 resta non verificato
      CATALOGO_REVISORE.filter((c) => c.modalita !== 'REGOLA_TESTO').length + 1
    );
    expect(r.conteggi.PASS + r.conteggi.NON_VERIFICATO).toBe(28);
    expect(r.testoRivisto).toBe(PULITO);
  });

  it('è deterministico: stesso testo, stesso esito', () => {
    const t = 'La proposta è ricevibile. Conclusioni: il piano è solido.';
    expect(revisionaTesto(t, 'RELAZIONE_SCENARIO')).toEqual(
      revisionaTesto(t, 'RELAZIONE_SCENARIO')
    );
  });

  it('REV-020: fuori dalla conclusione sostituisce, e lo dichiara', () => {
    const corpo =
      'La proposta risulta NON RICEVIBILE sulla riga INPS.\n' + 'Testo di analisi. '.repeat(40);
    const r = revisionaTesto(corpo, 'RELAZIONE_SCENARIO');
    const c = r.risultati.find((x) => x.controllo.id === 'REV-020')!;
    expect(c.esito).toBe('CORREZIONE_AUTOMATICA');
    expect(r.consegnabile).toBe(true);
    expect(r.testoRivisto).toContain('NON COERENTE CON I PARAMETRI CONFIGURATI');
    expect(c.rilievi[0].trovato).toBe('NON RICEVIBILE');
    expect(c.rilievi[0].nota).toContain('non coerente con i parametri configurati');
    expect(r.testoRivisto).not.toMatch(/ricevibil/i);
  });

  it('REV-020: nella conclusione, o senza sostituzione sicura, blocca', () => {
    expect(
      esito('Analisi. '.repeat(30) + '\nConclusioni\nLa proposta è ricevibile.', 'REV-020').esito
    ).toBe('BLOCCO');
    expect(esito('Il piano è solido. ' + 'Analisi. '.repeat(60), 'REV-020').esito).toBe('BLOCCO');
  });

  it('REV-020: «crisi» è vietata come accertamento, ammessa come citazione', () => {
    expect(esito(PULITO, 'REV-020').esito).toBe('PASS');
    expect(
      esito("L'azienda versa in stato di crisi. " + 'Analisi. '.repeat(60), 'REV-020').esito
    ).toBe('BLOCCO');
    expect(esito('Il debito risulta sostenibile. ' + 'Analisi. '.repeat(60), 'REV-020').esito).toBe(
      'BLOCCO'
    );
  });

  it('REV-020: la qualificazione obbligatoria nomina i termini per negarli, e non è una violazione', () => {
    expect(
      esito(`${PULITO}\n${QUALIFICAZIONE_RISCONTRO_PARAMETRI}\n` + 'x '.repeat(200), 'REV-020')
        .esito
    ).toBe('PASS');
  });

  it('REV-021: aggiunge in calce la qualificazione mancante', () => {
    const r = revisionaTesto(`${PULITO}\nLa documentazione è incompleta.`, 'RELAZIONE_SCENARIO');
    expect(r.risultati.find((x) => x.controllo.id === 'REV-021')!.esito).toBe(
      'CORREZIONE_AUTOMATICA'
    );
    expect(r.testoRivisto).toContain('QUALIFICAZIONI OBBLIGATORIE');
    expect(r.testoRivisto).toContain('perimetro documentale dichiarato');
  });

  it('REV-022: il riscontro di soglia non diventa un obbligo', () => {
    expect(esito("L'INPS deve segnalare il superamento della soglia.", 'REV-022').esito).toBe(
      'BLOCCO'
    );
    expect(esito('Sussiste l’obbligo di segnalazione ex art. 25-novies.', 'REV-022').esito).toBe(
      'BLOCCO'
    );
    expect(esito(PULITO, 'REV-022').esito).toBe('PASS');
  });

  it('REV-023 e REV-025: un indicatore non accerta, la piattaforma non attesta', () => {
    expect(esito('Il DSCR inferiore a 1 dimostra lo stato di insolvenza.', 'REV-023').esito).toBe(
      'BLOCCO'
    );
    expect(esito('Il DSCR è pari a 0,8 nel periodo considerato.', 'REV-023').esito).toBe('PASS');
    expect(esito('La piattaforma attesta la veridicità dei dati.', 'REV-025').esito).toBe('BLOCCO');
  });

  it('REV-024: senza dichiarazione del proprio limite, la antepone', () => {
    const r = revisionaTesto('Analisi dei dati.', 'DOCUMENTO_CORREDO');
    expect(r.risultati.find((x) => x.controllo.id === 'REV-024')!.esito).toBe(
      'CORREZIONE_AUTOMATICA'
    );
    expect(r.testoRivisto.startsWith(intestazioneLivello('DOCUMENTO_CORREDO'))).toBe(true);
  });

  it('REV-003: gli indici di allerta abrogati non passano per diritto vigente', () => {
    expect(
      esito('Ai sensi dell’art. 13, comma 2, risultano superati i limiti degli indici.', 'REV-003')
        .esito
    ).toBe('BLOCCO');
    expect(esito('Gli indici di allerta impongono la segnalazione.', 'REV-003').esito).toBe(
      'BLOCCO'
    );
    expect(esito('Risultano 3 indici CCII violati su 5 test.', 'REV-003').esito).toBe('BLOCCO');
    expect(
      esito('Tre indici diagnostici di bilancio oltre la soglia di riferimento.', 'REV-003').esito
    ).toBe('PASS');
    expect(
      esito(
        'Gli indici CNDCEC, abrogati prima di entrare in vigore, restano un ausilio diagnostico.',
        'REV-003'
      ).esito
    ).toBe('PASS');
  });

  it('una abbreviazione non spezza la frase: «art. 25-novies», «D.Lgs. 14/2019»', () => {
    // Se «art.» chiudesse la frase, il verbo e l'oggetto finirebbero in frasi diverse.
    expect(
      esito('Ai sensi dell’art. 25-novies del D.Lgs. 14/2019 la segnalazione è dovuta.', 'REV-022')
        .esito
    ).toBe('BLOCCO');
  });

  it('REV-012: un dato assente non vale zero', () => {
    expect(
      esito('Il debito INAIL non è disponibile ed è stato considerato pari a zero.', 'REV-012')
        .esito
    ).toBe('BLOCCO');
    expect(esito('Il debito INAIL non è disponibile: l’esito è parziale.', 'REV-012').esito).toBe(
      'PASS'
    );
  });

  it('REV-035 e REV-036: il cram down va richiamato con norma, versione e adesioni', () => {
    expect(esito('Il debitore potrà chiedere il cram down.', 'REV-035').esito).toBe('BLOCCO');
    // nello Screening non c'e' ancora una proposta: segnalazione, non blocco
    expect(
      revisionaTesto(
        'Il debitore potrà chiedere il cram down.',
        'RELAZIONE_SCREENING'
      ).risultati.find((x) => x.controllo.id === 'REV-035')!.esito
    ).toBe('SEGNALAZIONE');
    expect(
      esito(
        'Omologazione forzosa ex art. 63 CCII nel testo vigente, subordinata all’adesione degli altri creditori.',
        'REV-035'
      ).esito
    ).toBe('PASS');
    expect(
      esito(
        'L’omologazione forzosa ex art. 63 CCII, nella versione in vigore dal 28/09/2024, dipende dall’adesione degli altri creditori.',
        'REV-035'
      ).esito
    ).toBe('PASS');
    expect(esito('Si applica la ristrutturazione trasversale.', 'REV-036').esito).toBe('BLOCCO');
  });

  it('le istruzioni di lessico per i prompt nominano tutti i termini vietati', () => {
    const i = istruzioniLessicoPerPrompt();
    for (const t of ['ricevibile', 'solido', 'pavimento minimo', 'omologabile'])
      expect(i).toContain(t);
  });
});
