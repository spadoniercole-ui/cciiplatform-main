// src/lib/prodotti/prodottiExcel.ts
//
// IL FOGLIO DEI PRODOTTI, PER LA MANUTENZIONE IN BLOCCO (0.165.0).
//
// Il blocco dei prodotti si compila uno per uno, e con qualche decina di
// prodotti e tre o quattro domande ciascuno sono centinaia di campi. Questo
// modulo fa il giro completo: scrive il foglio dei prodotti configurati e
// rilegge quello corretto in Excel, perché la manutenzione si fa dove si
// vedono tutte le righe insieme.
//
// UNA RIGA PER DOMANDA. Le righe con la stessa coppia direttrice/prodotto sono
// lo stesso prodotto: è la stessa identità del database (`chiaveProdotto`),
// quindi reimportare il file aggiorna, non duplica.
//
// L'ID DELLA DOMANDA NON SI RIGENERA. Le risposte del triage sono agganciate a
// prodotto + id domanda: un id nuovo è una domanda nuova, e la risposta già
// data resterebbe orfana. Se la colonna è vuota l'id si ricava dalla posizione
// (`q1`, `q2`, …), quindi lo stesso file riletto due volte produce gli stessi
// id — e la seconda lettura non cambia nulla.
//
// LA VALIDAZIONE È QUELLA DELLA SCHERMATA. Le righe passano da `validaProdotto`
// e `normalizzaProdotto`, non da regole riscritte qui: un flag senza domande o
// un nome troppo lungo sono un errore di riga, esattamente come lo sarebbero
// nel salvataggio singolo. Un import che accettasse ciò che la schermata
// rifiuta aprirebbe una seconda strada per entrare in uno stato che il triage
// non sa leggere.

import * as XLSX from 'xlsx';
import { unaRiga } from '@/lib/titoliEnte/catalogoTl';
import {
  MASSIMO_CARATTERI_RISPOSTA_LIBERA,
  chiaveProdotto,
  normalizzaProdotto,
  validaProdotto,
  type DomandaProdotto,
  type InputProdottoEnte,
  type ProdottoEnte,
  type TipoDomanda,
} from '@/lib/prodotti/prodotti';

/** Le intestazioni del foglio; la lettura le ritrova dal testo, non dalla posizione. */
export const INTESTAZIONI_PRODOTTI = [
  'Direttrice',
  'Prodotto',
  'In check list',
  'Id domanda',
  'Domanda',
  'Risposta',
  'Max caratteri',
] as const;

const ETICHETTA_TIPO: Record<TipoDomanda, string> = {
  SI_NO: 'Sì/No',
  TESTO_LIBERO: 'Testo libero',
};

const NOTA =
  'Una riga per domanda: le righe con la stessa direttrice e lo stesso prodotto sono lo stesso prodotto. ' +
  'In check list: Sì o No, e con il Sì serve almeno una domanda. Risposta: «Sì/No» oppure «Testo libero». ' +
  'Id domanda: lascialo vuoto per le domande nuove, non cambiarlo per quelle che hanno già risposte.';

/** L'esito di un import in blocco: i conteggi servono al riepilogo mostrato. */
export interface EsitoImportProdotti {
  success: boolean;
  creati?: number;
  aggiornati?: number;
  invariati?: number;
  domandeAggiunte?: number;
  domandeRimosse?: number;
  domandeConservate?: number;
  errori?: { riga: number; motivo: string }[];
  error?: string;
}

