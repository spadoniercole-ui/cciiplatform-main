// src/lib/triage/riepilogoHtml.ts
//
// RIEPILOGO DEL TRIAGE in HTML, per la stampa in PDF: quali documenti sono
// stati caricati e letti, cosa se ne è ricavato, con quali valori si sono
// misurate le soglie e quale indicazione ne viene. È ciò che si consegna al
// responsabile di turno: il risultato a video non basta, perché non resta.
//
// COSA LO DISTINGUE DALLE COMUNICAZIONI. Le comunicazioni ai reparti dicono a
// un ufficio che cosa deve fare. Questo foglio dice che cosa è stato verificato
// alla data, quali soglie risultano superate, che cosa è stato inviato a chi e
// quando tornare a controllare: è il paper della verifica, non un'istruzione di
// lavoro. Le due cose non si sostituiscono.
//
// Logica pura: riceve i dati già calcolati dalla pagina, non ricalcola nulla.

import type { Attenzione } from '@/lib/screening/indicatore';
import { etaVerifica } from './etaVerifica';
import { STILE_BOX } from './box';
import { RANGHI, type EsitoScenari } from './scenari';
import type { SintesiChecklistProdotti } from '@/lib/prodotti/prodotti';

export interface DocumentoTriage {
  nome: string;
  /** Natura riconosciuta dalle intestazioni (o dichiarata: visura, XBRL). */
  tipo: string;
  /** Usato nel calcolo, oppure il motivo per cui non lo è stato. */
  esito: string;
}

export interface ValoriTriage {
  conLavoratori: boolean | null;
  annoPrecedente: number;
  contributiDovutiAnnoPrecedente: number | null;
  nonVersatoOltre90: number | null;
  ritardoOltre90Giorni: boolean | null;
  periodiInRitardo: number | null;
  /** null = Elenco denunce non letto; '' = letto, nessuna mancante. */
  denunceNonPresentate: string | null;
  creditiAffidatiAgente: number | null;
}

/** Una riga del confronto con le soglie dell'art. 25-novies. */
export interface SogliaRiepilogo {
  ambito: string;
  valore: string;
  esito: 'sotto' | 'sopra' | 'non_determinabile';
  esposizione: number | null;
}

/** L'avviso complessivo, quando c'è qualcosa da dire sulle soglie. */
export interface AlertSoglie {
  titolo: string;
  dettaglio: string;
}

/**
 * Un avviso in testa al foglio: qualcosa che va letto PRIMA dei numeri.
 *
 * `attenzione` = i numeri non sono più affidabili così come sono (sono
 * vecchi); `nota` = i numeri sono buoni ma vanno letti per quello che sono
 * (un'esposizione che non integra la soglia non è un'assenza di debito).
 */
export interface AvvisoRiepilogo {
  tono: 'attenzione' | 'nota';
  testo: string;
}

/** Ciò che è stato preparato per un ufficio: quante posizioni e quali voci. */
export interface UfficioRiepilogo {
  dipendenza: string;
  righe: number;
  totale: number;
  voci: string[];
}

