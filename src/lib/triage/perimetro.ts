// src/lib/triage/perimetro.ts
//
// LA CHECK DI PERIMETRO DEL TRIAGE.
//
// Il triage legge i prospetti e misura le soglie, ma le soglie dicono QUANTO
// l'azienda deve, non PERCHÉ non paga. Le due cose non si deducono l'una
// dall'altra: lo stesso importo può essere il frutto di un incidente — un
// ritardo tecnico, un versamento fermo — oppure il modo in cui l'azienda ha
// scelto di stare sul mercato. Il primo caso si lavora, il secondo si presidia.
//
// LA QUALIFICAZIONE VIENE DAI TITOLI, NON DA UN QUESTIONARIO GENERICO. La
// lavorazione (TS) di una materia dice già che cosa l'ente fa su quel credito:
// se quel flusso si è attivato e che esito ha avuto è una cosa che l'operatore
// sa e che nessun documento della piattaforma contiene. Da qui la check: una
// voce per ogni TS contrassegnata come rilevante per il perimetro, con i codici
// di partita che le stanno sotto.
//
// OBBLIGATORIA NELLA PARTE CHE CONTA. Le voci nascono dai titoli, non
// dall'operatore: finché una TS rilevante non ha risposta, il triage non è
// completo. Le domande delle direttrici restano un'altra cosa e non bloccano
// nulla — sono un approfondimento, non un requisito.
//
// UNA VOCE NON RISCONTRATA DEVE DIRE CHE COSA È. «Non riscontrata» da sola non
// distingue un problema momentaneo da un modus operandi, ed è proprio la
// distinzione che serve. Per questo la natura è obbligatoria su quella
// risposta, e può restare «non valutabile» quando l'operatore non lo sa: è
// un'informazione, non un silenzio.
//
// Logica pura: nessun accesso al database, così si verifica con i test.

/** Che atteggiamento esprime la lavorazione, secondo l'ente. */
export type VersoPerimetro = 'COLLABORATIVA' | 'RESISTENZA';

export const ETICHETTA_VERSO: Record<VersoPerimetro, string> = {
  COLLABORATIVA: 'Collaborativa — l’azienda si muove per restare nel perimetro',
  RESISTENZA: 'Di resistenza — la lavorazione serve a contrastare una condotta elusiva',
};

export type StatoPerimetro = 'RISCONTRATA' | 'NON_RISCONTRATA' | 'NON_APPLICABILE';

export const ETICHETTA_STATO: Record<StatoPerimetro, string> = {
  RISCONTRATA: 'Riscontrata',
  NON_RISCONTRATA: 'Non riscontrata',
  NON_APPLICABILE: 'Non applicabile',
};

export type NaturaProblema = 'MOMENTANEO' | 'MODUS_OPERANDI' | 'NON_VALUTABILE';

export const ETICHETTA_NATURA: Record<NaturaProblema, string> = {
  MOMENTANEO: 'Problema momentaneo',
  MODUS_OPERANDI: 'Modus operandi',
  NON_VALUTABILE: 'Non valutabile con i dati disponibili',
};

/** Una TS come è configurata nella materia, con il contrassegno di perimetro. */
export interface LavorazionePerimetro {
  id: number;
  materiaId: number;
  materia: string | null;
  tipologia: string;
  dipendenza: string | null;
  rilevantePerimetro: boolean;
  versoPerimetro: VersoPerimetro | null;
}

/** Il codice di partita, con la materia in cui cade: è il ponte verso la TS. */
export interface TitoloPerimetro {
  codice: string;
  materiaId: number | null;
}

/** Una voce della check: la TS rilevante e la risposta dell'operatore. */
export interface VocePerimetro {
  lavorazioneId: number;
  tipologia: string;
  materia: string | null;
  dipendenza: string | null;
  verso: VersoPerimetro | null;
  /** I codici di partita che cadono nella materia di questa lavorazione. */
  codici: string[];
  stato: StatoPerimetro | null;
  natura: NaturaProblema | null;
  nota: string | null;
}

