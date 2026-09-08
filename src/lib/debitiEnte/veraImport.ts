// Import del file VERA (INPS "DettaglioRichiesta"): legge TUTTE le sezioni
// del foglio indicato, ognuna con la sua natura data dal TITOLO di sezione
// (l'escamotage della colonna-guida applicato al titolo). Browser-safe.
//
// v1: per la verifica certo-per-certo a livello di categoria serve, per ogni
// sezione, la somma dell'importo. La colonna importo si individua per
// etichetta ("Totale debito" → "Importo"/"Residuo" → ultima numerica); la
// voce è la prima colonna testuale. Nessuna mappatura colonna-per-colonna:
// ciò che l'operatore mappa è solo il titolo di sezione → categoria.

import {
  estraiTutteLeSezioni,
  normalizzaEtichetta,
  testoCella,
  type SezioneConTitolo,
} from './tracciatoCore';
import { leggiFoglioAoa, elencoFogli } from './tracciatoExcel';
import { parseNumero } from './tracciatoImport';

export const FOGLIO_VERA_DEFAULT = 'Dettaglio Verifica';

function indiceImporto(intestazioni: string[]): number {
  const norm = intestazioni.map(normalizzaEtichetta);
  let i = norm.findIndex((h) => h === 'totale debito');
  if (i < 0) i = norm.findIndex((h) => h.includes('importo') || h.includes('residuo'));
  return i;
}

function indiceCredito(intestazioni: string[]): number {
  const norm = intestazioni.map(normalizzaEtichetta);
  let i = norm.findIndex((h) => h === 'totale credito');
  if (i < 0) i = norm.findIndex((h) => h.includes('credito'));
  return i;
}

function indiceVoce(intestazioni: string[]): number {
  const norm = intestazioni.map(normalizzaEtichetta);
  // La "voce" per VERA è la NATURA dell'omissione (F24 Non presentato, 18 -
  // Verbale Evasione, Denunce non trasmesse…): è ciò che conta per la catena
  // Natura+Stato. Ha PRIORITÀ su Posizione/Gestione, che sono solo identificativi.
  let i = norm.findIndex((h) => /(natura|omission|tipolog)/.test(h));
  if (i < 0) i = norm.findIndex((h) => /(descriz|causale|voce)/.test(h));
  if (i < 0) i = norm.findIndex((h) => /(posizione|gestione)/.test(h));
  return i >= 0 ? i : 0;
}

// Colonna "Stato": la dicitura distingue, DENTRO VERA, i debiti già
// contabilizzati (cella vuota) da quelli NON contabilizzati (cella valorizzata
// — certi ma non ancora esigibili, da lavorare). La dicitura non cambia tra i
// file VERA. Se la colonna manca (es. ADR, Gestione Separata) tutte le righe
// sono contabilizzate.
function indiceStato(intestazioni: string[]): number {
  const norm = intestazioni.map(normalizzaEtichetta);
  return norm.findIndex((h) => h === 'stato');
}

export interface SezioneVera {
  titolo: string;
  intestazioni: string[];
  idxImporto: number;
  idxVoce: number;
  numeroRighe: number;
  totale: number;
  righe: { voce: string; importo: number; stato: string }[];
}

export interface AnalisiVera {
  fogli: string[];
  foglioLetto: string;
  sezioni: SezioneVera[];
  /** Titoli di sezione distinti trovati nel file (normalizzati → label originale). */
  titoli: { norm: string; label: string }[];
}

function sezioneVeraDa(s: SezioneConTitolo): SezioneVera {
  const idxImporto = indiceImporto(s.intestazioni);
  const idxVoce = indiceVoce(s.intestazioni);
  // NETTING: se la sezione ha una colonna "Totale credito", l'importo utile è
  // debito − credito (posizione netta). Dove la colonna manca (es. ADR,
  // Gestione Separata) coincide col debito, e i totali combaciano al centesimo
  // col foglio Esito. Nella prima gestione può restare un piccolo scarto: è
  // dovuto alle Note di Rettifica, che l'Esito somma ma non compaiono nelle
  // righe di dettaglio.
  const idxCredito = indiceCredito(s.intestazioni);
  const idxStato = indiceStato(s.intestazioni);
  const righe = s.righe.map((r, n) => {
    const debito = idxImporto >= 0 ? parseNumero(r[idxImporto]) : 0;
    const credito = idxCredito >= 0 ? parseNumero(r[idxCredito]) : 0;
    return {
      voce:
        idxVoce >= 0 && testoCella(r[idxVoce]).trim() !== ''
          ? testoCella(r[idxVoce])
          : `Riga ${n + 1}`,
      importo: debito - credito,
      stato: idxStato >= 0 ? testoCella(r[idxStato]).trim() : '',
    };
  });
  const totale = righe.reduce((a, r) => a + r.importo, 0);
  return {
    titolo: s.titolo,
    intestazioni: s.intestazioni,
    idxImporto,
    idxVoce,
    numeroRighe: righe.length,
    totale,
    righe,
  };
}