export interface DatiRiepilogoTriage {
  azienda: string;
  codiceFiscale: string | null;
  partitaIva: string | null;
  sede: string | null;
  dataVerifica: string; // AAAA-MM-GG
  perimetro: string;
  documenti: DocumentoTriage[];
  /**
   * Perché l'elenco dei documenti è vuoto, quando lo è per un motivo noto.
   * In una verifica riaperta i file non esistono più: dire «nessun documento
   * caricato: valori inseriti a mano» sarebbe falso, e farebbe dubitare dei
   * numeri che invece vengono da quei documenti.
   */
  documentiNota?: string | null;
  /**
   * LA RISTAMPA DI UNA VERIFICA RIAPERTA. I file non esistono più: il foglio
   * si ricostruisce dalle righe salvate. Va detto IN TESTA, con la data della
   * verifica e quella della ristampa: senza quelle due date il foglio sembra
   * emesso nella stessa seduta della verifica, e chi lo legge fra sei mesi non
   * sa che le assegnazioni sono state rifatte con la configurazione di oggi.
   */
  ristampa?: { ricostruitaIl: string } | null;
  /**
   * QUANDO I PROSPETTI SONO STATI LETTI (AAAA-MM-GG). La data della verifica
   * dice a quando si riferiscono i conti, non quando sono stati letti: se un
   * nuova certificazione dei debiti è stato caricato dopo, il foglio deve poterlo dire.
   */
  documentiCaricatiIl?: string | null;
  note: string[];
  valori: ValoriTriage;
  attenzione: Attenzione | null;
  /** Il confronto riga per riga con le soglie. */
  soglie?: SogliaRiepilogo[];
  /** L'alert delle soglie, se una è superata o l'esito non è chiudibile. */
  alertSoglie?: AlertSoglie | null;
  /** Le evidenze preparate per i reparti. */
  uffici?: UfficioRiepilogo[];
  /** Giorno entro cui tornare a verificare (AAAA-MM-GG). */
  prossimaVerifica?: string | null;
  /** Giorni concessi ai reparti per attivarsi. Default 30. */
  giorniRiverifica?: number;
  /**
   * Il confronto con le due ipotesi (0.153.0): liquidazione giudiziale e cram
   * down, sulle percentuali dell'ente. `null` quando non c'è nulla da
   * confrontare: il box non compare, invece di comparire vuoto.
   */
  scenari?: EsitoScenari[] | null;
  /**
   * LA CHECK LIST DEI PRODOTTI (0.161.0). Le domande scritte sui prodotti con
   * il flag attivo, con le risposte di questa azienda: è la qualificazione
   * dell'operato che entra nel quadro insieme a visura e prospetti. `null`
   * quando nessun prodotto è in check list — il foglio non annuncia una
   * sezione che non ha contenuto.
   */
  checklistProdotti?: SintesiChecklistProdotti | null;
}

