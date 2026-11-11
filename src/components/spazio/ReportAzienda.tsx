'use client';

// IL REPORT AZIENDA, A VIDEO.
//
// Il pannello delle inclusioni sta PRIMA del pulsante: si decide che cosa
// entra nel documento, poi si emette. L'esito amministrativo non è una
// casella — c'è sempre, in sola lettura: non è una scelta dell'operatore che
// l'azienda abbia un debito certificato.
//
// Il documento emesso non si modifica: rigenerare produce una nuova
// generazione, e quelle precedenti restano leggibili con data e versione.

import { Fragment, useCallback, useEffect, useState } from 'react';
import { AlertTriangle, FileText, Loader2, Printer, RefreshCw } from 'lucide-react';
import {
  generaReportAziendaAction,
  ottieniReportAziendaAction,
  ottieniVersioneReportAction,
  type ReportSalvato,
  type VersioneReport,
} from '@/app/actions/reportAzienda';
import {
  INCLUSIONI_PREDEFINITE,
  htmlReport,
  type InclusioniReport,
  type SezioneReport,
} from '@/lib/reportAzienda/report';
import { stampaHtml } from '@/lib/stampaTesto';
import { TestoConNormativa } from './TestoConNormativa';

const euro = (n: number | null | undefined) =>
  typeof n === 'number' && Number.isFinite(n) ? `${Math.round(n).toLocaleString('it-IT')} €` : '—';

const numero = (n: number | null | undefined) =>
  typeof n === 'number' && Number.isFinite(n)
    ? n.toLocaleString('it-IT', { maximumFractionDigits: 2 })
    : '—';

const quando = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('it-IT') : 'data non disponibile';

