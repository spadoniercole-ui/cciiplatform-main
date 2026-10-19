// src/lib/lavorazioni/comunicazioni.ts
//
// DAL V.E.R.A. ALLA COMUNICAZIONE AL COLLEGA.
//
// Il file V.E.R.A. dice quali posizioni esistono, di che natura sono, in che
// stato e per quale periodo. La tabella «Lavorazioni» dice, per ogni
// tipologia di debito, che cosa va fatto e a chi va chiesto. Questo modulo
// unisce le due cose e produce un testo pronto da inviare.
//
// PERCHÉ IL TESTO SI COMPONE QUI E NON NEL COMPONENTE. Le regole sono
// verificabili e devono restare stabili: una posizione senza categoria non
// riceve una categoria inventata; una categoria senza lavorazione non
// produce una comunicazione muta; una lavorazione disattivata non viene
// usata. Sono tutte decisioni di dominio, non di impaginazione.
//
// COSA NON FA. Non invia nulla e non conosce indirizzi: l'invio è personale,
// come richiesto. Non qualifica la posizione giuridicamente e non promette
// esiti: si limita a mettere in fila i dati del file e la lavorazione
// configurata.
//
// Il raggruppamento è per DESTINATARIO, non per categoria: un collega che
// segue più tipologie riceve una sola comunicazione con le lavorazioni
// distinte, invece di tre messaggi parziali. Se la stessa tipologia è
// assegnata a due colleghi, la posizione compare in entrambe le
// comunicazioni — sono due competenze, non un doppione.

import { ETICHETTE_TRATTAMENTO, type TrattamentoVera } from '@/lib/debitiEnte/veraImport';

export interface LavorazioneConfig {
  categoria: string;
  lavorazione: string;
  destinatario: string;
  /** Le lavorazioni spente restano in tabella ma non generano comunicazioni. */
  attivo?: boolean;
}

export interface RigaVeraComunicazione {
  sezione: string;
  voce: string;
  importo: number;
  categoria: string;
  stato: string;
  trattamento: TrattamentoVera;
  periodo?: string;
}

export interface ComunicazioneStandard {
  destinatario: string;
  oggetto: string;
  corpo: string;
  categorie: string[];
  lavorazioni: string[];
  righe: number;
  totale: number;
}

export interface CategoriaSenzaLavorazione {
  categoria: string;
  etichetta: string;
  righe: number;
  totale: number;
}

export interface EsitoComunicazioniVera {
  comunicazioni: ComunicazioneStandard[];
  /** Tipologie presenti nel V.E.R.A. per cui nessuna lavorazione è configurata. */
  categorieSenzaLavorazione: CategoriaSenzaLavorazione[];
  /** Posizioni V.E.R.A. senza categoria: sezioni non mappate. Restano fuori. */
  righeSenzaCategoria: number;
}

export function formattaImportoEuro(importo: number): string {
  if (!Number.isFinite(importo) || Math.abs(importo) < 0.005) return 'importo non determinato';
  return `${importo.toLocaleString('it-IT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    // `auto` (il default) in italiano NON raggruppa i numeri di quattro
    // cifre: 1.200 diventerebbe «1200,00». In un documento che si invia a un
    // collega la differenza si vede, e sembra un refuso.
    useGrouping: true,
  })} €`;
}

