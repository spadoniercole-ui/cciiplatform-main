// src/lib/proposta/documentiRicevuti.ts
//
// I documenti ricevuti dall'azienda, caricati TUTTI INSIEME in un unico
// punto (non più tre scomparti fissi da riempire nel modo giusto). Ognuno
// ha un tipo, deciso dalla prima lettura e correggibile dall'istruttore; da
// qui si ricavano i ruoli che la valutazione conosce (proposta, attestazione,
// piano) e gli altri documenti, che entrano comunque nella lettura.
//
// Logica pura.

import type { TipoDocumentoRicevuto } from './primaLettura';

export interface DocumentoRicevuto {
  nome: string;
  url: string;
  tipo: TipoDocumentoRicevuto;
}

export interface DocumentoRuolo {
  nome: string;
  url: string;
}

export interface RuoliDocumenti {
  proposta: DocumentoRuolo | null;
  attestazione: DocumentoRuolo | null;
  piano: DocumentoRuolo | null;
  situazioneContabile: DocumentoRuolo | null;
  /** Tutti i documenti che non occupano un ruolo (compresi i secondi dello stesso tipo). */
  altri: DocumentoRuolo[];
}

/** Tipo dal nome del file: ripiego quando la lettura non ha classificato un documento. */
export function tipoDaNomeFile(nome: string): TipoDocumentoRicevuto {
  const n = nome.toLowerCase();
  if (/attestaz|asseveraz|relazione.*(professionista|attestator)/.test(n)) return 'ATTESTAZIONE';
  if (/situazione|bilancino|patrimonial|verifica|elenco.*credit/.test(n))
    return 'SITUAZIONE_CONTABILE';
  if (/proposta|accordo|transazione|domanda/.test(n)) return 'PROPOSTA';
  if (/piano/.test(n)) return 'PIANO';
  return 'ALTRO';
}

const normalizza = (s: string) =>
  s
    .toLowerCase()
    .replace(/\.pdf$/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/**
 * Assegna i tipi: prima la classificazione della lettura (per titolo del
 * documento), poi il nome del file. Un solo documento caricato è la proposta.
 */
export function classificaDocumenti(
  documenti: { nome: string; url: string }[],
  classificazione: { documento: string; tipo: TipoDocumentoRicevuto }[]
): DocumentoRicevuto[] {
  const mappa = new Map(classificazione.map((c) => [normalizza(c.documento), c.tipo]));
  const out = documenti.map((d) => ({
    ...d,
    tipo: mappa.get(normalizza(d.nome)) ?? tipoDaNomeFile(d.nome),
  }));
  if (out.length === 1) out[0].tipo = 'PROPOSTA';
  if (out.length > 1 && !out.some((d) => d.tipo === 'PROPOSTA')) {
    // Nessuna proposta riconosciuta: il primo documento non classificato lo diventa.
    const candidato = out.find((d) => d.tipo === 'ALTRO') ?? out[0];
    candidato.tipo = 'PROPOSTA';
  }
  return out;
}

export function ruoliDaDocumenti(elenco: DocumentoRicevuto[]): RuoliDocumenti {
  const ruoli: RuoliDocumenti = {
    proposta: null,
    attestazione: null,
    piano: null,
    situazioneContabile: null,
    altri: [],
  };
  for (const d of elenco) {
    const x = { nome: d.nome, url: d.url };
    const chiave =
      d.tipo === 'PROPOSTA'
        ? 'proposta'
        : d.tipo === 'ATTESTAZIONE'
          ? 'attestazione'
          : d.tipo === 'PIANO'
            ? 'piano'
            : d.tipo === 'SITUAZIONE_CONTABILE'
              ? 'situazioneContabile'
              : null;
    if (chiave && !ruoli[chiave]) ruoli[chiave] = x;
    else ruoli.altri.push(x);
  }
  return ruoli;
}

/** Il formato precedente (tre scomparti) letto come elenco. */
export function elencoDaSalvato(grezzo: unknown): DocumentoRicevuto[] {
  if (!grezzo || typeof grezzo !== 'object') return [];
  const g = grezzo as Record<string, unknown>;
  if (Array.isArray(g.elenco)) {
    return (g.elenco as DocumentoRicevuto[]).filter((d) => d && d.nome && d.url);
  }
  const vecchio: [string, TipoDocumentoRicevuto][] = [
    ['propostaCramDown', 'PROPOSTA'],
    ['asseverazione', 'ATTESTAZIONE'],
    ['pianoSviluppo', 'PIANO'],
  ];
  return vecchio
    .map(([k, tipo]) => {
      const d = g[k] as { nome?: string; url?: string } | null | undefined;
      return d?.nome && d?.url ? { nome: d.nome, url: d.url, tipo } : null;
    })
    .filter((d): d is DocumentoRicevuto => d !== null);
}