/** Analizza il file VERA: sezioni e titoli distinti. */
export async function analizzaVera(file: File, foglio?: string): Promise<AnalisiVera> {
  const fogli = await elencoFogli(file);
  const foglioScelto =
    foglio && fogli.includes(foglio)
      ? foglio
      : fogli.includes(FOGLIO_VERA_DEFAULT)
        ? FOGLIO_VERA_DEFAULT
        : fogli[0];
  const { aoa, foglioLetto } = await leggiFoglioAoa(file, foglioScelto);
  const sezioni = estraiTutteLeSezioni(aoa).map(sezioneVeraDa);
  const titoliMap = new Map<string, string>();
  for (const s of sezioni) {
    const norm = normalizzaEtichetta(s.titolo);
    if (norm && !titoliMap.has(norm)) titoliMap.set(norm, s.titolo);
  }
  return {
    fogli,
    foglioLetto,
    sezioni,
    titoli: Array.from(titoliMap.entries()).map(([norm, label]) => ({ norm, label })),
  };
}

// TRATTAMENTO della riga, deciso dalla CATENA Natura+Stato (non dal solo
// stato): il debito è già a ruolo, ancora da mettere a ruolo, oppure una
// posizione potenziale di cui non si conosce ancora l'importo (es. "Denunce
// non trasmesse": natura presente, nessuno stato, nessun importo).
export type TrattamentoVera = 'contabilizzato' | 'da_contabilizzare' | 'potenziale' | 'ignora';

export const ETICHETTE_TRATTAMENTO: Record<TrattamentoVera, string> = {
  contabilizzato: 'Contabilizzato',
  da_contabilizzare: 'Da contabilizzare',
  potenziale: 'Potenziale (importo ignoto)',
  ignora: 'Ignora',
};

/** Chiave normalizzata della combinazione Natura+Stato. */
export function chiaveCombinazione(natura: string, stato: string): string {
  return `${normalizzaEtichetta(natura)}::${normalizzaEtichetta(stato)}`;
}

/** Trattamento suggerito per una combinazione mai vista, da confermare dall'operatore. */
export function suggerisciTrattamento(stato: string, importo: number): TrattamentoVera {
  if (Math.abs(importo) < 0.005) return 'potenziale'; // natura presente ma importo ignoto
  return stato.trim() === '' ? 'contabilizzato' : 'da_contabilizzare';
}

export interface RigaVera {
  sezione: string;
  voce: string;
  importo: number;
  categoria: string;
  /** Dicitura della colonna Stato. */
  stato: string;
  /** Trattamento derivato dalla combinazione Natura+Stato. */
  trattamento: TrattamentoVera;
}

export interface CombinazioneVera {
  chiave: string;
  natura: string;
  stato: string;
  suggerito: TrattamentoVera;
}

/**
 * Trasforma le sezioni in righe salvabili. La CATEGORIA viene dal titolo di
 * sezione (`mappaturaTitoli`), il TRATTAMENTO dalla combinazione Natura+Stato
 * (`mappaturaTrattamenti`, chiave → trattamento). Titoli e combinazioni non
 * ancora mappati vengono elencati a parte per chiederli all'operatore.
 */
export function estraiRigheVera(
  sezioni: SezioneVera[],
  mappaturaTitoli: Record<string, string>,
  mappaturaTrattamenti: Record<string, TrattamentoVera> = {}
): {
  righe: RigaVera[];
  titoliNonMappati: { norm: string; label: string }[];
  combinazioniNonMappate: CombinazioneVera[];
} {
  const righe: RigaVera[] = [];
  const nonMappati: { norm: string; label: string }[] = [];
  const vistiNonMappati = new Set<string>();
  const combNonMappate: CombinazioneVera[] = [];
  const vistiComb = new Set<string>();
  for (const s of sezioni) {
    const norm = normalizzaEtichetta(s.titolo);
    const categoria = mappaturaTitoli[norm];
    if (!categoria) {
      if (!vistiNonMappati.has(norm)) {
        vistiNonMappati.add(norm);
        nonMappati.push({ norm, label: s.titolo });
      }
      continue;
    }
    for (const r of s.righe) {
      const chiave = chiaveCombinazione(r.voce, r.stato);
      const trattamento = mappaturaTrattamenti[chiave];
      if (!trattamento) {
        if (!vistiComb.has(chiave)) {
          vistiComb.add(chiave);
          combNonMappate.push({
            chiave,
            natura: r.voce,
            stato: r.stato,
            suggerito: suggerisciTrattamento(r.stato, r.importo),
          });
        }
        continue;
      }
      righe.push({
        sezione: s.titolo,
        voce: r.voce,
        importo: r.importo,
        categoria,
        stato: r.stato,
        trattamento,
      });
    }
  }
  return { righe, titoliNonMappati: nonMappati, combinazioniNonMappate: combNonMappate };
}