function dataItaliana(dataIso: string): string {
  const d = new Date(`${dataIso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return dataIso;
  return d.toLocaleDateString('it-IT', { timeZone: 'UTC' });
}

interface GruppoDestinatario {
  destinatario: string;
  righe: Set<RigaVeraComunicazione>;
  /** lavorazione → categorie a cui si applica. */
  lavorazioni: Map<string, Set<string>>;
}

export function componiComunicazioniVera(input: {
  azienda: string;
  /** Data della verifica in formato AAAA-MM-GG. */
  dataVerifica: string;
  righe: RigaVeraComunicazione[];
  lavorazioni: LavorazioneConfig[];
  /** codice categoria → etichetta mostrata (fallback: il codice). */
  etichette: Record<string, string>;
}): EsitoComunicazioniVera {
  const etichetta = (codice: string) => input.etichette[codice]?.trim() || codice;

  const attive = input.lavorazioni.filter(
    (l) =>
      l.attivo !== false &&
      l.categoria.trim() !== '' &&
      l.lavorazione.trim() !== '' &&
      l.destinatario.trim() !== ''
  );

  const perCategoria = new Map<string, LavorazioneConfig[]>();
  for (const l of attive) {
    const lista = perCategoria.get(l.categoria) ?? [];
    lista.push(l);
    perCategoria.set(l.categoria, lista);
  }

  const gruppi = new Map<string, GruppoDestinatario>();
  const senzaLavorazione = new Map<string, { righe: number; totale: number }>();
  let righeSenzaCategoria = 0;

  for (const r of input.righe) {
    const categoria = r.categoria.trim();
    if (!categoria) {
      righeSenzaCategoria += 1;
      continue;
    }
    const lavorazioni = perCategoria.get(categoria);
    if (!lavorazioni || lavorazioni.length === 0) {
      const voce = senzaLavorazione.get(categoria) ?? { righe: 0, totale: 0 };
      voce.righe += 1;
      voce.totale += r.importo;
      senzaLavorazione.set(categoria, voce);
      continue;
    }
    for (const l of lavorazioni) {
      const destinatario = l.destinatario.trim().replace(/\s+/g, ' ');
      const chiave = destinatario.toLocaleLowerCase('it-IT');
      const gruppo = gruppi.get(chiave) ?? {
        destinatario,
        righe: new Set<RigaVeraComunicazione>(),
        lavorazioni: new Map<string, Set<string>>(),
      };
      gruppo.righe.add(r);
      const categorie = gruppo.lavorazioni.get(l.lavorazione.trim()) ?? new Set<string>();
      categorie.add(categoria);
      gruppo.lavorazioni.set(l.lavorazione.trim(), categorie);
      gruppi.set(chiave, gruppo);
    }
  }

  const data = dataItaliana(input.dataVerifica);
  const comunicazioni: ComunicazioneStandard[] = Array.from(gruppi.values())
    .map((g) => {
      const righe = Array.from(g.righe).sort(
        (a, b) =>
          a.sezione.localeCompare(b.sezione, 'it-IT') ||
          a.voce.localeCompare(b.voce, 'it-IT') ||
          (a.periodo ?? '').localeCompare(b.periodo ?? '', 'it-IT')
      );
      const lavorazioni = Array.from(g.lavorazioni.entries())
        .map(([lavorazione, categorie]) => ({
          lavorazione,
          categorie: Array.from(categorie).sort((a, b) =>
            etichetta(a).localeCompare(etichetta(b), 'it-IT')
          ),
        }))
        .sort((a, b) => a.lavorazione.localeCompare(b.lavorazione, 'it-IT'));

      const categorie = Array.from(new Set(lavorazioni.flatMap((l) => l.categorie))).sort((a, b) =>
        etichetta(a).localeCompare(etichetta(b), 'it-IT')
      );

      const totale = righe.reduce((a, r) => a + r.importo, 0);

      const elencoLavorazioni = lavorazioni
        .map((l) => `- ${l.lavorazione} — ${l.categorie.map(etichetta).join(', ')}`)
        .join('\n');

      const elencoRighe = righe
        .map((r) => {
          const periodo = r.periodo ? ` (periodo ${r.periodo})` : '';
          const stato = r.stato.trim() ? `; stato V.E.R.A.: ${r.stato.trim()}` : '';
          return `- ${r.sezione} — ${r.voce}${periodo}: ${formattaImportoEuro(r.importo)}; ${
            ETICHETTE_TRATTAMENTO[r.trattamento] ?? r.trattamento
          }${stato}`;
        })
        .join('\n');

      const corpo = [
        'Buongiorno,',
        `in esito alla verifica della posizione debitoria di ${input.azienda} al ${data}, per le posizioni di tua competenza risultano i dati seguenti.`,
        `Lavorazioni richieste:\n${elencoLavorazioni}`,
        `Posizioni:\n${elencoRighe}`,
        `Totale delle posizioni elencate: ${formattaImportoEuro(totale)}.`,
        "Ti chiedo di svolgere la lavorazione indicata e di confermarmi l'esito.",
        'Grazie.',
      ].join('\n\n');

      return {
        destinatario: g.destinatario,
        oggetto:
          lavorazioni.length === 1
            ? `Posizione debitoria ${input.azienda} — richiesta di lavorazione`
            : `Posizione debitoria ${input.azienda} — richieste di lavorazione`,
        corpo,
        categorie,
        lavorazioni: lavorazioni.map((l) => l.lavorazione),
        righe: righe.length,
        totale,
      };
    })
    .sort((a, b) => a.destinatario.localeCompare(b.destinatario, 'it-IT'));

  return {
    comunicazioni,
    categorieSenzaLavorazione: Array.from(senzaLavorazione.entries())
      .map(([categoria, v]) => ({
        categoria,
        etichetta: etichetta(categoria),
        righe: v.righe,
        totale: v.totale,
      }))
      .sort((a, b) => a.etichetta.localeCompare(b.etichetta, 'it-IT')),
    righeSenzaCategoria,
  };
}
