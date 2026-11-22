// src/lib/ritratto/reportIconografia.ts
//
// IL REPORT DELL'ICONOGRAFIA — la stessa fotografia del ritratto, ridotta a un
// foglio A4: tabelle e due grafici, niente prosa.
//
// PERCHÉ NON RICALCOLA. Il report è una riduzione di `Ritratto`, non una
// seconda lettura: gli esiti, le date, le coperture e le intensità entrano ed
// escono identici. Se i due documenti divergessero, l'ente avrebbe due
// fotografie della stessa posizione e nessun modo di sapere quale credere.
//
// PERCHÉ TAGLIA. Un A4 non è una stampa di comodo: è il foglio che si allega,
// e deve stare su un foglio. Gli elenchi lunghi si riducono alle prime voci con
// il resto dichiarato in cifre — il taglio è scritto nel report, non silenzioso
// («e altre 3 voci»), e il testo integrale resta nell'iconografia a schermo.
//
// Il modello non conosce i CSS: dà i toni (rosso/giallo/verde, letta/parziale)
// e le parole già decise, perché la pagina non li ricalcoli a mano.
//
// Funzione pura, con i suoi test.

import type { EsitoAttenzione } from '@/lib/screening/indicatore';
import type { Stadio } from '@/lib/verificaAzienda/direttrici';
import type { Ritratto, StatoLettura } from './ritratto';

export interface RigaReport {
  etichetta: string;
  valore: string;
}

export interface RigaDirettriceReport {
  nome: string;
  /** Lo stadio come lo chiama il motore: la pagina sceglie il colore da qui. */
  stato: Stadio;
  /** «Fatta», «Cominciata»…: la parola da stampare. */
  etichettaStato: string;
  richiede: string | null;
}

export interface BarraDimensioneReport {
  lettera: string;
  nome: string;
  /** Intensità 0-100: la barra, non un voto. */
  punteggio: number;
  lettura: string;
  /** Per la classe CSS che colora la barra. */
  tono: 'letta' | 'parziale' | 'non-letta';
}

export interface RigaFattoReport {
  testo: string;
  /** true quando il testo è stato ridotto: il report lo dichiara. */
  ridotto: boolean;
}

export type TonoGiudizio = 'rosso' | 'giallo' | 'verde';

export interface GiudizioReport {
  etichetta: string;
  /** La parola del semaforo, solo quando aggiunge qualcosa all'etichetta. */
  parola: string | null;
  tono: TonoGiudizio;
  fattore: string | null;
  copertura: {
    determinate: number;
    totali: number;
    testo: string;
    /** true quando il giudizio vale solo su una parte delle dimensioni. */
    limitata: boolean;
    /** Percentuale intera, per l'arco del grafico. */
    percentuale: number;
  } | null;
  accertato: RigaFattoReport[];
  accertatoOltre: number;
  daAccertare: RigaFattoReport[];
  daAccertareOltre: number;
}

export interface ReportIconografia {
  titolo: string;
  sottotitolo: string | null;
  attiva: boolean;
  generatoIl: string;
  /** Righe della tabella «L'impresa»: già etichettate come si stampano. */
  impresa: RigaReport[];
  direttrici: RigaDirettriceReport[];
  /** «3 verifiche fatte su 3», come lo dice il ritratto. */
  direttriciNota: string;
  giudizio: GiudizioReport | null;
  dimensioni: BarraDimensioneReport[];
  dimensioniNota: string;
  mancanze: string[];
  /** Che cosa è stato ridotto, e dove si legge per intero. */
  notaRiduzione: string;
}

const LETTURA: Record<StatoLettura, { testo: string; tono: BarraDimensioneReport['tono'] }> = {
  LETTA: { testo: 'letta', tono: 'letta' },
  PARZIALE: { testo: 'parziale', tono: 'parziale' },
  NON_LETTA: { testo: 'non misurata', tono: 'non-letta' },
};

const TONO: Record<EsitoAttenzione, TonoGiudizio> = {
  ROSSO: 'rosso',
  GIALLO: 'giallo',
  ATTENZIONE_MINIMA: 'verde',
};

