// src/lib/flussiEnte/profilo.ts
//
// IL FLUSSO CHE L'ENTE RICEVE DALL'AZIENDA, COME PARAMETRO.
//
// Fino a qui la piattaforma conosceva una sola regola di scadenza, scritta nel
// codice: il versamento del periodo «AAAAMM» scade il 16 del mese successivo
// (`debitiEnte/scopertura.ts`). È la regola INPS dei contributi, e vale per
// l'INPS: applicarla a un ente che riceve una denuncia annuale, o premi INAIL
// frazionati in quattro rate, misura ritardi su un calendario che non esiste.
//
// Qui il calendario diventa un dato dell'ente: che cosa riceve dall'azienda
// (denunce e pagamenti), con quale periodicità, entro quale giorno del mese
// successivo, e in quante rate si paga. Da questo profilo il motore ricava i
// periodi ATTESI e le scadenze, e quindi i ritardi.
//
// I valori predefiniti sono un PUNTO DI PARTENZA, non una fonte normativa:
// l'operatore li conferma o li corregge, e quelli restano. La piattaforma
// dichiara il calendario che sta usando invece di farlo passare per legge.

export type Periodicita = 'MENSILE' | 'TRIMESTRALE' | 'ANNUALE';

export type TipoFlusso = 'INPS' | 'INAIL' | 'AGENZIA_ENTRATE' | 'ALTRO';

export interface ProfiloFlusso {
  id: number;
  /** L'ente a cui il flusso appartiene (tabella `enti` dello spazio). */
  enteId: number | null;
  /** Il nome dell'ente, per leggere il profilo senza un'altra query. */
  enteNome: string;
  tipo: TipoFlusso;
  /** Il nome del flusso come lo chiama l'ente: «UNIEMENS», «Autoliquidazione premi». */
  flusso: string;
  /** Come si chiama la denuncia: «denunce UNIEMENS», «autodichiarazione». */
  etichettaDenuncia: string;
  /** Come si chiama il pagamento: «deleghe F24», «rate del premio». */
  etichettaPagamento: string;
  periodicita: Periodicita;
  /** Quante denunce cadono in un anno solare (INPS: 11, gennaio-novembre). */
  periodiPerAnno: number;
  /** Giorno del mese in cui scade la denuncia; 0 = ultimo giorno del mese. */
  scadenzaDenunciaGiorno: number;
  /** Quanti mesi dopo il periodo di competenza scade la denuncia. */
  scadenzaDenunciaMesiDopo: number;
  /** Giorno del mese in cui scade il pagamento; 0 = ultimo giorno del mese. */
  scadenzaPagamentoGiorno: number;
  /** Quanti mesi dopo il periodo di competenza scade il pagamento. */
  scadenzaPagamentoMesiDopo: number;
  /** In quante rate si fraziona il pagamento (1 = una sola). */
  rate: number;
  attivo: boolean;
}

/** Giorno convenzionale «ultimo del mese»: il 30/31, che cambia con il calendario. */
export const ULTIMO_GIORNO = 0;

export const PERIODICITA: { codice: Periodicita; etichetta: string }[] = [
  { codice: 'MENSILE', etichetta: 'Mensile' },
  { codice: 'TRIMESTRALE', etichetta: 'Trimestrale' },
  { codice: 'ANNUALE', etichetta: 'Annuale' },
];

export const TIPI_FLUSSO: { codice: TipoFlusso; etichetta: string }[] = [
  { codice: 'INPS', etichetta: 'INPS' },
  { codice: 'INAIL', etichetta: 'INAIL' },
  { codice: 'AGENZIA_ENTRATE', etichetta: 'Agenzia delle Entrate' },
  { codice: 'ALTRO', etichetta: 'Altro ente' },
];

/**
 * I profili proposti quando lo spazio non ne ha ancora nessuno. Restano
 * modificabili: sono il modo più rapido per partire da un calendario
 * plausibile, non un'affermazione su come stiano le cose per legge.
 */
/** Un profilo senza i dati che dipendono dallo spazio (id ed ente). */
export type ProfiloFlussoBase = Omit<ProfiloFlusso, 'id' | 'enteId' | 'enteNome'>;

