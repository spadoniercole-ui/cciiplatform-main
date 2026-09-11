// src/lib/denunce/analisi.ts
//
// Analisi dell'Elenco denunce (flussi UNIEMENS) e della Lista Inadempienze.
//
// Servono a due cose che finora si chiedevano a mano o non si potevano fare
// affatto:
//
//   1. i CONTRIBUTI DOVUTI nell'anno precedente — il denominatore del 30%
//      dell'art. 25-novies — che prima l'operatore doveva digitare;
//   2. il RITARDO DI OLTRE 90 GIORNI, il terzo requisito della fattispecie,
//      che finora la piattaforma dichiarava sempre "non verificabile".
//
// ---------------------------------------------------------------------------
// LA FINESTRA DEL DOVUTO
//
// Una denuncia si presenta entro l'ultimo giorno del mese SUCCESSIVO al
// periodo di competenza: la denuncia di gennaio scade il 28/29 febbraio.
// Quindi, a una data di verifica, i periodi già dovuti sono quelli la cui
// scadenza è passata.
//
// Esempio (verifica 11/09/2026): luglio scadeva il 31/08, quindi è dovuto;
// agosto scade il 30/09, quindi NON è ancora dovuto e non entra nel conto.
// Senza questa finestra si lavora alla cieca: si sommano periodi non ancora
// esigibili, oppure si ignorano periodi scaduti.
//
// ---------------------------------------------------------------------------
// I BUCHI NON SONO ZERI
//
// Un periodo dentro la finestra che non compare nel file non vale zero: è una
// DENUNCIA NON PRESENTATA, e di per sé è un segnale. Viene elencato a parte,
// mai sommato come se fosse un importo nullo.
//
// ---------------------------------------------------------------------------
// PERCHÉ NON UNA MEDIA DEI RITARDI
//
// Una media nasconde esattamente i casi che contano: dieci periodi puntuali e
// uno in ritardo di 300 giorni danno una media di 30 giorni, sotto soglia. Ma
// la norma guarda il singolo versamento in ritardo, non la condotta media.
// Si contano perciò i periodi oltre i 90 giorni e il loro importo; la media
// resta disponibile come informazione di contesto sulla condotta, non come
// test.

/** Una riga dell'Elenco denunce, già letta dal foglio. */
export interface RigaDenuncia {
  /** Periodo di competenza, formato MM/AAAA. */
  periodo: string;
  /** Data di presentazione della denuncia (ISO o dd/mm/yyyy). */
  dataPresentazione: string | null;
  /** Saldo (debito - credito) del periodo. */
  saldo: number;
}

/** Una riga della Lista Inadempienze. */
export interface RigaInadempienza {
  /** Inizio periodo, formato AAAA/MM. */
  inizioPeriodo: string;
  importoAddebitato: number;
  importoAccreditato: number;
}

export interface PeriodoDovuto {
  periodo: string;
  anno: number;
  mese: number;
  saldo: number;
  scadenzaLegale: string;
  dataPresentazione: string | null;
  /** Giorni fra scadenza legale e presentazione; null se non presentata. */
  giorniRitardo: number | null;
}

export interface AnalisiDenunce {
  /** Contributi dovuti per anno, sui soli periodi già esigibili. */
  dovutoPerAnno: Record<number, number>;
  /** Periodi dentro la finestra ma assenti dal file: denunce non presentate. */
  periodiMancanti: string[];
  /** Ultimo periodo esigibile alla data di verifica. */
  ultimoPeriodoDovuto: string;
  periodi: PeriodoDovuto[];
  /** Periodi presentati oltre i 90 giorni dalla scadenza legale. */
  oltre90Giorni: PeriodoDovuto[];
  /** Importo complessivo dei periodi oltre i 90 giorni. */
  importoOltre90Giorni: number;
  /** Media dei ritardi, solo come contesto: NON è il test. */
  ritardoMedioGiorni: number | null;
}

/** Ultimo giorno del mese successivo al periodo: la scadenza di legge. */
export function scadenzaLegale(anno: number, mese: number): Date {
  // Mese successivo: giorno 0 del mese +2 = ultimo giorno del mese +1.
  return new Date(Date.UTC(anno, mese + 1, 0));
}

