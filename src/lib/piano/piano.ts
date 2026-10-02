// src/lib/piano/piano.ts
//
// PIANO DI SVILUPPO — il modello che segue la proposta, uguale per il
// Redigente (che lo compila e lo allega) e per il Ricevente (che lo mette
// alla prova cambiando le ipotesi). Regole di Ercole (25/09/2026):
//   - le righe del piano sono le macro-voci del bilancio XBRL gia' lette dal
//     parser, cosi' ogni ipotesi ha di fronte il dato storico da cui parte;
//   - il personale non si dettaglia per categoria: e' dentro i costi della
//     produzione e la leva agisce sul cumulato;
//   - orizzonte fino a cinque anni, scelto per scenario;
//   - la vecchia simulazione a leve e' sostituita.
//
// Per ogni riga di INPUT e ogni anno del piano l'ipotesi e' una variazione
// percentuale sull'anno precedente oppure un valore assoluto. Le righe
// DERIVATE si calcolano. Il piano di rientro entra come riga propria (rate
// verso l'ente e verso gli altri creditori) sottratta alla cassa generata.
// Logica pura e deterministica.

export type RigaInput =
  | 'ricaviVendite'
  | 'altriRicavi' // valore della produzione - ricavi delle vendite
  | 'costiOperativi' // costi della produzione - ammortamenti
  | 'ammortamenti'
  | 'oneriFinanziari'
  | 'aliquotaImposte' // % sull'utile ante imposte (se positivo)
  | 'investimenti' // acquisti di immobilizzazioni nell'anno (valore assoluto)
  | 'creditiClienti'
  | 'debitiFornitori'
  | 'debitiBanche'
  | 'apportiSoci'; // versamenti in conto capitale / finanziamenti soci (valore assoluto)

export const RIGHE_INPUT: RigaInput[] = [
  'ricaviVendite',
  'altriRicavi',
  'costiOperativi',
  'ammortamenti',
  'oneriFinanziari',
  'aliquotaImposte',
  'investimenti',
  'creditiClienti',
  'debitiFornitori',
  'debitiBanche',
  'apportiSoci',
];

export const ETICHETTA_RIGA: Record<RigaInput, string> = {
  ricaviVendite: 'Ricavi delle vendite e delle prestazioni',
  altriRicavi: 'Altri ricavi e variazioni (valore della produzione − ricavi)',
  costiOperativi: 'Costi della produzione (senza ammortamenti; personale compreso)',
  ammortamenti: 'Ammortamenti e svalutazioni',
  oneriFinanziari: 'Oneri finanziari',
  aliquotaImposte: 'Aliquota d’imposta sull’utile (%)',
  investimenti: 'Investimenti in immobilizzazioni (nell’anno)',
  creditiClienti: 'Crediti verso clienti (a fine anno)',
  debitiFornitori: 'Debiti verso fornitori (a fine anno)',
  debitiBanche: 'Debiti verso banche (a fine anno)',
  apportiSoci: 'Apporti dei soci (nell’anno)',
};

/** Righe che nel bilancio sono un valore assoluto dell'anno, non un saldo. */
export const RIGHE_FLUSSO: Set<RigaInput> = new Set([
  'investimenti',
  'apportiSoci',
  'aliquotaImposte',
]);

export interface Ipotesi {
  tipo: 'pct' | 'abs';
  valore: number;
  /** Solo per le ipotesi scritte dall'AI (variante «elaborazione dell'AI»): perché quel valore. */
  motivazione?: string;
}

/** ipotesi[riga][indiceAnno] — indice 0 = primo anno del piano. */
export type IpotesiPiano = Partial<Record<RigaInput, (Ipotesi | null)[]>>;

export interface EsercizioStorico {
  anno: number;
  ricaviVendite: number;
  valoreProduzione: number;
  costiProduzione: number;
  ammortamenti: number;
  oneriFinanziari: number;
  utileEsercizio: number;
  immobilizzazioni: number;
  creditiClienti: number;
  disponibilitaLiquide: number;
  attivoCircolante: number;
  totaleAttivo: number;
  patrimonioNetto: number;
  debitiBanche: number;
  debitiFornitori: number;
  debitiTributari: number;
  debitiPrevidenziali: number;
  totaleDebiti: number;
}

export interface RatePiano {
  /** Rate annue verso l'ente dello spazio, per anno del piano. */
  ente: number[];
  /** Rate annue verso gli altri creditori della proposta. */
  altri: number[];
}

