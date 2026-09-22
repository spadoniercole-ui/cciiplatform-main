// src/lib/revisore/catalogo.ts
//
// CATALOGO DEI CONTROLLI DEL REVISORE — parte E dei materiali di Libra
// (consegna 3 di 6): 28 controlli in quattro gruppi. E' un DATO: il pannello
// «Revisione» lo mostra per intero, cosi' chi legge vede anche i controlli
// che la piattaforma NON e' ancora in grado di eseguire.
//
// `modalita` dice come il controllo viene eseguito oggi:
//   REGOLA_TESTO  — regola deterministica sul testo: eseguita a ogni revisione.
//   MOTORE        — il vincolo e' garantito a monte dal motore di calcolo (es.
//                   ruoli fuori dalla lettera a); sul testo libero non e'
//                   verificabile, e il revisore lo dichiara.
//   FASCICOLO     — richiede che ogni dato porti il proprio identificativo di
//                   provenienza (il «motore dati e prove» indicato da Libra):
//                   non ancora costruito.
//   SEMANTICO     — richiede di capire il senso della frase: spettera' al
//                   revisore AI (fase 5) con validazione umana.
// Un controllo non eseguito NON risulta mai superato: risulta NON_VERIFICATO.

export type GruppoControllo = 'FONTI' | 'DATI' | 'LINGUAGGIO' | 'STRUMENTI';
export type ModalitaControllo = 'REGOLA_TESTO' | 'MOTORE' | 'FASCICOLO' | 'SEMANTICO';
export type AzioneLibra =
  'BLOCCO' | 'SEGNALAZIONE' | 'CORREZIONE_O_BLOCCO' | 'BLOCCO_O_SEGNALAZIONE';

export interface ControlloRevisore {
  id: string;
  gruppo: GruppoControllo;
  verifica: string;
  azione: AzioneLibra;
  messaggio: string;
  modalita: ModalitaControllo;
}

export const ETICHETTA_GRUPPO: Record<GruppoControllo, string> = {
  FONTI: 'Fonti, vigenza e citazioni',
  DATI: 'Dati, calcoli e provenienza',
  LINGUAGGIO: 'Linguaggio e perimetro dell’output',
  STRUMENTI: 'Strumenti, attestazioni e creditori pubblici',
};

const c = (
  id: string,
  gruppo: GruppoControllo,
  modalita: ModalitaControllo,
  azione: AzioneLibra,
  verifica: string,
  messaggio: string
): ControlloRevisore => ({ id, gruppo, modalita, azione, verifica, messaggio });

