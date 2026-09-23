// src/lib/fascicolo/evidenza.ts
//
// FASCICOLO DI EVIDENZA — il «motore dati e prove» indicato da Libra: ogni
// importo con la propria provenienza (documento, data, ente, natura, rango) e
// il proprio stato di verifica.
//
// Prima tappa (0.109.84): il fascicolo si COMPONE AL VOLO dai dati che la
// piattaforma ha gia' — righe della proposta, posizione debitoria dell'ente,
// V.E.R.A. — senza duplicarli in una tabella nuova: nessuno stato da tenere
// allineato, sempre coerente con i dati correnti. Di molte righe oggi NON si
// conosce il documento di origine (l'importazione non lo registrava): il
// fascicolo lo dichiara, riga per riga, invece di tacerlo. Le prossime tappe
// registreranno l'impronta SHA-256 di ogni file al caricamento.
//
// Logica pura: niente database, niente React.

export type OrigineEvidenza = 'PROPOSTA' | 'POSIZIONE_ENTE' | 'VERA' | 'BILANCIO' | 'CALCOLO';

/**
 * Stato dell'evidenza — riscritto nella 0.109.96 su indicazione di Ercole: il
 * criterio non e' il file di origine, e' il TITOLO.
 *  - TITOLO_ENTE      : credito dell'ente, acquisito come certo, liquido ed
 *                       esigibile sul presupposto degli atti che lo fondano;
 *                       il titolo presunto e' dedotto dal codice di partita
 *                       (tabella «Titoli di credito dell'ente»). L'onere di
 *                       dimostrarlo resta all'ente.
 *  - DICHIARATO       : dato di provenienza aziendale (proposta, bilancio,
 *                       situazione dichiarata), riportato come proposto.
 *  - IMPORTO_NON_NOTO : la voce esiste ma l'importo e' ignoto. NON vale zero.
 *  - DERIVATO         : calcolato dalla piattaforma da altre evidenze.
 * Il documento di origine (nome, impronta) resta come traccia, non come stato.
 */
export type StatoEvidenza = 'TITOLO_ENTE' | 'DICHIARATO' | 'IMPORTO_NON_NOTO' | 'DERIVATO';

/** Titolo presunto di una partita dell'ente, dalla tabella dei titoli. */
export interface TitoloPresunto {
  codice: string;
  atto: string;
  presuppostoGiuridico: string | null;
  riferimentoInterno: string | null;
}

export interface Evidenza {
  /** Stabile finche' la riga di origine esiste: EV-<origine>-<id riga>. */
  id: string;
  origine: OrigineEvidenza;
  descrizione: string;
  /** null = importo non noto. Mai zero al posto di un dato assente. */
  importo: number | null;
  ente: string | null;
  natura: string | null;
  rango: string | null;
  /** AAAA-MM-GG, se la riga la porta. */
  dataRiferimento: string | null;
  documento: { nome: string; impronta: string | null } | null;
  stato: StatoEvidenza;
  /** Solo TITOLO_ENTE: l'atto presunto dal codice; null = codice non configurato. */
  titolo?: TitoloPresunto | null;
  /** Solo TITOLO_ENTE: il codice della partita, se il tracciato lo porta. */
  codicePartita?: string | null;
  /** Per DERIVATO: da quali evidenze e con quale operazione. */
  derivatoDa?: { ids: string[]; operazione: string };
}

const PREFISSO: Record<OrigineEvidenza, string> = {
  PROPOSTA: 'PRO',
  POSIZIONE_ENTE: 'ENT',
  VERA: 'VER',
  BILANCIO: 'BIL',
  CALCOLO: 'CAL',
};

export function idEvidenza(origine: OrigineEvidenza, chiave: string | number): string {
  return `EV-${PREFISSO[origine]}-${chiave}`;
}

export interface DocumentoOrigine {
  nomeFile: string;
  impronta: string;
}

export interface RigaPropostaFascicolo {
  id: number;
  documento: DocumentoOrigine | null;
  categoriaCreditore: string;
  importoDovuto: number;
  percentualeOfferta: number;
  rangoLegale: string | null;
}

