// src/lib/valutazione/listaControllo.ts
//
// LISTA DI CONTROLLO PRIMA DELLA VALUTAZIONE (Ricevente) — richiesta di
// Ercole (30/09/2026): si caricano i documenti, si aggiornano i dati
// attualizzati e i dati di settore ISTAT, e SOLO a quel punto si avvia la
// valutazione. Il pulsante si abilita a lista completa e dice cosa manca,
// con il percorso nell'applicativo (regola «si capisce se parte»).
//
// Il piano di sviluppo aziendale NON e' fra le condizioni: e' l'ultima
// attivita', ed esiste solo se lo scenario e' stato creato con il flag.
// La lista lo ricorda, non lo pretende.
//
// Logica pura.

export type StatoDocumento = 'caricato' | 'assente_dichiarato' | 'mancante';

export interface InputListaControllo {
  propostaSelezionata: boolean;
  asseverazione: StatoDocumento;
  pianoAziendale: StatoDocumento;
  posizioniAggiornate: number;
  posizioneNonPervenutaDichiarata: boolean;
  /** null = funzione Dati di Settore non attiva o ATECO assente: voce non applicabile. */
  settore:
    { applicabile: false; motivo: string } | { applicabile: true; aggiornatoIl: string | null };
  pianoSviluppoAttivo: boolean;
  oggi: string; // ISO
  sogliaGiorniSettore?: number;
}

export interface VoceLista {
  id: 'proposta' | 'asseverazione' | 'pianoAziendale' | 'posizione' | 'settore' | 'pianoSviluppo';
  etichetta: string;
  ok: boolean;
  /** true = la voce non blocca l'avvio (informativa). */
  informativa: boolean;
  dettaglio: string;
  percorso: string | null;
}

export interface EsitoListaControllo {
  voci: VoceLista[];
  pronta: boolean;
  mancanti: string[];
}

const giorni = (da: string, a: string) => Math.floor((Date.parse(a) - Date.parse(da)) / 86_400_000);

export function valutaListaControllo(i: InputListaControllo): EsitoListaControllo {
  const soglia = i.sogliaGiorniSettore ?? 30;
  const voci: VoceLista[] = [];

  voci.push({
    id: 'proposta',
    etichetta: 'Proposta (PDF)',
    ok: i.propostaSelezionata,
    informativa: false,
    dettaglio: i.propostaSelezionata
      ? 'Selezionata.'
      : 'Obbligatoria: senza la proposta la valutazione non parte.',
    percorso: i.propostaSelezionata ? null : 'Qui sopra, «Proposta di cram down» › Scegli file',
  });

  const doc = (
    id: 'asseverazione' | 'pianoAziendale',
    etichetta: string,
    s: StatoDocumento
  ): VoceLista => ({
    id,
    etichetta,
    ok: s !== 'mancante',
    informativa: false,
    dettaglio:
      s === 'caricato'
        ? 'Selezionato.'
        : s === 'assente_dichiarato'
          ? 'Dichiarato non pervenuto: l’assenza pesa sul giudizio finale.'
          : 'Selezionalo, oppure dichiaralo non pervenuto.',
    percorso:
      s === 'mancante'
        ? `Qui sopra, «${etichetta}» › Scegli file, oppure spunta «Non pervenuto»`
        : null,
  });
  voci.push(doc('asseverazione', 'Asseverazione del professionista', i.asseverazione));
  voci.push(doc('pianoAziendale', 'Piano di sviluppo dell’azienda', i.pianoAziendale));

  const posOk = i.posizioniAggiornate > 0 || i.posizioneNonPervenutaDichiarata;
  voci.push({
    id: 'posizione',
    etichetta: 'Posizione contabile aggiornata',
    ok: posOk,
    informativa: false,
    dettaglio:
      i.posizioniAggiornate > 0
        ? `${i.posizioniAggiornate} ${i.posizioniAggiornate === 1 ? 'caricamento' : 'caricamenti'} nei dati attualizzati.`
        : i.posizioneNonPervenutaDichiarata
          ? 'Dichiarata non pervenuta: la valutazione userà l’ultimo bilancio.'
          : 'Carica il bilancino o la situazione contabile ricevuti, oppure dichiarala non pervenuta.',
    percorso: posOk ? null : 'Scenari › questo scenario › passo «Posizione Aggiornata»',
  });

  if (!i.settore.applicabile) {
    voci.push({
      id: 'settore',
      etichetta: 'Dati di settore ISTAT',
      ok: true,
      informativa: true,
      dettaglio: i.settore.motivo,
      percorso: null,
    });
  } else {
    const agg = i.settore.aggiornatoIl;
    const eta = agg ? giorni(agg, i.oggi) : null;
    const ok = eta !== null && eta <= soglia;
    voci.push({
      id: 'settore',
      etichetta: 'Dati di settore ISTAT',
      ok,
      informativa: false,
      dettaglio:
        agg === null
          ? 'Mai scaricati per il settore di questa azienda.'
          : ok
            ? `Aggiornati il ${new Date(agg).toLocaleDateString('it-IT')}.`
            : `Aggiornati il ${new Date(agg).toLocaleDateString('it-IT')}, ${eta} giorni fa: vanno aggiornati (oltre ${soglia} giorni).`,
      percorso: ok
        ? null
        : '«Aggiorna ora» qui accanto, oppure Scenari › questo scenario › passo «Dati di Settore»',
    });
  }

  voci.push({
    id: 'pianoSviluppo',
    etichetta: 'Analisi del piano di sviluppo',
    ok: true,
    informativa: true,
    dettaglio: i.pianoSviluppoAttivo
      ? 'Attiva per questo scenario: è l’ultima attività, dopo la valutazione (passo «Piano di sviluppo»).'
      : 'Non attiva per questo scenario (flag in fase di creazione): nessuna analisi del piano.',
    percorso: null,
  });

  const mancanti = voci.filter((v) => !v.ok && !v.informativa).map((v) => v.etichetta);
  return { voci, pronta: mancanti.length === 0, mancanti };
}
