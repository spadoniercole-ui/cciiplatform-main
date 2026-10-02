// src/lib/relazione/contestoRicevente.ts
//
// Contesto della RELAZIONE DI CHIUSURA del Ricevente: solo ciò che lo
// screening non sapeva. La relazione non ripete lo screening né la tabella
// degli indici: dice che cosa è cambiato (posizione aggiornata contro
// l'ultimo bilancio depositato, indici che cambiano esito), quanto è
// credibile la proposta (lettura critica, settore, piano) e propone
// l'intenzione di voto. Logica pura: riceve i dati già letti.

import type { DatiFinanziariPeriodo, IndiceCcii } from '@/lib/xbrl/types';

const euro = (n: number) => `€ ${Math.round(n).toLocaleString('it-IT')}`;

const VOCI_CONFRONTO: [keyof DatiFinanziariPeriodo, string][] = [
  ['ricaviVendite', 'Ricavi'],
  ['patrimonioNetto', 'Patrimonio netto'],
  ['totaleDebiti', 'Totale debiti'],
  ['debitiTributari', 'Debiti tributari'],
  ['debitiPrevidenziali', 'Debiti previdenziali'],
  ['disponibilitaLiquide', 'Disponibilità liquide'],
];

export interface IngressoContestoRicevente {
  screeningDel: string | null;
  ultimoBilancio: {
    anno: number | null;
    dati: DatiFinanziariPeriodo;
    indici: IndiceCcii[];
  } | null;
  posizioneAggiornata: {
    data: string | null;
    dati: DatiFinanziariPeriodo;
    indici: IndiceCcii[];
  } | null;
  debitoEnteVera: number | null;
  esito: { etichetta: string; motivazione: string } | null;
  letturaCritica: string | null;
  crescitaSettore: number | null;
  crescitaAzienda: number | null;
  sintesiPiano: string | null;
}

export function contestoRelazioneRicevente(i: IngressoContestoRicevente): string {
  const parti: string[] = [];
  parti.push(
    `SCREENING DI RIFERIMENTO: ${
      i.screeningDel
        ? `elaborato il ${new Date(i.screeningDel).toLocaleDateString('it-IT')}`
        : 'non disponibile'
    }. Non ripeterne il contenuto: la relazione riporta solo ciò che è cambiato o che lo screening non poteva sapere.`
  );
  if (i.esito) {
    parti.push(
      `ESITO DELLA VALUTAZIONE (già calcolato): ${i.esito.etichetta} — ${i.esito.motivazione}`
    );
  }
  if (i.debitoEnteVera !== null) {
    parti.push(
      `DEBITO VERSO L'ENTE (V.E.R.A., contabilizzato e da contabilizzare): ${euro(i.debitoEnteVera)}.`
    );
  }
  if (i.posizioneAggiornata && i.ultimoBilancio) {
    const pa = i.posizioneAggiornata;
    const ub = i.ultimoBilancio;
    const righe = VOCI_CONFRONTO.filter(([k]) => pa.dati[k] !== 0 || ub.dati[k] !== 0).map(
      ([k, nome]) =>
        `| ${nome} | ${euro(ub.dati[k])} | ${euro(pa.dati[k])} | ${euro(pa.dati[k] - ub.dati[k])} |`
    );
    parti.push(
      `COSA È CAMBIATO — POSIZIONE AGGIORNATA${
        pa.data ? ` AL ${pa.data.split('-').reverse().join('/')}` : ''
      } CONTRO IL BILANCIO ${ub.anno ?? 'DEPOSITATO'} (riportala come tabella Markdown):\n| Voce | Bilancio ${
        ub.anno ?? ''
      } | Posizione aggiornata | Variazione |\n|---|---|---|---|\n${righe.join('\n')}`
    );
    const stato = (e: string) => (e === 'VIOLATO' ? 'oltre soglia' : 'entro soglia');
    const cambi = pa.indici
      .map((x) => {
        const prima = ub.indici.find((y) => y.codice === x.codice);
        return prima && prima.esito !== x.esito
          ? `${x.nome}: da ${stato(prima.esito)} (${prima.valore}) a ${stato(x.esito)} (${x.valore})`
          : null;
      })
      .filter((x): x is string => x !== null);
    parti.push(
      `INDICI CHE CAMBIANO ESITO fra bilancio e posizione aggiornata: ${
        cambi.length ? cambi.join('; ') : 'nessuno'
      }. Cita solo questi, non l'elenco completo.`
    );
  } else {
    parti.push(
      'POSIZIONE AGGIORNATA: non pervenuta — la valutazione poggia sull’ultimo bilancio depositato; dichiaralo.'
    );
  }
  if (i.crescitaSettore !== null || i.crescitaAzienda !== null) {
    const f = (n: number | null) => (n === null ? 'n/d' : `${n.toFixed(1).replace('.', ',')}%`);
    parti.push(
      `SETTORE (ISTAT): crescita storica del settore ${f(i.crescitaSettore)} l'anno, dell'azienda ${f(i.crescitaAzienda)} l'anno.`
    );
  }
  if (i.letturaCritica) {
    parti.push(
      `LETTURA CRITICA DEI DOCUMENTI (già fatta; sintetizzala, non riscriverla):\n${i.letturaCritica.slice(0, 7000)}`
    );
  }
  parti.push(
    i.sintesiPiano
      ? `PIANO DI SVILUPPO MESSO ALLA PROVA:\n${i.sintesiPiano}`
      : 'PIANO DI SVILUPPO: non messo alla prova in questa istruttoria.'
  );
  return parti.join('\n\n');
}

/** Struttura della relazione di chiusura del Ricevente. */
export const ISTRUZIONI_RELAZIONE_RICEVENTE = `
Stai redigendo la RELAZIONE DI CHIUSURA dell'istruttoria di un ente creditore su una proposta ricevuta: è la bozza per il livello dirigenziale, che decide l'intenzione di voto. È una bozza di lavoro, non un giudizio professionale.

REGOLE:
1. Non ripetere lo screening né l'elenco completo degli indici: riporta SOLO ciò che è cambiato e ciò che serve a decidere.
2. Lo strumento si chiama come indicato nell'INQUADRAMENTO; non inventare cifre.
3. Il riscontro con i parametri è già calcolato (sulla base dell'art. 63, al netto di sanzioni e interessi quando il documento lo consente): riportalo, non ricalcolarlo.
4. Formato Markdown, 600-900 parole, tabelle Markdown dove ci sono numeri da confrontare. Sezioni:
   1. ESITO E INTENZIONE DI VOTO PROPOSTA — esito del riscontro sulla posizione dell'ente, documenti mancanti, e una proposta di intenzione di voto (favorevole / favorevole con riserve / contraria) motivata in tre righe, da confermare dal dirigente.
   2. COSA È CAMBIATO DALLO SCREENING — tabella della posizione aggiornata contro l'ultimo bilancio, indici che cambiano esito, debito verso l'ente.
   3. CREDIBILITÀ DELLA PROPOSTA — sintesi della lettura critica, confronto con il settore, esito del piano se messo alla prova.
   4. CONFRONTO CON LA LIQUIDAZIONE — dal testo fornito, senza aggiungere numeri.
   5. RACCOMANDAZIONI — al massimo cinque, operative.
5. Chiudi con «AVVERTENZA»: output automatico sui dati caricati e sui parametri configurati, non giudizio professionale; la decisione resta all'ente.
`;
