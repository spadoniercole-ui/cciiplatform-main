// src/lib/giudice/confronto.ts
//
// IL CONFRONTO FRA IL PROVVEDIMENTO E I DATI DELL'ENTE.
//
// Il giudice ha detto quanto l'ente ha diritto di ricevere; l'ente sa quanto
// ha a ruolo. Questo modulo mette le due cose una accanto all'altra, voce per
// voce, e calcola quello che nessuno dei due documenti dice da solo: la
// perdita. È aritmetica deterministica, non una stima dell'AI — l'analisi
// critica viene dopo, sui numeri già calcolati qui.
//
// NESSUNA INVENZIONE. Il recupero atteso si calcola solo se il provvedimento
// dichiara una percentuale per quel credito. Se manca, resta null e lo si
// dice: una perdita calcolata su una percentuale inventata sarebbe un numero
// che nessuno può difendere.
//
// L'abbinamento fra le voci è per somiglianza del testo, con una soglia: due
// descrizioni diverse dello stesso credito si incontrano, due crediti diversi
// no. Le voci che non si abbinano non spariscono: entrano nel totale come
// «non riscontrate», perché è lì che si nasconde la contestazione più seria.

import type { LetturaProvvedimento, TipoAttoGiudice } from './lettura';

export interface VoceEnte {
  voce: string;
  importo: number;
}

export type EsitoVoce =
  'CONFORME' | 'MINORE' | 'MAGGIORE' | 'NON_RISCONTRATO' | 'NON_PRESENTE_NEI_DATI_ENTE';

export interface DifferenzaVoce {
  voce: string;
  voceGiudice: string | null;
  importoEnte: number | null;
  importoGiudice: number | null;
  rango: string | null;
  /** importoGiudice − importoEnte; positivo = il giudice ha riconosciuto più dell'ente. */
  differenza: number | null;
  differenzaPct: number | null;
  esito: EsitoVoce;
  /** Importo che l'ente incasserebbe applicando la percentuale dell'atto; null se non dichiarata. */
  realizzoAtteso: number | null;
  nota: string;
}

export interface TotaleRango {
  rango: string;
  importoEnte: number;
  ammessoGiudice: number;
  recuperoAtteso: number | null;
  perdita: number | null;
}

export interface ElementoContestabile {
  voce: string;
  motivo: string;
  /** Differenza sfavorevole all'ente, in euro; null se non quantificabile. */
  importo: number | null;
}

export interface ConfrontoProvvedimento {
  voci: DifferenzaVoce[];
  totaliRango: TotaleRango[];
  creditoEnte: number;
  ammessoGiudice: number;
  /** Somma dei realizzi noti; null se almeno un credito non ha una percentuale. */
  recuperoAtteso: number | null;
  /** Credito dell'ente − importo ammesso dal giudice (positivo = minor ammissione). */
  minoreAmmissione: number;
  /** Credito dell'ente − recupero atteso; null se il recupero non è calcolabile. */
  perditaTotale: number | null;
  speseProceduraPct: number | null;
  tempiMesi: number | null;
  difformita: number;
  nonAmmessi: number;
  nonRiscontratiDalGiudice: number;
  elementiContestabili: ElementoContestabile[];
  avvisi: string[];
}

const STOPWORD = new Set([
  'di',
  'del',
  'della',
  'dei',
  'degli',
  'delle',
  'il',
  'lo',
  'la',
  'i',
  'gli',
  'le',
  'un',
  'uno',
  'una',
  'e',
  'ed',
  'per',
  'con',
  'da',
  'in',
  'su',
  'a',
  'al',
  'alla',
  'ai',
  'agli',
  'alle',
  'the',
  'of',
]);

