// src/lib/piano/levePiano.ts
//
// LE CINQUE LEVE CHE DIVENTANO NUMERI (0.256.35, semplificate nella 0.256.37).
//
// Fino alla 0.256.34 le leve erano testo nel prompt: l'analisi le proponeva,
// la tabella restava ferma, e la stessa riga di ricavi si ripeteva per tutti
// gli anni. Qui la leva diventa una regola deterministica e dichiarata, che si
// applica alle ipotesi già scritte (dall'analisi o dall'operatore):
//
//   PERSONALE    riduce il costo del personale della misura. Il personale segue
//                la quota storica sui costi del percorso scritto, così la riga
//                resta coerente anche quando le ipotesi muovono i costi.
//   TECNOLOGIA   investe la misura dei ricavi dell'anno in immobilizzazioni e
//                le ammortizza in quote costanti su VITA_AMMORTAMENTO anni: i
//                ricavi non salgono per questo, salgono se il percorso li alza.
//   PRODUZIONE   aggiunge la misura dei ricavi di partenza come ricavi nuovi,
//   MERCATI      a regime entro ANNI_RAMPA anni, con i costi e i crediti nella
//   CLIENTELA    stessa incidenza storica del bilancio.
//
// Le leve non si sommano al risultato: riscrivono solo le righe che toccano e
// lasciano le altre ipotesi come sono. Chi calcola il piano applica le ipotesi
// ottenute e non applica di nuovo le leve.
//
// Logica pura, con i suoi test.

import {
  calcolaPiano,
  euro,
  type EsercizioStorico,
  type EsitoPiano,
  type Ipotesi,
  type IpotesiPiano,
  type RatePiano,
} from './piano';
import {
  LEVE,
  LEVE_PREDEFINITE,
  levaAccesa,
  leveDaSalvate,
  type DefinizioneLeva,
  type IdLeva,
  type LeveSimulazione,
  type SceltaLeva,
} from './leveSimulazione';

/** Anni perché una linea o un mercato nuovo renda a regime. */
export const ANNI_RAMPA = 3;
/** Vita utile degli investimenti in tecnologia, in anni. */
export const VITA_AMMORTAMENTO = 5;

const r2 = (n: number) => Math.round(n * 100) / 100;

/** La stessa regola del motore: percentuale sull'anno prima, oppure assoluto. */
function proietta(base: number, ip: Ipotesi | null | undefined, flusso: boolean): number {
  if (!ip) return flusso ? 0 : base;
  if (ip.tipo === 'abs') return ip.valore;
  return base * (1 + ip.valore / 100);
}

export interface EffettoLeva {
  id: IdLeva;
  domanda: string;
  pct: number;
  /** Che cosa fa al piano, in una riga. */
  testo: string;
}

export interface EsitoLeve {
  /** Le ipotesi con dentro l'effetto delle leve (solo le righe toccate). */
  ipotesi: IpotesiPiano;
  effetti: EffettoLeva[];
  /** Che cosa il piano chiede di rinunciare o di anticipare. */
  sacrifici: string[];
  /** Perché una leva accesa non ha prodotto numeri. */
  avvisi: string[];
}

/** Gli anni in cui una leva sui ricavi arriva a regime. */
const rampaDi = (id: IdLeva): number => (id === 'MERCATI' ? 2 : ANNI_RAMPA);

/**
 * Applica le leve alle ipotesi. Senza leve accese restituisce le ipotesi
 * esattamente come sono: nessuna riga si riscrive per nulla.
 */