/** Le voci che stanno su un foglio: oltre, il resto si conta. */
const MASSIMO_VOCI = 2;
const MASSIMO_CARATTERI = 190;

/** Riduce un testo senza spezzare una parola a metà. */
function riduci(testo: string): RigaFattoReport {
  const pulito = testo.trim();
  if (pulito.length <= MASSIMO_CARATTERI) return { testo: pulito, ridotto: false };
  const tagliato = pulito.slice(0, MASSIMO_CARATTERI);
  const spazio = tagliato.lastIndexOf(' ');
  return { testo: `${spazio > 0 ? tagliato.slice(0, spazio) : tagliato}…`, ridotto: true };
}

function voci(vociTesto: string[]): { righe: RigaFattoReport[]; oltre: number } {
  const piene = vociTesto.filter((v) => v.trim().length > 0);
  return {
    righe: piene.slice(0, MASSIMO_VOCI).map((v) => riduci(v)),
    oltre: Math.max(0, piene.length - MASSIMO_VOCI),
  };
}

export function componiReportIconografia(
  ritratto: Ritratto,
  generatoIl: string
): ReportIconografia {
  const { testata, direttrici, giudizio, dimensioni, mancanze } = ritratto;

  const impresa: RigaReport[] = [...testata.identificativi];
  impresa.push({
    etichetta: 'Verifica amministrativa',
    valore: testata.verificataIl ? `del ${testata.verificataIl}` : 'mai eseguita',
  });
  impresa.push({
    etichetta: 'Debito memorizzato',
    valore: testata.debito
      ? `${testata.debito.testo}${testata.debito.il ? ` · ${testata.debito.il}` : ''}`
      : 'nessun debito memorizzato',
  });

  const accertato = voci(giudizio.accertato);
  const daAccertare = voci(giudizio.daAccertare);
  const etichetta = giudizio.etichetta ?? '';

  const giudizioReport: GiudizioReport | null = giudizio.presente
    ? {
        etichetta,
        parola: giudizio.parola?.toLowerCase() === etichetta.toLowerCase() ? null : giudizio.parola,
        tono: TONO[giudizio.esito ?? 'GIALLO'],
        fattore: giudizio.fattoreDeterminante,
        copertura: giudizio.copertura
          ? {
              ...giudizio.copertura,
              percentuale: Math.round(
                (giudizio.copertura.determinate / Math.max(1, giudizio.copertura.totali)) * 100
              ),
            }
          : null,
        accertato: accertato.righe,
        accertatoOltre: accertato.oltre,
        daAccertare: daAccertare.righe,
        daAccertareOltre: daAccertare.oltre,
      }
    : null;

  const ridotto = [...accertato.righe, ...daAccertare.righe].some((r) => r.ridotto)
    ? 'Le voci di «Accertato» e «Da accertare» sono ridotte per stare sul foglio: il testo integrale è nell’iconografia a schermo.'
    : 'Nessuna voce è stata ridotta: il foglio riporta il testo integrale.';

  return {
    titolo: testata.nome,
    sottotitolo: testata.sottotitolo,
    attiva: testata.attiva,
    generatoIl,
    impresa,
    direttrici: direttrici.voci.map((v) => ({
      nome: v.nome,
      stato: v.stato,
      etichettaStato: v.etichettaStato,
      richiede: v.richiede,
    })),
    direttriciNota: direttrici.nota,
    giudizio: giudizioReport,
    dimensioni: dimensioni.voci.map((v) => ({
      lettera: v.lettera,
      nome: v.nome,
      punteggio: Math.max(0, Math.min(100, v.punteggio)),
      lettura: LETTURA[v.stato].testo,
      tono: LETTURA[v.stato].tono,
    })),
    dimensioniNota: dimensioni.nota,
    // Le mancanze sono già frasi brevi: entrano tutte, il foglio le regge.
    mancanze,
    notaRiduzione: ridotto,
  };
}
