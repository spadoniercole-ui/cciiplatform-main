// src/lib/cciiEngine.ts

export interface IndiceXbrl {
  id: string;
  categoria: string;
  nome: string;
  formula: string;
  xbrlTag: string; // Es: "UtilePerditaEsercizio / TotalePatrimonioNetto * 100"
  attivo: boolean;
}

export interface EngineResult {
  id: string;
  nome: string;
  categoria: string;
  valore: number | null;
  stato: 'SUCCESS' | 'TAG_DISATTIVATO' | 'DATO_MANCANTE' | 'ERRORE_MATEMATICO';
  notaDettaglio: string;
}

/**
 * Normalizza i tag rimuovendo prefissi comuni (es: it-cc-dg_)
 * per garantire il matching tra dizionario formule e tassonomia reale.
 */
const cleanTagToken = (token: string): string => {
  return token.replace(/^it-cc-dg_/, '').trim();
};

/**
 * Valutatore matematico sicuro (No eval grezzo).
 * Elabora espressioni aritmetiche elementari (+, -, *, /) pre-popolate con i valori numerici.
 */
const safeEvaluate = (expression: string): number => {
  // Sanificazione stringa da caratteri nocivi
  const sanitized = expression.replace(/[^0-9.\s+\-*/()]/g, '');
  try {
    // Utilizzo controllato per calcolo aritmetico puro di soli numeri
    const fn = new Function(`return (${sanitized});`);
    const res = fn();
    if (!isFinite(res) || isNaN(res)) throw new Error('Errore matematico');
    return Number(res);
  } catch (e) {
    throw new Error('Divisione per zero o espressione malformata');
  }
};

/**
 * MOTORE DI CALCOLO CCII
 * @param indici Elenco delle formule dal dizionario master
 * @param xbrlValori Mappa chiave-valore dei dati estratti dal file XBRL (es: { TotaleAttivo: 500000 })
 * @param sessioneTag Mappa dei tag abilitati dal Superadmin (da localStorage)
 */
export const elaboraMotoreCCII = (
  indici: IndiceXbrl[],
  xbrlValori: Record<string, number>,
  sessioneTag: Record<string, boolean>
): EngineResult[] => {
  return indici.map((indice) => {
    // Se l'indice stesso è disattivato globalmente nel dizionario
    if (!indice.attivo) {
      return {
        id: indice.id,
        nome: indice.nome,
        categoria: indice.categoria,
        valore: null,
        stato: 'TAG_DISATTIVATO',
        notaDettaglio: 'Indice disattivato nel dizionario master.',
      };
    }

    // Estraiamo i token alfabetici dalla stringa xbrlTag per capire quali tag servono
    // Es: "it-cc-dg_UtileNetto / it-cc-dg_PatrimonioNetto" -> ["it-cc-dg_UtileNetto", "it-cc-dg_PatrimonioNetto"]
    const rawTokens = indice.xbrlTag.match(/[a-zA-Z0-9_]+/g) || [];

    let sottoesameExpression = indice.xbrlTag;
    let haTagDisattivato = false;
    let haDatoMancante = false;
    const dettagliMancanti: string[] = [];

    // Analizziamo ogni singolo tag richiesto dalla formula
    for (const rawToken of rawTokens) {
      // Salta i token puramente numerici presi per errore dal regex
      if (/^\d+$/.test(rawToken)) continue;

      const tagPulito = cleanTagToken(rawToken);

      // 1. Controllo di veto del Superadmin (Sessione localStorage della Fase 2)
      // Se il tag è presente in sessione ed è esplicitamente false, blocchiamo tutto
      if (sessioneTag[tagPulito] === false) {
        haTagDisattivato = true;
        dettagliMancanti.push(`${tagPulito} (Disabilitato da Admin)`);
      }

      // 2. Controllo presenza del dato nel file XBRL caricato
      const valoreEstratto = xbrlValori[tagPulito];
      if (valoreEstratto === undefined) {
        haDatoMancante = true;
        dettagliMancanti.push(`${tagPulito} (Non trovato nel file)`);
      }

      // Sostituzione dinamica nel pattern matematico
      const valoreFisico = valoreEstratto || 0;
      // Sostituiamo il token originale (compreso di eventuale vecchio prefisso) con il numero reale
      sottoesameExpression = sottoesameExpression.replace(
        new RegExp(rawToken, 'g'),
        valoreFisico.toString()
      );
    }

    // Gestione degli stati di blocco blandi/critici
    if (haTagDisattivato) {
      return {
        id: indice.id,
        nome: indice.nome,
        categoria: indice.categoria,
        valore: null,
        stato: 'TAG_DISATTIVATO',
        notaDettaglio: `Calcolo inibito. Tag critici esclusi: ${dettagliMancanti.join(', ')}`,
      };
    }

    if (haDatoMancante) {
      return {
        id: indice.id,
        nome: indice.nome,
        categoria: indice.categoria,
        valore: null,
        stato: 'DATO_MANCANTE',
        notaDettaglio: `Dati insufficienti nel bilancio per mappare: ${dettagliMancanti.join(', ')}`,
      };
    }

    // 3. Esecuzione del calcolo matematico con gestione fallimento
    try {
      const risultatoNumerico = safeEvaluate(sottoesameExpression);
      return {
        id: indice.id,
        nome: indice.nome,
        categoria: indice.categoria,
        valore: parseFloat(risultatoNumerico.toFixed(2)),
        stato: 'SUCCESS',
        notaDettaglio: `Calcolo eseguito correttamente. Formula applicata: ${indice.formula}`,
      };
    } catch (error) {
      return {
        id: indice.id,
        nome: indice.nome,
        categoria: indice.categoria,
        valore: null,
        stato: 'ERRORE_MATEMATICO',
        notaDettaglio:
          'Incongruenza contabile (Probabile divisione per zero: es. Patrimonio Netto o Attivo pari a 0).',
      };
    }
  });
};
