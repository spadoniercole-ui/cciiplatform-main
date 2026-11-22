import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, FileText } from 'lucide-react';
import { ottieniContestoAccessoSpazio } from '@/app/actions/spazi';
import { ritrattoAziendaAction } from '@/app/actions/ritratto';
import { componiReportIconografia } from '@/lib/ritratto/reportIconografia';
import type { Stadio } from '@/lib/verificaAzienda/direttrici';
import { stileFoglioA4 } from '@/lib/stampe/foglioA4';
import { StampaDocumento } from '@/components/spazio/StampaDocumento';

export const dynamic = 'force-dynamic';

// IL REPORT DELL'ICONOGRAFIA — un foglio A4, tabelle e due grafici.
//
// Il contenuto non si ricalcola qui: `componiReportIconografia` riduce il
// ritratto già composto (e lui, a sua volta, legge le fonti già accertate).
// Questa pagina decide solo l'impaginazione: due colonne per le tabelle corte,
// riga intera per le direttrici e per il grafico delle dimensioni, elenchi dei
// fatti in coda. Ciò che non sta sul foglio lo dichiara il modello, non si
// taglia qui. Carta, margini e regole di stampa vengono da `stileFoglioA4`: lo
// stesso foglio del report della verifica amministrativa.
const CSS = `
${stileFoglioA4({
  marginePagina: '9mm 10mm',
  tipografia: 'font-size: 8.2pt; line-height: 1.35;',
})}
.ico-intestazione h1 { font-size: 15pt; margin: .6mm 0 1mm; letter-spacing: -.01em; }
.ico-occhiello { font-size: 6.8pt; letter-spacing: .16em; text-transform: uppercase; color: #64748b; }
.ico-meta { font-size: 7.4pt; color: #475569; display: flex; flex-wrap: wrap; gap: 1mm 3mm; }
.ico-riga { border-top: 1.2px solid #0f172a; margin: 3mm 0; }
.ico-griglia { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; }
.ico-sezione { margin-bottom: 3.4mm; break-inside: avoid; }
.ico-titolo { font-size: 7.2pt; letter-spacing: .14em; text-transform: uppercase; color: #334155;
  font-weight: 700; border-bottom: 1px solid #cbd5e1; padding-bottom: .8mm; margin-bottom: 1.4mm; }
.ico-tabella { width: 100%; border-collapse: collapse; font-size: 7.6pt; }
.ico-tabella tr { break-inside: avoid; }
.ico-tabella th { text-align: left; font-size: 6.4pt; letter-spacing: .1em; text-transform: uppercase;
  color: #64748b; border-bottom: 1px solid #94a3b8; padding: .9mm 1.2mm; }
.ico-tabella td { padding: .9mm 1.2mm; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
.ico-tabella td.etichetta { color: #64748b; width: 38%; }
.ico-esito { display: flex; align-items: center; gap: 2mm; }
.ico-pallino { width: 2.4mm; height: 2.4mm; border-radius: 50%; display: inline-block; }
.ico-pallino.rosso { background: #dc2626; } .ico-pallino.giallo { background: #f59e0b; }
.ico-pallino.verde { background: #10b981; }
.ico-stato { font-size: 6.6pt; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; }
.ico-stato.completo { color: #047857; } .ico-stato.parziale { color: #b45309; }
.ico-stato.mancante, .ico-stato.non { color: #64748b; }
.ico-grafico { display: flex; flex-direction: column; gap: 1.4mm; }
.ico-barra-dim { display: grid; grid-template-columns: 7mm 1fr 8mm; align-items: center; gap: 1.6mm;
  font-size: 7.4pt; break-inside: avoid; }
.ico-barra-dim .lettera { font-family: var(--font-mono), monospace; font-weight: 700; color: #475569; }
.ico-barra-dim .traccia { height: 2.6mm; background: #e2e8f0; border-radius: 2mm; overflow: hidden; }
.ico-barra-dim .riempimento { display: block; height: 100%; border-radius: 2mm; }
.ico-barra-dim .riempimento.letta { background: #0f172a; }
.ico-barra-dim .riempimento.parziale { background: #f59e0b; }
.ico-barra-dim .riempimento.non-letta { background: #cbd5e1; }
.ico-barra-dim .valore { text-align: right; font-family: var(--font-mono), monospace; font-size: 7pt;
  color: #64748b; }
.ico-barra-dim .didascalia { grid-column: 2 / 4; }
.ico-donut { display: flex; align-items: center; gap: 3mm; }
.ico-legenda { font-size: 6.8pt; color: #64748b; }
.ico-nota { font-size: 6.8pt; color: #64748b; margin-top: 1mm; }
.ico-fatti p { margin: 0; }
.ico-fatti p + p { margin-top: 1mm; }
.ico-avviso { font-size: 7pt; color: #78350f; border-left: 2px solid #f59e0b;
  padding-left: 2.4mm; margin-top: 1.4mm; }
.ico-mancanze { border-left: 2px solid #f59e0b; padding-left: 2.4mm; }
.ico-mancanze .ico-titolo { border-color: #f59e0b; color: #78350f; }
.ico-mancanze p { font-size: 7.2pt; color: #78350f; margin: 0 0 .8mm; }
.ico-piede { margin-top: 2.6mm; border-top: 1px solid #0f172a; padding-top: 1.6mm;
  display: flex; justify-content: space-between; gap: 4mm; font-size: 6.6pt; color: #64748b; }
`;