/**
 * Le voci obbligatorie: una per ogni TS contrassegnata come rilevante.
 *
 * Non si filtrano i titoli per debito: il legame fra un codice di partita e
 * un importo del triage non è un dato che la piattaforma possiede — le
 * posizioni hanno una descrizione, non un codice. Dire «questa TS riguarda
 * solo i crediti con debito» sarebbe una deduzione, e per giunta sbagliata
 * quando il debito è a zero perché la pratica è stata chiusa. La voce elenca
 * i codici che la materia copre: chi risponde sa di che cosa sta parlando.
 */
export function vociObbligatorie(
  titoli: TitoloPerimetro[],
  lavorazioni: LavorazionePerimetro[]
): VocePerimetro[] {
  const perLavorazione = lavorazioni
    .filter((l) => l.rilevantePerimetro)
    .slice()
    .sort((a, b) => (a.materia ?? '').localeCompare(b.materia ?? '', 'it') || a.id - b.id);

  return perLavorazione.map((l) => ({
    lavorazioneId: l.id,
    tipologia: l.tipologia,
    materia: l.materia,
    dipendenza: l.dipendenza,
    verso: l.versoPerimetro,
    codici: titoli
      .filter((t) => t.materiaId === l.materiaId)
      .map((t) => t.codice)
      .sort((a, b) => a.localeCompare(b, 'it')),
    stato: null,
    natura: null,
    nota: null,
  }));
}

/** Le risposte già salvate, applicate alle voci ricalcolate dai titoli. */
export function applicaRisposte(
  voci: VocePerimetro[],
  salvate: Pick<VocePerimetro, 'lavorazioneId' | 'stato' | 'natura' | 'nota'>[]
): VocePerimetro[] {
  const perId = new Map(salvate.map((s) => [s.lavorazioneId, s]));
  return voci.map((v) => {
    const s = perId.get(v.lavorazioneId);
    return s ? { ...v, stato: s.stato, natura: s.natura, nota: s.nota } : v;
  });
}

/**
 * Che cosa manca. Una voce senza stato è incompleta; una voce «non
 * riscontrata» senza natura lo è altrettanto, perché non dice che cosa è
 * successo. «Non applicabile» non chiede natura: la TS non riguarda questa
 * azienda, e chiederne la natura sarebbe una domanda senza oggetto.
 */
export function mancanze(voci: VocePerimetro[]): string[] {
  const out: string[] = [];
  for (const v of voci) {
    const nome = `«${v.tipologia}»${v.materia ? ` (${v.materia})` : ''}`;
    if (!v.stato) {
      out.push(`${nome}: indicare se la lavorazione è stata riscontrata.`);
      continue;
    }
    if (v.stato === 'NON_RISCONTRATA' && !v.natura) {
      out.push(`${nome}: dire se è un problema momentaneo o un modus operandi.`);
    }
    if (v.nota && v.nota.length > 500) {
      out.push(`${nome}: la nota non può superare 500 caratteri.`);
    }
  }
  return out;
}

export function completa(voci: VocePerimetro[]): boolean {
  return voci.length > 0 && mancanze(voci).length === 0;
}

export interface SintesiPerimetro {
  totali: number;
  riscontrate: number;
  nonRiscontrate: number;
  nonApplicabili: number;
  /** Voci ancora senza risposta (o senza natura). */
  daCompilare: number;
  /** Codici sotto una TS di resistenza non riscontrata: i crediti da guardare. */
  codiciDaAttenzionare: string[];
  /** Codici sotto una TS non riscontrata per un problema momentaneo. */
  codiciIncidentali: string[];
  /** Codici sotto una TS non riscontrata come modus operandi. */
  codiciStrutturali: string[];
  etichetta: string;
  dettaglio: string;
}

/**
 * Il quadro della check, per il riepilogo.
 *
 * La distinzione che conta non è «quante sono» ma DOVE stanno i codici: su una
 * condotta strutturale o su un incidente. Le due liste non si sommano mai in
 * un unico numero, perché dire «12 crediti da attenzionare» quando nove sono
 * incidenti e tre sono modus operandi nasconderebbe l'unica informazione utile.
 */