function nomeFileSicuro(testo: string): string {
  return (testo || 'prodotti_ente')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

/**
 * Scrive il foglio dei prodotti: una riga per domanda, un prodotto senza
 * domande su una riga sola, una direttrice ancora vuota come promemoria (è il
 * blocco da completare, non una riga da cancellare). Senza nulla da scrivere
 * resta il modello, con il suo esempio nella nota.
 */
export function esportaProdottiExcel(
  nome: string,
  prodotti: ProdottoEnte[],
  direttrici: string[]
): void {
  const dati: (string | number)[][] = [[NOTA], [...INTESTAZIONI_PRODOTTI]];

  const nomi: string[] = [];
  const gia = (testo: string) => nomi.some((n) => n.toLowerCase() === testo.toLowerCase());
  for (const d of [...direttrici, ...prodotti.map((p) => p.direttrice)]) {
    const pulito = unaRiga(d);
    if (pulito && !gia(pulito)) nomi.push(pulito);
  }

  for (const nomeDirettrice of nomi) {
    const della = prodotti
      .filter((p) => unaRiga(p.direttrice).toLowerCase() === nomeDirettrice.toLowerCase())
      .sort((a, b) => a.ordine - b.ordine || a.id - b.id);
    if (della.length === 0) {
      dati.push([nomeDirettrice, '', '', '', '', '', '']);
      continue;
    }
    for (const p of della) {
      if (p.domande.length === 0) {
        dati.push([p.direttrice, p.nome, p.inChecklist ? 'Sì' : 'No', '', '', '', '']);
        continue;
      }
      for (const d of p.domande) {
        dati.push([
          p.direttrice,
          p.nome,
          p.inChecklist ? 'Sì' : 'No',
          d.id,
          d.testo,
          ETICHETTA_TIPO[d.tipo],
          d.tipo === 'TESTO_LIBERO' ? (d.maxCaratteri ?? MASSIMO_CARATTERI_RISPOSTA_LIBERA) : '',
        ]);
      }
    }
  }

  if (nomi.length === 0) for (let i = 0; i < 10; i++) dati.push(['', '', '', '', '', '', '']);

  const foglio = XLSX.utils.aoa_to_sheet(dati);
  foglio['!cols'] = [
    { wch: 22 },
    { wch: 28 },
    { wch: 12 },
    { wch: 12 },
    { wch: 60 },
    { wch: 18 },
    { wch: 12 },
  ];
  foglio['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: INTESTAZIONI_PRODOTTI.length - 1 } }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, foglio, 'Prodotti');
  XLSX.writeFile(wb, `prodotti_ente_${nomeFileSicuro(nome)}.xlsx`);
}

export interface EsitoLetturaProdotti {
  prodotti: InputProdottoEnte[];
  righeConErrore: { riga: number; motivo: string }[];
  righeLette: number;
}

const senzaAccenti = (testo: string) =>
  testo
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const VERO = new Set(['si', 'yes', 'true', 'x', '1', 'vero']);
const FALSO = new Set(['no', 'false', '0', 'falso']);

/** Rilegge il foglio dei prodotti: riga per riga, senza scrivere niente. */
export async function leggiProdottiDaExcel(file: File): Promise<EsitoLetturaProdotti> {
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const foglio = wb.Sheets[wb.SheetNames[0]];
  if (!foglio || !foglio['!ref'])
    return {
      prodotti: [],
      righeConErrore: [{ riga: 0, motivo: 'Il foglio è vuoto.' }],
      righeLette: 0,
    };

  const intervallo = XLSX.utils.decode_range(foglio['!ref']);
  const testoCella = (riga: number, colonna: number): string =>
    colonna < 0
      ? ''
      : String(foglio[XLSX.utils.encode_cell({ r: riga, c: colonna })]?.v ?? '').trim();

  // Le intestazioni si cercano per testo: chi apre il file in Excel può
  // aggiungere righe in cima, e la nota delle istruzioni non deve spostare
  // tutto di una colonna.
  let rigaIntestazioni = -1;
  for (let r = intervallo.s.r; r <= Math.min(intervallo.e.r, intervallo.s.r + 15); r++) {
    let haDirettrice = false;
    let haProdotto = false;
    for (let c = intervallo.s.c; c <= intervallo.e.c; c++) {
      const testo = senzaAccenti(testoCella(r, c));
      if (testo.startsWith('direttrice')) haDirettrice = true;
      if (testo.startsWith('prodotto')) haProdotto = true;
    }
    if (haDirettrice && haProdotto) {
      rigaIntestazioni = r;
      break;
    }
  }
  if (rigaIntestazioni < 0)
    return {
      prodotti: [],
      righeConErrore: [
        {
          riga: 0,
          motivo:
            'Il foglio non ha le colonne «Direttrice» e «Prodotto»: scarica di nuovo il foglio dei prodotti.',
        },
      ],
      righeLette: 0,
    };

  const colonne = {
    direttrice: -1,
    prodotto: -1,
    flag: -1,
    id: -1,
    domanda: -1,
    tipo: -1,
    max: -1,
  };
  for (let c = intervallo.s.c; c <= intervallo.e.c; c++) {
    const testo = senzaAccenti(testoCella(rigaIntestazioni, c));
    if (!testo) continue;
    if (testo.startsWith('direttrice')) colonne.direttrice = c;
    else if (testo.startsWith('prodotto')) colonne.prodotto = c;
    else if (testo.includes('check')) colonne.flag = c;
    else if (testo.startsWith('id')) colonne.id = c;
    else if (testo.startsWith('domanda')) colonne.domanda = c;
    else if (testo.startsWith('risposta')) colonne.tipo = c;
    else if (testo.startsWith('max')) colonne.max = c;
  }
  if (colonne.prodotto < 0 || colonne.domanda < 0)
    return {
      prodotti: [],
      righeConErrore: [
        {
          riga: rigaIntestazioni + 1,
          motivo: 'Manca la colonna «Prodotto» o la colonna «Domanda».',
        },
      ],
      righeLette: 0,
    };

  interface RigaDomanda {
    riga: number;
    id: string;
    testo: string;
    tipo: string;
    max: string;
  }
  interface Gruppo {
    riga: number;
    direttrice: string;
    nome: string;
    inChecklist: boolean;
    domande: RigaDomanda[];
  }

  const gruppi = new Map<string, Gruppo>();
  const righeConErrore: { riga: number; motivo: string }[] = [];
  let righeLette = 0;

  for (let r = rigaIntestazioni + 1; r <= intervallo.e.r; r++) {
    const direttrice = testoCella(r, colonne.direttrice);
    const nome = testoCella(r, colonne.prodotto);
    const testoDomanda = testoCella(r, colonne.domanda);
    // Una riga con la sola direttrice è il promemoria di un blocco ancora
    // vuoto (o una riga vuota): non è un errore e non è un prodotto.
    if (!nome && !testoDomanda) continue;
    if (!nome) {
      righeConErrore.push({ riga: r + 1, motivo: 'Riga con la domanda ma senza prodotto.' });
      continue;
    }
    if (!direttrice) {
      righeConErrore.push({ riga: r + 1, motivo: `«${nome}» non ha una direttrice.` });
      continue;
    }

    righeLette += 1;
    const chiave = chiaveProdotto(direttrice, nome);
    let gruppo = gruppi.get(chiave);
    if (!gruppo) {
      gruppo = { riga: r + 1, direttrice, nome, inChecklist: false, domande: [] };
      gruppi.set(chiave, gruppo);
    }

    const flag = senzaAccenti(testoCella(r, colonne.flag));
    if (flag) {
      if (VERO.has(flag)) gruppo.inChecklist = true;
      else if (!FALSO.has(flag))
        righeConErrore.push({
          riga: r + 1,
          motivo: `«${flag}» non è un valore di «In check list»: scrivi Sì o No.`,
        });
    }

    if (!testoDomanda) continue;
    gruppo.domande.push({
      riga: r + 1,
      id: testoCella(r, colonne.id),
      testo: testoDomanda,
      tipo: senzaAccenti(testoCella(r, colonne.tipo)),
      max: testoCella(r, colonne.max),
    });
  }

  const prodotti: InputProdottoEnte[] = [];
  for (const gruppo of gruppi.values()) {
    const usati = new Set<string>();
    const domande: DomandaProdotto[] = [];
    let contatore = 0;
    let rotto = false;

    for (const d of gruppo.domande) {
      let id = d.id;
      if (id) {
        if (usati.has(id)) {
          righeConErrore.push({
            riga: d.riga,
            motivo: `L'id «${id}» compare due volte nello stesso prodotto.`,
          });
          rotto = true;
          continue;
        }
      } else {
        // L'id ricavato dalla posizione è stabile: lo stesso file, riletto,
        // dà gli stessi id e non stacca le risposte già date.
        do {
          contatore += 1;
          id = `q${contatore}`;
        } while (usati.has(id));
      }
      usati.add(id);

      let tipo: TipoDomanda = 'SI_NO';
      if (d.tipo && d.tipo !== 'si/no' && d.tipo !== 'si') {
        if (d.tipo === 'testo libero' || d.tipo === 'testo' || d.tipo === 'libero')
          tipo = 'TESTO_LIBERO';
        else {
          righeConErrore.push({
            riga: d.riga,
            motivo: `«${d.tipo}» non è un tipo di risposta: scrivi «Sì/No» o «Testo libero».`,
          });
          rotto = true;
          continue;
        }
      }

      let maxCaratteri: number | null = null;
      if (tipo === 'TESTO_LIBERO') {
        maxCaratteri = MASSIMO_CARATTERI_RISPOSTA_LIBERA;
        if (d.max) {
          const numero = Number(d.max.replace(',', '.'));
          if (
            !Number.isFinite(numero) ||
            numero < 1 ||
            numero > MASSIMO_CARATTERI_RISPOSTA_LIBERA
          ) {
            righeConErrore.push({
              riga: d.riga,
              motivo: `Il tetto della risposta libera deve stare fra 1 e ${MASSIMO_CARATTERI_RISPOSTA_LIBERA} caratteri.`,
            });
            rotto = true;
            continue;
          }
          maxCaratteri = Math.round(numero);
        }
      }

      domande.push({ id, testo: d.testo, tipo, maxCaratteri });
    }

    if (rotto) continue;

    const normalizzato = normalizzaProdotto({
      id: null,
      direttrice: gruppo.direttrice,
      nome: gruppo.nome,
      inChecklist: gruppo.inChecklist,
      domande,
    });
    const errore = validaProdotto(normalizzato);
    if (errore) {
      righeConErrore.push({ riga: gruppo.riga, motivo: `«${gruppo.nome}»: ${errore}` });
      continue;
    }
    prodotti.push(normalizzato);
  }

  return { prodotti, righeConErrore, righeLette };
}

export type StatoImport = 'NUOVO' | 'AGGIORNATO' | 'INVARIATO';

export interface VoceConfronto {
  chiave: string;
  direttrice: string;
  nome: string;
  stato: StatoImport;
  domandeAggiunte: string[];
  domandeModificate: string[];
  /** Tolte dal file: restano solo se qualcuno ha già risposto (lo sa il database). */
  domandeRimosse: string[];
}

export interface ConfrontoImport {
  voci: VoceConfronto[];
  nuovi: number;
  aggiornati: number;
  invariati: number;
  domandeRimosse: number;
}

const stessaDomanda = (a: DomandaProdotto, b: DomandaProdotto) =>
  a.testo === b.testo && a.tipo === b.tipo && (a.maxCaratteri ?? null) === (b.maxCaratteri ?? null);

/**
 * Che cosa cambierebbe il file, prodotto per prodotto: è l'anteprima che si
 * guarda prima di confermare. Non tocca il database e non decide: dice solo
 * dove il file aggiunge, cambia, toglie o non tocca niente.
 */
export function confrontaImport(
  esistenti: ProdottoEnte[],
  nuovi: InputProdottoEnte[]
): ConfrontoImport {
  const perChiave = new Map(esistenti.map((p) => [chiaveProdotto(p.direttrice, p.nome), p]));

  const voci: VoceConfronto[] = nuovi.map((n) => {
    const chiave = chiaveProdotto(n.direttrice, n.nome);
    const esistente = perChiave.get(chiave);
    if (!esistente) {
      return {
        chiave,
        direttrice: n.direttrice,
        nome: n.nome,
        stato: 'NUOVO' as const,
        domandeAggiunte: n.domande.map((d) => d.id),
        domandeModificate: [],
        domandeRimosse: [],
      };
    }
    const perId = new Map(esistente.domande.map((d) => [d.id, d]));
    const nelFile = new Set(n.domande.map((d) => d.id));
    const domandeAggiunte = n.domande.filter((d) => !perId.has(d.id)).map((d) => d.id);
    const domandeModificate = n.domande
      .filter((d) => {
        const e = perId.get(d.id);
        return !!e && !stessaDomanda(e, d);
      })
      .map((d) => d.id);
    const domandeRimosse = esistente.domande.filter((d) => !nelFile.has(d.id)).map((d) => d.id);

    const stessoOrdine = esistente.domande.every((d, i) => n.domande[i]?.id === d.id);
    const invariato =
      esistente.inChecklist === n.inChecklist &&
      esistente.domande.length === n.domande.length &&
      stessoOrdine &&
      domandeAggiunte.length === 0 &&
      domandeModificate.length === 0 &&
      domandeRimosse.length === 0;

    return {
      chiave,
      direttrice: n.direttrice,
      nome: n.nome,
      stato: invariato ? ('INVARIATO' as const) : ('AGGIORNATO' as const),
      domandeAggiunte,
      domandeModificate,
      domandeRimosse,
    };
  });

  return {
    voci,
    nuovi: voci.filter((v) => v.stato === 'NUOVO').length,
    aggiornati: voci.filter((v) => v.stato === 'AGGIORNATO').length,
    invariati: voci.filter((v) => v.stato === 'INVARIATO').length,
    domandeRimosse: voci.reduce((n, v) => n + v.domandeRimosse.length, 0),
  };
}