export interface AnnoPiano {
  anno: number;
  ricaviVendite: number;
  altriRicavi: number;
  valoreProduzione: number;
  costiOperativi: number;
  ammortamenti: number;
  ebitda: number;
  ebit: number;
  oneriFinanziari: number;
  utileAnteImposte: number;
  imposte: number;
  utile: number;
  investimenti: number;
  creditiClienti: number;
  debitiFornitori: number;
  debitiBanche: number;
  apportiSoci: number;
  rateEnte: number;
  rateAltri: number;
  /** Cassa generata dalla gestione prima delle rate e dei rimborsi. */
  flussoGestione: number;
  /** Cassa dopo rate, rimborsi bancari, investimenti e apporti. */
  flussoNetto: number;
  disponibilitaLiquide: number;
  immobilizzazioni: number;
  patrimonioNetto: number;
  debitiTributari: number;
  debitiPrevidenziali: number;
  totaleDebiti: number;
  totaleAttivo: number;
  /** Copertura delle rate: flusso di gestione / (rate + rimborsi banche). null se non ci sono rate. */
  coperturaRate: number | null;
}

export interface VincoloPiano {
  anno: number;
  codice: 'CASSA_NEGATIVA' | 'RATE_NON_COPERTE' | 'PATRIMONIO_NEGATIVO' | 'PERDITA';
  testo: string;
}

