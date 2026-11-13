import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { ottieniContestoAccessoSpazio } from '@/app/actions/spazi';
import { ottieniAziendaPerId } from '@/app/actions/aziende';
import { ottieniAttenzioneScreeningAction } from '@/app/actions/attenzioneScreening';
import { ottieniStoricoVerificheAction } from '@/app/actions/aziendaInVerifica';
import { ottieniRaccomandazioneAction } from '@/app/actions/raccomandazioneVerifica';
import { debitoEnteMemorizzatoAction } from '@/app/actions/debitiEnteMemorizzati';
import { valutaSoglieAction } from '@/app/actions/soglie25novies';
import { leggiChecklistProdottiAzienda } from '@/lib/prodotti/checklistAzienda';
import { checklistProdottiCompleta } from '@/lib/checklist/pesoProdotti';
import { StampaDocumento } from '@/components/spazio/StampaDocumento';
import { valutaValidita } from '@/lib/screening/validitaVerifica';

// IL REPORT DELLA VERIFICA AMMINISTRATIVA — FUORI DAL GUSCIO (0.215.0).
//
// Le versioni precedenti stampavano una pagina dell'applicazione: sidebar,
// barre di stato, contenitore scorrevole. Anche nascosti, restava il difetto di
// fondo — il documento era la schermata. Qui il report è una rotta autonoma,
// senza Pannello Spazio intorno: un foglio A4 con copertina, indice, sezioni
// numerate, testata e piede che si ripetono a ogni pagina (position: fixed, che
// i browser ripetono in stampa), salti di pagina dichiarati e tabelle con
// filetti. Lo stile è scritto qui, in unità da carta (mm, pt), non ricavato
// dalle classi dello schermo.
//
// Nessun dato nuovo: le stesse azioni della verifica. Nessun consiglio: i fatti
// e le strade possibili, con la decisione che resta all'ente.

export const dynamic = 'force-dynamic';