export const PROFILI_PREDEFINITI: ProfiloFlussoBase[] = [
  {
    tipo: 'INPS',
    flusso: 'UNIEMENS',
    etichettaDenuncia: 'denunce UNIEMENS',
    etichettaPagamento: 'deleghe F24',
    periodicita: 'MENSILE',
    // Gennaio-novembre: la denuncia di dicembre si trasmette a gennaio, quindi
    // nell'anno solare le denunce presentate sono undici.
    periodiPerAnno: 11,
    scadenzaDenunciaGiorno: ULTIMO_GIORNO,
    scadenzaDenunciaMesiDopo: 1,
    scadenzaPagamentoGiorno: 15,
    scadenzaPagamentoMesiDopo: 1,
    rate: 1,
    attivo: true,
  },
  {
    tipo: 'INAIL',
    flusso: 'Autoliquidazione premi',
    etichettaDenuncia: 'autodichiarazione dei premi',
    etichettaPagamento: 'rate del premio',
    periodicita: 'ANNUALE',
    periodiPerAnno: 1,
    scadenzaDenunciaGiorno: ULTIMO_GIORNO,
    scadenzaDenunciaMesiDopo: 2,
    scadenzaPagamentoGiorno: 16,
    scadenzaPagamentoMesiDopo: 2,
    rate: 4,
    attivo: false,
  },
  {
    tipo: 'AGENZIA_ENTRATE',
    flusso: 'Dichiarazioni annuali',
    etichettaDenuncia: 'dichiarazioni annuali',
    etichettaPagamento: 'versamenti',
    periodicita: 'ANNUALE',
    periodiPerAnno: 1,
    scadenzaDenunciaGiorno: 30,
    scadenzaDenunciaMesiDopo: 11,
    scadenzaPagamentoGiorno: 30,
    scadenzaPagamentoMesiDopo: 11,
    rate: 1,
    attivo: false,
  },
  {
    tipo: 'AGENZIA_ENTRATE',
    flusso: 'Liquidazioni IVA periodiche',
    etichettaDenuncia: 'liquidazioni periodiche',
    etichettaPagamento: 'versamenti IVA',
    periodicita: 'MENSILE',
    periodiPerAnno: 12,
    scadenzaDenunciaGiorno: ULTIMO_GIORNO,
    scadenzaDenunciaMesiDopo: 1,
    scadenzaPagamentoGiorno: 16,
    scadenzaPagamentoMesiDopo: 1,
    rate: 1,
    attivo: false,
  },
];

/** I mesi di competenza di un anno, secondo la periodicità. */
export function mesiDiCompetenza(
  profilo: Pick<ProfiloFlusso, 'periodicita' | 'periodiPerAnno'>
): number[] {
  if (profilo.periodicita === 'ANNUALE') return [12];
  if (profilo.periodicita === 'TRIMESTRALE') {
    return [3, 6, 9, 12].slice(0, Math.min(4, Math.max(1, profilo.periodiPerAnno)));
  }
  const quanti = Math.min(12, Math.max(1, profilo.periodiPerAnno));
  return Array.from({ length: quanti }, (_, i) => i + 1);
}

const rxPeriodo = /^(\d{4})-(\d{2})$/;

export function periodoValido(periodo: string | null | undefined): string | null {
  const p = (periodo ?? '').trim();
  const m = rxPeriodo.exec(p);
  if (!m) return null;
  const mese = Number(m[2]);
  if (mese < 1 || mese > 12) return null;
  return p;
}

export function meseSuccessivo(periodo: string, mesi: number): string {
  const [anno, mese] = periodo.split('-').map(Number);
  const d = new Date(Date.UTC(anno, mese - 1 + mesi, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * La scadenza di un periodo: il mese di competenza, spostato in avanti, al
 * giorno indicato. `ULTIMO_GIORNO` diventa il 28/29/30/31 che quel mese ha.
 */
export function scadenza(periodo: string, mesiDopo: number, giorno: number): string | null {
  const p = periodoValido(periodo);
  if (!p) return null;
  const mese = meseSuccessivo(p, mesiDopo);
  const [anno, m] = mese.split('-').map(Number);
  const ultimo = new Date(Date.UTC(anno, m, 0)).getUTCDate();
  const g = giorno === ULTIMO_GIORNO ? ultimo : Math.min(Math.max(1, giorno), ultimo);
  return `${mese}-${String(g).padStart(2, '0')}`;
}

export function scadenzaDenuncia(profilo: ProfiloFlusso, periodo: string): string | null {
  return scadenza(periodo, profilo.scadenzaDenunciaMesiDopo, profilo.scadenzaDenunciaGiorno);
}

export function scadenzaPagamento(profilo: ProfiloFlusso, periodo: string): string | null {
  return scadenza(periodo, profilo.scadenzaPagamentoMesiDopo, profilo.scadenzaPagamentoGiorno);
}

/**
 * I periodi di competenza attesi fra due mesi (compresi), saltando i mesi di
 * sospensione della matricola: in quei mesi non c'è obbligo di denuncia né di
 * versamento, quindi non sono «mancanti», sono fuori perimetro.
 */
export function periodiAttesi(
  profilo: ProfiloFlusso,
  dal: string,
  al: string,
  sospesi: string[] = []
): string[] {
  const inizio = periodoValido(dal);
  const fine = periodoValido(al);
  if (!inizio || !fine || inizio > fine) return [];
  const competenza = new Set(mesiDiCompetenza(profilo));
  const esclusi = new Set(sospesi);
  const out: string[] = [];
  let [anno, mese] = inizio.split('-').map(Number);
  const [annoFine, meseFine] = fine.split('-').map(Number);
  while (anno < annoFine || (anno === annoFine && mese <= meseFine)) {
    const periodo = `${anno}-${String(mese).padStart(2, '0')}`;
    if (competenza.has(mese) && !esclusi.has(periodo)) out.push(periodo);
    mese += 1;
    if (mese > 12) {
      mese = 1;
      anno += 1;
    }
  }
  return out;
}