export function ReportAzienda({
  nomeSchema,
  aziendaId,
  ragioneSociale,
  codice,
}: {
  nomeSchema: string;
  aziendaId: number;
  ragioneSociale: string;
  codice: string;
}) {
  const [inclusioni, setInclusioni] = useState<InclusioniReport>(INCLUSIONI_PREDEFINITE);
  const [report, setReport] = useState<ReportSalvato | null>(null);
  const [versioni, setVersioni] = useState<VersioneReport[]>([]);
  const [inCorso, setInCorso] = useState(false);
  const [lettura, setLettura] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);
  const [messaggio, setMessaggio] = useState<string | null>(null);

  const carica = useCallback(async () => {
    setLettura(true);
    const r = await ottieniReportAziendaAction(nomeSchema, aziendaId);
    setLettura(false);
    if (!r.success) {
      setErrore(r.error ?? 'Impossibile leggere il report.');
      return;
    }
    setReport(r.report);
    setVersioni(r.versioni);
  }, [nomeSchema, aziendaId]);

  useEffect(() => {
    void carica();
  }, [carica]);

  const genera = async () => {
    setInCorso(true);
    setErrore(null);
    setMessaggio(null);
    const r = await generaReportAziendaAction(nomeSchema, aziendaId, inclusioni);
    setInCorso(false);
    if (!r.success || !r.report) {
      setErrore(r.error ?? 'Il report non è stato emesso.');
      return;
    }
    await carica();
    setMessaggio(
      `Report emesso: versione ${r.report.versione ?? 'n/d'}, impronta ${(r.report.impronta ?? '').slice(0, 12)}…`
    );
  };

  const apriVersione = async (id: number) => {
    setErrore(null);
    const r = await ottieniVersioneReportAction(nomeSchema, aziendaId, id);
    if (!r.success || !r.report) {
      setErrore(r.error ?? 'Generazione non leggibile.');
      return;
    }
    setReport(r.report);
    setMessaggio(
      'Stai leggendo una generazione precedente: è quella emessa, non una copia ricalcolata.'
    );
  };

  const stampa = () => {
    if (!report) return;
    stampaHtml(
      `Report — ${ragioneSociale}`,
      htmlReport(report.contenuto),
      `Generato il ${quando(report.generatoIl)} · piattaforma ${report.versione ?? 'n/d'}`,
      report.generatoIl
    );
  };

  const contenuto = report?.contenuto ?? null;

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
        <h1 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <FileText className="w-4 h-4 text-blue-600" />
          Report — {ragioneSociale}
        </h1>
        <p className="text-xs text-slate-500 leading-relaxed max-w-3xl">
          Un documento solo, che mette insieme l’esito della verifica amministrativa (in sola
          lettura), il dato della verifica contabile e l’analisi della valutazione completa. Si
          sceglie che cosa includere prima di emetterlo; il report emesso non si modifica, si
          rigenera.
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
          Cosa includere
        </p>

        <fieldset className="space-y-1.5">
          <legend className="text-[11px] font-bold text-slate-700">Analisi di inquadramento</legend>
          {(
            [
              [
                'RIUSA',
                'Riusa la relazione esistente',
                'Nessuna chiamata AI: entra il testo già generato e revisionato.',
              ],
              [
                'RIGENERA',
                'Rigenera la relazione',
                'Rifà l’analisi sui documenti acquisiti: cambia anche il questionario dello screening.',
              ],
              [
                'ESCLUDI',
                'Escludi l’analisi',
                'Solo dati: il report resta un prospetto, senza prosa.',
              ],
            ] as const
          ).map(([valore, etichetta, descrizione]) => (
            <label
              key={valore}
              className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer"
            >
              <input
                type="radio"
                name="analisi"
                checked={inclusioni.analisi === valore}
                onChange={() => setInclusioni((i) => ({ ...i, analisi: valore }))}
                className="mt-0.5"
              />
              <span>
                <span className="font-bold">{etichetta}</span>
                <span className="block text-[10px] text-slate-500 mt-0.5">{descrizione}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <div className="space-y-1.5 pt-1 border-t border-slate-100">
          {(
            [
              [
                'riscontri',
                'Riscontri normativi',
                'Soglie e articoli movimentati, calcolati sui dati.',
              ],
              [
                'questionario',
                'Questionario per direttrici',
                'Allegato di lavoro: di norma resta fuori dal documento.',
              ],
              [
                'riferimenti',
                'Riferimenti e metodo',
                'Fonti usate, versione, impronta e avvertenza finale.',
              ],
            ] as const
          ).map(([chiave, etichetta, descrizione]) => (
            <label
              key={chiave}
              className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={inclusioni[chiave]}
                onChange={(e) => setInclusioni((i) => ({ ...i, [chiave]: e.target.checked }))}
                className="mt-0.5"
              />
              <span>
                <span className="font-bold">{etichetta}</span>
                <span className="block text-[10px] text-slate-500 mt-0.5">{descrizione}</span>
              </span>
            </label>
          ))}
        </div>

        <p className="text-[10px] text-slate-500 leading-relaxed bg-slate-50 border border-slate-200 rounded-lg p-2.5">
          L’esito della verifica amministrativa entra sempre, in sola lettura: il report lo cita con
          data, copertura e debito memorizzato, e non lo modifica. Se la verifica non è chiusa, il
          documento lo dichiara invece di scrivere zero.
        </p>

        <button
          type="button"
          onClick={() => void genera()}
          disabled={inCorso || lettura}
          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {inCorso ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <FileText className="w-3 h-3" />
          )}
          {report ? 'Emetti una nuova generazione' : 'Genera il report'}
        </button>
      </div>

      {errore && (
        <p className="text-xs font-bold text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          {errore}
        </p>
      )}
      {messaggio && (
        <p className="text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
          {messaggio}
        </p>
      )}

      {lettura && <p className="text-xs text-slate-400">Lettura del report…</p>}

      {!lettura && !report && (
        <p className="text-xs text-slate-500 bg-white border border-slate-200 rounded-xl p-4">
          Nessun report emesso per questa azienda. Scegli che cosa includere e genera il primo.
        </p>
      )}

      {contenuto && report && (
        <>
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Generazione del {quando(report.generatoIl)} · piattaforma {report.versione ?? 'n/d'}
              </p>
              <button
                type="button"
                onClick={stampa}
                className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-blue-700 hover:text-blue-800"
              >
                <Printer className="w-3 h-3" /> Stampa / PDF
              </button>
            </div>
            {report.impronta && (
              <p className="text-[10px] text-slate-400 break-all">
                Impronta del contenuto: {report.impronta}
              </p>
            )}
            {contenuto.avvisi.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-amber-800 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> Da leggere prima
                </p>
                {contenuto.avvisi.map((a) => (
                  <p key={a} className="text-[11px] text-amber-800 leading-relaxed">
                    {a}
                  </p>
                ))}
              </div>
            )}
          </div>

          {contenuto.sezioni.map((s) => (
            <Sezione key={s.id} sezione={s} codice={codice} />
          ))}
        </>
      )}

      {versioni.length > 1 && (
        <section className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
            <RefreshCw className="w-3 h-3" /> Generazioni precedenti — {versioni.length - 1}
          </p>
          <ul className="divide-y divide-slate-100">
            {versioni.slice(1).map((v) => (
              <li key={v.id}>
                <button
                  type="button"
                  onClick={() => void apriVersione(v.id)}
                  className="w-full text-left py-2 text-xs text-slate-800 hover:text-blue-700"
                >
                  <span className="font-bold">{quando(v.generatoIl)}</span>
                  <span className="text-slate-500"> · piattaforma {v.versione ?? '?'}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-[11px] text-slate-500 leading-relaxed">
        Il documento è messo a disposizione della direzione dell’ente per le valutazioni del caso.
        Non conclude nel merito e non accerta lo stato di crisi: la verifica amministrativa resta il
        dato attuale, la contabile il dato depositato, la proiezione un’ipotesi dichiarata.
      </p>
    </div>
  );
}

function Sezione({ sezione, codice }: { sezione: SezioneReport; codice: string }) {
  return (
    <section className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
      <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
        {sezione.titolo}
      </h2>
      {sezione.tipo === 'testo' && sezione.testo && (
        <TestoConNormativa testo={sezione.testo} codice={codice} />
      )}
      {sezione.tipo === 'prospetto' && (
        <div className="space-y-3 overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-[9px] uppercase text-slate-400 border-b border-slate-200">
                <th className="text-left py-1.5 pr-2">Voce</th>
                {sezione.anni.map((a) => (
                  <th key={String(a)} className="text-right py-1.5 px-1">
                    {a ?? 'n/d'}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {sezione.righe.map((r) => (
                <tr key={r.etichetta}>
                  <td
                    className={`py-1 pr-2 ${r.forte ? 'font-bold text-slate-800' : 'text-slate-600'}`}
                  >
                    {r.etichetta}
                  </td>
                  {r.valori.map((v, i) => (
                    <td
                      key={i}
                      className={`py-1 px-1 text-right tabular-nums ${
                        r.forte ? 'font-bold text-slate-900' : 'text-slate-700'
                      }`}
                    >
                      {euro(v)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {sezione.indici.length > 0 && (
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-[9px] uppercase text-slate-400 border-b border-slate-200">
                  <th className="text-left py-1.5 pr-2">Indice</th>
                  <th className="text-right py-1.5 px-1">Soglia</th>
                  {sezione.anni.map((a) => (
                    <th key={String(a)} className="text-right py-1.5 px-1">
                      {a ?? 'n/d'}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {sezione.indici.map((ind) => (
                  <tr key={ind.codice}>
                    <td className="py-1 pr-2 text-slate-700">
                      <span className="font-mono text-[9px] text-slate-400 mr-1">{ind.codice}</span>
                      {ind.nome}
                    </td>
                    <td className="py-1 px-1 text-right text-[10px] text-slate-500">
                      {ind.soglia}
                    </td>
                    {ind.valori.map((v, i) => (
                      <td
                        key={i}
                        className={`py-1 px-1 text-right tabular-nums ${
                          ind.esiti[i] === 'VIOLATO'
                            ? 'text-red-700 font-bold'
                            : ind.esiti[i] === 'OK'
                              ? 'text-emerald-700'
                              : 'text-slate-400'
                        }`}
                      >
                        {numero(v)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
      {sezione.tipo === 'mappa' && (
        <div className="space-y-3 overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-[9px] uppercase text-slate-400 border-b border-slate-200">
                <th className="text-left py-1.5 pr-2">Voce</th>
                {sezione.anni.map((a, k) => (
                  <th key={`${a}-${k}`} className="text-right py-1.5 px-1 whitespace-nowrap">
                    {a}
                    <span
                      className={`block text-[8px] font-normal ${
                        sezione.tipi[k] === 'PROIEZIONE' ? 'text-blue-600' : 'text-slate-400'
                      }`}
                    >
                      {sezione.tipi[k] === 'PROIEZIONE' ? 'proiezione' : 'storico'}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {sezione.righe.map((r) => (
                <Fragment key={r.etichetta}>
                  <tr className={r.forte ? 'bg-slate-50/60' : undefined}>
                    <td
                      className={`py-1 pr-2 ${
                        r.forte ? 'font-bold text-slate-800' : 'text-slate-600'
                      }`}
                    >
                      {r.etichetta}
                    </td>
                    {r.valori.map((v, i) => (
                      <td
                        key={i}
                        className={`py-1 px-1 text-right tabular-nums ${
                          r.forte ? 'font-bold text-slate-900' : 'text-slate-700'
                        }`}
                      >
                        {euro(v)}
                      </td>
                    ))}
                  </tr>
                  {/* Il debito è un «di cui» dei costi: si legge nell’anno in
                      cui entra, non come una voce di bilancio a sé. */}
                  {r.etichetta === 'Costi della produzione' && (
                    <tr className="bg-slate-50/40">
                      <td className="py-1 pr-2 pl-3 italic text-slate-500">
                        di cui debito dell’ente
                      </td>
                      {sezione.debitiInseriti.map((d, i) => (
                        <td key={i} className="py-1 px-1 text-right tabular-nums text-slate-500">
                          {d > 0 ? euro(d) : '—'}
                        </td>
                      ))}
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
          {sezione.indici.length > 0 && (
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-[9px] uppercase text-slate-400 border-b border-slate-200">
                  <th className="text-left py-1.5 pr-2">Indice</th>
                  <th className="text-right py-1.5 px-1">Soglia</th>
                  {sezione.anni.map((a, k) => (
                    <th key={`${a}-${k}`} className="text-right py-1.5 px-1">
                      {a}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {sezione.indici.map((ind) => (
                  <tr key={ind.codice}>
                    <td className="py-1 pr-2 text-slate-700">
                      <span className="font-mono text-[9px] text-slate-400 mr-1">{ind.codice}</span>
                      {ind.nome}
                    </td>
                    <td className="py-1 px-1 text-right text-[10px] text-slate-500">
                      {ind.soglia}
                    </td>
                    {ind.valori.map((v, i) => (
                      <td
                        key={i}
                        className={`py-1 px-1 text-right tabular-nums ${
                          ind.esiti[i] === 'VIOLATO'
                            ? 'text-red-700 font-bold'
                            : ind.esiti[i] === 'OK'
                              ? 'text-emerald-700'
                              : 'text-slate-400'
                        }`}
                      >
                        {numero(v)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
      {(sezione.tipo === 'voci' || sezione.tipo === 'elenco') && sezione.voci.length > 0 && (
        <dl className="divide-y divide-slate-50">
          {sezione.voci.map((v, i) => (
            <div
              key={`${v.etichetta}-${i}`}
              className="py-1.5 grid sm:grid-cols-[minmax(0,200px)_1fr] gap-1 sm:gap-3"
            >
              <dt className="text-[11px] font-bold text-slate-700">{v.etichetta}</dt>
              <dd className="text-[11px] text-slate-700 whitespace-pre-wrap leading-relaxed">
                {v.valore}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {sezione.nota && (
        <p className="text-[10px] text-slate-400 leading-relaxed pt-1 border-t border-slate-50">
          {sezione.nota}
        </p>
      )}
    </section>
  );
}
