import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { ottieniContestoAccessoSpazio } from '@/app/actions/spazi';
import { ottieniAziendaPerId } from '@/app/actions/aziende';
import { ottieniAttenzioneScreeningAction } from '@/app/actions/attenzioneScreening';
import { ottieniStoricoVerificheAction } from '@/app/actions/aziendaInVerifica';
import { ottieniRaccomandazioneAction } from '@/app/actions/raccomandazioneVerifica';
import { debitoEnteMemorizzatoAction } from '@/app/actions/debitiEnteMemorizzati';
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

const ETICHETTE_PERCORSO: Record<string, string> = {
  ACCORDO: 'Accordo transattivo',
  LIQUIDAZIONE: 'Liquidazione giudiziale',
  CRAM_DOWN: 'Cram down',
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

  const [attenzioneRis, storicoRis, raccomandazioneRis, debitoRis] = await Promise.all([
    ottieniAttenzioneScreeningAction(contesto.nomeSchema, id).catch(() => null),
    ottieniStoricoVerificheAction(contesto.nomeSchema).catch(() => null),
    ottieniRaccomandazioneAction(contesto.nomeSchema, id).catch(() => null),
    debitoEnteMemorizzatoAction(contesto.nomeSchema, id).catch(() => null),
  ]);
  const attenzione = attenzioneRis?.success ? (attenzioneRis.attenzione ?? null) : null;
  const raccomandazione = raccomandazioneRis?.success
    ? (raccomandazioneRis.raccomandazione ?? null)
    : null;
  const debito = debitoRis?.success ? (debitoRis.debito ?? null) : null;
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
                <li>Debito dell’ente</li>
                {raccomandazione && <li>Lettura dei dati</li>}
                {raccomandazione && <li>I percorsi, distinti, e i loro esiti</li>}
                {raccomandazione && <li>Elementi letti</li>}
                <li>Limiti e natura del documento</li>
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

          {/* 3 · DEBITO */}
          <section className="doc-sezione">
            <h2 className="doc-titolo">
              <span className="doc-num">3</span> Debito dell’ente — dato certo
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
            <>
              <section className="doc-sezione">
                <h2 className="doc-titolo">
                  <span className="doc-num">4</span> Lettura dei dati
                </h2>
                <div className="doc-blocco">
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
              </section>

              <section className="doc-sezione">
                <h2 className="doc-titolo">
                  <span className="doc-num">5</span> I percorsi, distinti, e i loro esiti
                </h2>
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
              </section>

              <section className="doc-sezione">
                <h2 className="doc-titolo">
                  <span className="doc-num">6</span> Elementi letti
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
            </>
          )}

          {/* 7 · LIMITI */}
          <section className="doc-sezione">
            <h2 className="doc-titolo">
              <span className="doc-num">{raccomandazione ? '7' : '4'}</span> Limiti e natura del
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
        </div>
      </div>
    </>
  );
}