function leggiData(v: string | null): Date | null {
  if (!v) return null;
  const it = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (it) return new Date(Date.UTC(Number(it[3]), Number(it[2]) - 1, Number(it[1])));
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function scomponi(periodo: string): { anno: number; mese: number } | null {
  const m = periodo.trim().match(/^(\d{1,2})\/(\d{4})$/);
  if (m) return { anno: Number(m[2]), mese: Number(m[1]) };
  const a = periodo.trim().match(/^(\d{4})\/(\d{1,2})$/);
  if (a) return { anno: Number(a[1]), mese: Number(a[2]) };
  return null;
}

const GIORNI = 86_400_000;

export function analizzaDenunce(
  righe: RigaDenuncia[],
  dataVerifica: Date,
  /** Da quale anno considerare i periodi mancanti. Default: anno precedente. */
  annoDa?: number
): AnalisiDenunce {
  // Ultimo periodo la cui scadenza è già passata alla data di verifica.
  let ultimoAnno = dataVerifica.getUTCFullYear();
  let ultimoMese = dataVerifica.getUTCMonth() + 1;
  // Il periodo del mese scorso scade a fine mese corrente: non è ancora
  // dovuto. Si torna indietro finché la scadenza non è passata.
  while (scadenzaLegale(ultimoAnno, ultimoMese) >= dataVerifica) {
    ultimoMese -= 1;
    if (ultimoMese === 0) {
      ultimoMese = 12;
      ultimoAnno -= 1;
    }
  }

  const dovutoPerAnno: Record<number, number> = {};
  const periodi: PeriodoDovuto[] = [];
  const presenti = new Set<string>();

  for (const r of righe) {
    const p = scomponi(r.periodo);
    if (!p) continue;
    // Fuori finestra: periodo non ancora esigibile.
    if (p.anno > ultimoAnno || (p.anno === ultimoAnno && p.mese > ultimoMese)) continue;

    presenti.add(`${p.anno}-${p.mese}`);
    dovutoPerAnno[p.anno] = (dovutoPerAnno[p.anno] ?? 0) + r.saldo;

    const scad = scadenzaLegale(p.anno, p.mese);
    const pres = leggiData(r.dataPresentazione);
    periodi.push({
      periodo: r.periodo,
      anno: p.anno,
      mese: p.mese,
      saldo: r.saldo,
      scadenzaLegale: scad.toISOString().slice(0, 10),
      dataPresentazione: pres ? pres.toISOString().slice(0, 10) : null,
      giorniRitardo: pres
        ? Math.max(0, Math.round((pres.getTime() - scad.getTime()) / GIORNI))
        : null,
    });
  }

  // Periodi attesi e mancanti, dall'anno indicato fino all'ultimo esigibile.
  const daAnno = annoDa ?? ultimoAnno - 1;
  const periodiMancanti: string[] = [];
  for (let a = daAnno; a <= ultimoAnno; a++) {
    const fine = a === ultimoAnno ? ultimoMese : 12;
    for (let m = 1; m <= fine; m++) {
      if (!presenti.has(`${a}-${m}`)) {
        periodiMancanti.push(`${String(m).padStart(2, '0')}/${a}`);
      }
    }
  }

  const oltre90 = periodi.filter((p) => (p.giorniRitardo ?? 0) > 90);
  const conRitardo = periodi.filter((p) => p.giorniRitardo !== null);

  return {
    dovutoPerAnno,
    periodiMancanti,
    ultimoPeriodoDovuto: `${String(ultimoMese).padStart(2, '0')}/${ultimoAnno}`,
    periodi,
    oltre90Giorni: oltre90,
    importoOltre90Giorni: oltre90.reduce((s, p) => s + p.saldo, 0),
    ritardoMedioGiorni:
      conRitardo.length === 0
        ? null
        : Math.round(
            conRitardo.reduce((s, p) => s + (p.giorniRitardo ?? 0), 0) / conRitardo.length
          ),
  };
}

export interface AnalisiInadempienze {
  /** Netto per anno. Un anno con accrediti superiori NON scende sotto zero. */
  nettoPerAnno: Record<number, number>;
  /** Somma dei netti annuali positivi: il debito complessivo non versato. */
  totaleNonVersato: number;
  /** Anni in cui gli accrediti superano gli addebiti: da segnalare, non da sottrarre. */
  anniConSaldoNegativo: number[];
}

/**
 * Il netto di un anno non scende mai sotto zero, e il totale somma solo i
 * netti positivi.
 *
 * Se un anno chiude con accrediti superiori agli addebiti — succede: 2022 nel
 * campione reale — sottrarre quel negativo dal totale significherebbe far
 * cancellare da un accredito del 2022 un debito del 2025. Sono partite
 * diverse, e compensarle darebbe un non versato più basso del vero.
 */
export function analizzaInadempienze(righe: RigaInadempienza[]): AnalisiInadempienze {
  const netto: Record<number, number> = {};
  for (const r of righe) {
    const p = scomponi(r.inizioPeriodo);
    if (!p) continue;
    netto[p.anno] = (netto[p.anno] ?? 0) + (r.importoAddebitato - r.importoAccreditato);
  }
  const anniNeg = Object.entries(netto)
    .filter(([, v]) => v < 0)
    .map(([a]) => Number(a));
  const totale = Object.values(netto).reduce((s, v) => s + Math.max(0, v), 0);
  return { nettoPerAnno: netto, totaleNonVersato: totale, anniConSaldoNegativo: anniNeg };
}

// ---------------------------------------------------------------------------
// VERSAMENTI (Elenco Deleghe — F24)
//
// È la fonte che mancava per il terzo requisito dell'art. 25-novies. Il file
// delle denunce dà la data di PRESENTAZIONE del flusso, che misura la
// condotta dichiarativa: un'azienda può presentare tutte le denunce
// puntualmente e non versare un euro. La norma parla di ritardo nel
// VERSAMENTO, e il versamento sta qui.
//
// DUE SCADENZE DIVERSE, da non confondere:
//   - VERSAMENTO F24: il 16 del mese successivo al periodo;
//   - DENUNCIA UNIEMENS: l'ultimo giorno del mese successivo.
//
// COSA SI ESCLUDE, e perché conta:
//   - codice tributo diverso da DM10 — le rettifiche (DMR) correggono i DM
//     ma non sono versamenti della gestione;
//   - righe STORNATE o con esito "Altre gestioni" — sono importi ripartiti su
//     gestioni diverse dalla DM. Nel campione reale sono 49.006 €, di cui
//     29.620 € su un solo periodo: contarli avrebbe fatto risultare pagato
//     ciò che pagato non era.

/** Una riga dell'Elenco Deleghe, già letta dal foglio. */
export interface RigaDelega {
  /** Periodo di competenza, formato M/AAAA o MM/AAAA. */
  periodo: string;
  dataVersamento: string | null;
  importo: number;
  codiceTributo: string;
  esito: string | null;
  stato: string | null;
}

export interface PeriodoConfronto {
  periodo: string;
  anno: number;
  mese: number;
  dovuto: number;
  versato: number;
  /** Mai negativo: un versamento in eccesso non genera un credito qui. */
  residuo: number;
  scadenzaVersamento: string;
  /** Ultimo versamento valido attribuito al periodo. */
  ultimoVersamento: string | null;
  /** Giorni fra scadenza e ultimo versamento; null se mai versato. */
  giorniRitardo: number | null;
  /** Nessun versamento valido: il ritardo è in corso, non misurabile. */
  maiVersato: boolean;
}

export interface AnalisiVersamenti {
  periodi: PeriodoConfronto[];
  /**
   * Somma dei residui, ricostruita incrociando dovuto e versato.
   *
   * NON È UTILIZZABILE COME DEBITO COMPLESSIVO nel test dell'art. 25-novies,
   * e non va mostrata come cifra di debito. È una grandezza che l'ente non
   * ha mai certificato: esiste solo qui. Il debito complessivo è quello
   * della Lista Inadempienze, che l'INPS dichiara.
   *
   * Resta calcolata per un solo scopo: rilevare uno SCOSTAMENTO fra ciò che
   * risulta non versato dai file e ciò che l'ente ha già lavorato. Uno
   * scarto ampio dice che c'è del non ancora trattato — è un'informazione di
   * contesto, non un numero su cui fondare un giudizio.
   */
  residuoRicostruito: number;
  /** Periodi il cui versamento è avvenuto oltre 90 giorni dalla scadenza. */
  oltre90Giorni: PeriodoConfronto[];
  /** Periodi dovuti e mai versati: ritardo in corso, per definizione oltre soglia. */
  maiVersati: PeriodoConfronto[];
  /**
   * Contributi DOVUTI (saldo delle denunce, dato ufficiale) dei periodi in
   * ritardo. Aggregazione di importi certificati, non una ricostruzione.
   */
  dovutoInRitardo: number;
  /** Righe scartate e perché: si dichiara ciò che non si è contato. */
  scartate: { righe: number; importo: number; motivo: string }[];
}

/** Scadenza del versamento F24: il 16 del mese successivo al periodo. */
export function scadenzaVersamento(anno: number, mese: number): Date {
  return mese === 12 ? new Date(Date.UTC(anno + 1, 0, 16)) : new Date(Date.UTC(anno, mese, 16));
}

export function analizzaVersamenti(
  denunce: RigaDenuncia[],
  deleghe: RigaDelega[],
  dataVerifica: Date
): AnalisiVersamenti {
  const valide: RigaDelega[] = [];
  let nonDm = { righe: 0, importo: 0 };
  let storni = { righe: 0, importo: 0 };

  for (const d of deleghe) {
    if (
      !String(d.codiceTributo ?? '')
        .toUpperCase()
        .startsWith('DM10')
    ) {
      nonDm = { righe: nonDm.righe + 1, importo: nonDm.importo + d.importo };
      continue;
    }
    const stornata =
      String(d.stato ?? '').toUpperCase() === 'STORNATO' ||
      String(d.esito ?? '').toUpperCase() === 'ALTRE GESTIONI';
    if (stornata) {
      storni = { righe: storni.righe + 1, importo: storni.importo + d.importo };
      continue;
    }
    valide.push(d);
  }

  const analisiDen = analizzaDenunce(denunce, dataVerifica);
  const versatoPer = new Map<string, { importo: number; ultima: Date | null }>();
  for (const d of valide) {
    const p = scomponi(d.periodo);
    if (!p) continue;
    const k = `${p.anno}-${p.mese}`;
    const corrente = versatoPer.get(k) ?? { importo: 0, ultima: null };
    const data = leggiData(d.dataVersamento);
    versatoPer.set(k, {
      importo: corrente.importo + d.importo,
      ultima: data && (!corrente.ultima || data > corrente.ultima) ? data : corrente.ultima,
    });
  }

  const periodi: PeriodoConfronto[] = analisiDen.periodi.map((p) => {
    const v = versatoPer.get(`${p.anno}-${p.mese}`) ?? { importo: 0, ultima: null };
    const scad = scadenzaVersamento(p.anno, p.mese);
    const maiVersato = v.importo <= 0 || v.ultima === null;
    return {
      periodo: p.periodo,
      anno: p.anno,
      mese: p.mese,
      dovuto: p.saldo,
      versato: v.importo,
      residuo: Math.max(0, p.saldo - v.importo),
      scadenzaVersamento: scad.toISOString().slice(0, 10),
      ultimoVersamento: v.ultima ? v.ultima.toISOString().slice(0, 10) : null,
      giorniRitardo: v.ultima
        ? Math.max(0, Math.round((v.ultima.getTime() - scad.getTime()) / GIORNI))
        : null,
      maiVersato,
    };
  });

  // Un periodo mai versato non ha "giorni di ritardo" misurabili, ma il
  // ritardo c'è ed è in corso: se la scadenza è passata da più di 90 giorni
  // il requisito è soddisfatto, e trattarlo come non calcolabile
  // significherebbe perdere proprio i casi peggiori.
  const scadutoDa = (p: PeriodoConfronto) =>
    Math.round((dataVerifica.getTime() - new Date(p.scadenzaVersamento).getTime()) / GIORNI);

  const oltre90 = periodi.filter((p) => !p.maiVersato && (p.giorniRitardo ?? 0) > 90);
  const maiVersati = periodi.filter((p) => p.maiVersato && p.residuo > 0 && scadutoDa(p) > 90);

  const scartate: AnalisiVersamenti['scartate'] = [];
  if (nonDm.righe > 0) {
    scartate.push({
      righe: nonDm.righe,
      importo: nonDm.importo,
      motivo: 'Codice tributo diverso da DM10 (rettifiche e altre gestioni).',
    });
  }
  if (storni.righe > 0) {
    scartate.push({
      righe: storni.righe,
      importo: storni.importo,
      motivo: 'Righe stornate o ripartite su altre gestioni.',
    });
  }

  return {
    periodi,
    residuoRicostruito: periodi.reduce((s, p) => s + p.residuo, 0),
    oltre90Giorni: oltre90,
    maiVersati,
    dovutoInRitardo: [...oltre90, ...maiVersati].reduce((s, p) => s + p.dovuto, 0),
    scartate,
  };
}
