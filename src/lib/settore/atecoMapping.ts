// src/lib/settore/atecoMapping.ts
//
// L'indice di fatturato ISTAT (fonte: comunicato mensile "Fatturato
// dell'industria e dei servizi", verificato — usa ancora ATECO 2007
// nonostante ATECO 2025 sia in vigore dal 2025: la statistica ufficiale
// non ha ancora ribasato le serie) copre SOLO alcune sezioni: B, C
// (industria estrattiva e manifatturiera) e G (esclusa la divisione 47),
// H, I, J, L, M, N (servizi). Fuori da queste, niente dato — e va detto
// chiaramente, non taciuto.
//
// Il dettaglio disponibile è "gruppo di attività economica" (3 cifre,
// es. 52.2), non le 6 cifre di un codice ATECO completo (es. 52.25.09):
// va troncato, non cercato per intero.

export type DataflowSettore = 'SERVIZI' | 'INDUSTRIA' | null;

interface Sezione {
  lettera: string;
  divisioni: [number, number]; // intervallo incluso
}

const SEZIONI: Sezione[] = [
  { lettera: 'A', divisioni: [1, 3] },
  { lettera: 'B', divisioni: [5, 9] },
  { lettera: 'C', divisioni: [10, 33] },
  { lettera: 'D', divisioni: [35, 35] },
  { lettera: 'E', divisioni: [36, 39] },
  { lettera: 'F', divisioni: [41, 43] },
  { lettera: 'G', divisioni: [45, 47] },
  { lettera: 'H', divisioni: [49, 53] },
  { lettera: 'I', divisioni: [55, 56] },
  { lettera: 'J', divisioni: [58, 63] },
  { lettera: 'K', divisioni: [64, 66] },
  { lettera: 'L', divisioni: [68, 68] },
  { lettera: 'M', divisioni: [69, 75] },
  { lettera: 'N', divisioni: [77, 82] },
  { lettera: 'O', divisioni: [84, 84] },
  { lettera: 'P', divisioni: [85, 85] },
  { lettera: 'Q', divisioni: [86, 88] },
  { lettera: 'R', divisioni: [90, 93] },
  { lettera: 'S', divisioni: [94, 96] },
  { lettera: 'T', divisioni: [97, 98] },
  { lettera: 'U', divisioni: [99, 99] },
];

const SEZIONI_SERVIZI = new Set(['H', 'I', 'J', 'L', 'M', 'N']);

export interface InfoSettoreAteco {
  divisione: string; // "52"
  gruppo: string; // "52.2" — il livello di dettaglio realmente disponibile
  sezione: string | null; // "H"
  dataflow: DataflowSettore;
  motivoAssenza: string | null; // spiegazione se dataflow === null
}

/** Estrae divisione (2 cifre) e gruppo (3 cifre, XX.X) da un codice ATECO completo o parziale. */
export function analizzaCodiceAteco(codiceAteco: string): InfoSettoreAteco | null {
  const pulito = codiceAteco.trim();
  const match = pulito.match(/^(\d{2})(?:\.(\d))?/);
  if (!match) return null;

  const divisione = match[1];
  const gruppo = match[2] ? `${divisione}.${match[2]}` : divisione;
  const divisioneNum = parseInt(divisione, 10);

  const sezioneTrovata = SEZIONI.find(
    (s) => divisioneNum >= s.divisioni[0] && divisioneNum <= s.divisioni[1]
  );
  const sezione = sezioneTrovata?.lettera || null;

  let dataflow: DataflowSettore = null;
  let motivoAssenza: string | null = null;

  if (sezione === 'B' || sezione === 'C') {
    dataflow = 'INDUSTRIA';
  } else if (sezione && SEZIONI_SERVIZI.has(sezione)) {
    dataflow = 'SERVIZI';
  } else if (sezione === 'G' && divisioneNum !== 47) {
    dataflow = 'SERVIZI'; // commercio all'ingrosso e riparazione autoveicoli, incluso nell'indice servizi
  } else if (sezione === 'G' && divisioneNum === 47) {
    motivoAssenza =
      "Il commercio al dettaglio (divisione 47) non è nell'indice del fatturato industria/servizi — esiste un indice ISTAT dedicato (vendite al dettaglio), non ancora collegato.";
  } else if (sezione) {
    motivoAssenza = `La sezione ${sezione} (${divisione}) non è coperta dall'indice ISTAT del fatturato industria/servizi — quell'indice copre solo B, C, G (tranne 47), H, I, J, L, M, N.`;
  } else {
    motivoAssenza = 'Divisione ATECO non riconosciuta.';
  }

  return { divisione, gruppo, sezione, dataflow, motivoAssenza };
}