export function pianoConLeve(input: {
  storico: EsercizioStorico;
  orizzonte: number;
  ipotesi: IpotesiPiano;
  leve: LeveSimulazione;
}): EsitoLeve {
  const { storico: s, orizzonte, ipotesi } = input;
  const accese: { definizione: DefinizioneLeva; scelta: SceltaLeva }[] = [];
  for (const definizione of LEVE) {
    const scelta = input.leve[definizione.id];
    if (levaAccesa(scelta)) accese.push({ definizione, scelta });
  }
  if (accese.length === 0) return { ipotesi, effetti: [], sacrifici: [], avvisi: [] };

  const vocePersonale = accese.find(({ definizione }) => definizione.id === 'PERSONALE');
  const voceTecnologia = accese.find(({ definizione }) => definizione.id === 'TECNOLOGIA');
  const scelteRicavi = accese.filter(
    ({ definizione }) => definizione.id !== 'PERSONALE' && definizione.id !== 'TECNOLOGIA'
  );

  const costiStorici = Math.max(0, s.costiProduzione - s.ammortamenti);

  // Percorso di partenza: le ipotesi scritte, applicate anno per anno con la
  // stessa regola del motore. Su questo percorso si innesta la leva.
  const ricaviBase: number[] = [];
  const costiBase: number[] = [];
  const investimentiBase: number[] = [];
  const ammortamentiBase: number[] = [];
  const creditiBase: number[] = [];
  let ricavi = s.ricaviVendite;
  let costi = costiStorici;
  let investimenti = 0;
  let ammortamenti = s.ammortamenti;
  let crediti = s.creditiClienti;
  for (let i = 0; i < orizzonte; i++) {
    ricavi = proietta(ricavi, ipotesi.ricaviVendite?.[i], false);
    costi = proietta(costi, ipotesi.costiOperativi?.[i], false);
    investimenti = proietta(investimenti, ipotesi.investimenti?.[i], true);
    ammortamenti = proietta(ammortamenti, ipotesi.ammortamenti?.[i], false);
    crediti = proietta(crediti, ipotesi.creditiClienti?.[i], false);
    ricaviBase.push(Math.max(0, ricavi));
    costiBase.push(Math.max(0, costi));
    investimentiBase.push(Math.max(0, investimenti));
    ammortamentiBase.push(Math.max(0, ammortamenti));
    creditiBase.push(Math.max(0, crediti));
  }

  const quotaPersonale =
    typeof s.costiPersonale === 'number' && s.costiPersonale > 0 && costiStorici > 0
      ? Math.min(1, s.costiPersonale / costiStorici)
      : null;
  // La misura dei ricavi nuovi è sui ricavi dell'azienda (l'ultimo bilancio),
  // non sul primo anno del percorso: la leva non si gonfia con la crescita.
  // Costi e crediti seguono l'incidenza storica, non quella del primo anno.
  const ricaviPartenza = Math.max(0, s.ricaviVendite);
  const incidenzaCosti = s.ricaviVendite > 0 ? costiStorici / s.ricaviVendite : 0;
  const incidenzaCrediti = s.ricaviVendite > 0 ? s.creditiClienti / s.ricaviVendite : 0;

  const effetti: EffettoLeva[] = [];
  const sacrifici: string[] = [];
  const avvisi: string[] = [];
  const risparmioAnno = Array.from({ length: orizzonte }, () => 0);
  let personaleAnno: number[] | null = null;

  const aggiuntiAnno = Array.from({ length: orizzonte }, () => 0);
  const costiAggiuntiAnno = Array.from({ length: orizzonte }, () => 0);
  const creditiAggiuntiAnno = Array.from({ length: orizzonte }, () => 0);
  // Le nuove linee portano anche il loro personale: si calcola prima del
  // taglio, così la riga «di cui costo del personale» torna col totale.
  const effettiRicavi: EffettoLeva[] = [];
  const sacrificiRicavi: string[] = [];
  for (const { definizione, scelta } of scelteRicavi) {
    const rampa = rampaDi(definizione.id);
    const aggiunti = Array.from({ length: orizzonte }, (_, i) =>
      r2(((ricaviPartenza * scelta.misura) / 100) * Math.min(1, (i + 1) / rampa))
    );
    for (let i = 0; i < orizzonte; i++) {
      aggiuntiAnno[i] += aggiunti[i];
      costiAggiuntiAnno[i] += r2(aggiunti[i] * incidenzaCosti);
      creditiAggiuntiAnno[i] += r2(aggiunti[i] * incidenzaCrediti);
    }
    const ultimo = aggiunti[aggiunti.length - 1] ?? 0;
    effettiRicavi.push({
      id: definizione.id,
      domanda: definizione.domanda,
      pct: scelta.misura,
      testo: `+${euro(ultimo)} di ricavi a regime (${scelta.misura}% dei ricavi di partenza), con ${euro(r2(ultimo * incidenzaCosti))} di costi nella stessa incidenza del bilancio.`,
    });
    sacrificiRicavi.push(
      `${definizione.domanda} ${scelta.misura}%: ${euro(r2(ultimo * incidenzaCrediti))} di crediti in più a regime e ${euro(r2(ultimo * incidenzaCosti))} di costi da anticipare — il piano deve finanziarli.`
    );
  }

  if (vocePersonale) {
    const misura = vocePersonale.scelta.misura;
    if (quotaPersonale === null) {
      avvisi.push(
        'Il bilancio non separa il costo del personale: la leva dei tagli resta dichiarata ma non produce numeri.'
      );
    } else {
      const personaleBase = costiBase.map((c, i) =>
        r2((c + costiAggiuntiAnno[i]) * quotaPersonale)
      );
      personaleAnno = personaleBase.map((p) => r2(p * (1 - misura / 100)));
      for (let i = 0; i < orizzonte; i++)
        risparmioAnno[i] = r2(personaleBase[i] - personaleAnno[i]);
      const basePrimo = personaleBase[0] ?? 0;
      const dopoPrimo = personaleAnno[0] ?? 0;
      const risparmioPrimo = risparmioAnno[0] ?? 0;
      effetti.push({
        id: 'PERSONALE',
        domanda: vocePersonale.definizione.domanda,
        pct: misura,
        testo: `Costo del personale da ${euro(basePrimo)} a ${euro(dopoPrimo)} nel primo anno: ${euro(risparmioPrimo)} l’anno in meno nei costi.`,
      });
      sacrifici.push(
        `Personale −${misura}%: ${euro(risparmioPrimo)} l’anno di costo in meno, ma meno capacità produttiva — il piano deve dire quali volumi restano coperti.`
      );
    }
  }

  const investimentiTecnologia = Array.from({ length: orizzonte }, () => 0);
  const ammortamentiTecnologia = Array.from({ length: orizzonte }, () => 0);
  if (voceTecnologia) {
    const misura = voceTecnologia.scelta.misura;
    for (let i = 0; i < orizzonte; i++) {
      investimentiTecnologia[i] = r2((ricaviBase[i] * misura) / 100);
      // Quote costanti: l'investimento di ogni anno pesa per 1/VITA per anno.
      const quota = investimentiTecnologia[i] / VITA_AMMORTAMENTO;
      for (let j = i; j < Math.min(orizzonte, i + VITA_AMMORTAMENTO); j++)
        ammortamentiTecnologia[j] += quota;
    }
    const ultimo = investimentiTecnologia[investimentiTecnologia.length - 1] ?? 0;
    effetti.push({
      id: 'TECNOLOGIA',
      domanda: voceTecnologia.definizione.domanda,
      pct: misura,
      testo: `${misura}% dei ricavi in immobilizzazioni: ${euro(ultimo)} l’anno, ammortizzati in ${VITA_AMMORTAMENTO} anni.`,
    });
    sacrifici.push(
      `Tecnologia ${misura}% dei ricavi: ${euro(investimentiTecnologia.reduce((a, b) => a + b, 0))} di investimenti nel piano, e i ricavi arrivano solo se il percorso li sostiene.`
    );
  }

  effetti.push(...effettiRicavi);
  sacrifici.push(...sacrificiRicavi);

  if (effetti.length === 0) return { ipotesi, effetti, sacrifici, avvisi };

  const notaRicavi = scelteRicavi
    .map(({ definizione, scelta }) => `${definizione.domanda} ${scelta.misura}%`)
    .join(', ');
  const notaCosti = [
    personaleAnno ? 'leva: taglio del personale' : '',
    notaRicavi ? `ricavi nuovi: ${notaRicavi}` : '',
  ]
    .filter(Boolean)
    .join('; ');
  const notaInvest = voceTecnologia
    ? `leva: tecnologia ${voceTecnologia.scelta.misura}% dei ricavi`
    : '';
  const motivazioneRicavi = notaRicavi ? `leve: ${notaRicavi}` : '';

  // Solo le righe toccate vengono riscritte: le altre restano le ipotesi
  // scritte, con la loro forma percentuale o assoluta.
  const ipotesiConLeve: IpotesiPiano = { ...ipotesi };
  if (personaleAnno) {
    ipotesiConLeve.costiPersonale = personaleAnno.map((valore) => ({
      tipo: 'abs',
      valore,
      motivazione: `leva: tagli del personale ${vocePersonale!.scelta.misura}%`,
    }));
  }
  if (scelteRicavi.length > 0) {
    ipotesiConLeve.ricaviVendite = ricaviBase.map((valore, i) => ({
      tipo: 'abs',
      valore: r2(valore + aggiuntiAnno[i]),
      ...(motivazioneRicavi
        ? {
            motivazione: [ipotesi.ricaviVendite?.[i]?.motivazione, motivazioneRicavi]
              .filter(Boolean)
              .join(' — '),
          }
        : {}),
    }));
    ipotesiConLeve.creditiClienti = creditiBase.map((valore, i) => ({
      tipo: 'abs',
      valore: r2(valore + creditiAggiuntiAnno[i]),
    }));
  }
  if (personaleAnno || scelteRicavi.length > 0) {
    ipotesiConLeve.costiOperativi = costiBase.map((valore, i) => ({
      tipo: 'abs',
      valore: Math.max(0, r2(valore + costiAggiuntiAnno[i] - risparmioAnno[i])),
      ...(notaCosti
        ? {
            motivazione: [ipotesi.costiOperativi?.[i]?.motivazione, notaCosti]
              .filter(Boolean)
              .join(' — '),
          }
        : {}),
    }));
  }
  if (voceTecnologia) {
    ipotesiConLeve.investimenti = investimentiBase.map((valore, i) => ({
      tipo: 'abs',
      valore: r2(valore + investimentiTecnologia[i]),
      ...(notaInvest
        ? {
            motivazione: [ipotesi.investimenti?.[i]?.motivazione, notaInvest]
              .filter(Boolean)
              .join(' — '),
          }
        : {}),
    }));
    ipotesiConLeve.ammortamenti = ammortamentiBase.map((valore, i) => ({
      tipo: 'abs',
      valore: r2(valore + ammortamentiTecnologia[i]),
    }));
  }

  return { ipotesi: ipotesiConLeve, effetti, sacrifici, avvisi };
}