export function normalizzaVoce(voce: string): string {
  return voce
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function token(voce: string): Set<string> {
  return new Set(
    normalizzaVoce(voce)
      .split(' ')
      .filter((t) => t.length > 1 && !STOPWORD.has(t))
  );
}

/** Somiglianza 0..1 fra due descrizioni: Jaccard, con containment privilegiato. */
export function somiglianza(a: string, b: string): number {
  const ta = token(a);
  const tb = token(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let comuni = 0;
  for (const t of ta) if (tb.has(t)) comuni++;
  const jaccard = comuni / (ta.size + tb.size - comuni);
  const containment = comuni / Math.min(ta.size, tb.size);
  return Math.max(jaccard, containment * 0.85);
}

const SOGLIA_ABBINAMENTO = 0.6;

const arrotonda = (n: number) => Math.round(n * 100) / 100;

const sogliaDifformita = (importo: number) => Math.max(1, Math.abs(importo) * 0.01);

function notaVoce(esito: EsitoVoce, differenza: number | null): string {
  switch (esito) {
    case 'CONFORME':
      return "L'importo riconosciuto coincide con quello a ruolo.";
    case 'MINORE':
      return `Il giudice ha riconosciuto ${Math.abs(differenza ?? 0).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })} in meno di quanto l'ente ha a ruolo.`;
    case 'MAGGIORE':
      return `Il giudice ha riconosciuto ${(differenza ?? 0).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })} in più di quanto l'ente ha a ruolo: verificare la posizione, non è una perdita.`;
    case 'NON_RISCONTRATO':
      return 'Il credito a ruolo non trova corrispondenza nel provvedimento: nessun importo ammesso.';
    case 'NON_PRESENTE_NEI_DATI_ENTE':
      return "Il provvedimento riconosce un credito che non risulta nella posizione debitoria dell'ente.";
  }
}

/**
 * Confronta la posizione debitoria dell'ente con i crediti letti nell'atto.
 * Le voci dell'ente sono la base: ognuna cerca il credito più simile non
 * ancora abbinato. I crediti del giudice rimasti senza corrispondenza
 * entrano comunque nell'elenco, perché possono spiegare una differenza di
 * totale.
 */
export function confrontaProvvedimento(
  vociEnte: VoceEnte[],
  lettura: LetturaProvvedimento,
  tipoAtto: TipoAttoGiudice
): ConfrontoProvvedimento {
  const usati = new Set<number>();
  const voci: DifferenzaVoce[] = [];
  const avvisi: string[] = [];

  for (const v of vociEnte) {
    if (!v.voce.trim() || !Number.isFinite(v.importo)) continue;
    let migliore = -1;
    let punteggio = 0;
    lettura.crediti.forEach((c, i) => {
      if (usati.has(i)) return;
      const s = somiglianza(v.voce, c.voce);
      if (s > punteggio) {
        punteggio = s;
        migliore = i;
      }
    });

    if (migliore < 0 || punteggio < SOGLIA_ABBINAMENTO) {
      voci.push({
        voce: v.voce,
        voceGiudice: null,
        importoEnte: arrotonda(v.importo),
        importoGiudice: null,
        rango: null,
        differenza: null,
        differenzaPct: null,
        esito: 'NON_RISCONTRATO',
        realizzoAtteso: null,
        nota: notaVoce('NON_RISCONTRATO', null),
      });
      continue;
    }

    usati.add(migliore);
    const c = lettura.crediti[migliore];
    const differenza = arrotonda(c.importo - v.importo);
    const soglia = sogliaDifformita(v.importo);
    const esito: EsitoVoce =
      Math.abs(differenza) <= soglia ? 'CONFORME' : differenza < 0 ? 'MINORE' : 'MAGGIORE';
    const realizzo =
      c.percentualeRealizzo === null ? null : arrotonda((c.importo * c.percentualeRealizzo) / 100);

    voci.push({
      voce: v.voce,
      voceGiudice: c.voce,
      importoEnte: arrotonda(v.importo),
      importoGiudice: arrotonda(c.importo),
      rango: c.rango,
      differenza,
      differenzaPct: v.importo !== 0 ? arrotonda((differenza / v.importo) * 100) : null,
      esito,
      realizzoAtteso: realizzo,
      nota: notaVoce(esito, differenza),
    });
  }

  lettura.crediti.forEach((c, i) => {
    if (usati.has(i)) return;
    voci.push({
      voce: c.voce,
      voceGiudice: c.voce,
      importoEnte: null,
      importoGiudice: arrotonda(c.importo),
      rango: c.rango,
      differenza: null,
      differenzaPct: null,
      esito: 'NON_PRESENTE_NEI_DATI_ENTE',
      realizzoAtteso:
        c.percentualeRealizzo === null
          ? null
          : arrotonda((c.importo * c.percentualeRealizzo) / 100),
      nota: notaVoce('NON_PRESENTE_NEI_DATI_ENTE', null),
    });
  });

  const creditoEnte = voci.reduce((s, v) => s + (v.importoEnte ?? 0), 0);
  const ammessoGiudice = voci.reduce((s, v) => s + (v.importoGiudice ?? 0), 0);
  const tuttoIlRealizzoNoto = voci
    .filter((v) => v.importoGiudice !== null)
    .every((v) => v.realizzoAtteso !== null);
  const recuperoAtteso =
    voci.some((v) => v.importoGiudice !== null) && tuttoIlRealizzoNoto
      ? arrotonda(voci.reduce((s, v) => s + (v.realizzoAtteso ?? 0), 0))
      : null;

  if (recuperoAtteso === null) {
    avvisi.push(
      'Il provvedimento non indica una percentuale di soddisfacimento per almeno un credito: il recupero atteso e la perdita complessiva non sono calcolabili. Non viene usata una percentuale stimata.'
    );
  }
  if (voci.some((v) => v.esito === 'NON_RISCONTRATO')) {
    avvisi.push(
      "Alcuni crediti a ruolo non trovano corrispondenza nel provvedimento: compaiono come «non riscontrati» e concorrono alla perdita, ma la causa va verificata sull'atto."
    );
  }
  if (lettura.speseProceduraPct === null) {
    avvisi.push(
      'Le spese di procedura non sono indicate nel provvedimento: non sono state dedotte dal recupero.'
    );
  }

  const mappaRanghi = new Map<string, DifferenzaVoce[]>();
  for (const v of voci) {
    const chiave = v.rango ?? 'NON_INDICATO';
    const gruppo = mappaRanghi.get(chiave) ?? [];
    gruppo.push(v);
    mappaRanghi.set(chiave, gruppo);
  }
  const totaliRango: TotaleRango[] = [...mappaRanghi.entries()].map(([rango, gruppo]) => {
    const ente = gruppo.reduce((s, v) => s + (v.importoEnte ?? 0), 0);
    const ammesso = gruppo.reduce((s, v) => s + (v.importoGiudice ?? 0), 0);
    const noto = gruppo
      .filter((v) => v.importoGiudice !== null)
      .every((v) => v.realizzoAtteso !== null);
    const recupero =
      noto && gruppo.some((v) => v.importoGiudice !== null)
        ? arrotonda(gruppo.reduce((s, v) => s + (v.realizzoAtteso ?? 0), 0))
        : null;
    return {
      rango,
      importoEnte: arrotonda(ente),
      ammessoGiudice: arrotonda(ammesso),
      recuperoAtteso: recupero,
      perdita: recupero === null ? null : arrotonda(ente - recupero),
    };
  });

  const elementiContestabili: ElementoContestabile[] = voci
    .filter((v) => v.esito === 'MINORE' || v.esito === 'NON_RISCONTRATO')
    .map((v) => ({
      voce: v.voce,
      motivo:
        v.esito === 'NON_RISCONTRATO'
          ? `Credito a ruolo di ${(v.importoEnte ?? 0).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })} non riscontrato nel provvedimento.`
          : `Importo ammesso inferiore a quello a ruolo di ${Math.abs(v.differenza ?? 0).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })} (${Math.abs(v.differenzaPct ?? 0).toLocaleString('it-IT')}%).`,
      importo:
        v.esito === 'NON_RISCONTRATO' ? (v.importoEnte ?? null) : Math.abs(v.differenza ?? 0),
    }));

  if (tipoAtto === 'DECRETO_LIQUIDAZIONE' && lettura.crediti.length === 0) {
    avvisi.push(
      'La lettura non ha estratto crediti: il decreto potrebbe non contenere lo stato passivo. Caricare anche il provvedimento di ammissione o lo stato passivo, oppure correggere i documenti.'
    );
  }

  return {
    voci,
    totaliRango,
    creditoEnte: arrotonda(creditoEnte),
    ammessoGiudice: arrotonda(ammessoGiudice),
    recuperoAtteso,
    minoreAmmissione: arrotonda(creditoEnte - ammessoGiudice),
    perditaTotale: recuperoAtteso === null ? null : arrotonda(creditoEnte - recuperoAtteso),
    speseProceduraPct: lettura.speseProceduraPct,
    tempiMesi: lettura.tempiMesi,
    difformita: voci.filter((v) => v.esito === 'MINORE' || v.esito === 'MAGGIORE').length,
    nonAmmessi: voci.filter((v) => v.esito === 'NON_RISCONTRATO').length,
    nonRiscontratiDalGiudice: voci.filter((v) => v.esito === 'NON_PRESENTE_NEI_DATI_ENTE').length,
    elementiContestabili,
    avvisi,
  };
}

const euro = (n: number) =>
  n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 });

