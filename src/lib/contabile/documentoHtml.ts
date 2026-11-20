// LE TABELLE CONTABILI NEL DOCUMENTO DELLA VERIFICA.
//
// Il documento dell'esito rimandava a un'altra stampa («Fotografia contabile»)
// per i numeri che lo sostengono: chi lo leggeva doveva cercare altrove il
// prospetto, gli indici e la proiezione, e fidarsi che fossero gli stessi. Ora
// ci sono dentro, ciascuno con la sua nota.
//
// Tre sezioni, nell'ordine in cui si leggono:
//
//   1. IL PROSPETTO A SCALARE  i bilanci depositati, voce per voce: è il dato,
//                              senza riclassifiche.
//   2. GLI INDICI              per annualità, con soglia ed esito: sono la
//                              lettura diagnostica del dato.
//   3. LA PROIEZIONE           gli anni costruiti dai differenziali fino
//                              all'anno della verifica, con il metodo e le
//                              avvertenze già composte dal motore.
//
// Nessun calcolo nuovo: le voci sono quelle del prospetto della schermata, gli
// indici quelli archiviati dal motore XBRL, la proiezione quella restituita da
// `componiProiezione`. Le note spiegano che cosa contiene ogni tabella e che
// cosa non è: è la parte che rende il numero leggibile a chi non l'ha prodotto.
//
// Logica pura: riceve i dati, produce HTML. Niente accesso al database.

import { indiciVisibili, valoreIndice } from '@/lib/xbrl/indiciVisibili';
import type { DatiFinanziariPeriodo, IndiceCcii } from '@/lib/xbrl/types';
import type { ProiezioneContabile } from './proiezione';

/** Un bilancio come lo legge il documento: basta ciò che si stampa. */
export interface BilancioDocumento {
  annoBilancio: number | null;
  datiFinanziari: DatiFinanziariPeriodo;
  indici: IndiceCcii[];
  altriIndici?: IndiceCcii[];
}