const CSS = `
.doc-canvas { background: #e2e8f0; min-height: 100vh; padding: 20px 12px 56px; }
.doc-foglio {
  width: 210mm; min-height: 297mm; margin: 0 auto; background: #fff; color: #0f172a;
  box-shadow: 0 10px 30px rgba(15,23,42,.18); padding: 22mm 18mm 20mm;
  font-family: var(--font-body), system-ui, sans-serif; font-size: 9.5pt; line-height: 1.45;
}
.doc-foglio h1, .doc-foglio h2, .doc-foglio h3 { font-family: var(--font-display), system-ui, sans-serif; margin: 0; }
.doc-cifra { font-family: var(--font-mono), ui-monospace, monospace; font-variant-numeric: tabular-nums; }

.doc-testata, .doc-piede { display: none; }
.doc-intestazione { border-bottom: 2px solid #0f172a; padding-bottom: 6px; margin-bottom: 14px;
  display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.doc-marchio { font-size: 7.5pt; letter-spacing: .22em; text-transform: uppercase; color: #64748b; font-weight: 700; }
.doc-occhiello { font-size: 7.5pt; letter-spacing: .2em; text-transform: uppercase; color: #64748b; font-weight: 700; }
.doc-copertina { min-height: 236mm; display: flex; flex-direction: column; }
.doc-copertina .doc-titolo-grande { font-size: 26pt; line-height: 1.1; letter-spacing: -.01em; margin: 6mm 0 2mm; }
.doc-azienda { font-size: 17pt; font-weight: 700; line-height: 1.2; }
.doc-riga { display: flex; justify-content: space-between; gap: 10px; border-bottom: 1px solid #e2e8f0; padding: 3px 0; }
.doc-riga dt { color: #64748b; font-size: 8.5pt; }
.doc-riga dd { margin: 0; font-weight: 600; font-size: 9pt; text-align: right; }
.doc-esito { border: 1px solid #cbd5e1; border-left-width: 5px; padding: 8px 10px; margin-bottom: 6mm; }
.doc-esito strong { display: block; font-size: 12pt; }
.doc-numeri { display: grid; grid-template-columns: repeat(2, 1fr); gap: 4mm; margin: 4mm 0; }
.doc-numero { border: 1px solid #cbd5e1; padding: 3mm; }
.doc-numero span { display: block; }
.doc-numero .doc-numero-etichetta { font-size: 7pt; letter-spacing: .14em; text-transform: uppercase; color: #64748b; font-weight: 700; }
.doc-numero .doc-numero-valore { font-size: 13pt; font-weight: 700; margin-top: 1mm; }
.doc-numero .doc-numero-nota { font-size: 7.5pt; color: #64748b; margin-top: .5mm; }
.doc-indice { margin-top: auto; border-top: 1px solid #0f172a; padding-top: 3mm; }
.doc-indice ol { margin: 2mm 0 0; padding-left: 6mm; font-size: 9pt; }
.doc-indice li { margin-bottom: .8mm; }

.doc-sezione { margin: 0 0 7mm; break-inside: avoid; }
.doc-sezione + .doc-sezione { break-before: auto; }
.doc-titolo { font-size: 12pt; margin-bottom: 2mm; padding-bottom: 1.2mm; border-bottom: 1px solid #0f172a; }
.doc-titolo .doc-num { color: #94a3b8; margin-right: 2.5mm; font-size: 9pt; font-family: var(--font-mono), monospace; }
.doc-blocco { break-inside: avoid; }
.doc-tabella { width: 100%; border-collapse: collapse; font-size: 9pt; }
.doc-tabella th { text-align: left; font-size: 7pt; letter-spacing: .12em; text-transform: uppercase;
  color: #64748b; border-bottom: 1px solid #94a3b8; padding: 1.2mm 1.5mm; }
.doc-tabella td { padding: 1.2mm 1.5mm; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
.doc-tabella td.num, .doc-tabella th.num { text-align: right; font-family: var(--font-mono), monospace; }
.doc-elenco { margin: 1mm 0 0; padding: 0; list-style: none; }
.doc-elenco li { position: relative; padding-left: 4mm; margin-bottom: 1mm; }
.doc-elenco li:before { content: ''; position: absolute; left: 0; top: 1.6mm; width: 1.4mm; height: 1.4mm;
  background: #0f172a; }
.doc-elenco.vuoto li:before { background: #fff; border: .3mm solid #94a3b8; }
.doc-nota { font-size: 8pt; color: #64748b; margin-top: 1.5mm; }
.doc-nota-forte { border-left: 2px solid #f59e0b; padding-left: 2.5mm; font-size: 8.5pt; color: #334155; }
.doc-percorso { break-inside: avoid; margin-bottom: 5mm; padding-left: 3mm; border-left: 2px solid #cbd5e1; }
.doc-percorso.primario { border-left-color: #0f172a; }
.doc-percorso h3 { font-size: 10.5pt; margin-bottom: 1mm; }
.doc-bollo { display: inline-block; border: 1px solid #94a3b8; padding: 0 1.2mm; font-size: 6.5pt;
  letter-spacing: .12em; text-transform: uppercase; color: #475569; font-weight: 700; vertical-align: 1px; }
.doc-firma { margin-top: 6mm; border-top: 1px solid #0f172a; padding-top: 2mm; font-size: 8pt; color: #475569; }
.doc-firma .doc-riga-doc { display: flex; justify-content: space-between; gap: 10px; }
.doc-finale { break-before: page; padding-top: 2mm; }
.doc-allegato { break-before: page; padding-top: 2mm; }
.doc-finale .doc-titolo { font-size: 14pt; border-bottom-width: 2px; }
.doc-finale .doc-numero .doc-numero-valore { font-size: 12pt; }
.doc-finale .doc-sintesi-riga { display: flex; justify-content: space-between; gap: 6mm;
  border-bottom: 1px solid #e2e8f0; padding: 1.4mm 0; font-size: 9pt; }
.doc-finale .doc-sintesi-riga strong { font-weight: 700; }

.doc-barra { position: fixed; top: 14px; right: 16px; display: flex; gap: 8px; z-index: 20; }

@media print {
  @page { size: A4; margin: 24mm 18mm 20mm; }
  html, body { background: #fff !important; }
  .doc-canvas { background: #fff; padding: 0; min-height: 0; }
  .doc-foglio { width: auto; min-height: 0; margin: 0; padding: 0; box-shadow: none; font-size: 9.5pt; }
  .doc-barra, .doc-non-stampare { display: none !important; }
  .doc-testata {
    display: flex; position: fixed; top: -18mm; left: 0; right: 0;
    justify-content: space-between; align-items: baseline;
    font-size: 7pt; letter-spacing: .12em; text-transform: uppercase; color: #64748b;
    border-bottom: .3mm solid #cbd5e1; padding-bottom: 1.5mm;
  }
  .doc-piede {
    display: flex; position: fixed; bottom: -14mm; left: 0; right: 0;
    justify-content: space-between; font-size: 7pt; color: #64748b;
    border-top: .3mm solid #cbd5e1; padding-top: 1.5mm;
  }
  .doc-copertina { min-height: 0; break-after: page; }
  .doc-copertina .doc-indice { margin-top: 12mm; }
  .doc-sezione { break-inside: avoid; }
  .doc-titolo { break-after: avoid; }
  .doc-tabella tr { break-inside: avoid; }
  .doc-copertina .doc-numeri { grid-template-columns: repeat(2, 1fr); }
  a { color: inherit; text-decoration: none; }
}
`;