/**
 * L'analisi critica: l'AI scrive, ma non calcola. Riceve il confronto già
 * fatto e può solo spiegarlo, ordinarlo e dire dove guardare. Non cita
 * articoli né rimedi: la qualificazione giuridica resta al legale dell'ente.
 */
export function promptAnalisiCritica(input: {
  tipoAtto: TipoAttoGiudice;
  nomeAzienda: string;
  lettura: LetturaProvvedimento;
  confronto: ConfrontoProvvedimento;
}): string {
  const { tipoAtto, nomeAzienda, lettura, confronto } = input;
  const atto =
    tipoAtto === 'DECRETO_LIQUIDAZIONE'
      ? 'decreto di liquidazione giudiziale'
      : 'dispositivo di cram down';
  const voci = confronto.voci
    .map(
      (v) =>
        `- ${v.voce}${v.voceGiudice && v.voceGiudice !== v.voce ? ` (nel provvedimento: ${v.voceGiudice})` : ''}: ente ${v.importoEnte === null ? 'non presente' : euro(v.importoEnte)}, giudice ${v.importoGiudice === null ? 'non ammesso' : euro(v.importoGiudice)}, esito ${v.esito}${v.realizzoAtteso !== null ? `, recupero atteso ${euro(v.realizzoAtteso)}` : ', recupero non calcolabile'}.`
    )
    .join('\n');

  return `Sei un analista della crisi d'impresa che assiste un ente creditore pubblico. L'ente ha ricevuto un ${atto} relativo a ${nomeAzienda}. Il tuo compito è scrivere un'ANALISI CRITICA del provvedimento, non una valutazione della proposta: qui non c'è nulla da accettare, c'è un atto del giudice da riscontrare con i dati dell'ente.

DATI GIÀ CALCOLATI DALLA PIATTAFORMA — sono l'unica fonte dei numeri che puoi usare:
- Credito dell'ente a ruolo: ${euro(confronto.creditoEnte)}
- Importo ammesso o riconosciuto dal giudice: ${euro(confronto.ammessoGiudice)}
- Minore ammissione (credito a ruolo − ammesso): ${euro(confronto.minoreAmmissione)}
- Recupero atteso applicando le percentuali dell'atto: ${confronto.recuperoAtteso === null ? 'non calcolabile (percentuale non indicata per almeno un credito)' : euro(confronto.recuperoAtteso)}
- Perdita complessiva (credito a ruolo − recupero atteso): ${confronto.perditaTotale === null ? 'non calcolabile' : euro(confronto.perditaTotale)}
- Spese di procedura indicate: ${lettura.speseProceduraPct === null ? 'non indicate' : `${lettura.speseProceduraPct}%`}
- Tempi indicati: ${lettura.tempiMesi === null ? 'non indicati' : `${lettura.tempiMesi} mesi`}
- Difformità: ${confronto.difformita}; crediti non ammessi: ${confronto.nonAmmessi}; crediti del giudice non presenti nei dati dell'ente: ${confronto.nonRiscontratiDalGiudice}

VOCI A CONFRONTO:
${voci || '- nessuna voce confrontabile'}

AVVISI GIÀ RILEVATI:
${confronto.avvisi.length ? confronto.avvisi.map((a) => `- ${a}`).join('\n') : '- nessuno'}

SCRIVI LA RELAZIONE COSÌ:
1. L'atto e ciò che dice — in 2-3 frasi: che cosa ha disposto il giudice, quali crediti ha riconosciuto, con quali percentuali e tempi.
2. Le difformità, una per una — per ogni voce in cui il giudice si discosta dai dati dell'ente, ripeti i due importi e la differenza. Parti dalle più rilevanti. Non omettere i crediti non ammessi.
3. La perdita — spiega la minore ammissione e, se calcolabile, la perdita complessiva al netto del recupero atteso. Se un dato non è calcolabile, dillo e indica quale percentuale manca: non stimarla.
4. Gli elementi che possono fondare una contestazione — elenca solo le difformità sfavorevoli all'ente e spiega, per ciascuna, perché merita verifica (importo non riconosciuto, credito non ammesso, rango o privilegio da chiarire). Non citare articoli, rimedi o termini processuali: non sei il legale dell'ente e la qualificazione giuridica non è tua.
5. Conclusioni — una valutazione prudente: se le difformità sono marginali o se c'è materia per un approfondimento. Dichiara che la relazione è un'analisi tecnica sui documenti e sui dati dell'ente, non un parere legale.

REGOLE:
- Non calcolare nuovi numeri e non arrotondare in modo diverso da quelli forniti.
- Non inventare crediti, percentuali, spese o tempi che non sono qui sopra.
- Se una voce non è confrontabile, scrivilo invece di azzerarla.
- Lingua italiana, tono asciutto, nessun aggettivo enfatico.`;
}