export interface EsitoPiano {
  anni: AnnoPiano[];
  vincoli: VincoloPiano[];
  /** Cassa minima toccata nel piano. */
  cassaMinima: number;
  /** Anno da cui il patrimonio netto torna positivo (null se mai). */
  annoPatrimonioPositivo: number | null;
  sintesi: string;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

function applica(base: number, ip: Ipotesi | null | undefined, flusso: boolean): number {
  if (!ip) return flusso ? 0 : base;
  if (ip.tipo === 'abs') return ip.valore;
  return base * (1 + ip.valore / 100);
}

/** Aliquota implicita dallo storico: imposte / utile ante imposte, se ricavabile. */
export function aliquotaImplicita(s: EsercizioStorico): number | null {
  const ebit = s.valoreProduzione - s.costiProduzione;
  const ante = ebit - s.oneriFinanziari;
  if (ante <= 0) return null;
  const imposte = ante - s.utileEsercizio;
  if (imposte < 0) return null;
  return r2(Math.min(60, (imposte / ante) * 100));
}

export function calcolaPiano(
  storico: EsercizioStorico,
  orizzonte: number,
  ipotesi: IpotesiPiano,
  rate: RatePiano,
  capitaleSociale: number | null = null
): EsitoPiano {
  const anni: AnnoPiano[] = [];
  const vincoli: VincoloPiano[] = [];
  const s = storico;
  const altroCircolante = Math.max(
    0,
    s.attivoCircolante - s.creditiClienti - s.disponibilitaLiquide
  );
  const altriDebiti = Math.max(
    0,
    s.totaleDebiti - s.debitiBanche - s.debitiFornitori - s.debitiTributari - s.debitiPrevidenziali
  );
  const aliquotaBase = aliquotaImplicita(s) ?? 27.9; // IRES 24% + IRAP 3,9%, se lo storico non la rivela

  let prev = {
    ricaviVendite: s.ricaviVendite,
    altriRicavi: s.valoreProduzione - s.ricaviVendite,
    costiOperativi: Math.max(0, s.costiProduzione - s.ammortamenti),
    ammortamenti: s.ammortamenti,
    oneriFinanziari: s.oneriFinanziari,
    aliquota: aliquotaBase,
    creditiClienti: s.creditiClienti,
    debitiFornitori: s.debitiFornitori,
    debitiBanche: s.debitiBanche,
    disponibilita: s.disponibilitaLiquide,
    immobilizzazioni: s.immobilizzazioni,
    patrimonioNetto: s.patrimonioNetto,
    debitiTributari: s.debitiTributari,
    debitiPrevidenziali: s.debitiPrevidenziali,
  };
  // Il debito verso l'ente (previdenziale) e tributario si riduce delle rate pagate.
  const totaleRateEnte = rate.ente.reduce((a, b) => a + b, 0);

  for (let i = 0; i < orizzonte; i++) {
    const anno = s.anno + 1 + i;
    const ip = (r: RigaInput) => ipotesi[r]?.[i] ?? null;
    const ricaviVendite = applica(prev.ricaviVendite, ip('ricaviVendite'), false);
    const altriRicavi = applica(prev.altriRicavi, ip('altriRicavi'), false);
    const costiOperativi = applica(prev.costiOperativi, ip('costiOperativi'), false);
    const ammortamenti = applica(prev.ammortamenti, ip('ammortamenti'), false);
    const oneriFinanziari = applica(prev.oneriFinanziari, ip('oneriFinanziari'), false);
    const aliquota = ip('aliquotaImposte') ? ip('aliquotaImposte')!.valore : prev.aliquota;
    const investimenti = applica(0, ip('investimenti'), true);
    const apportiSoci = applica(0, ip('apportiSoci'), true);
    const creditiClienti = applica(prev.creditiClienti, ip('creditiClienti'), false);
    const debitiFornitori = applica(prev.debitiFornitori, ip('debitiFornitori'), false);
    const debitiBanche = applica(prev.debitiBanche, ip('debitiBanche'), false);
    const rateEnte = rate.ente[i] ?? 0;
    const rateAltri = rate.altri[i] ?? 0;

    const valoreProduzione = ricaviVendite + altriRicavi;
    const ebitda = valoreProduzione - costiOperativi;
    const ebit = ebitda - ammortamenti;
    const utileAnteImposte = ebit - oneriFinanziari;
    const imposte = utileAnteImposte > 0 ? (utileAnteImposte * aliquota) / 100 : 0;
    const utile = utileAnteImposte - imposte;

    // Flusso di gestione: EBITDA - oneri - imposte - variazione del circolante.
    const varCrediti = creditiClienti - prev.creditiClienti;
    const varFornitori = debitiFornitori - prev.debitiFornitori;
    const flussoGestione = ebitda - oneriFinanziari - imposte - varCrediti + varFornitori;
    const rimborsiBanche = prev.debitiBanche - debitiBanche; // positivo se si rimborsa
    const flussoNetto =
      flussoGestione - rateEnte - rateAltri - rimborsiBanche - investimenti + apportiSoci;
    const disponibilita = prev.disponibilita + flussoNetto;
    const immobilizzazioni = Math.max(0, prev.immobilizzazioni + investimenti - ammortamenti);
    const patrimonioNetto = prev.patrimonioNetto + utile + apportiSoci;
    // Il debito previdenziale si riduce delle rate verso l'ente; il tributario
    // delle rate verso gli altri creditori solo per la quota che lo riguarda:
    // qui, in mancanza di dettaglio, resta invariato.
    const debitiPrevidenziali = Math.max(0, prev.debitiPrevidenziali - rateEnte);
    const debitiTributari = prev.debitiTributari;
    const totaleDebiti =
      debitiBanche + debitiFornitori + debitiTributari + debitiPrevidenziali + altriDebiti;
    const totaleAttivo = immobilizzazioni + creditiClienti + disponibilita + altroCircolante;
    const servizio = rateEnte + rateAltri + Math.max(0, rimborsiBanche);
    const coperturaRate = servizio > 0 ? r2(flussoGestione / servizio) : null;

    if (disponibilita < 0)
      vincoli.push({
        anno,
        codice: 'CASSA_NEGATIVA',
        testo: `Cassa negativa a fine ${anno}: ${euro(disponibilita)}.`,
      });
    if (coperturaRate !== null && coperturaRate < 1)
      vincoli.push({
        anno,
        codice: 'RATE_NON_COPERTE',
        testo: `Nel ${anno} il flusso di gestione copre il ${Math.round(coperturaRate * 100)}% delle rate e dei rimborsi.`,
      });
    if (patrimonioNetto < 0 || (capitaleSociale !== null && patrimonioNetto < capitaleSociale))
      vincoli.push({
        anno,
        codice: 'PATRIMONIO_NEGATIVO',
        testo: `Patrimonio netto ${patrimonioNetto < 0 ? 'negativo' : 'sotto il capitale sociale'} a fine ${anno}: ${euro(patrimonioNetto)}.`,
      });
    if (utile < 0)
      vincoli.push({
        anno,
        codice: 'PERDITA',
        testo: `Perdita d’esercizio nel ${anno}: ${euro(utile)}.`,
      });

    anni.push({
      anno,
      ricaviVendite: r2(ricaviVendite),
      altriRicavi: r2(altriRicavi),
      valoreProduzione: r2(valoreProduzione),
      costiOperativi: r2(costiOperativi),
      ammortamenti: r2(ammortamenti),
      ebitda: r2(ebitda),
      ebit: r2(ebit),
      oneriFinanziari: r2(oneriFinanziari),
      utileAnteImposte: r2(utileAnteImposte),
      imposte: r2(imposte),
      utile: r2(utile),
      investimenti: r2(investimenti),
      creditiClienti: r2(creditiClienti),
      debitiFornitori: r2(debitiFornitori),
      debitiBanche: r2(debitiBanche),
      apportiSoci: r2(apportiSoci),
      rateEnte: r2(rateEnte),
      rateAltri: r2(rateAltri),
      flussoGestione: r2(flussoGestione),
      flussoNetto: r2(flussoNetto),
      disponibilitaLiquide: r2(disponibilita),
      immobilizzazioni: r2(immobilizzazioni),
      patrimonioNetto: r2(patrimonioNetto),
      debitiTributari: r2(debitiTributari),
      debitiPrevidenziali: r2(debitiPrevidenziali),
      totaleDebiti: r2(totaleDebiti),
      totaleAttivo: r2(totaleAttivo),
      coperturaRate,
    });
    prev = {
      ricaviVendite,
      altriRicavi,
      costiOperativi,
      ammortamenti,
      oneriFinanziari,
      aliquota,
      creditiClienti,
      debitiFornitori,
      debitiBanche,
      disponibilita,
      immobilizzazioni,
      patrimonioNetto,
      debitiTributari,
      debitiPrevidenziali,
    };
  }

  const cassaMinima = Math.min(...anni.map((a) => a.disponibilitaLiquide));
  const annoPatrimonioPositivo = anni.find((a) => a.patrimonioNetto >= 0)?.anno ?? null;
  const nonCoperti = vincoli.filter((v) => v.codice === 'RATE_NON_COPERTE').length;
  const sintesi = [
    `Piano su ${orizzonte} anni (${anni[0]?.anno}–${anni[anni.length - 1]?.anno}); rate verso l’ente ${euro(totaleRateEnte)} in totale.`,
    vincoli.length === 0
      ? 'Nessun vincolo scattato: cassa mai negativa, rate coperte dal flusso di gestione, patrimonio netto sopra il minimo.'
      : `${vincoli.length} ${vincoli.length === 1 ? 'vincolo scattato' : 'vincoli scattati'}: ${nonCoperti ? `rate non coperte in ${nonCoperti} ${nonCoperti === 1 ? 'anno' : 'anni'}; ` : ''}cassa minima ${euro(cassaMinima)}${annoPatrimonioPositivo ? `; patrimonio netto positivo dal ${annoPatrimonioPositivo}` : '; patrimonio netto mai positivo nell’orizzonte'}.`,
  ].join('\n');
  return { anni, vincoli, cassaMinima: r2(cassaMinima), annoPatrimonioPositivo, sintesi };
}

export function euro(n: number): string {
  return `${Math.round(n).toLocaleString('it-IT')} €`;
}

/**
 * Rate annue dal piano della proposta: per ogni riga, importo offerto
 * (dovuto × percentuale) distribuito sui mesi delle rate, poi sommato per
 * anno del piano. L'ente dello spazio va nelle rate «ente», il resto in «altri».
 */
export function rateDaProposta(
  righe: {
    categoriaCreditore: string;
    importoDovuto: number;
    percentualeOfferta: number;
    numeroRate: number | null;
    modalita: string;
  }[],
  orizzonte: number,
  eEnte: (categoria: string) => boolean
): RatePiano {
  const ente = new Array(orizzonte).fill(0);
  const altri = new Array(orizzonte).fill(0);
  for (const r of righe) {
    const offerto = (r.importoDovuto * r.percentualeOfferta) / 100;
    const mesi = r.modalita === 'RATEALE' && r.numeroRate && r.numeroRate > 0 ? r.numeroRate : 1;
    const rataMese = offerto / mesi;
    const dest = eEnte(r.categoriaCreditore) ? ente : altri;
    for (let m = 0; m < mesi; m++) {
      const anno = Math.floor(m / 12);
      if (anno < orizzonte) dest[anno] += rataMese;
    }
  }
  return { ente: ente.map(r2), altri: altri.map(r2) };
}