/** Il giorno entro cui tornare a verificare: la data più i giorni concessi. */
export function dataRiverifica(dataVerifica: string, giorni = 30): string | null {
  const m = (dataVerifica ?? '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) + giorni * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const euro = (n: number | null) =>
  n === null
    ? '<i>non rilevato</i>'
    : `${n.toLocaleString('it-IT', { maximumFractionDigits: 2 })} €`;
const sino = (b: boolean | null, si: string, no: string) =>
  b === null ? '<i>non determinabile con i documenti caricati</i>' : b ? si : no;
const data = (iso: string) => iso.split('-').reverse().join('/');
/** Data e ora locali; stringa vuota se il valore non è una data. */
const quando = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};
const ESITO_SOGLIA: Record<SogliaRiepilogo['esito'], string> = {
  sopra: '<b style="color:#b91c1c">SUPERATA</b>',
  sotto: 'non superata',
  non_determinabile: '<i>non determinabile</i>',
};

/**
 * GLI AVVISI CHE STANNO IN TESTA AL FOGLIO.
 *
 * Due cose non si leggono dai numeri e vanno dette prima di stamparli.
 *
 * 1. I NUMERI SONO VECCHI. Una verifica riaperta dopo la finestra dei trenta
 *    giorni si stampa identica a quella del primo giorno: le posizioni sono
 *    quelle lette allora, e il foglio stesso dichiara un termine per tornare
 *    a controllare. Se lo dice la videata e non il foglio, chi riceve il
 *    foglio non lo sa — e il foglio è ciò che resta.
 *
 * 2. UN'ESPOSIZIONE SOTTO LA SOGLIA NON È UN'ASSENZA DI DEBITO. Il foglio
 *    elenca le posizioni instradate agli uffici e, se nessun parametro è
 *    superato, potrebbe sembrare che non ci sia nulla: l'importo invece c'è,
 *    ed è dovuto. Si dichiara il confronto con la soglia, perché è quello che
 *    il motore ha misurato, e non si conclude nulla che vada oltre.
 *
 * Entrambe si contano sulla stessa regola della videata (`etaVerifica`, in
 * UTC): due calcoli diversi dello stesso termine darebbero un foglio e una
 * schermata in disaccordo sullo stesso fascicolo.
 */
function avvisiRiepilogo(d: DatiRiepilogoTriage, giorni: number): AvvisoRiepilogo[] {
  const out: AvvisoRiepilogo[] = [];

  const eta = etaVerifica(d.dataVerifica, new Date().toISOString().slice(0, 10), giorni);
  if (eta?.daRicontrollare) {
    out.push({
      tono: 'attenzione',
      testo:
        `I numeri di questo foglio risalgono alla verifica del ${data(d.dataVerifica)}: sono ` +
        `trascorsi ${eta.giorni} giorni e la finestra dei ${giorni} giorni per il ricontrollo si è ` +
        `chiusa il ${data(eta.riverifica)}. Le posizioni e gli importi sono quelli letti allora. ` +
        'Prima di decidere ricontrolla i prospetti — certificazione dei debiti e fogli dell’ente — e ricarica ciò ' +
        'che è cambiato.',
    });
  }

  // L'esposizione si cita solo se è NOTA e se nessun parametro è superato:
  // con una soglia sopra, l'alert dice già molto di più e ripetersi qui
  // toglierebbe forza all'unica riga che conta.
  const righe = d.soglie ?? [];
  const sotto = righe.filter((r) => r.esito === 'sotto' && (r.esposizione ?? 0) > 0);
  if (!righe.some((r) => r.esito === 'sopra') && sotto.length > 0) {
    const r = sotto.reduce((a, b) => ((b.esposizione ?? 0) > (a.esposizione ?? 0) ? b : a));
    out.push({
      tono: 'nota',
      testo:
        `Esposizione di ${euro(r.esposizione)} confrontata con il parametro «${r.ambito}»: la ` +
        'soglia non risulta superata. L’importo è il debito che gli uffici stanno lavorando e resta ' +
        'dovuto: il foglio dichiara il confronto con la soglia di segnalazione, non l’assenza del ' +
        'debito né alcuna conclusione sulla crisi dell’impresa.',
    });
  }

  return out;
}

export function htmlRiepilogoTriage(d: DatiRiepilogoTriage): string {
  const v = d.valori;
  const parti: string[] = [];
  const giorni = d.giorniRiverifica ?? 30;
  const riverifica = d.prossimaVerifica ?? dataRiverifica(d.dataVerifica, giorni);
  const avvisiInTesta = avvisiRiepilogo(d, giorni);
  // La numerazione segue l'ordine reale delle sezioni: un titolo «5.» su una
  // pagina che ne ha tre è il genere di dettaglio che fa sembrare il foglio
  // incompleto.
  let n = 0;
  const titolo = (testo: string) => `<h2>${++n}. ${esc(testo)}</h2>`;

  parti.push(`<style>
  .rt h2{font-size:14px;margin:18px 0 6px}
  .rt .meta{font-size:12px;color:#334155}
  .rt .perimetro{white-space:pre-wrap;font-size:10px;color:#475569;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:8px}
  .rt ul{margin:4px 0 0 18px;padding:0}
  .rt li{font-size:11px;margin:3px 0}
  .rt .esito{font-size:13px;font-weight:700}
  .rt .lacune li{color:#92400e}
  .rt .alert{font-size:11px;background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:8px;color:#7f1d1d}
  .rt .quando{font-size:12px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;padding:10px;color:#1e3a8a}
  .rt .ristampa{font-size:11px;background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:8px;color:#78350f;margin:10px 0}
  .rt .avvisi{margin:10px 0}
  .rt .avvisi p{font-size:11px;border-radius:6px;padding:8px;margin:6px 0}
  .rt .avvisi .attenzione{background:#fffbeb;border:1px solid #fde68a;color:#78350f}
  .rt .avvisi .nota{background:#f1f5f9;border:1px solid #cbd5e1;color:#334155}
${STILE_BOX}
</style>`);
  parti.push('<div class="rt">');
  parti.push(
    `<p class="meta"><b>${esc(d.azienda)}</b>${d.codiceFiscale ? ` — C.F. ${esc(d.codiceFiscale)}` : ''}${
      d.partitaIva && d.partitaIva !== d.codiceFiscale ? ` — P.IVA ${esc(d.partitaIva)}` : ''
    }${d.sede ? `<br>${esc(d.sede)}` : ''}<br>Verifica riferita al <b>${data(d.dataVerifica)}</b></p>`
  );

  // 0. Se è una ricostruzione, si dice subito: prima di ogni numero.
  if (d.ristampa) {
    const il = quando(d.ristampa.ricostruitaIl);
    const caricati = d.documentiCaricatiIl ? data(d.documentiCaricatiIl) : null;
    parti.push(
      `<p class="ristampa"><b>Copia ricostruita dai dati salvati</b><br>Verifica riferita al <b>${data(
        d.dataVerifica
      )}</b> — ristampata${il ? ` il <b>${esc(il)}</b>` : ''}.<br>Posizioni e importi sono quelli letti dai documenti${
        caricati ? ` caricati il <b>${esc(caricati)}</b>` : ''
      }; le assegnazioni ai reparti e le soglie sono ricalcolate con la configurazione attuale.</p>`
    );
  }

  // 0-bis. Gli avvisi, prima di ogni numero: un foglio che li mette in coda
  // arriva a chi lo legge dopo che si è già fatto un'idea.
  if (avvisiInTesta.length) {
    parti.push(
      `<div class="avvisi">${avvisiInTesta
        .map((x) => `<p class="${x.tono}">${esc(x.testo)}</p>`)
        .join('')}</div>`
    );
  }

  // 1. LA CHECK LIST DEI PRODOTTI, PRIMA DELLE CRITICITÀ (0.169.0). È l'unica
  // check list del foglio: le domande dell'ente sui fatti concreti, con le
  // risposte di questa azienda. Sta qui, e non dopo le soglie, perché è lo
  // strumento con cui si leggono le criticità che seguono: prima il quadro
  // qualitativo, poi il giudizio che ne tiene conto. Una domanda senza
  // risposta si stampa come tale, e la qualificazione è una lettura
  // istruttoria, non un responso.
  if (d.checklistProdotti && d.checklistProdotti.totale > 0) {
    const cp = d.checklistProdotti;
    parti.push(titolo('Check list dei prodotti: analisi qualitativa dell’azienda'));
    parti.push(`<p class="esito">${esc(cp.etichetta)}</p>`);
    parti.push(`<p style="font-size:11px">${esc(cp.dettaglio)}</p>`);
    parti.push(
      `<table><tbody>\n<tr><td>Domande in check list</td><td class="num">${cp.totale}</td></tr>\n<tr><td>Risposte date</td><td class="num">${cp.risposte}</td></tr>\n<tr><td>Domande a risposta chiusa</td><td class="num">${cp.chiuse}</td></tr>\n<tr><td>Risposte positive</td><td class="num">${cp.positive}</td></tr>\n<tr><td>Risposte negative</td><td class="num">${cp.negative}</td></tr>\n</tbody></table>`
    );
    parti.push(
      `<table><thead><tr><th>Prodotto</th><th>Domanda</th><th>Risposta</th><th>Lettura</th></tr></thead><tbody>${cp.voci
        .map(
          (v) =>
            `<tr><td>${esc(v.prodotto)}</td><td>${esc(v.domanda)}</td><td>${esc(v.risposta)}</td><td>${
              v.lettura === 'POSITIVA' ? 'Positiva' : v.lettura === 'NEGATIVA' ? 'Negativa' : '—'
            }</td></tr>`
        )
        .join('')}</tbody></table>`
    );
    parti.push(
      '<p style="font-size:10px;color:#475569">Le domande nascono dai prodotti contrassegnati in Parametri di Spazio → Prodotti dell’ente, con la forma scelta in configurazione (Sì/No oppure testo libero). La qualificazione dell’operato è una lettura istruttoria: non accerta la crisi e non sostituisce le soglie, che si misurano sugli importi. È la base qualitativa su cui si leggono le criticità e le soglie che seguono.</p>'
    );
  }

  // 1. Esito
  parti.push(titolo('Indicazione del triage'));
  if (d.attenzione) {
    const a = d.attenzione;
    parti.push(
      `<p class="esito">${esc(a.etichetta)}</p><p style="font-size:11px">Fattore determinante: ${esc(
        a.fattoreDeterminante
      )} — dimensioni determinate ${a.copertura.determinate} su ${a.copertura.totali}.</p>`
    );
    if (a.accertato.length)
      parti.push(
        `<p style="font-size:11px;margin-bottom:0"><b>Accertato dai documenti</b></p><ul>${a.accertato
          .map((x) => `<li>${esc(x)}</li>`)
          .join('')}</ul>`
      );
    if (a.daAccertare.length)
      parti.push(
        `<p style="font-size:11px;margin-bottom:0"><b>Da accertare</b></p><ul class="lacune">${a.daAccertare
          .map((x) => `<li>${esc(x)}</li>`)
          .join('')}</ul>`
      );
  } else {
    parti.push('<p style="font-size:11px">Indicatore non calcolabile con i dati inseriti.</p>');
  }

  // 2. Soglie e alert
  if (d.soglie?.length || d.alertSoglie) {
    parti.push(titolo('Soglie di segnalazione (art. 25-novies) e alert'));
    if (d.soglie?.length)
      parti.push(
        `<table><thead><tr><th>Parametro</th><th>Soglia</th><th>Importo confrontato</th><th>Esito</th></tr></thead><tbody>${d.soglie
          .map(
            (s) =>
              `<tr><td>${esc(s.ambito)}</td><td>${esc(s.valore)}</td><td class="num">${euro(
                s.esposizione
              )}</td><td>${ESITO_SOGLIA[s.esito]}</td></tr>`
          )
          .join('')}</tbody></table>`
      );
    if (d.alertSoglie)
      parti.push(
        `<p class="alert"><b>${esc(d.alertSoglie.titolo)}</b><br>${esc(d.alertSoglie.dettaglio)}</p>`
      );
  }

  // 2-bis. IL CONFRONTO CON LE DUE IPOTESI (0.153.0). Subito dopo le soglie:
  // il numero misurato e il suo contesto si leggono uno dopo l'altro, non a
  // distanza di pagine. La tabella mostra tutti i ranghi: il foglio non deve
  // dipendere da una scelta fatta a video, e ciò che non è calcolabile lo dice
  // con il dato che manca. Un'ipotesi vuota non si stampa come zero.
  if (d.scenari?.length) {
    const scenari = d.scenari;
    const credito = scenari[0]?.credito ?? null;
    const mancanti = Array.from(new Set(scenari.flatMap((s) => s.mancanti)));
    parti.push(titolo('Confronto con gli scenari: liquidazione giudiziale e cram down'));
    parti.push(
      `<p style="font-size:11px"><b>Credito dell’ente confrontato:</b> ${euro(credito)}</p>`
    );
    parti.push(
      '<table><thead><tr><th>Rango del credito</th><th>Liquidazione giudiziale</th><th>Cram down omologato</th><th>Differenza</th></tr></thead><tbody>'
    );
    for (const s of scenari) {
      const rango = s.rango
        ? (RANGHI.find((r) => r.codice === s.rango)?.etichetta ?? s.rango)
        : '—';
      const liq = s.liquidazione.calcolabile
        ? `${euro(s.liquidazione.netto)} <span style="font-size:10px;color:#475569">(${s.liquidazione.percentuale}% al netto delle spese)</span>`
        : `<i>non calcolabile</i> <span style="font-size:10px;color:#92400e">${esc(
            s.liquidazione.motivo ?? 'parametri incompleti'
          )}</span>`;
      const cram = s.cramDown.calcolabile
        ? `${euro(s.cramDown.netto)} <span style="font-size:10px;color:#475569">(${s.cramDown.percentuale}% del credito)</span>`
        : `<i>non calcolabile</i> <span style="font-size:10px;color:#92400e">${esc(
            s.cramDown.motivo ?? 'parametri incompleti'
          )}</span>`;
      const diff = s.confronto ? euro(s.confronto.differenza) : '—';
      parti.push(
        `<tr><td>${esc(rango)}</td><td class="num">${liq}</td><td class="num">${cram}</td><td class="num">${diff}</td></tr>`
      );
    }
    parti.push('</tbody></table>');
    if (mancanti.length)
      parti.push(
        `<p class="lacune" style="font-size:11px">Per completare il confronto manca: ${esc(
          mancanti.join('; ')
        )}. I parametri si impostano in Parametri di Spazio → Scenari: la piattaforma non ne propone nessuno.</p>`
      );
    parti.push(
      '<p style="font-size:10px;color:#475569">Riferimenti: CCII, art. 84, c. 1 (soddisfacimento non inferiore a quello della liquidazione giudiziale); art. 87, c. 1, lett. c) e cc. 2-3 (valore di liquidazione e obbligo di motivare la preferibilità); art. 112, cc. 3 e 5 (giudizio di convenienza). Il cram down richiama l’omologazione nonostante il dissenso delle classi: il comma va riscontrato sul testo prima di citarlo in un atto. Percentuali e spese di procedura sono parametri dell’ente, non della legge.</p>'
    );
    parti.push(
      '<p style="font-size:10px;color:#92400e">Il confronto applica al credito dell’ente le percentuali configurate: non stima l’attivo dell’azienda e non è un giudizio di convenienza su una proposta.</p>'
    );
  }

  // 3. Valori
  parti.push(titolo('Valori misurati per le soglie (art. 25-novies CCII)'));
  parti.push(`<table><tbody>
<tr><td>Lavoratori subordinati o parasubordinati</td><td>${sino(v.conLavoratori, 'sì', 'no')}</td></tr>
<tr><td>Contributi dovuti nell’anno ${v.annoPrecedente}</td><td class="num">${euro(v.contributiDovutiAnnoPrecedente)}</td></tr>
<tr><td>Contributi non versati, partite rimaste all’ente scadute da oltre 90 giorni</td><td class="num">${euro(v.nonVersatoOltre90)}</td></tr>
<tr><td>Ritardo di oltre 90 giorni</td><td>${sino(
    v.ritardoOltre90Giorni,
    `sì${v.periodiInRitardo ? ` — ${v.periodiInRitardo} periodi` : ''}`,
    'no'
  )}</td></tr>
<tr><td>Denunce non presentate</td><td>${
    v.denunceNonPresentate === null
      ? '<i>Elenco denunce non letto</i>'
      : v.denunceNonPresentate === ''
        ? 'nessuna'
        : esc(v.denunceNonPresentate)
  }</td></tr>
<tr><td>Crediti affidati all’Agente della Riscossione (al netto dei sospesi)</td><td class="num">${euro(v.creditiAffidatiAgente)}</td></tr>
</tbody></table>`);

  // 4. Documenti
  parti.push(titolo('Documenti caricati e letti'));
  parti.push(
    d.documenti.length
      ? `<table><thead><tr><th>File</th><th>Riconosciuto come</th><th>Uso</th></tr></thead><tbody>${d.documenti
          .map(
            (x) => `<tr><td>${esc(x.nome)}</td><td>${esc(x.tipo)}</td><td>${esc(x.esito)}</td></tr>`
          )
          .join('')}</tbody></table>`
      : d.documentiNota
        ? `<p style="font-size:11px">${esc(d.documentiNota)}</p>`
        : '<p style="font-size:11px">Nessun documento caricato: valori inseriti a mano.</p>'
  );

  // 5. Lettura
  if (d.note.length) {
    parti.push(titolo('Cosa è stato letto nei documenti'));
    parti.push(`<ul>${d.note.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`);
  }

  // 6. Evidenze per i reparti
  if (d.uffici?.length) {
    parti.push(titolo('Evidenze preparate per i reparti'));
    parti.push(
      `<p style="font-size:11px">Posizioni e voci che ogni ufficio ha ricevuto con il proprio report. L’invio è a cura di chi scarica il documento: la piattaforma non trasmette nulla.</p>`
    );
    parti.push(
      `<table><thead><tr><th>Ufficio</th><th>Voci</th><th>Posizioni</th><th>Totale</th></tr></thead><tbody>${d.uffici
        .map(
          (u) =>
            `<tr><td>${esc(u.dipendenza)}</td><td>${esc(u.voci.join(' · ') || '—')}</td><td class="num">${
              u.righe
            }</td><td class="num">${euro(u.totale)}</td></tr>`
        )
        .join('')}</tbody></table>`
    );
    parti.push(
      `<p style="font-size:11px">Totale delle evidenze: <b>${euro(
        d.uffici.reduce((a, u) => a + u.totale, 0)
      )}</b> su ${d.uffici.reduce((a, u) => a + u.righe, 0)} posizioni in ${d.uffici.length} ${
        d.uffici.length === 1 ? 'ufficio' : 'uffici'
      }.</p>`
    );
  }

  // 7. Riverifica
  if (riverifica) {
    parti.push(titolo('Quando tornare a verificare'));
    parti.push(
      `<p class="quando">Entro il <b>${data(riverifica)}</b> — ${giorni} giorni dalla verifica del ${data(
        d.dataVerifica
      )} — si controlla che i reparti si siano attivati sulle indicazioni ricevute. Se alla data non risulta alcuna lavorazione, la posizione si riprende in carico.</p>`
    );
  }

  // 8. Perimetro
  parti.push(titolo('Perimetro'));
  parti.push(`<p class="perimetro">${esc(d.perimetro)}</p>`);
  parti.push('</div>');
  return incorniciaSezioni(parti.join('\n'));
}

/**
 * LA CORNICE NUMERATA (0.153.0).
 *
 * Le sezioni sono già scritte una dopo l'altra da `titolo()`. Qui si avvolgono
 * in un box per sezione, con il numero in alto a sinistra e il salto di pagina
 * dopo ciascuna: il foglio si legge un box alla volta, come si legge un
 * verbale, e ogni citazione ha un numero. Il preambolo — intestazione,
 * ristampa, avvisi — resta fuori dalle cornici: non è una verifica.
 *
 * La trasformazione è testuale e volutamente semplice: il numero è già nel
 * titolo (`<h2>3. ...</h2>`), quindi non c'è una seconda numerazione da
 * tenere allineata a quella visibile.
 */
function incorniciaSezioni(html: string): string {
  const parti = html.split(/(?=<h2>)/);
  if (parti.length <= 1) return html;
  return parti
    .map((parte, i) => {
      const m = parte.match(/^<h2>(\d+)\./);
      if (!m) return parte;
      const ultimo = i === parti.length - 1;
      const corpo = parte.replace(/^<h2>/, '<h2 style="padding-left:34px">');
      return `<section class="triage-box"${
        ultimo ? '' : ' style="page-break-after:always"'
      }><div class="triage-box-num" aria-hidden="true">${m[1]}</div>${corpo}</section>`;
    })
    .join('\n');
}
