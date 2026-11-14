// src/lib/flussiEnte/congruenza.ts
//
// ATTESI CONTRO RICEVUTI, PERIODO PER PERIODO.
//
// Il profilo dell'ente dice quanti flussi doveva ricevere in un arco di tempo;
// i dati in archivio dicono quanti ne ha ricevuti davvero. Il confronto non è
// un totale contro un totale — due numeri che tornano possono nascondere un
// periodo mancante compensato da un altro — ma periodo contro periodo: si
// elencano i mesi attesi senza denuncia, quelli senza pagamento, quelli fuori
// dal perimetro del profilo e quelli coperti da una sospensione.
//
// LE REGOLARIZZAZIONI. Un periodo può non avere una denuncia o una delega
// perché la partita è già passata in «TS 27 — flusso Uniemens non versato» o
// all'Agente della Riscossione: non è un flusso mai arrivato, è un flusso
// arrivato per un'altra strada. Questi periodi non si contano fra i mancanti:
// si elencano a parte, con la voce che li copre, così chi legge sa dove sono
// finiti.
//
// I RITARDI. Per i flussi mancanti il ritardo si misura dalla scadenza alla
// data della verifica, ed è un numero vero. Per quelli presenti il file non
// porta la data di trasmissione né quella di versamento: il ritardo non è
// calcolabile, e la piattaforma lo dichiara invece di dedurlo.

import {
  meseSuccessivo,
  periodiAttesi,
  periodoValido,
  scadenzaDenuncia,
  scadenzaPagamento,
  type ProfiloFlusso,
} from './profilo';

/** Famiglia di un flusso: la denuncia o il pagamento. */
export type FamigliaFlusso = 'DENUNCIA' | 'PAGAMENTO';

export interface RigaFlusso {
  /** Periodo di competenza come lo scrive il file: «202506 - 202506». */
  periodo: string;
  /** La natura della voce: «Denunce non trasmesse», «F24 non presentato»… */
  voce: string;
}

export interface SospensioneFlusso {
  /** Primo mese sospeso, «AAAA-MM». */
  dal: string;
  /** Ultimo mese sospeso, «AAAA-MM». */
  al: string;
  motivo: string;
}

export interface PeriodoScoperto {
  periodo: string;
  tipo: FamigliaFlusso;
  /** Giorni fra la scadenza e la data della verifica. */
  giorni: number;
  scadenza: string;
}

export interface PeriodoRegolarizzato {
  periodo: string;
  tipo: FamigliaFlusso;
  /** La voce che lo copre: «TS 27 - flusso Uniemens non versato», una cartella… */
  voce: string;
}

export interface EsitoCongruenza {
  /** L'ente a cui il flusso appartiene. */
  ente: string;
  flusso: string;
  etichette: { denuncia: string; pagamento: string };
  dal: string;
  al: string;
  /** Periodi attesi nel perimetro, sospensioni escluse. */
  attesi: number;
  /** I mesi esclusi perché la matricola era sospesa. */
  sospesi: string[];
  denunce: number;
  deleghe: number;
  senzaDenuncia: string[];
  senzaDelega: string[];
  /** Periodi fuori dal perimetro del profilo ma presenti nei dati. */
  fuoriPerimetro: { denunce: string[]; deleghe: string[] };
  regolarizzati: PeriodoRegolarizzato[];
  scoperte: PeriodoScoperto[];
  /** Tutti i periodi attesi hanno denuncia e pagamento (o una regolarizzazione). */
  completo: boolean;
  /** Perché il ritardo non si misura sui flussi presenti. */
  notaRitardi: string;
}

const SOGLIA_REGOLARIZZAZIONE = /ts\s*0?27|riscossione|cartella|ruolo|avviso di addebito/i;

/**
 * La famiglia di una riga, dalla natura della voce. Le due famiglie non si
 * deducono dal file — la certificazione dei debiti non distingue «denuncia» e
 * «pagamento» come colonne — ma dalla voce, che è il modo in cui l'ente le
 * nomina da sempre.
 */
export function famigliaDaVoce(voce: string): FamigliaFlusso | null {
  const v = (voce ?? '').trim();
  if (!v) return null;
  if (/denunc|uniemens|dm ?10|autodichiaraz/i.test(v)) return 'DENUNCIA';
  if (/f24|deleg|versament|premio|rata/i.test(v)) return 'PAGAMENTO';
  return null;
}

/**
 * Il periodo di competenza dentro il testo del file: «202506 - 202506»,
 * «2025-06», «06/2025». null quando il periodo non si legge — e allora la
 * riga non entra in nessun conteggio, invece di finire al mese zero.
 */
export function periodoDaTesto(testo: string | null | undefined): string | null {
  const t = (testo ?? '').trim();
  if (!t) return null;
  const compatto = /^(\d{4})(\d{2})/.exec(t);
  if (compatto) {
    const p = `${compatto[1]}-${compatto[2]}`;
    return periodoValido(p);
  }
  const trattino = /^(\d{4})-(\d{2})/.exec(t);
  if (trattino) return periodoValido(`${trattino[1]}-${trattino[2]}`);
  const barrato = /^(\d{1,2})\/(\d{4})/.exec(t);
  if (barrato) {
    return periodoValido(`${barrato[2]}-${barrato[1].padStart(2, '0')}`);
  }
  return null;
}