export const CATALOGO_REVISORE: ControlloRevisore[] = [
  c(
    'REV-001',
    'FONTI',
    'REGOLA_TESTO',
    'BLOCCO',
    'Ogni affermazione normativa porta un identificativo di fonte del registro.',
    'Testo bloccato: riferimento normativo privo di identificativo di fonte.'
  ),
  c(
    'REV-002',
    'FONTI',
    'SEMANTICO',
    'BLOCCO',
    'La fonte citata è vigente alla data del fatto, della proposta o del procedimento.',
    'Testo bloccato: la versione della fonte non è applicabile alla data di riferimento.'
  ),
  c(
    'REV-003',
    'FONTI',
    'REGOLA_TESTO',
    'CORREZIONE_O_BLOCCO',
    'Una fonte abrogata o storica non è presentata come vigente.',
    'Riferimento storico rilevato: la fonte non può essere presentata come disciplina vigente.'
  ),
  c(
    'REV-004',
    'FONTI',
    'SEMANTICO',
    'BLOCCO',
    'Il testo distingue norma primaria, atto attuativo, prassi e interpretazione.',
    'Testo bloccato: fonte attuativa o interpretativa presentata come norma primaria.'
  ),
  c(
    'REV-005',
    'FONTI',
    'FASCICOLO',
    'BLOCCO',
    'Ogni percentuale, soglia, termine o maggioranza è associata a fonte, comma e versione temporale.',
    'Testo bloccato: valore numerico privo di fonte normativa temporalmente verificata.'
  ),
  c(
    'REV-006',
    'FONTI',
    'SEMANTICO',
    'BLOCCO',
    'Nessuna fonte estranea alla fattispecie, all’ente creditore o allo strumento.',
    'Testo bloccato: fonte non pertinente al percorso o alla fattispecie descritta.'
  ),
  c(
    'REV-007',
    'FONTI',
    'SEMANTICO',
    'BLOCCO_O_SEGNALAZIONE',
    'Un contrasto interpretativo è riportato con il suo ambito temporale e la versione normativa.',
    'Verifica richiesta: questione interpretativa temporalmente sensibile o non consolidata.'
  ),

  c(
    'REV-010',
    'DATI',
    'REGOLA_TESTO',
    'BLOCCO',
    'Ogni importo, percentuale, data e indicatore corrisponde a un dato del motore o a un documento identificato.',
    'Testo bloccato: dato numerico non riconciliato con il motore o con la fonte documentale.'
  ),
  c(
    'REV-011',
    'DATI',
    'FASCICOLO',
    'BLOCCO_O_SEGNALAZIONE',
    'Ogni dato reca fonte, data di riferimento, perimetro soggettivo e stato di validazione.',
    'Dato non utilizzabile: provenienza, data o perimetro non verificati.'
  ),
  c(
    'REV-012',
    'DATI',
    'REGOLA_TESTO',
    'BLOCCO',
    'Un dato assente, non disponibile o non riconciliato non è trattato come zero.',
    'Testo bloccato: dato mancante trasformato in valore numerico.'
  ),
  c(
    'REV-013',
    'DATI',
    'FASCICOLO',
    'CORREZIONE_O_BLOCCO',
    'Somme, percentuali e rapporti coincidono con il ricalcolo deterministico.',
    'Incoerenza aritmetica rilevata fra testo e motore.'
  ),
  c(
    'REV-014',
    'DATI',
    'SEMANTICO',
    'BLOCCO_O_SEGNALAZIONE',
    'Le stime indicano metodologia, assunzioni, data, soggetto responsabile e documenti.',
    'Stima non utilizzabile: metodologia o assunzioni non documentate.'
  ),
  c(
    'REV-015',
    'DATI',
    'MOTORE',
    'BLOCCO',
    'Un credito non è contato due volte, per ente di origine e per stato di riscossione.',
    'Testo bloccato: possibile duplicazione dell’esposizione debitoria.'
  ),
  c(
    'REV-016',
    'DATI',
    'MOTORE',
    'BLOCCO',
    'Il dato IVA dell’art. 25-novies deriva dalle LIPE, con periodo e volume d’affari.',
    'Esito IVA non esprimibile: debito o volume d’affari non riconducibili alle fonti richieste.'
  ),
  c(
    'REV-017',
    'DATI',
    'MOTORE',
    'BLOCCO',
    'I 90 giorni si calcolano per INPS, INAIL e Agente della Riscossione, non per l’Agenzia delle Entrate.',
    'Testo bloccato: requisito temporale applicato a fattispecie non pertinente.'
  ),

  c(
    'REV-020',
    'LINGUAGGIO',
    'REGOLA_TESTO',
    'CORREZIONE_O_BLOCCO',
    'Nessun termine vietato in un output automatico.',
    'Espressione non consentita in output automatico.'
  ),
  c(
    'REV-021',
    'LINGUAGGIO',
    'REGOLA_TESTO',
    'CORREZIONE_O_BLOCCO',
    'Un termine consentito con qualificazione porta la qualificazione obbligatoria.',
    'Qualificazione obbligatoria assente.'
  ),
  c(
    'REV-022',
    'LINGUAGGIO',
    'REGOLA_TESTO',
    'BLOCCO',
    'Ogni esito ex art. 25-novies usa «presupposti oggettivi rilevati / non rilevati».',
    'Testo bloccato: il riscontro di soglia è stato trasformato in obbligo o giudizio sulla crisi.'
  ),
  c(
    'REV-023',
    'LINGUAGGIO',
    'REGOLA_TESTO',
    'BLOCCO',
    'Un indicatore, il DSCR, il Test pratico o la Check List non sono presentati come prova autonoma.',
    'Testo bloccato: indicatore tecnico presentato come conclusione giuridica.'
  ),
  c(
    'REV-024',
    'LINGUAGGIO',
    'REGOLA_TESTO',
    'BLOCCO',
    'L’output riporta il proprio limite: bozza istruttoria, elaborazione tecnica o soggetto a validazione.',
    'Manca la qualificazione del livello di affidabilità dell’output.'
  ),
  c(
    'REV-025',
    'LINGUAGGIO',
    'REGOLA_TESTO',
    'BLOCCO',
    'Il sistema non si attribuisce ruoli di esperto, attestatore, revisore legale, creditore pubblico o tribunale.',
    'Testo bloccato: attribuzione indebita di funzione professionale o pubblica al sistema.'
  ),

  c(
    'REV-030',
    'STRUMENTI',
    'SEMANTICO',
    'BLOCCO',
    'Un confronto liquidatorio contiene attivo, passivo, rango, costi, tempi, probabilità di realizzo, proposta e metodologia.',
    'Confronto liquidatorio non esprimibile: base comparativa incompleta.'
  ),
  c(
    'REV-031',
    'STRUMENTI',
    'SEMANTICO',
    'BLOCCO',
    'Una bozza ex art. 63 o 88 distingue piano liquidatorio e piano in continuità.',
    'Testo bloccato: criterio comparativo non coerente con la natura del piano.'
  ),
  c(
    'REV-032',
    'STRUMENTI',
    'SEMANTICO',
    'BLOCCO',
    'Una relazione sui dati aziendali identifica documenti esaminati, riconciliazioni, anomalie, metodo e perimetro.',
    'Bozza non finalizzabile: verifiche documentali non tracciate.'
  ),
  c(
    'REV-033',
    'STRUMENTI',
    'FASCICOLO',
    'BLOCCO',
    'Una bozza di attestazione contiene professionista, incarico, indipendenza, accettazione e approvazione espressa.',
    'Titolo attestativo non utilizzabile: requisiti del professionista o approvazione non registrati.'
  ),
  c(
    'REV-034',
    'STRUMENTI',
    'SEMANTICO',
    'BLOCCO',
    'Il trattamento dei crediti pubblici distingue capitale, accessori, rango, garanzie, ruoli, contenzioso e data.',
    'Trattamento del credito pubblico non verificabile: perimetro del debito incompleto.'
  ),
  c(
    'REV-035',
    'STRUMENTI',
    'REGOLA_TESTO',
    'BLOCCO',
    'Se è richiamata l’omologazione forzosa, il testo indica norma, versione, maggioranza e adesione determinante.',
    'Riferimento a omologazione forzosa non verificabile: presupposti incompleti.'
  ),
  c(
    'REV-036',
    'STRUMENTI',
    'REGOLA_TESTO',
    'BLOCCO',
    'La ristrutturazione trasversale è trattata distinguendo prima e dopo il D.Lgs. 136/2024.',
    'Testo bloccato: disciplina del cram down applicata senza verifica temporale.'
  ),
];

export const MOTIVO_NON_VERIFICATO: Record<Exclude<ModalitaControllo, 'REGOLA_TESTO'>, string> = {
  MOTORE:
    'Garantito a monte dal motore di calcolo; sul testo libero non è verificabile in modo deterministico.',
  FASCICOLO:
    'Richiede che ogni dato porti l’identificativo della propria provenienza (fascicolo di evidenza): non ancora disponibile.',
  SEMANTICO:
    'Richiede di interpretare il senso del testo: spetta alla revisione professionale, e in seguito al revisore AI con validazione umana.',
};