/**
 * L'UNICO PUNTO IN CUI LE LEVE ENTRANO NEL CALCOLO (0.256.36).
 *
 * Le ipotesi che arrivano qui sono quelle scritte (dall'analisi o
 * dall'operatore), senza l'effetto delle leve: la funzione lo applica una volta
 * e restituisce insieme il piano e le ipotesi che lo hanno prodotto. Chi
 * mostra gli effetti usa `applicazione`, chi ricalcola lo stesso piano parte da
 * qui: non c'è una seconda applicazione, e quindi non c'è doppio conteggio.
 */
export function calcolaPianoConLeve(input: {
  storico: EsercizioStorico;
  orizzonte: number;
  ipotesi: IpotesiPiano;
  leve?: LeveSimulazione | null;
  rate: RatePiano;
  capitaleSociale?: number | null;
}): { esito: EsitoPiano; applicazione: EsitoLeve } {
  const applicazione = pianoConLeve({
    storico: input.storico,
    orizzonte: input.orizzonte,
    ipotesi: input.ipotesi,
    leve: leveDaSalvate(input.leve) ?? LEVE_PREDEFINITE,
  });
  return {
    applicazione,
    esito: calcolaPiano(
      input.storico,
      input.orizzonte,
      applicazione.ipotesi,
      input.rate,
      input.capitaleSociale ?? null
    ),
  };
}