export function sintesiPerimetro(voci: VocePerimetro[]): SintesiPerimetro {
  const riscontrate = voci.filter((v) => v.stato === 'RISCONTRATA').length;
  const nonRiscontrate = voci.filter((v) => v.stato === 'NON_RISCONTRATA');
  const nonApplicabili = voci.filter((v) => v.stato === 'NON_APPLICABILE').length;
  const daCompilare = voci.filter(
    (v) => !v.stato || (v.stato === 'NON_RISCONTRATA' && !v.natura)
  ).length;

  const codici = (filtro: (v: VocePerimetro) => boolean) =>
    Array.from(new Set(nonRiscontrate.filter(filtro).flatMap((v) => v.codici))).sort((a, b) =>
      a.localeCompare(b, 'it')
    );

  const incidentali = codici((v) => v.natura === 'MOMENTANEO');
  const strutturali = codici((v) => v.natura === 'MODUS_OPERANDI');
  // Anche una TS di resistenza non riscontrata senza natura è da guardare: la
  // risposta manca, e il codice non può sparire dal quadro per questo. Se la
  // natura è dichiarata, però, comanda quella: un problema momentaneo sotto
  // una TS di resistenza resta un problema momentaneo, e i due elenchi non si
  // sommano (leggeremmo lo stesso codice due volte).
  const daAttenzionare = Array.from(
    new Set(
      nonRiscontrate
        .filter(
          (v) => v.natura === 'MODUS_OPERANDI' || (v.verso === 'RESISTENZA' && v.natura === null)
        )
        .flatMap((v) => v.codici)
    )
  ).sort((a, b) => a.localeCompare(b, 'it'));

  if (voci.length === 0) {
    return {
      totali: 0,
      riscontrate: 0,
      nonRiscontrate: 0,
      nonApplicabili: 0,
      daCompilare: 0,
      codiciDaAttenzionare: [],
      codiciIncidentali: [],
      codiciStrutturali: [],
      etichetta: 'Nessuna TS rilevante per il perimetro',
      dettaglio:
        'Nessuna lavorazione delle materie è contrassegnata come rilevante per il perimetro: la check obbligatoria non ha voci. Il contrassegno si imposta in Parametri di Spazio → Materie e lavorazioni.',
    };
  }

  if (daCompilare > 0) {
    return {
      totali: voci.length,
      riscontrate,
      nonRiscontrate: nonRiscontrate.length,
      nonApplicabili,
      daCompilare,
      codiciDaAttenzionare: daAttenzionare,
      codiciIncidentali: incidentali,
      codiciStrutturali: strutturali,
      etichetta: 'Check di perimetro incompleta',
      dettaglio: `${daCompilare} ${
        daCompilare === 1 ? 'voce non ha risposta' : 'voci non hanno risposta'
      }: il triage non si considera completo finché le TS rilevanti non sono state verificate.`,
    };
  }

  const pezzi: string[] = [];
  if (strutturali.length > 0)
    pezzi.push(
      `${strutturali.length} ${
        strutturali.length === 1 ? 'codice sta' : 'codici stanno'
      } sotto una condotta strutturale (modus operandi)`
    );
  if (incidentali.length > 0)
    pezzi.push(
      `${incidentali.length} ${
        incidentali.length === 1 ? 'codice viene' : 'codici vengono'
      } da un problema momentaneo`
    );

  return {
    totali: voci.length,
    riscontrate,
    nonRiscontrate: nonRiscontrate.length,
    nonApplicabili,
    daCompilare: 0,
    codiciDaAttenzionare: daAttenzionare,
    codiciIncidentali: incidentali,
    codiciStrutturali: strutturali,
    etichetta:
      strutturali.length > 0
        ? 'Perimetro: condotta strutturale da presidiare'
        : daAttenzionare.length > 0
          ? 'Perimetro: crediti da attenzionare'
          : 'Perimetro: nessuna condotta elusiva rilevata',
    dettaglio:
      pezzi.length > 0
        ? `${pezzi.join('; ')}. Il quadro non dice nulla sull’importo del debito: quello lo misurano le soglie, con i suoi valori.`
        : 'Tutte le TS rilevanti risultano riscontrate e nessun codice è rimasto sotto una condotta di resistenza. La verifica riguarda le lavorazioni configurate, non l’intera storia dell’azienda.',
  };
}
