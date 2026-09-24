// src/lib/revisore/revisore.ts
//
// REVISORE A REGOLE — fase 4 della reingegnerizzazione.
//
// Legge un testo generato e applica i controlli del catalogo (Libra, parte E).
// E' logica pura e deterministica: stesso testo, stesso esito; nessuna AI,
// nessuna rete, nessun database. Gira anche nel browser, quindi vale anche per
// i testi generati PRIMA che il revisore esistesse.
//
// Esiti di un controllo (Libra E.1): PASS, BLOCCO, SEGNALAZIONE,
// CORREZIONE_AUTOMATICA. La piattaforma ne aggiunge uno, NON_VERIFICATO, per i
// controlli che oggi non sa eseguire: dichiararli superati sarebbe una falsa
// assicurazione.
//
// Regola di consegna (Libra E.1): un testo e' consegnabile solo se nessun
// controllo e' in BLOCCO.

import {
  ACCERTAMENTI_VIETATI,
  LESSICO,
  SOSTITUZIONI_DIRETTE,
  cercaTerminiLessico,
  intervalliQualificazioneNegata,
} from '@/lib/lessico/lessico';
import {
  IMPORTI_DI_LEGGE,
  riconciliaTestoConFascicolo,
  type Evidenza,
} from '@/lib/fascicolo/evidenza';
import { riscontraCitazioni } from '@/lib/registroFonti/citazioni';
import { CATALOGO_REVISORE, MOTIVO_NON_VERIFICATO, type ControlloRevisore } from './catalogo';
import { LIVELLO_PER_TIPO, type LivelloOutput, type TipoOutput } from './livelli';
import { FASE_PER_TIPO, MODELLO_DICHIARAZIONE, dichiarazionePerimetro } from './perimetro';

export type EsitoControllo =
  'PASS' | 'BLOCCO' | 'SEGNALAZIONE' | 'CORREZIONE_AUTOMATICA' | 'NON_VERIFICATO';

export interface Rilievo {
  trovato: string;
  contesto: string;
  /** Che cosa fare, o che cosa e' stato fatto. */
  nota: string;
}

export interface RisultatoControllo {
  controllo: ControlloRevisore;
  esito: EsitoControllo;
  messaggio: string;
  rilievi: Rilievo[];
}

export interface Revisione {
  tipoOutput: TipoOutput;
  livello: LivelloOutput;
  consegnabile: boolean;
  /** Il testo con le correzioni automatiche applicate e l'intestazione di livello. */
  testoRivisto: string;
  risultati: RisultatoControllo[];
  conteggi: Record<EsitoControllo, number>;
}