export interface SezioneContabile {
  titolo: string;
  corpo: string;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const euro = (n: number | null | undefined) =>
  typeof n === 'number' && Number.isFinite(n) ? `${Math.round(n).toLocaleString('it-IT')} €` : '—';

const numero = (n: number | null | undefined) =>
  typeof n === 'number' && Number.isFinite(n)
    ? n.toLocaleString('it-IT', { maximumFractionDigits: 2 })
    : 'n/d';

/** Le voci del prospetto, nell'ordine in cui si leggono (come in schermata). */
const VOCI: { etichetta: string; chiave: keyof DatiFinanziariPeriodo; forte?: boolean }[] = [
  { etichetta: 'Ricavi delle vendite', chiave: 'ricaviVendite' },
  { etichetta: 'Valore della produzione', chiave: 'valoreProduzione' },
  { etichetta: 'Costi della produzione', chiave: 'costiProduzione' },
  { etichetta: 'EBITDA', chiave: 'ebitda', forte: true },
  { etichetta: 'Ammortamenti', chiave: 'ammortamenti' },
  { etichetta: 'EBIT', chiave: 'ebit', forte: true },
  { etichetta: 'Oneri finanziari', chiave: 'oneriFinanziari' },
  { etichetta: 'Risultato d’esercizio', chiave: 'utileEsercizio', forte: true },
  { etichetta: 'Patrimonio netto', chiave: 'patrimonioNetto', forte: true },
  { etichetta: 'Totale debiti', chiave: 'totaleDebiti' },
  { etichetta: 'Disponibilità liquide', chiave: 'disponibilitaLiquide' },
];

/** PFN = debiti verso banche − disponibilità liquide; null se una delle due manca. */
const pfn = (d: DatiFinanziariPeriodo): number | null =>
  typeof d.debitiBanche === 'number' && typeof d.disponibilitaLiquide === 'number'
    ? d.debitiBanche - d.disponibilitaLiquide
    : null;

const nota = (testo: string) => `<p class="note">${esc(testo)}</p>`;

/**
 * Le tre sezioni contabili del documento. Ogni sezione ha titolo e corpo già
 * pronti: la numerazione la decide chi compone il documento.
 */
export function htmlSezioniContabili(input: {
  storico: BilancioDocumento[];
  proiezione: ProiezioneContabile | null;
  /** Codici degli indici abilitati nello spazio. Vuoto = tutti quelli del bilancio. */
  indiciAbilitati: string[];
}): SezioneContabile[] {
  const bilanci = input.storico
    .filter((b) => b.annoBilancio !== null)
    .sort((a, b) => (a.annoBilancio as number) - (b.annoBilancio as number));
  const sezioni: SezioneContabile[] = [];

  // ---- 1. Prospetto a scalare ---------------------------------------------
  sezioni.push({
    titolo: 'Prospetto contabile depositato',
    corpo:
      bilanci.length === 0
        ? nota(
            'Nessun bilancio XBRL in archivio: il prospetto non ha colonne da mostrare. Il dato si carica nella verifica contabile, sezione 3.'
          )
        : `<table>
  <thead><tr><th>Voce</th>${bilanci
    .map((b) => `<th class="num">${b.annoBilancio}</th>`)
    .join('')}</tr></thead>
  <tbody>
    ${VOCI.map(
      (v) =>
        `<tr${v.forte ? ' class="tot"' : ''}><td>${esc(v.etichetta)}</td>${bilanci
          .map(
            (b) => `<td class="num">${euro(b.datiFinanziari[v.chiave] as number | undefined)}</td>`
          )
          .join('')}</tr>`
    ).join('')}
    <tr class="tot"><td>Posizione finanziaria netta</td>${bilanci
      .map((b) => `<td class="num">${euro(pfn(b.datiFinanziari))}</td>`)
      .join('')}</tr>
  </tbody>
</table>` +
          nota(
            'Le voci sono quelle dei bilanci XBRL in archivio, nell’ordine del prospetto e senza riclassifiche. In grassetto EBITDA, EBIT, risultato d’esercizio e patrimonio netto: sono le righe da cui si leggono l’equilibrio e gli indici. La posizione finanziaria netta è debiti verso banche meno disponibilità liquide; quando una delle due voci non è valorizzata la riga resta «—», non uno zero.'
          ),
  });

  // ---- 2. Indici per annualità --------------------------------------------
  let corpoIndici: string;
  if (bilanci.length === 0) {
    corpoIndici = nota('Nessun bilancio in archivio: non ci sono indici da calcolare.');
  } else {
    const ultimo = bilanci[bilanci.length - 1];
    const righe = indiciVisibili(input.indiciAbilitati, ultimo.indici, ultimo.altriIndici ?? []);
    corpoIndici =
      righe.length === 0
        ? nota(
            'Nessun indice abilitato nello spazio, e nessun indice calcolabile dal bilancio: la tabella resta vuota. Gli indici si scelgono in Parametri di Spazio → Indici.'
          )
        : `<table>
  <thead><tr><th>Indice</th><th>Soglia</th>${bilanci
    .map((b) => `<th class="num">${b.annoBilancio}</th>`)
    .join('')}</tr></thead>
  <tbody>
    ${righe
      .map((ind) => {
        const celle = bilanci
          .map((b) => {
            const v = valoreIndice(b, ind.codice);
            if (!v) {
              return `<td class="num">${ind.motivoNonCalcolabile ? 'n/d' : '—'}</td>`;
            }
            if (v.valore === 'N/D') return `<td class="num">n/d</td>`;
            return `<td class="num">${numero(v.valore)}${
              v.esito === 'VIOLATO' ? ' (oltre soglia)' : ''
            }</td>`;
          })
          .join('');
        return `<tr><td><strong>${esc(ind.codice)}</strong> — ${esc(
          ind.nome.replace(new RegExp(`^${ind.codice}\\s*[—-]\\s*`), '')
        )}</td><td>${esc(ind.soglia)}</td>${celle}</tr>`;
      })
      .join('')}
  </tbody>
</table>` +
          nota(
            'Stesse formule del resto della piattaforma. «Oltre soglia» segnala il superamento della soglia di riferimento dell’indice: sono strumenti operativi di lettura, non parametri normativi (il sistema dell’originario art. 13 CCII è abrogato). «n/d» indica un indice che il solo bilancio depositato non basta a calcolare — il motivo è nella riga — oppure una voce di bilancio mancante.'
          ) +
          righe
            .filter((r) => r.motivoNonCalcolabile)
            .map((r) => nota(`${r.codice}: ${r.motivoNonCalcolabile as string}`))
            .join('');
  }
  sezioni.push({ titolo: 'Indici diagnostici per annualità', corpo: corpoIndici });

  // ---- 3. Proiezione fino all'anno della verifica -------------------------
  const p = input.proiezione;
  let corpoProiezione: string;
  if (!p) {
    corpoProiezione = nota(
      input.storico.length === 0
        ? 'Nessun bilancio XBRL in archivio: senza il dato depositato non c’è una serie da cui contare i differenziali.'
        : 'Proiezione non disponibile: il dettaglio è nella verifica contabile, sezione 5.'
    );
  } else if (p.anniArchivio.length === 0) {
    corpoProiezione = nota(p.metodo);
  } else {
    const intestazioni = [
      ...p.anniArchivio.map(
        (anno) => `<th class="num">${anno}<br><span style="font-weight:400">storico</span></th>`
      ),
      ...p.annualitaCalcolate.map(
        (anno) => `<th class="num">${anno}<br><span style="font-weight:400">calcolato</span></th>`
      ),
    ].join('');
    const righe = p.voci
      .map((voce) => {
        const storico = voce.storico
          .map((s) => `<td class="num">${s.valore === null ? '—' : euro(s.valore)}</td>`)
          .join('');
        const calcolate = p.annualitaCalcolate
          .map((anno) => {
            const punto = voce.proiezioni.find((x) => x.anno === anno);
            return `<td class="num">${punto ? euro(punto.valore) : '—'}</td>`;
          })
          .join('');
        const qualifica =
          voce.natura === 'DERIVATA'
            ? ' <span style="color:#64748b;font-size:10px">(derivata)</span>'
            : voce.proiettabile
              ? ''
              : ' <span style="color:#64748b;font-size:10px">(ferma)</span>';
        return `<tr${voce.natura === 'DERIVATA' ? ' class="tot"' : ''}><td>${esc(
          voce.etichetta
        )}${qualifica}</td>${storico}${calcolate}</tr>`;
      })
      .join('');
    corpoProiezione =
      `<p style="font-size:11px">${esc(p.metodo)}</p>` +
      `<table><thead><tr><th>Voce</th>${intestazioni}</tr></thead><tbody>${righe}</tbody></table>` +
      (p.annualitaCalcolate.length > 0
        ? nota(
            `«Calcolato» non è «previsto»: valore della produzione, costi, oneri e debiti seguono la stessa ragione geometrica dei differenziali, applicata ai valori del ${p.annoUltimoBilancio} fino al ${p.annoVerifica}; le voci derivate si ricavano da quelle. «Storico» è il dato depositato, così com’è. Le voci segnate «ferma» non hanno una serie utilizzabile e restano all’ultimo dato: non sono stimate.`
          )
        : '') +
      (p.ponteEnte?.applicato
        ? nota(
            `Voce dell’ente: il bilancio ${p.annoUltimoBilancio} dichiara ${euro(
              p.ponteEnte.debitoContabileUltimo
            )} fra debiti tributari e previdenziali; la verifica amministrativa ne accerta ${euro(
              p.ponteEnte.debitoVerificato
            )}${p.ponteEnte.accertatoIl ? ` (${p.ponteEnte.accertatoIl})` : ''}. La differenza di ${euro(
              p.ponteEnte.differenza
            )} è la crescita presunta nel periodo ricostruito, iscritta come voce dell’ente in ${p.ponteEnte.quote
              .map((q) => `${q.anno}: ${euro(q.quota)}`)
              .join(' · ')}; alla data della verifica le due voci tornano allo stock accertato.`
          )
        : p.ponteEnte?.motivo
          ? nota(`Voce dell’ente non ricostruita: ${p.ponteEnte.motivo}`)
          : '') +
      (p.avvertenze.length > 0
        ? `<p class="note">Limiti della proiezione:</p><ul>${p.avvertenze
            .map((a) => `<li>${esc(a)}</li>`)
            .join('')}</ul>`
        : '');
  }
  sezioni.push({
    titolo: 'Differenziali e proiezione fino all’anno della verifica',
    corpo: corpoProiezione,
  });

  return sezioni;
}