export interface RigaPosizioneEnte {
  id: number;
  documento: DocumentoOrigine | null;
  codiceGuida?: string | null;
  titolo?: TitoloPresunto | null;
  voce: string;
  importo: number;
  importoVersato: number | null;
  tipo: string;
  data: string | null;
}
/** Un bilancio dello storico XBRL: le voci che le relazioni citano. */
export interface BilancioFascicolo {
  id: number;
  anno: number | null;
  documento: DocumentoOrigine | null;
  /** true = anno comparativo dedotto da un altro file, non caricato a se'. */
  comparativo: boolean;
  voci: Partial<
    Record<
      | 'ricaviVendite'
      | 'valoreProduzione'
      | 'costiProduzione'
      | 'ebitda'
      | 'oneriFinanziari'
      | 'utileEsercizio'
      | 'totaleAttivo'
      | 'attivoCircolante'
      | 'disponibilitaLiquide'
      | 'patrimonioNetto'
      | 'totaleDebiti'
      | 'debitiBanche'
      | 'debitiFornitori'
      | 'debitiTributari'
      | 'debitiPrevidenziali',
      number
    >
  >;
}

export const ETICHETTA_VOCE_BILANCIO: Record<keyof BilancioFascicolo['voci'], string> = {
  ricaviVendite: 'Ricavi delle vendite',
  valoreProduzione: 'Valore della produzione',
  costiProduzione: 'Costi della produzione',
  ebitda: 'EBITDA',
  oneriFinanziari: 'Oneri finanziari',
  utileEsercizio: 'Utile (perdita) dell’esercizio',
  totaleAttivo: 'Totale attivo',
  attivoCircolante: 'Attivo circolante',
  disponibilitaLiquide: 'Disponibilità liquide',
  patrimonioNetto: 'Patrimonio netto',
  totaleDebiti: 'Totale debiti',
  debitiBanche: 'Debiti verso banche',
  debitiFornitori: 'Debiti verso fornitori',
  debitiTributari: 'Debiti tributari',
  debitiPrevidenziali: 'Debiti previdenziali',
};

export interface RigaVera {
  id: number;
  documento: DocumentoOrigine | null;
  sezione: string;
  voce: string;
  importo: number;
  categoria: string;
  /** 'contabilizzato' | 'da_contabilizzare' | 'potenziale' | 'ignora' */
  trattamento: string;
}

const arrotonda = (n: number) => Math.round(n * 100) / 100;