const spazi = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Abbreviazioni dopo le quali il punto NON chiude la frase («art. 63», «D.Lgs. 14/2019»). */
const ABBREVIAZIONE_FINALE =
  /(?:^|[\s(«"’'])(?:artt?|n|nn|c|co|lett|cfr|es|pag|pagg|p|sez|cass|trib|civ|D|Lgs|L|M|P|R|S|r|l|A|p\.A|ss)\.$/iu;

function frasi(testo: string): string[] {
  const pezzi = testo.split(/(?<=[.!?;:])\s+|\n+/);
  const unite: string[] = [];
  for (const pezzo of pezzi) {
    const ultima = unite[unite.length - 1];
    if (ultima !== undefined && ABBREVIAZIONE_FINALE.test(ultima)) {
      unite[unite.length - 1] = `${ultima} ${pezzo}`;
    } else {
      unite.push(pezzo);
    }
  }
  return unite.map(spazi).filter((f) => f.length > 0);
}

/** La frase che contiene la posizione data (fra due segni di fine frase o a capo). */
function fraseIntorno(testo: string, posizione: number): string {
  const inizio = Math.max(
    testo.lastIndexOf('.', posizione - 1),
    testo.lastIndexOf('\n', posizione - 1),
    testo.lastIndexOf(';', posizione - 1),
    -1
  );
  const fineCandidati = ['.', '\n', ';']
    .map((c) => testo.indexOf(c, posizione))
    .filter((i) => i >= 0);
  const fine = fineCandidati.length ? Math.min(...fineCandidati) : testo.length;
  return testo.slice(inizio + 1, fine);
}

function contestoDi(testo: string, posizione: number, lunghezza: number): string {
  return spazi(testo.slice(Math.max(0, posizione - 60), posizione + lunghezza + 60));
}

/** Da dove comincia la parte conclusiva: un titolo di conclusione, o l'ultimo 15% del testo. */
function inizioConclusione(testo: string): number {
  const titolo =
    /(?:^|\n)[#*\s\d.)-]*(?:conclusion[ei]|esito\s+complessivo|giudizio\s+(?:finale|complessivo)|valutazione\s+(?:finale|conclusiva)|sintesi\s+finale)\b/giu;
  let ultimo = -1;
  for (const m of testo.matchAll(titolo)) ultimo = m.index ?? ultimo;
  return ultimo >= 0 ? ultimo : Math.floor(testo.length * 0.85);
}

type Verifica = (
  testo: string,
  ambiente: {
    fascicolo: Evidenza[] | null;
    tipoOutput: TipoOutput;
    correggi: (da: RegExp, a: string) => void;
    accoda: (nota: string) => void;
  }
) => { esito: EsitoControllo; rilievi: Rilievo[] };

const PASS = { esito: 'PASS' as const, rilievi: [] as Rilievo[] };

function perFrase(
  testo: string,
  condizione: (frase: string) => RegExpMatchArray | null,
  nota: string
): Rilievo[] {
  const rilievi: Rilievo[] = [];
  for (const f of frasi(testo)) {
    const m = condizione(f);
    if (m) rilievi.push({ trovato: m[0], contesto: f.slice(0, 220), nota });
  }
  return rilievi;
}

const VERIFICHE: Record<string, Verifica> = {
  // Ogni norma citata deve stare nel registro delle fonti: una norma assente
  // non e' stata verificata da nessuno (e' cosi' che l'AI ha citato due decreti
  // diversi, a memoria, per l'obbligo Uniemens). Assente dal registro = BLOCCO,
  // come vuole Libra; presente ma abrogata o da verificare = SEGNALAZIONE.
  'REV-001': (testo) => {
    const r = riscontraCitazioni(testo);
    const rilievi: Rilievo[] = [
      ...r.nonInRegistro.map((c) => ({
        trovato: c.testo,
        contesto: contestoDi(testo, c.posizione, c.testo.length),
        nota: 'Norma non presente nel registro delle fonti: nessuno l’ha verificata. Aggiungerla al registro dopo il riscontro sul testo ufficiale, oppure togliere la citazione.',
      })),
      ...r.nonSostenibili
        // Una fonte abrogata citata COME abrogata («il sistema dell'originario
        // art. 13 CCII e' stato abrogato») e' una citazione corretta, non un
        // rilievo: la frase intorno lo dichiara.
        .filter(
          ({ citazione, fonte }) =>
            !(
              fonte.stato === 'abrogato' &&
              /abrogat|non\s+(?:più|piu’)\s+(?:in\s+vigore|vigent)|originari[oa]|storic|superat/iu.test(
                fraseIntorno(testo, citazione.posizione)
              )
            )
        )
        .map(({ citazione, fonte }) => ({
          trovato: citazione.testo,
          contesto: contestoDi(testo, citazione.posizione, citazione.testo.length),
          nota: `Nel registro come «${fonte.stato}» (${fonte.id}): ${fonte.verifica}`,
        })),
    ];
    if (r.nonInRegistro.length) return { esito: 'BLOCCO', rilievi };
    if (rilievi.length) return { esito: 'SEGNALAZIONE', rilievi };
    return PASS;
  },

  // Ogni importo del testo deve avere la sua evidenza nel fascicolo. Finche' il
  // fascicolo non copre tutte le fonti (oggi: proposta, posizione dell'ente,
  // V.E.R.A.), un importo non riconciliato e' SEGNALATO, non bloccato: bloccare
  // su una copertura parziale punirebbe i testi per un limite della piattaforma.
  'REV-010': (testo, amb) => {
    if (amb.fascicolo === null) return { esito: 'NON_VERIFICATO', rilievi: [] };
    const { nonRiconciliati, riconciliati } = riconciliaTestoConFascicolo(
      testo,
      amb.fascicolo,
      IMPORTI_DI_LEGGE
    );
    if (nonRiconciliati.length === 0) return PASS;
    // Un solo rilievo di conteggio: la provenienza dei dati aziendali e'
    // coperta dalla dichiarazione di perimetro in testa all'elaborato
    // (scelta di Ercole); l'elenco puntuale resta per le CONTRADDIZIONI
    // numeriche (REV-013), non per i dati presi come proposti.
    return {
      esito: 'SEGNALAZIONE',
      rilievi: [
        {
          trovato: `${nonRiconciliati.length} ${nonRiconciliati.length === 1 ? 'importo' : 'importi'} su ${nonRiconciliati.length + riconciliati.length}`,
          contesto: nonRiconciliati
            .slice(0, 6)
            .map((i) => i.testo)
            .join(', '),
          nota: 'Importi non presenti nel fascicolo di evidenza: dati riportati come proposti, coperti dalla dichiarazione di perimetro. Non è una contraddizione: nessuna correzione richiesta.',
        },
      ],
    };
  },

  // Fonte abrogata presentata come vigente: gli indici di allerta dell'originario
  // art. 13, comma 2, abrogato dal D.Lgs. 83/2022 prima di diventare operativo.
  'REV-003': (testo) => {
    // «artt. 63 e 88» richiamati insieme: contesti diversi (rilievo di Libra).
    const insieme = perFrase(
      testo,
      (f) => {
        const m = f.match(
          /art(?:t\.?|icol[oi]|\.)?\s*63\s*(?:e|ed|,)\s*88\b|art(?:t\.?|icol[oi]|\.)?\s*88\s*(?:e|ed|,)\s*63\b/iu
        );
        if (!m) return null;
        return /condizionat|a\s+seconda|se\s+la\s+società|rispettivamente|accord[oi]\s+di\s+ristrutturazione.*concordat|concordat.*accord[oi]\s+di\s+ristrutturazione/iu.test(
          f
        )
          ? null
          : m;
      },
      'Gli artt. 63 e 88 CCII operano in contesti diversi (transazione negli accordi di ristrutturazione; concordato preventivo): sostituire il rinvio cumulativo con una formula condizionata allo strumento.'
    );
    const rilievi = perFrase(
      testo,
      (f) => {
        const m = f.match(
          /indic[ei]\s+(?:di\s+allerta|(?:del\s+)?CNDCEC|CCII)|(?:test|indic[ei])\s+(?:CCII\s+)?violat[oi]|art(?:icolo|\.)?\s*13,?\s*(?:comma|c\.)\s*2|sistema\s+di\s+allerta|\bOCRI\b/iu
        );
        if (!m) return null;
        return /abrogat|non\s+(?:più|piu’)\s+(?:in\s+vigore|vigent)|storic|(?:disciplina|norma|sistema|impianto)\s+superat|mai\s+(?:entrat|divenut|approvat)|non\s+costituisc|diagnostic|strument[oi]\s+operativ|non\s+(?:sono\s+)?parametr/iu.test(
          f
        )
          ? null
          : m;
      },
      'La frase richiama una disciplina abrogata senza dirlo: riscriverla indicando che non è diritto vigente.'
    );
    if (rilievi.length) return { esito: 'BLOCCO', rilievi };
    if (insieme.length) return { esito: 'SEGNALAZIONE', rilievi: insieme };
    return PASS;
  },

  'REV-012': (testo) => {
    const rilievi = perFrase(
      testo,
      (f) =>
        /non\s+(?:è\s+|sono\s+)?(?:disponibil|caricat|pervenut|present|riconciliat)|assent[ei]|mancant[ei]|in\s+assenza\s+d/iu.test(
          f
        )
          ? f.match(
              /(?:pari|uguale|uguali)\s+a\s+(?:€\s*)?(?:zero|0(?:[,.]0+)?)(?!\d)|(?:considerat|assunt|trattat|valorizzat)[oaie]\s+(?:come\s+|a\s+)(?:zero|nullo|nulla|0)(?!\d)/iu
            )
          : null,
      'Un dato assente va dichiarato assente, non valorizzato a zero.'
    );
    return rilievi.length ? { esito: 'BLOCCO', rilievi } : PASS;
  },

  // Termini vietati. Sostituzione automatica dove e' sicura; blocco dove non lo
  // e', e sempre quando il termine sta nella conclusione.
  'REV-020': (testo, amb) => {
    const soglia = inizioConclusione(testo);
    const bloccanti: Rilievo[] = [];
    const corretti: Rilievo[] = [];
    // La qualificazione obbligatoria nomina i termini per negarli: non e' una violazione.
    const negati = intervalliQualificazioneNegata(testo);

    for (const r of cercaTerminiLessico(testo, { soloSorvegliati: true })) {
      if (negati.some(([da, a]) => r.posizione >= da && r.posizione < a)) continue;
      const inConclusione = r.posizione >= soglia;
      // «NON RICEVIBILE»: il lessico trova l'aggettivo, ma la sostituzione
      // riguarda l'intera espressione negata, e il rilievo deve dirlo.
      const negazione = testo.slice(Math.max(0, r.posizione - 6), r.posizione).match(/non\s+$/iu);
      if (negazione) {
        r.trovato = `${negazione[0]}${r.trovato}`;
        r.posizione -= negazione[0].length;
      }
      const diretta = SOSTITUZIONI_DIRETTE.find(
        (s) => s.voce === r.voce.id && new RegExp(s.modello.source, 'iu').test(r.trovato)
      );
      const contesto = contestoDi(testo, r.posizione, r.trovato.length);
      if (r.voce.id === 'LEX-SEGNALAZIONE-DOVUTA') continue; // la tratta REV-022
      if (diretta && !inConclusione) {
        corretti.push({ trovato: r.trovato, contesto, nota: `Sostituito con «${diretta.con}».` });
      } else {
        bloccanti.push({
          trovato: r.trovato,
          contesto,
          nota: inConclusione
            ? `Il termine è nella parte conclusiva: va riscritto. Formula di Libra: ${r.voce.formulaSostitutiva}`
            : `Nessuna sostituzione automatica sicura. Formula di Libra: ${r.voce.formulaSostitutiva}`,
        });
      }
    }
    for (const a of ACCERTAMENTI_VIETATI) {
      const voce = LESSICO.find((v) => v.id === a.voce);
      for (const m of testo.matchAll(new RegExp(a.modello.source, 'giu'))) {
        bloccanti.push({
          trovato: m[0],
          contesto: contestoDi(testo, m.index ?? 0, m[0].length),
          nota: `Il termine è usato come accertamento. Formula di Libra: ${voce?.formulaSostitutiva ?? ''}`,
        });
      }
    }
    if (bloccanti.length) return { esito: 'BLOCCO', rilievi: [...bloccanti, ...corretti] };
    if (corretti.length) {
      for (const s of SOSTITUZIONI_DIRETTE) amb.correggi(s.modello, s.con);
      return { esito: 'CORREZIONE_AUTOMATICA', rilievi: corretti };
    }
    return PASS;
  },

  'REV-021': (testo, amb) => {
    const rilievi: Rilievo[] = [];
    for (const voce of LESSICO.filter((v) => v.classe === 'CONSENTITO_QUALIFICATO')) {
      const trovati = cercaTerminiLessico(testo).filter((r) => r.voce.id === voce.id);
      if (trovati.length === 0 || !voce.qualificazione) continue;
      // Basta il nucleo della qualificazione, non la frase identica.
      const nucleo = voce.qualificazione.slice(0, 40).toLowerCase();
      if (testo.toLowerCase().includes(nucleo)) continue;
      amb.accoda(`«${voce.termine}»: ${voce.qualificazione}`);
      rilievi.push({
        trovato: trovati[0].trovato,
        contesto: trovati[0].contesto,
        nota: `Qualificazione aggiunta in calce: ${voce.qualificazione}`,
      });
    }
    return rilievi.length ? { esito: 'CORREZIONE_AUTOMATICA', rilievi } : PASS;
  },

  'REV-022': (testo) => {
    const rilievi = perFrase(
      testo,
      (f) =>
        f.match(
          /segnalazion[ei]\s+(?:è\s+|sono\s+|risulta\s+)?(?:dovut[ae]|obbligatori[ae])|obblig\w+\s+di\s+segnala\w+|(?:deve|devono|dovrà|dovranno|è\s+tenut[oa]|sono\s+tenut[ei])\s+(?:a\s+)?(?:segnalare|effettuare\s+la\s+segnalazione|procedere\s+(?:alla|con\s+la)\s+segnalazione)/iu
        ),
      'Usare: «risultano integrati / non risultano integrati i presupposti oggettivi rilevati ex [fonte], alla data [data]».'
    );
    return rilievi.length ? { esito: 'BLOCCO', rilievi } : PASS;
  },

  'REV-023': (testo) => {
    const rilievi = perFrase(
      testo,
      (f) =>
        f.match(
          /(?:DSCR|test\s+pratico|check\s*list|lista\s+di\s+controllo|indic[ei]|indicator[ei]|semaforo|punteggio)[^.]{0,90}?(?:dimostra|dimostrano|prova|provano|accerta|accertano|conferma|confermano|certifica|certificano|attesta|attestano)[^.]{0,60}?(?:crisi|insolvenza|risanamento|continuità)/iu
        ),
      'Un indicatore rileva un dato: non dimostra né accerta crisi, insolvenza o risanamento.'
    );
    return rilievi.length ? { esito: 'BLOCCO', rilievi } : PASS;
  },

  'REV-024': (testo, amb) => {
    if (MODELLO_DICHIARAZIONE.test(testo)) return PASS;
    return {
      esito: 'CORREZIONE_AUTOMATICA',
      rilievi: [
        {
          trovato: '(dichiarazione di perimetro assente)',
          contesto: spazi(testo.slice(0, 120)),
          nota: `Anteposta la dichiarazione di perimetro e destinazione (${FASE_PER_TIPO[amb.tipoOutput].toLowerCase()}).`,
        },
      ],
    };
  },

  'REV-025': (testo) => {
    const rilievi = perFrase(
      testo,
      (f) =>
        f.match(
          /(?:la\s+piattaforma|il\s+sistema|CCIIPlatform|l[’']\s*(?:AI|intelligenza\s+artificiale|assistente|applicativo)|il\s+software|il\s+presente\s+(?:documento|elaborato))\s+(?:\w+\s+){0,3}?(?:attesta|assevera|certifica|accerta|omologa|giudica|delibera|dichiara\s+(?:la\s+)?(?:crisi|insolvenza|fattibilità|convenienza))/iu
        ),
      'La piattaforma rileva e calcola: non attesta, non assevera, non certifica, non accerta.'
    );
    return rilievi.length ? { esito: 'BLOCCO', rilievi } : PASS;
  },

  'REV-035': (testo, amb) => {
    const m = testo.match(/omologazione\s+forzosa|cram\s*-?\s*down/iu);
    if (!m) return PASS;
    const mancanti: string[] = [];
    if (!/art(?:icolo|\.)?\s*(?:63|88)\b/iu.test(testo))
      mancanti.push('la norma (art. 63 o 88 CCII)');
    if (!/aderent|adesion|maggioranz|determinant/iu.test(testo))
      mancanti.push('adesione e maggioranze');
    if (
      !/28\s*(?:\/|\.|\s+settembre\s+)\s*(?:09\s*[/.]\s*)?2024|136\/2024|69\/2023|version[ei]|vigent[ei]|in\s+vigore|testo\s+attuale|correttivo|alla\s+data\s+(?:della|di\s+deposito)/iu.test(
        testo
      )
    )
      mancanti.push('la versione applicabile alla data della proposta');
    if (mancanti.length === 0) return PASS;
    // Nella relazione di Screening non esiste ancora una proposta, quindi
    // nemmeno una data: il richiamo e' generale e la lacuna si segnala, non
    // blocca. Con una proposta in esame, invece, blocca.
    const preProposta = amb.tipoOutput === 'RELAZIONE_SCREENING';
    return {
      esito: preProposta ? 'SEGNALAZIONE' : 'BLOCCO',
      rilievi: [
        {
          trovato: m[0],
          contesto: contestoDi(testo, m.index ?? 0, m[0].length),
          nota: `Il testo richiama l’omologazione forzosa senza indicare: ${mancanti.join('; ')}.${preProposta ? ' Prima della proposta il richiamo può restare generale: indicare almeno che la disciplina applicabile dipende dalla data della proposta.' : ''}`,
        },
      ],
    };
  },

  'REV-036': (testo) => {
    const m = testo.match(/ristrutturazione\s+trasversale/iu);
    if (!m) return PASS;
    if (/136\/2024|28\s*(?:\/|\.|\s+settembre\s+)\s*(?:09\s*[/.]\s*)?2024|correttivo/iu.test(testo))
      return PASS;
    return {
      esito: 'BLOCCO',
      rilievi: [
        {
          trovato: m[0],
          contesto: contestoDi(testo, m.index ?? 0, m[0].length),
          nota: 'Distinguere la disciplina anteriore e successiva al D.Lgs. 136/2024 (in vigore dal 28/09/2024).',
        },
      ],
    };
  },
};

export function revisionaTesto(
  testoOriginale: string,
  tipoOutput: TipoOutput,
  contesto: { fascicolo?: Evidenza[] | null } = {}
): Revisione {
  let testoRivisto = testoOriginale;
  const note: string[] = [];
  const ambiente = {
    fascicolo: contesto.fascicolo ?? null,
    tipoOutput,
    correggi: (da: RegExp, a: string) => {
      testoRivisto = testoRivisto.replace(new RegExp(da.source, 'giu'), (trovato) =>
        // conserva il maiuscolo dei titoli e dei prompt
        trovato === trovato.toUpperCase() && trovato.length > 3 ? a.toUpperCase() : a
      );
    },
    accoda: (nota: string) => note.push(nota),
  };

  const risultati: RisultatoControllo[] = CATALOGO_REVISORE.map((controllo) => {
    if (controllo.modalita !== 'REGOLA_TESTO') {
      return {
        controllo,
        esito: 'NON_VERIFICATO' as const,
        messaggio: MOTIVO_NON_VERIFICATO[controllo.modalita],
        rilievi: [],
      };
    }
    const verifica = VERIFICHE[controllo.id];
    // I controlli leggono sempre il testo ORIGINALE: una correzione non deve
    // nascondere un rilievo a un controllo successivo.
    const { esito, rilievi } = verifica(testoOriginale, ambiente);
    return {
      controllo,
      esito,
      messaggio:
        esito === 'PASS'
          ? 'Controllo superato.'
          : esito === 'NON_VERIFICATO'
            ? 'Fascicolo di evidenza non disponibile per questo testo: gli importi non sono stati riconciliati.'
            : esito === 'SEGNALAZIONE' && controllo.id === 'REV-010'
              ? 'Importi non riconciliati con il fascicolo di evidenza.'
              : esito === 'SEGNALAZIONE'
                ? `Verifica richiesta: ${controllo.messaggio.replace(/^Testo bloccato:\s*/iu, '')}`
                : controllo.messaggio,
      rilievi,
    };
  });

  const conteggi: Record<EsitoControllo, number> = {
    PASS: 0,
    BLOCCO: 0,
    SEGNALAZIONE: 0,
    CORREZIONE_AUTOMATICA: 0,
    NON_VERIFICATO: 0,
  };
  for (const r of risultati) conteggi[r.esito] += 1;

  if (!MODELLO_DICHIARAZIONE.test(testoRivisto)) {
    testoRivisto = `${dichiarazionePerimetro(FASE_PER_TIPO[tipoOutput])}\n\n${testoRivisto}`;
  }
  if (note.length) {
    testoRivisto = `${testoRivisto}\n\nQUALIFICAZIONI OBBLIGATORIE\n${note.map((n) => `- ${n}`).join('\n')}`;
  }

  return {
    tipoOutput,
    livello: LIVELLO_PER_TIPO[tipoOutput],
    consegnabile: conteggi.BLOCCO === 0,
    testoRivisto,
    risultati,
    conteggi,
  };
}

/** Ogni controllo a REGOLA_TESTO ha la sua verifica, e viceversa: lo garantisce un test. */
export const CONTROLLI_ESEGUITI = Object.keys(VERIFICHE);