/** Tutti i mesi coperti dalle sospensioni, estremi compresi. */
export function mesiSospesi(sospensioni: SospensioneFlusso[]): string[] {
  const out: string[] = [];
  for (const s of sospensioni) {
    const dal = periodoValido(s.dal);
    const al = periodoValido(s.al);
    if (!dal || !al || dal > al) continue;
    let p = dal;
    // Il ciclo è limitato dai due estremi: nessuna sospensione può generare
    // un elenco infinito, nemmeno se i dati sono sbagliati.
    while (p <= al) {
      out.push(p);
      p = meseSuccessivo(p, 1);
    }
  }
  return [...new Set(out)].sort();
}

const giorniFra = (da: string, a: string): number => {
  const inizio = new Date(`${da}T00:00:00Z`).getTime();
  const fine = new Date(`${a}T00:00:00Z`).getTime();
  if (Number.isNaN(inizio) || Number.isNaN(fine)) return 0;
  return Math.floor((fine - inizio) / 86_400_000);
};

const NOTA_RITARDI =
  'Il file della certificazione dei debiti non porta la data di trasmissione della denuncia né quella del versamento: per i flussi presenti il ritardo non è calcolabile. Per i periodi mancanti il ritardo si misura dalla scadenza alla data della verifica.';

/**
 * L'esito del confronto. Non esprime giudizi: dice quante denunce e quante
 * deleghe sono arrivate, quali periodi restano scoperti e da quanti giorni.
 */
export function congruenzaFlussi(input: {
  profilo: ProfiloFlusso;
  righe: RigaFlusso[];
  sospensioni?: SospensioneFlusso[];
  dal: string;
  al: string;
  dataVerifica: string;
}): EsitoCongruenza {
  const { profilo, righe, dal, al, dataVerifica } = input;
  const sospesi = mesiSospesi(input.sospensioni ?? []);
  const attesi = periodiAttesi(profilo, dal, al, sospesi);
  const insiemeAttesi = new Set(attesi);

  const denunce = new Set<string>();
  const deleghe = new Set<string>();
  const regolarizzazioni = new Map<string, PeriodoRegolarizzato>();
  const fuoriDenunce: string[] = [];
  const fuoriDeleghe: string[] = [];

  for (const riga of righe) {
    const famiglia = famigliaDaVoce(riga.voce);
    if (!famiglia) continue;
    const periodo = periodoDaTesto(riga.periodo);
    if (!periodo) continue;

    if (SOGLIA_REGOLARIZZAZIONE.test(riga.voce) && attesi.length > 0) {
      regolarizzazioni.set(`${famiglia}:${periodo}`, {
        periodo,
        tipo: famiglia,
        voce: riga.voce.trim(),
      });
      continue;
    }

    if (famiglia === 'DENUNCIA') {
      denunce.add(periodo);
      if (!insiemeAttesi.has(periodo)) fuoriDenunce.push(periodo);
    } else {
      deleghe.add(periodo);
      if (!insiemeAttesi.has(periodo)) fuoriDeleghe.push(periodo);
    }
  }

  const regolarizzati: PeriodoRegolarizzato[] = [];
  const senzaDenuncia: string[] = [];
  const senzaDelega: string[] = [];
  const scoperte: PeriodoScoperto[] = [];

  for (const periodo of attesi) {
    if (!denunce.has(periodo)) {
      const reg = regolarizzazioni.get(`DENUNCIA:${periodo}`);
      if (reg) regolarizzati.push(reg);
      else senzaDenuncia.push(periodo);
    }
    if (!deleghe.has(periodo)) {
      const reg = regolarizzazioni.get(`PAGAMENTO:${periodo}`);
      if (reg) regolarizzati.push(reg);
      else senzaDelega.push(periodo);
    }
  }

  for (const periodo of senzaDenuncia) {
    const scad = scadenzaDenuncia(profilo, periodo);
    if (!scad) continue;
    const giorni = giorniFra(scad, dataVerifica);
    if (giorni >= 0) scoperte.push({ periodo, tipo: 'DENUNCIA', giorni, scadenza: scad });
  }
  for (const periodo of senzaDelega) {
    const scad = scadenzaPagamento(profilo, periodo);
    if (!scad) continue;
    const giorni = giorniFra(scad, dataVerifica);
    if (giorni >= 0) scoperte.push({ periodo, tipo: 'PAGAMENTO', giorni, scadenza: scad });
  }

  scoperte.sort((a, b) => b.giorni - a.giorni || a.periodo.localeCompare(b.periodo));

  return {
    ente: profilo.enteNome,
    flusso: profilo.flusso,
    etichette: { denuncia: profilo.etichettaDenuncia, pagamento: profilo.etichettaPagamento },
    dal,
    al,
    attesi: attesi.length,
    sospesi,
    denunce: denunce.size,
    deleghe: deleghe.size,
    senzaDenuncia,
    senzaDelega,
    fuoriPerimetro: {
      denunce: [...new Set(fuoriDenunce)].sort(),
      deleghe: [...new Set(fuoriDeleghe)].sort(),
    },
    regolarizzati,
    scoperte,
    completo:
      attesi.length > 0 &&
      senzaDenuncia.length === 0 &&
      senzaDelega.length === 0 &&
      fuoriDenunce.length === 0 &&
      fuoriDeleghe.length === 0,
    notaRitardi: NOTA_RITARDI,
  };
}