export function componiFascicolo(input: {
  proposta: RigaPropostaFascicolo[];
  posizioneEnte: RigaPosizioneEnte[];
  vera: RigaVera[];
  bilanci?: BilancioFascicolo[];
}): Evidenza[] {
  const evidenze: Evidenza[] = [];
  const base = { ente: null, natura: null, rango: null, dataRiferimento: null, documento: null };

  for (const r of input.proposta) {
    const idDovuto = idEvidenza('PROPOSTA', `${r.id}-dovuto`);
    evidenze.push({
      ...base,
      id: idDovuto,
      origine: 'PROPOSTA',
      descrizione: `Proposta — ${r.categoriaCreditore}: importo dovuto`,
      importo: r.importoDovuto,
      ente: r.categoriaCreditore,
      rango: r.rangoLegale,
      documento: r.documento
        ? { nome: r.documento.nomeFile, impronta: r.documento.impronta }
        : null,
      stato: 'DICHIARATO',
    });
    evidenze.push({
      ...base,
      id: idEvidenza('PROPOSTA', `${r.id}-offerto`),
      origine: 'CALCOLO',
      descrizione: `Proposta — ${r.categoriaCreditore}: importo offerto (${r.percentualeOfferta}% del dovuto)`,
      importo: arrotonda((r.importoDovuto * r.percentualeOfferta) / 100),
      ente: r.categoriaCreditore,
      rango: r.rangoLegale,
      stato: 'DERIVATO',
      derivatoDa: { ids: [idDovuto], operazione: `× ${r.percentualeOfferta}%` },
    });
  }
  if (input.proposta.length > 1) {
    evidenze.push({
      ...base,
      id: idEvidenza('CALCOLO', 'proposta-totale-dovuto'),
      origine: 'CALCOLO',
      descrizione: 'Proposta — totale degli importi dovuti',
      importo: arrotonda(input.proposta.reduce((s, r) => s + r.importoDovuto, 0)),
      stato: 'DERIVATO',
      derivatoDa: {
        ids: input.proposta.map((r) => idEvidenza('PROPOSTA', `${r.id}-dovuto`)),
        operazione: 'somma',
      },
    });
    evidenze.push({
      ...base,
      id: idEvidenza('CALCOLO', 'proposta-totale-offerto'),
      origine: 'CALCOLO',
      descrizione: 'Proposta — totale degli importi offerti',
      importo: arrotonda(
        input.proposta.reduce((s, r) => s + (r.importoDovuto * r.percentualeOfferta) / 100, 0)
      ),
      stato: 'DERIVATO',
      derivatoDa: {
        ids: input.proposta.map((r) => idEvidenza('PROPOSTA', `${r.id}-offerto`)),
        operazione: 'somma',
      },
    });
  }

  for (const r of input.posizioneEnte) {
    evidenze.push({
      ...base,
      id: idEvidenza('POSIZIONE_ENTE', r.id),
      origine: 'POSIZIONE_ENTE',
      descrizione: `Posizione debitoria dell’ente — ${r.voce}`,
      importo: r.importo,
      natura: r.tipo,
      dataRiferimento: r.data,
      documento: r.documento
        ? { nome: r.documento.nomeFile, impronta: r.documento.impronta }
        : null,
      stato: 'TITOLO_ENTE',
      titolo: r.titolo ?? null,
      codicePartita: r.codiceGuida ?? null,
    });
    if (r.importoVersato !== null && r.importoVersato !== 0) {
      evidenze.push({
        ...base,
        id: idEvidenza('POSIZIONE_ENTE', `${r.id}-saldo`),
        origine: 'CALCOLO',
        descrizione: `Posizione debitoria dell’ente — ${r.voce}: saldo residuo`,
        importo: arrotonda(r.importo - r.importoVersato),
        natura: r.tipo,
        dataRiferimento: r.data,
        stato: 'DERIVATO',
        derivatoDa: { ids: [idEvidenza('POSIZIONE_ENTE', r.id)], operazione: '− versato' },
      });
    }
  }
  if (input.posizioneEnte.length > 1) {
    evidenze.push({
      ...base,
      id: idEvidenza('CALCOLO', 'ente-totale-saldo'),
      origine: 'CALCOLO',
      descrizione: 'Posizione debitoria dell’ente — totale dei saldi',
      importo: arrotonda(
        input.posizioneEnte.reduce((s, r) => s + r.importo - (r.importoVersato ?? 0), 0)
      ),
      stato: 'DERIVATO',
      derivatoDa: {
        ids: input.posizioneEnte.map((r) => idEvidenza('POSIZIONE_ENTE', r.id)),
        operazione: 'somma dei saldi',
      },
    });
  }

  const veraUtili = input.vera.filter((r) => r.trattamento !== 'ignora');
  for (const r of veraUtili) {
    const potenziale = r.trattamento === 'potenziale';
    evidenze.push({
      ...base,
      id: idEvidenza('VERA', r.id),
      origine: 'VERA',
      descrizione: `V.E.R.A. — ${r.sezione}: ${r.voce}`,
      // Una voce potenziale ha importo ignoto: null, mai zero.
      importo: potenziale ? null : r.importo,
      ente: 'INPS',
      natura: r.categoria,
      documento: r.documento
        ? { nome: r.documento.nomeFile, impronta: r.documento.impronta }
        : null,
      stato: potenziale ? 'IMPORTO_NON_NOTO' : 'TITOLO_ENTE',
    });
  }
  const veraConImporto = veraUtili.filter((r) => r.trattamento !== 'potenziale');
  if (veraConImporto.length > 1) {
    evidenze.push({
      ...base,
      id: idEvidenza('CALCOLO', 'vera-totale'),
      origine: 'CALCOLO',
      descrizione:
        veraUtili.length > veraConImporto.length
          ? `V.E.R.A. — totale delle voci a importo noto (MINIMO: ${veraUtili.length - veraConImporto.length} voci hanno importo non noto)`
          : 'V.E.R.A. — totale',
      importo: arrotonda(veraConImporto.reduce((s, r) => s + r.importo, 0)),
      ente: 'INPS',
      stato: 'DERIVATO',
      derivatoDa: { ids: veraConImporto.map((r) => idEvidenza('VERA', r.id)), operazione: 'somma' },
    });
  }
  // Bilancio: una evidenza per voce e per anno. Il dato di bilancio serve al
  // quadro generale e alle relazioni, MAI alle soglie dell'art. 25-novies
  // (la voce D.13 somma INPS e INAIL): la descrizione lo ricorda.
  for (const b of input.bilanci ?? []) {
    for (const [chiave, valore] of Object.entries(b.voci)) {
      if (valore === undefined || valore === null || !Number.isFinite(valore)) continue;
      const etichetta =
        ETICHETTA_VOCE_BILANCIO[chiave as keyof BilancioFascicolo['voci']] ?? chiave;
      evidenze.push({
        ...base,
        id: idEvidenza('BILANCIO', `${b.anno ?? 'nd'}-${chiave}`),
        origine: 'BILANCIO',
        descrizione: `Bilancio ${b.anno ?? 'anno n.d.'}${b.comparativo ? ' (comparativo)' : ''} — ${etichetta}${chiave === 'debitiPrevidenziali' || chiave === 'debitiTributari' ? ' (aggregato di bilancio: non si usa per le soglie)' : ''}`,
        importo: valore,
        dataRiferimento: b.anno ? `${b.anno}-12-31` : null,
        documento: b.documento
          ? { nome: b.documento.nomeFile, impronta: b.documento.impronta }
          : null,
        stato: 'DICHIARATO',
      });
    }
  }
  return evidenze;
}