const euro = (valore: number) =>
  `${valore.toLocaleString('it-IT', { maximumFractionDigits: 0 })} €`;
const data = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('it-IT') : null;

const ESITO_SOGLIA: Record<string, string> = {
  sopra: 'Superata',
  sotto: 'Non superata',
  non_determinabile: 'Non determinabile',
};

export default async function ReportVerificaAmministrativaPage({
  params,
  searchParams,
}: {
  params: Promise<{ codice: string; aziendaId: string }>;
  searchParams: Promise<{ stampa?: string }>;
}) {
  const { codice, aziendaId } = await params;
  const { stampa } = await searchParams;
  const contesto = await ottieniContestoAccessoSpazio(codice);
  if (!contesto) redirect('/');
  if (contesto.modalita === 'OPERATORE') redirect(`/spazio/${codice}`);

  const id = Number(aziendaId);
  if (!Number.isInteger(id) || id <= 0) redirect(`/spazio/${codice}/verifica-salute`);

  const azienda = await ottieniAziendaPerId(contesto.nomeSchema, id);
  if (!azienda.success || !azienda.azienda) redirect(`/spazio/${codice}/verifica-salute`);

  // In uno spazio ENTE si valuta la soglia dell'ente, in uno REDIGENTE tutte:
  // lo decide il motore delle soglie, non questa pagina.
  const tipoSpazio = contesto.tipoSpazio === 'ENTE' ? 'ENTE' : 'NON_ENTE';
  const [attenzioneRis, storicoRis, raccomandazioneRis, debitoRis, soglieRis, checklistRis] =
    await Promise.all([
      ottieniAttenzioneScreeningAction(contesto.nomeSchema, id).catch(() => null),
      ottieniStoricoVerificheAction(contesto.nomeSchema).catch(() => null),
      ottieniRaccomandazioneAction(contesto.nomeSchema, id).catch(() => null),
      debitoEnteMemorizzatoAction(contesto.nomeSchema, id).catch(() => null),
      valutaSoglieAction(contesto.nomeSchema, id, tipoSpazio).catch(() => null),
      leggiChecklistProdottiAzienda(contesto.nomeSchema, id).catch(() => null),
    ]);
  const attenzione = attenzioneRis?.success ? (attenzioneRis.attenzione ?? null) : null;
  const raccomandazione = raccomandazioneRis?.success
    ? (raccomandazioneRis.raccomandazione ?? null)
    : null;
  const debito = debitoRis?.success ? (debitoRis.debito ?? null) : null;
  const soglie = soglieRis?.success ? (soglieRis.esito ?? null) : null;

  // LA CHECK LIST CHE QUALIFICA È QUELLA DEI PRODOTTI (0.220.0). Si compila nel
  // triage, prima dell'esito: è da quelle risposte che la lettura prende peso.
  // La ministeriale si compila, nella peggiore delle ipotesi, nella fase
  // redigente, e non può qualificare un documento che la precede.
  //
  // L'allegato si riporta quando la check list è completa, e quando non lo è il
  // documento dichiara perché manca: non lo si toglie in silenzio.
  const sintesiProdotti = checklistRis;
  const prodottiCompleti = checklistProdottiCompleta(sintesiProdotti);
  const risposteChecklist = sintesiProdotti?.risposte ?? 0;
  const totaleDomande = sintesiProdotti?.totale ?? 0;
  // Zero domande in check list non è «0/0 risposte»: è un quadro che non si
  // può formare, e il documento deve dirlo con le parole giuste.
  const prodottiChiesti = totaleDomande > 0;
  const checklistCompleta = prodottiCompleti;
  const allegatoDisponibile = prodottiCompleti && raccomandazione !== null;
  const righeSoglie = (soglie?.righe ?? []).filter((r) => r.applicabile);
  // I numeri della sintesi finale: le stesse righe del documento, contate.
  const soglieSuperate = righeSoglie.filter((r) => r.esito === 'sopra');
  const soglieNonDeterminabili = righeSoglie.filter((r) => r.esito === 'non_determinabile');
  const totaleSoglieSuperate = soglieSuperate.reduce((somma, r) => somma + (r.esposizione ?? 0), 0);
  const debitoIl = data(debitoRis?.memorizzatoIl ?? null);
  const riga = storicoRis?.success ? storicoRis.righe?.find((v) => v.id === id) : undefined;
  const validita = valutaValidita(riga?.eseguitaIl ?? null);
  const oggi = new Date().toLocaleDateString('it-IT');
  const oggetto = raccomandazione
    ? raccomandazione.percorsi.find((p) => p.codice === raccomandazione.percorsoConsigliato)
    : null;

  return (
    <>
      <style>{CSS}</style>

      <div className="doc-canvas">
        <div className="doc-barra">
          <Link
            href={`/spazio/${codice}/verifica-salute/${id}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-600"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Torna all’esito
          </Link>
          <StampaDocumento etichetta="Stampa / PDF" auto={stampa === '1'} />
        </div>

        <div className="doc-foglio">
          {/* TESTATA E PIEDE RICORRENTI — solo in stampa, a ogni pagina */}
          <div className="doc-testata">
            <span>Report di supporto · verifica amministrativa</span>
            <span>{azienda.azienda.ragioneSociale}</span>
          </div>
          <div className="doc-piede">
            <span>
              Spazio {contesto.codice} · documento generato il {oggi}
            </span>
            <span>Strumento di supporto — la decisione resta all’ente</span>
          </div>

          {/* COPERTINA */}
          <section className="doc-copertina">
            <div className="doc-intestazione">
              <span className="doc-marchio">CCII · Codice della crisi d’impresa</span>
              <span className="doc-marchio">Documento di supporto</span>
            </div>

            <p className="doc-occhiello">Verifica amministrativa</p>
            <h1 className="doc-titolo-grande">Report di supporto</h1>
            <p className="doc-azienda">{azienda.azienda.ragioneSociale}</p>
            <p className="doc-nota">
              {azienda.azienda.partitaIva
                ? `P. IVA ${azienda.azienda.partitaIva}`
                : 'P. IVA non registrata'}
              {azienda.azienda.codiceFiscale &&
              azienda.azienda.codiceFiscale !== azienda.azienda.partitaIva
                ? ` · C.F. ${azienda.azienda.codiceFiscale}`
                : ''}
              {azienda.azienda.codiceAteco ? ` · ATECO ${azienda.azienda.codiceAteco}` : ''}
            </p>

            <div className="doc-esito" style={{ marginTop: '7mm' }}>
              <span className="doc-occhiello">Esito della verifica</span>
              <strong>{attenzione ? attenzione.etichetta : 'Indicatore non leggibile'}</strong>
              <span className="doc-nota">
                {attenzione ? attenzione.fattoreDeterminante : 'la verifica non è stata completata'}
              </span>
            </div>

            <div className="doc-numeri">
              <div className="doc-numero">
                <span className="doc-numero-etichetta">Copertura</span>
                <span className="doc-numero-valore doc-cifra">
                  {attenzione
                    ? `${attenzione.copertura.determinate}/${attenzione.copertura.totali}`
                    : '—'}
                </span>
                <span className="doc-numero-nota">elementi determinati sul totale</span>
              </div>
              <div className="doc-numero">
                <span className="doc-numero-etichetta">Verifica eseguita</span>
                <span className="doc-numero-valore doc-cifra">{data(riga?.eseguitaIl) ?? '—'}</span>
                <span className="doc-numero-nota">{validita.etichetta}</span>
              </div>
              <div className="doc-numero">
                <span className="doc-numero-etichetta">Debito dell’ente</span>
                <span className="doc-numero-valore doc-cifra">
                  {debito ? euro(debito.totale) : '—'}
                </span>
                <span className="doc-numero-nota">
                  {debito ? 'dato certo, non stimato' : 'non memorizzato'}
                </span>
              </div>
              <div className="doc-numero">
                <span className="doc-numero-etichetta">Primo confronto</span>
                <span className="doc-numero-valore">{oggetto?.etichetta ?? 'non disponibile'}</span>
                <span className="doc-numero-nota">
                  {oggetto ? `decide ${oggetto.chiDecide.toLowerCase()}` : '—'}
                </span>
              </div>
            </div>

            <div className="doc-indice">
              <span className="doc-occhiello">Contenuto del documento</span>
              <ol>
                <li>Dati della verifica</li>
                <li>Esito e fatti accertati</li>
                <li>Soglie di segnalazione (art. 25-novies)</li>
                <li>Debito dell’ente</li>
                {raccomandazione && <li>Elementi letti</li>}
                <li>Limiti e natura del documento</li>
                <li>Allegato A — Supporto decisionale (se la check list è completa)</li>
                <li>Sintesi finale — i numeri in trenta secondi</li>
              </ol>
            </div>
          </section>

          {/* 1 · DATI DELLA VERIFICA */}
          <section className="doc-sezione">
            <h2 className="doc-titolo">
              <span className="doc-num">1</span> Dati della verifica
            </h2>
            <dl>
              <div className="doc-riga">
                <dt>Azienda</dt>
                <dd>{azienda.azienda.ragioneSociale}</dd>
              </div>
              <div className="doc-riga">
                <dt>Partita IVA</dt>
                <dd className="doc-cifra">{azienda.azienda.partitaIva || '—'}</dd>
              </div>
              <div className="doc-riga">
                <dt>Codice fiscale</dt>
                <dd className="doc-cifra">{azienda.azienda.codiceFiscale || '—'}</dd>
              </div>
              <div className="doc-riga">
                <dt>Codice ATECO</dt>
                <dd className="doc-cifra">{azienda.azienda.codiceAteco || '—'}</dd>
              </div>
              <div className="doc-riga">
                <dt>Spazio</dt>
                <dd>{contesto.codice}</dd>
              </div>
              <div className="doc-riga">
                <dt>Verifica eseguita il</dt>
                <dd className="doc-cifra">
                  {data(riga?.eseguitaIl) ?? 'non registrata'}
                  {validita.etichetta ? ` · ${validita.etichetta}` : ''}
                </dd>
              </div>
              <div className="doc-riga">
                <dt>Copertura della verifica</dt>
                <dd className="doc-cifra">
                  {attenzione
                    ? `${attenzione.copertura.determinate}/${attenzione.copertura.totali}`
                    : '—'}
                </dd>
              </div>
              <div className="doc-riga">
                <dt>Documento generato il</dt>
                <dd className="doc-cifra">{oggi}</dd>
              </div>
            </dl>
          </section>

          {/* 2 · ESITO */}
          <section className="doc-sezione">
            <h2 className="doc-titolo">
              <span className="doc-num">2</span> Esito e fatti accertati
            </h2>
            {attenzione ? (
              <div className="doc-blocco">
                {attenzione.accertato.length > 0 && (
                  <>
                    <p className="doc-occhiello">Accertato</p>
                    <ul className="doc-elenco">
                      {attenzione.accertato.map((voce, i) => (
                        <li key={i}>{voce}</li>
                      ))}
                    </ul>
                  </>
                )}
                {attenzione.daAccertare.length > 0 && (
                  <>
                    <p className="doc-occhiello" style={{ marginTop: '4mm' }}>
                      Da accertare
                    </p>
                    <ul className="doc-elenco vuoto">
                      {attenzione.daAccertare.map((voce, i) => (
                        <li key={i}>{voce}</li>
                      ))}
                    </ul>
                  </>
                )}
                <div style={{ marginTop: '3mm' }}>
                  <p className="doc-occhiello">Check list dei prodotti — quadro qualitativo</p>
                  {prodottiCompleti && sintesiProdotti ? (
                    <p>
                      <strong>{sintesiProdotti.etichetta}</strong>. {sintesiProdotti.positive}{' '}
                      risposte lette come positive e {sintesiProdotti.negative} come negative sulle{' '}
                      {sintesiProdotti.chiuse} domande chiuse; {risposteChecklist}/{totaleDomande}{' '}
                      risposte date. Il quadro entra nella valutazione amministrativa con il peso
                      delle risposte date, e può peggiorare l’esito ma non migliorarlo.
                    </p>
                  ) : (
                    <p className="doc-nota">
                      {prodottiChiesti
                        ? `Non completa: ${risposteChecklist}/${totaleDomande} risposte date. Finché la check list dei prodotti non è compilata il quadro qualitativo non entra nella valutazione, e il supporto decisionale resta fuori dal documento.`
                        : 'Nessun prodotto è in check list: non ci sono domande da porre, quindi il quadro qualitativo non si forma e non entra nella valutazione. Le domande si scrivono sui prodotti, nei parametri dello spazio.'}
                    </p>
                  )}
                </div>
                <p className="doc-nota" style={{ marginTop: '3mm' }}>
                  Indicatore di priorità di attenzione, non di probabilità di insolvenza. La scelta
                  su come procedere resta al valutatore.
                </p>
              </div>
            ) : (
              <p>
                L’indicatore di attenzione non è leggibile per questa azienda: il documento riporta
                le strade possibili, senza l’esito della verifica.
              </p>
            )}
          </section>

          {/* 3 · SOGLIE */}
          <section className="doc-sezione">
            <h2 className="doc-titolo">
              <span className="doc-num">3</span> Soglie di segnalazione (art. 25-novies)
            </h2>
            {righeSoglie.length > 0 ? (
              <div className="doc-blocco">
                <table className="doc-tabella">
                  <thead>
                    <tr>
                      <th style={{ width: '46%' }}>Soglia</th>
                      <th className="num">Esposizione</th>
                      <th style={{ width: '22%' }}>Esito</th>
                    </tr>
                  </thead>
                  <tbody>
                    {righeSoglie.map((r, i) => (
                      <tr key={`${r.ambito}-${i}`}>
                        <td>
                          <strong>{r.ambito}</strong>
                          <br />
                          <span style={{ fontSize: '8pt', color: '#475569' }}>
                            {r.descrizione}
                            {r.valore ? ` · soglia ${r.valore}` : ''}
                          </span>
                        </td>
                        <td className="num">
                          {r.esposizione === null ? '—' : euro(r.esposizione)}
                        </td>
                        <td>
                          <strong>{ESITO_SOGLIA[r.esito] ?? r.esito}</strong>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <ul className="doc-elenco" style={{ marginTop: '2.5mm' }}>
                  {righeSoglie.map((r, i) => (
                    <li key={`motivo-${i}`}>
                      <strong>{r.ambito}.</strong> {r.motivo}
                    </li>
                  ))}
                </ul>
                {soglie && soglie.datiMancanti.length > 0 && (
                  <p className="doc-nota">
                    Dati mancanti per il calcolo: {soglie.datiMancanti.join('; ')}.
                  </p>
                )}
                <p className="doc-nota">
                  Ogni riga riporta la soglia nella lettera dell’art. 25-novies e l’importo
                  confrontato. «Non determinabile» dice che il dato necessario non è in archivio,
                  non che la soglia sia rispettata.
                </p>
              </div>
            ) : (
              <p className="doc-blocco">
                Nessuna soglia valutabile per questa azienda: mancano i dati necessari al confronto
                (contributi, retribuzioni o debiti iscritti).
              </p>
            )}
          </section>

          {/* 4 · DEBITO */}
          <section className="doc-sezione">
            <h2 className="doc-titolo">
              <span className="doc-num">4</span> Debito dell’ente — dato certo
            </h2>
            {debito ? (
              <div className="doc-blocco">
                <table className="doc-tabella">
                  <tbody>
                    <tr>
                      <td>
                        <strong>Debito verificato</strong>
                      </td>
                      <td className="num">
                        <strong>{euro(debito.totale)}</strong>
                      </td>
                    </tr>
                    <tr>
                      <td>Contabilizzato</td>
                      <td className="num">{euro(debito.contabilizzato)}</td>
                    </tr>
                    <tr>
                      <td>Da contabilizzare</td>
                      <td className="num">{euro(debito.daContabilizzare)}</td>
                    </tr>
                    <tr>
                      <td>Contributi previdenziali</td>
                      <td className="num">{euro(debito.contributi)}</td>
                    </tr>
                    <tr>
                      <td>
                        Sanzioni e interessi
                        {debito.sanzioniNonDistinte ? ' (non distinti)' : ''}
                      </td>
                      <td className="num">{euro(debito.sanzioni)}</td>
                    </tr>
                    <tr>
                      <td>Voci considerate</td>
                      <td className="num">{debito.righe}</td>
                    </tr>
                  </tbody>
                </table>
                <p className="doc-nota">
                  Fonte: {debito.fonte}
                  {debitoIl ? ` · memorizzato il ${debitoIl}` : ''}. È la cifra accertata nella
                  verifica amministrativa: la simulazione la usa come dato, non la stima.
                </p>
              </div>
            ) : (
              <p className="doc-blocco">
                Nessun debito memorizzato: la verifica amministrativa non è ancora stata chiusa. Il
                documento non contiene quindi una cifra certificata.
              </p>
            )}
          </section>

          {raccomandazione && (
            <section className="doc-sezione">
              <h2 className="doc-titolo">
                <span className="doc-num">5</span> Elementi letti
              </h2>
              <table className="doc-tabella">
                <tbody>
                  {raccomandazione.motivi.map((m, i) => (
                    <tr key={i}>
                      <td className="num" style={{ width: '8mm' }}>
                        {i + 1}
                      </td>
                      <td>{m}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {/* 7 · LIMITI */}
          <section className="doc-sezione">
            <h2 className="doc-titolo">
              <span className="doc-num">{raccomandazione ? '6' : '5'}</span> Limiti e natura del
              documento
            </h2>
            <ul className="doc-elenco">
              {(raccomandazione?.limiti ?? []).map((l, i) => (
                <li key={i}>{l}</li>
              ))}
              <li>
                I percorsi sono accostati, non scelti: la decisione su come procedere resta all’ente
                e non dipende dalla piattaforma.
              </li>
              <li>
                Il documento non sostituisce la valutazione del caso concreto né gli atti che ne
                discendono.
              </li>
            </ul>
            <div className="doc-firma">
              <div className="doc-riga-doc">
                <span>
                  Documento generato dalla piattaforma il {oggi} · spazio {contesto.codice}
                </span>
                <span className="doc-cifra">{azienda.azienda.ragioneSociale}</span>
              </div>
            </div>
          </section>

          {/* ALLEGATO A · IL SUPPORTO DECISIONALE. Sta in fondo, come si
              consulta un allegato: la lettura dei dati, i percorsi e i loro
              esiti. Si riporta solo se la check list dei prodotti che qualifica
              il caso è completa, perché è da quelle risposte che la lettura
              prende peso; altrimenti il documento dichiara perché manca. */}
          <section className="doc-sezione doc-allegato">
            <h2 className="doc-titolo">Allegato A — Supporto decisionale</h2>
            {allegatoDisponibile && raccomandazione ? (
              <>
                <p className="doc-nota" style={{ marginBottom: '3mm' }}>
                  Riportato perché la check list dei prodotti è completa ({risposteChecklist}/
                  {totaleDomande} risposte) e il quadro qualitativo è «
                  {sintesiProdotti?.etichetta ?? 'non determinato'}». Non è una raccomandazione:
                  sono le strade che i fatti accertati rendono disponibili, con chi le decide.
                </p>

                <div className="doc-blocco" style={{ marginBottom: '5mm' }}>
                  <p className="doc-occhiello">Lettura dei dati</p>
                  <p style={{ fontWeight: 700, fontSize: '11pt', marginBottom: '1.5mm' }}>
                    {raccomandazione.titolo}
                  </p>
                  <p>{raccomandazione.sintesi}</p>
                  {oggetto && (
                    <p className="doc-nota" style={{ marginTop: '2mm' }}>
                      <strong>Primo confronto: </strong>
                      {oggetto.etichetta} — decide {oggetto.chiDecide.toLowerCase()}.
                    </p>
                  )}
                </div>

                <p className="doc-occhiello" style={{ marginBottom: '2mm' }}>
                  I percorsi, distinti, e i loro esiti
                </p>
                {raccomandazione.percorsi.map((p) => (
                  <div
                    key={p.codice}
                    className={`doc-percorso ${
                      p.codice === raccomandazione.percorsoConsigliato ? 'primario' : ''
                    }`}
                  >
                    <h3>
                      {p.etichetta}
                      {p.codice === raccomandazione.percorsoConsigliato && (
                        <>
                          {' '}
                          <span className="doc-bollo">primo confronto</span>
                        </>
                      )}
                    </h3>
                    <p>{p.natura}</p>
                    <p className="doc-nota">
                      <strong>Decide:</strong> {p.chiDecide}.
                    </p>
                    <ul className="doc-elenco">
                      {p.presupposti.map((voce, i) => (
                        <li key={i}>{voce}</li>
                      ))}
                    </ul>
                    {p.esiti && (
                      <div style={{ marginTop: '2mm' }}>
                        <p className="doc-occhiello">Esiti possibili della proposta</p>
                        <table className="doc-tabella">
                          <thead>
                            <tr>
                              <th>Esito</th>
                              <th>Decide</th>
                              <th>Che cosa significa</th>
                            </tr>
                          </thead>
                          <tbody>
                            {p.esiti.map((e) => (
                              <tr key={e.codice}>
                                <td>
                                  <strong>{e.etichetta}</strong>
                                </td>
                                <td>{e.chiDecide}</td>
                                <td>{e.descrizione}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    <p className="doc-nota" style={{ fontStyle: 'italic', marginTop: '1.5mm' }}>
                      {p.limiti.join(' ')}
                    </p>
                  </div>
                ))}
                <p className="doc-nota-forte">{raccomandazione.nonEquiparabili}</p>
              </>
            ) : (
              <p>
                {prodottiChiesti
                  ? `Non riportato: la check list dei prodotti che qualifica il caso non è completa (${risposteChecklist}/${totaleDomande} risposte date). Senza quelle risposte il quadro qualitativo non entra nella valutazione e le strade possibili restano fuori dal documento.`
                  : 'Non riportato: nessun prodotto è in check list, quindi non ci sono domande da porre. Senza un quadro qualitativo le strade possibili restano fuori dal documento; le domande si scrivono sui prodotti, nei parametri dello spazio.'}
              </p>
            )}
          </section>

          {/* PAGINA DI SINTESI FINALE — i numeri, in trenta secondi */}
          <section className="doc-sezione doc-finale">
            <h2 className="doc-titolo">Sintesi finale — i numeri in trenta secondi</h2>

            <div className="doc-numeri">
              <div className="doc-numero">
                <span className="doc-numero-etichetta">Esito della verifica</span>
                <span className="doc-numero-valore">
                  {attenzione ? attenzione.etichetta : 'non leggibile'}
                </span>
                <span className="doc-numero-nota">
                  {attenzione ? attenzione.fattoreDeterminante : 'verifica non completata'}
                </span>
              </div>
              <div className="doc-numero">
                <span className="doc-numero-etichetta">Debito dell’ente</span>
                <span className="doc-numero-valore doc-cifra">
                  {debito ? euro(debito.totale) : '—'}
                </span>
                <span className="doc-numero-nota">
                  {debito ? `dato certo · ${debito.righe} voci` : 'non memorizzato'}
                </span>
              </div>
              <div className="doc-numero">
                <span className="doc-numero-etichetta">Soglie superate</span>
                <span className="doc-numero-valore doc-cifra">
                  {soglieSuperate.length}/{righeSoglie.length}
                </span>
                <span className="doc-numero-nota">
                  {totaleSoglieSuperate > 0
                    ? `${euro(totaleSoglieSuperate)} di esposizione`
                    : 'nessuna esposizione sopra soglia'}
                </span>
              </div>
              <div className="doc-numero">
                <span className="doc-numero-etichetta">Primo confronto</span>
                <span className="doc-numero-valore">{oggetto?.etichetta ?? 'non disponibile'}</span>
                <span className="doc-numero-nota">
                  {oggetto ? `decide ${oggetto.chiDecide.toLowerCase()}` : '—'}
                </span>
              </div>
            </div>

            {soglieSuperate.length > 0 && (
              <div style={{ marginTop: '4mm' }}>
                <p className="doc-occhiello">Soglie superate, con l’importo</p>
                <ul className="doc-elenco">
                  {soglieSuperate.map((r, i) => (
                    <li key={`sint-sopra-${i}`}>
                      <strong>{r.ambito}</strong>
                      {r.esposizione === null ? '' : ` — ${euro(r.esposizione)}`}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {soglieNonDeterminabili.length > 0 && (
              <div style={{ marginTop: '4mm' }}>
                <p className="doc-occhiello">Soglie non calcolabili con i dati in archivio</p>
                <ul className="doc-elenco vuoto">
                  {soglieNonDeterminabili.map((r, i) => (
                    <li key={`sint-nondet-${i}`}>
                      <strong>{r.ambito}</strong> — {r.motivo}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {attenzione && attenzione.daAccertare.length > 0 && (
              <div style={{ marginTop: '4mm' }}>
                <p className="doc-occhiello">Da accertare prima di decidere</p>
                <ul className="doc-elenco vuoto">
                  {attenzione.daAccertare.map((voce, i) => (
                    <li key={`sint-acc-${i}`}>{voce}</li>
                  ))}
                </ul>
              </div>
            )}

            {raccomandazione && (
              <div style={{ marginTop: '6mm' }}>
                <p className="doc-occhiello">Dove porta ciascuna strada</p>
                {raccomandazione.percorsi.map((p) => (
                  <div key={`sint-perc-${p.codice}`} className="doc-sintesi-riga">
                    <span>
                      <strong>{p.etichetta}</strong>
                      {p.codice === raccomandazione.percorsoConsigliato ? ' · primo confronto' : ''}
                      <br />
                      <span className="doc-nota">
                        {p.esiti
                          ? `Esiti: ${p.esiti.map((e) => e.etichetta).join('; ')}`
                          : 'Nessun esito della proposta: l’atto lo decide il giudice'}
                      </span>
                    </span>
                    <span className="doc-nota" style={{ textAlign: 'right', minWidth: '42mm' }}>
                      Decide {p.chiDecide.toLowerCase()}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <p className="doc-nota-forte" style={{ marginTop: '6mm' }}>
              Questi sono i fatti e le strade che ne discendono. La direzione non è scritta qui: la
              sceglie l’ente, e la piattaforma non la sostituisce.
            </p>
          </section>
        </div>
      </div>
    </>
  );
}