const CLASSE_STATO: Record<Stadio, string> = {
  COMPLETO: 'completo',
  PARZIALE: 'parziale',
  MANCANTE: 'mancante',
  NON_DISPONIBILE: 'non',
};

export default async function ReportIconografiaPage({
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
  if (!Number.isInteger(id) || id <= 0) redirect(`/spazio/${codice}/ritratti`);

  const esito = await ritrattoAziendaAction(contesto.nomeSchema, id, contesto.tipoSpazio);
  if (!esito.success || !esito.ritratto) redirect(`/spazio/${codice}/ritratti`);

  const report = componiReportIconografia(esito.ritratto, new Date().toLocaleDateString('it-IT'));
  const g = report.giudizio;
  const copertura = g?.copertura ?? null;
  // Cinque barre a zero, tutte «non misurate», non sono un'intensità nulla:
  // sono un dato che manca, e il foglio lo dice accanto al grafico.
  const barreSenzaDati =
    report.dimensioni.length > 0 && report.dimensioni.every((d) => d.tono === 'non-letta');

  return (
    <>
      <style>{CSS}</style>

      <div className="foglio-canvas">
        <div className="foglio-barra">
          <Link
            href={`/spazio/${codice}/aziende/${id}/ritratto`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-600"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Torna all’iconografia
          </Link>
          <StampaDocumento etichetta="Stampa / PDF" auto={stampa === '1'} />
        </div>

        <div className="foglio">
          <header className="ico-intestazione">
            <p className="ico-occhiello">
              <FileText className="inline h-3 w-3 align-[-1px]" /> Iconografia aziendale · sintesi
              per la stampa
            </p>
            <h1>{report.titolo}</h1>
            <div className="ico-meta">
              {report.sottotitolo && <span>{report.sottotitolo}</span>}
              <span>{report.attiva ? 'Attiva' : 'Disabilitata'}</span>
              <span>Foglio generato il {report.generatoIl}</span>
              <span>Un solo foglio A4: tabelle e grafici, nessun allegato</span>
            </div>
          </header>

          <div className="ico-riga" />

          <div className="ico-griglia">
            <section className="ico-sezione">
              <h2 className="ico-titolo">1 · L’impresa e la posizione</h2>
              <table className="ico-tabella">
                <tbody>
                  {report.impresa.map((r) => (
                    <tr key={r.etichetta}>
                      <td className="etichetta">{r.etichetta}</td>
                      <td>{r.valore}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="ico-sezione">
              <h2 className="ico-titolo">2 · Il giudizio</h2>
              {g ? (
                <table className="ico-tabella">
                  <tbody>
                    <tr>
                      <td className="etichetta">Esito</td>
                      <td>
                        <span className="ico-esito">
                          <span className={`ico-pallino ${g.tono}`} />
                          <strong>{g.etichetta}</strong>
                          {g.parola && <span className="ico-legenda">({g.parola})</span>}
                        </span>
                      </td>
                    </tr>
                    <tr>
                      <td className="etichetta">Copertura</td>
                      <td>
                        {copertura ? (
                          <span className="ico-donut">
                            <svg viewBox="0 0 44 44" width="34" height="34" aria-hidden="true">
                              <circle
                                cx="22"
                                cy="22"
                                r="18"
                                fill="none"
                                stroke="#e2e8f0"
                                strokeWidth="6"
                              />
                              {/* Il cerchio vale 100: la percentuale è il trattino. */}
                              <circle
                                cx="22"
                                cy="22"
                                r="18"
                                fill="none"
                                stroke="#0f172a"
                                strokeWidth="6"
                                pathLength={100}
                                strokeDasharray={`${copertura.percentuale} 100`}
                                transform="rotate(-90 22 22)"
                              />
                              <text
                                x="22"
                                y="25"
                                textAnchor="middle"
                                fontSize="13"
                                fontWeight="700"
                                fill="#0f172a"
                              >
                                {copertura.determinate}/{copertura.totali}
                              </text>
                            </svg>
                            <span className="ico-legenda">
                              {copertura.testo} determinabili
                              {copertura.limitata ? ' — giudizio limitato ai dati disponibili' : ''}
                            </span>
                          </span>
                        ) : (
                          <span className="ico-legenda">copertura non dichiarata</span>
                        )}
                      </td>
                    </tr>
                    <tr>
                      <td className="etichetta">Fattore determinante</td>
                      <td>{g.fattore ?? '—'}</td>
                    </tr>
                  </tbody>
                </table>
              ) : (
                <p className="ico-nota">
                  Nessuna verifica registrata: il foglio riporta anagrafica e direttrici, non un
                  giudizio.
                </p>
              )}
            </section>
          </div>

          <section className="ico-sezione">
            <h2 className="ico-titolo">3 · Le tre direttrici</h2>
            <table className="ico-tabella">
              <thead>
                <tr>
                  <th>Verifica</th>
                  <th>Stato</th>
                  <th>Che cosa resta</th>
                </tr>
              </thead>
              <tbody>
                {report.direttrici.map((d) => (
                  <tr key={d.nome}>
                    <td>{d.nome}</td>
                    <td>
                      <span className={`ico-stato ${CLASSE_STATO[d.stato]}`}>
                        {d.etichettaStato}
                      </span>
                    </td>
                    <td>{d.richiede ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="ico-nota">{report.direttriciNota}</p>
          </section>

          <section className="ico-sezione">
            <h2 className="ico-titolo">4 · Le cinque dimensioni — intensità dei determinanti</h2>
            {report.dimensioni.length > 0 ? (
              <>
                <div className="ico-grafico">
                  {report.dimensioni.map((d) => (
                    <div key={d.lettera} className="ico-barra-dim">
                      <span className="lettera">{d.lettera}</span>
                      <span className="traccia">
                        <span
                          className={`riempimento ${d.tono}`}
                          style={{ width: `${Math.max(1.5, d.punteggio)}%` }}
                        />
                      </span>
                      <span className="valore">{d.punteggio}</span>
                      <span className="ico-legenda didascalia">
                        {d.nome} · {d.lettura}
                      </span>
                    </div>
                  ))}
                </div>
                {barreSenzaDati && (
                  <p className="ico-avviso">
                    Nessuna delle cinque dimensioni è misurata: le barre restano a zero perché manca
                    il dato, non perché l’intensità sia nulla.
                  </p>
                )}
                <p className="ico-nota">{report.dimensioniNota}</p>
              </>
            ) : (
              <p className="ico-nota">
                Dimensioni non disponibili: si calcolano sulla verifica della posizione.
              </p>
            )}
          </section>

          {g && (
            <section className="ico-sezione">
              <h2 className="ico-titolo">5 · Accertato e da accertare</h2>
              <table className="ico-tabella ico-fatti">
                <thead>
                  <tr>
                    <th>Accertato</th>
                    <th>Da accertare</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      {g.accertato.length === 0 && 'Nessun elemento accertato.'}
                      {g.accertato.map((v, i) => (
                        <p key={i}>— {v.testo}</p>
                      ))}
                      {g.accertatoOltre > 0 && (
                        <p className="ico-nota">e altre {g.accertatoOltre} voci.</p>
                      )}
                    </td>
                    <td>
                      {g.daAccertare.length === 0 && 'Nulla da integrare con i dati previsti.'}
                      {g.daAccertare.map((v, i) => (
                        <p key={i}>— {v.testo}</p>
                      ))}
                      {g.daAccertareOltre > 0 && (
                        <p className="ico-nota">e altre {g.daAccertareOltre} voci.</p>
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
              <p className="ico-nota">{report.notaRiduzione}</p>
            </section>
          )}

          {report.mancanze.length > 0 && (
            <section className="ico-sezione ico-mancanze">
              <h2 className="ico-titolo">Che cosa l’iconografia non dice</h2>
              {report.mancanze.map((m, i) => (
                <p key={i}>— {m}</p>
              ))}
              {report.mancanzeOltre > 0 && (
                <p>
                  … e altre {report.mancanzeOltre} lacune: stanno nell’iconografia a schermo, dove
                  il testo non ha il limite del foglio.
                </p>
              )}
            </section>
          )}

          <div className="ico-piede">
            <span>
              Documento generato dalla piattaforma: nessun valore è ricalcolato a mano. Il giudizio
              è quello della verifica, le barre dicono quanto pesa ciascuna dimensione e non si
              sommano.
            </span>
            <span>{report.titolo}</span>
          </div>
        </div>
      </div>
    </>
  );
}