// ---------------------------------------------------------------------------
// Riconciliazione di un testo con il fascicolo (controlli REV-010 e REV-012)
// ---------------------------------------------------------------------------

export interface ImportoNelTesto {
  testo: string;
  valore: number;
  posizione: number;
}

/** Importi in euro scritti all'italiana: «€ 1.234,56», «1.234 euro», «euro 120.000». */
export function estraiImportiDaTesto(testo: string): ImportoNelTesto[] {
  const numero = '(\\d{1,3}(?:\\.\\d{3})+|\\d+)(?:,(\\d{1,2}))?';
  const rx = new RegExp(`(?:€|euro|eur)\\s*${numero}|${numero}\\s*(?:€|euro\\b|eur\\b)`, 'giu');
  const trovati: ImportoNelTesto[] = [];
  for (const m of testo.matchAll(rx)) {
    const intero = m[1] ?? m[3];
    const decimali = m[2] ?? m[4] ?? '';
    const valore = Number(`${intero.replace(/\./g, '')}.${decimali || '0'}`);
    if (Number.isFinite(valore)) trovati.push({ testo: m[0], valore, posizione: m.index ?? 0 });
  }
  return trovati;
}

export interface EsitoRiconciliazione {
  riconciliati: { importo: ImportoNelTesto; evidenza: Evidenza }[];
  nonRiconciliati: ImportoNelTesto[];
}

/**
 * Ogni importo del testo deve coincidere con un'evidenza (scarto massimo 1 €:
 * i testi arrotondano all'euro). Un importo tondo minore di 1.000 € non si
 * considera: «5.000 €» o «15.000 €» sono di norma soglie di legge, che
 * rispondono al registro delle fonti, non al fascicolo.
 */
export function riconciliaTestoConFascicolo(
  testo: string,
  fascicolo: Evidenza[],
  importiDiLegge: number[] = []
): EsitoRiconciliazione {
  const riconciliati: EsitoRiconciliazione['riconciliati'] = [];
  const nonRiconciliati: ImportoNelTesto[] = [];
  for (const importo of estraiImportiDaTesto(testo)) {
    if (importiDiLegge.some((l) => Math.abs(l - importo.valore) < 0.005)) continue;
    const evidenza = fascicolo.find(
      (e) => e.importo !== null && Math.abs(Math.abs(e.importo) - importo.valore) <= 1
    );
    if (evidenza) riconciliati.push({ importo, evidenza });
    else nonRiconciliati.push(importo);
  }
  return { riconciliati, nonRiconciliati };
}

/** Soglie e parametri di legge espressi in euro: non sono dati del fascicolo. */
export const IMPORTI_DI_LEGGE = [5_000, 15_000, 20_000, 100_000, 200_000, 500_000, 300_000];

export function riepilogoFascicolo(fascicolo: Evidenza[]): Record<StatoEvidenza, number> {
  const r: Record<StatoEvidenza, number> = {
    TITOLO_ENTE: 0,
    DICHIARATO: 0,
    IMPORTO_NON_NOTO: 0,
    DERIVATO: 0,
  };
  for (const e of fascicolo) r[e.stato] += 1;
  return r;
}
