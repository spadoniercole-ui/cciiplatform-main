'use client';

// Piano-ponte — scheda operativa a livello azienda.
//
// Il calcolo è del motore puro; qui si vedono le fonti, si modificano le
// assunzioni centrali e si confrontano gli scenari. La versione confermata
// non si tocca: il pulsante di modifica sparisce e resta la traccia.

import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Calculator,
  CheckCircle2,
  FileText,
  Landmark,
  Printer,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import {
  archiviaPonteAction,
  confermaPonteAction,
  generaPonteAction,
  ottieniPonteAction,
  proponiAssunzioniPonteAction,
  salvaAssunzioniPonteAction,
  type PropostaAiPonte,
} from '@/app/actions/ponte';
import { reportPonteHtml } from '@/lib/ponte/report';
import { stampaHtml } from '@/lib/stampaTesto';
import type { AssunzionePonte, DatiPonte } from '@/lib/ponte/types';

interface Props {
  nomeSchema: string;
  aziendaId: number;
  codice: string;
}

const MODIFICABILI = new Set([
  'crescitaRicavi',
  'margineEbitda',
  'giorniIncasso',
  'giorniPagamento',
]);
const euro = (n: number) => `${Math.round(n).toLocaleString('it-IT')} €`;
const perc = (n: number) => `${n.toLocaleString('it-IT', { maximumFractionDigits: 2 })}%`;
const dataIt = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : '—');

function BadgeStato({ stato }: { stato: string }) {
  const classi: Record<string, string> = {
    BOZZA: 'bg-slate-100 text-slate-600 border-slate-200',
    CALCOLATO: 'bg-sky-50 text-sky-700 border-sky-200',
    CONFERMATO: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    SUPERATO: 'bg-amber-50 text-amber-700 border-amber-200',
    ARCHIVIATO: 'bg-slate-100 text-slate-400 border-slate-200',
  };
  return (
    <span
      className={`inline-flex px-2 py-0.5 rounded border text-[10px] font-bold uppercase tracking-wider ${
        classi[stato] ?? classi.BOZZA
      }`}
    >
      {stato}
    </span>
  );
}

export function PianoPonte({ nomeSchema, aziendaId, codice }: Props) {
  const [dati, setDati] = useState<DatiPonte | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [caricamento, setCaricamento] = useState(true);
  const [inCorso, setInCorso] = useState(false);
  const [dichiaratoZero, setDichiaratoZero] = useState(false);
  const [valori, setValori] = useState<Record<string, number>>({});
  const [proposta, setProposta] = useState<PropostaAiPonte | null>(null);
  const [proponendo, setProponendo] = useState(false);
  const [esitoSalvataggio, setEsitoSalvataggio] = useState<string | null>(null);
  const [vistaProiezione, setVistaProiezione] = useState<'ANNI' | 'MESI'>('ANNI');

  const carica = async () => {
    setCaricamento(true);
    setErrore(null);
    const r = await ottieniPonteAction(nomeSchema, aziendaId);
    if (r.success && r.dati) {
      setDati(r.dati);
      const assunzioni = r.dati.ponte?.output?.assunzioni ?? [];
      setValori(Object.fromEntries(assunzioni.map((a) => [a.codice, a.valore])));
    } else {
      setErrore(r.error || 'Impossibile caricare il Piano-ponte.');
    }
    setCaricamento(false);
  };

  useEffect(() => {
    void carica();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nomeSchema, aziendaId]);

  const esegui = async <T extends { success: boolean; error?: string }>(
    fn: () => Promise<T>,
    dopo = true
  ) => {
    setInCorso(true);
    setErrore(null);
    setEsitoSalvataggio(null);
    try {
      const r = await fn();
      if (!r.success) setErrore(r.error || 'Operazione non riuscita.');
      else if (dopo) await carica();
      return r;
    } catch (e: any) {
      setErrore(`Operazione non riuscita: ${e.message || e}`);
      return null;
    } finally {
      setInCorso(false);
    }
  };

  const genera = () =>
    esegui(() => generaPonteAction(nomeSchema, aziendaId, dichiaratoZero, proposta?.assunzioni));

  const proponiAi = async () => {
    setProponendo(true);
    setErrore(null);
    try {
      const r = await proponiAssunzioniPonteAction(nomeSchema, aziendaId, dichiaratoZero);
      if (!r.success || !r.proposta) {
        setErrore(r.error || 'La proposta di assunzioni non è disponibile.');
        return;
      }
      setProposta(r.proposta);
      setValori((v) => ({
        ...v,
        ...Object.fromEntries(r.proposta!.assunzioni.map((a) => [a.codice, a.valore])),
      }));
    } catch (e: any) {
      setErrore(`Proposta non riuscita: ${e.message || e}`);
    } finally {
      setProponendo(false);
    }
  };

  const salvaAssunzioni = async () => {
    const ponte = dati?.ponte;
    if (!ponte?.output) return;
    const proposte = new Map((proposta?.assunzioni ?? []).map((a) => [a.codice, a]));
    const assunzioni: AssunzionePonte[] = ponte.output.assunzioni.map((a) => {
      // La proposta AI vince sul valore lasciato nel campo, ma resta
      // un'assunzione del motore: il salvataggio la rivalida comunque.
      const voceProposta = proposte.get(a.codice);
      if (voceProposta) return { ...voceProposta, intervallo: a.intervallo };
      return {
        ...a,
        valore: Object.prototype.hasOwnProperty.call(valori, a.codice)
          ? valori[a.codice]
          : a.valore,
      };
    });
    const r = await esegui(() =>
      salvaAssunzioniPonteAction(nomeSchema, aziendaId, ponte.id, assunzioni)
    );
    if (r?.success) {
      // La proposta ha già prodotto la sua versione: il pannello non resta
      // aperto come se il salvataggio non fosse avvenuto.
      setProposta(null);
      setEsitoSalvataggio(
        `Assunzioni salvate: ${r.versione ? `versione ${r.versione}` : 'nuova versione'} calcolata. La versione precedente resta nello storico, con le assunzioni che aveva.`
      );
    }
  };

  const conferma = () => {
    if (!dati?.ponte) return;
    if (
      !window.confirm(
        'Confermare questa versione? Diventa immutabile e l’eventuale versione confermata precedente viene superata.'
      )
    )
      return;
    void esegui(() => confermaPonteAction(nomeSchema, aziendaId, dati.ponte!.id));
  };

  const archivia = () => {
    if (!dati?.ponte) return;
    if (!window.confirm('Archiviare questa versione non confermata?')) return;
    void esegui(() => archiviaPonteAction(nomeSchema, aziendaId, dati.ponte!.id));
  };

  const stampa = () => {
    if (!dati?.ponte?.output) return;
    stampaHtml(
      `Piano-ponte — ${dati.azienda.ragioneSociale}`,
      reportPonteHtml({ dati, ponte: dati.ponte }),
      undefined,
      dati.ponte.createdAt
    );
  };

  if (caricamento) return <p className="text-xs text-slate-400">Caricamento del Piano-ponte…</p>;
  if (!dati) {
    return (
      <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl p-4">
        {errore || 'Piano-ponte non disponibile.'}
      </div>
    );
  }

  const ponte = dati.ponte;
  const output = ponte?.output ?? null;
  const modificabile = !!ponte && (ponte.stato === 'CALCOLATO' || ponte.stato === 'BOZZA');
  const bloccato = dati.blocchi.length > 0;
  const debitoMancante = !dati.debitoEnte;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-bold text-slate-900 uppercase text-xs tracking-wider flex items-center gap-2">
            <Landmark className="w-4 h-4" /> Piano-ponte
          </h2>
          <p className="text-[11px] text-slate-500 mt-1 max-w-3xl">
            Porta l’ultimo bilancio depositato alla Data verifica usando note integrative, visura,
            settore e debito ente. Non è un piano di sviluppo e non appartiene a uno Scenario: è la
            base contabile su cui lo Scenario potrà confrontare le assunzioni dell’azienda.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {ponte && <BadgeStato stato={ponte.stato} />}
          <a
            href={`/spazio/${codice}/aziende/${aziendaId}/screening`}
            className="text-[10px] font-bold uppercase tracking-wider text-slate-500 hover:text-blue-600"
          >
            Torna alla valutazione completa
          </a>
        </div>
      </div>

      {errore && (
        <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <p>{errore}</p>
        </div>
      )}

      {proposta && (
        <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 space-y-2">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <h3 className="font-bold text-violet-950 uppercase text-[10px] tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" /> Proposta AI — {proposta.modello}
            </h3>
            <button
              type="button"
              onClick={() => setProposta(null)}
              className="text-[10px] font-bold uppercase tracking-wider text-violet-700 hover:text-violet-900"
            >
              Chiudi
            </button>
          </div>
          <p className="text-[11px] text-violet-950 leading-relaxed">{proposta.sintesi}</p>
          {proposta.assunzioni.length > 0 && (
            <p className="text-[10px] text-violet-900">
              Assunzioni proposte: {proposta.assunzioni.map((a) => a.etichetta).join(', ')}. Il
              motore le rivalida al calcolo.
            </p>
          )}
          {proposta.datiMancanti.length > 0 && (
            <p className="text-[10px] text-violet-900">
              <span className="font-bold">Dati mancanti:</span> {proposta.datiMancanti.join('; ')}
            </p>
          )}
          {proposta.avvisi.length > 0 && (
            <p className="text-[10px] text-violet-900">
              <span className="font-bold">Avvisi:</span> {proposta.avvisi.join('; ')}
            </p>
          )}
          {proposta.scartate.length > 0 && (
            <p className="text-[10px] text-amber-800">
              <span className="font-bold">Scartate:</span> {proposta.scartate.join('; ')}
            </p>
          )}
        </div>
      )}

      {dati.blocchi.length > 0 && (
        <div className="space-y-2">
          {dati.blocchi.map((b) => (
            <div
              key={b.codice}
              className="flex items-start gap-2 text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-xl p-3"
            >
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <p>
                <span className="font-bold">{b.codice}</span> — {b.testo}
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-2">
        <div className="bg-white border border-slate-200 rounded-xl p-3">
          <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
            Ultimo bilancio
          </p>
          <p className="text-sm font-bold text-slate-900 mt-1">
            {dati.esercizi.length ? dati.esercizi[dati.esercizi.length - 1].anno : 'assente'}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-3">
          <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
            Note integrative
          </p>
          <p className="text-sm font-bold text-slate-900 mt-1">{dati.note.length} testi</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-3">
          <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Visura</p>
          <p className="text-sm font-bold text-slate-900 mt-1">
            {dati.visura ? 'letta' : dati.visuraTrattenuta ? 'acquisita' : 'assente'}
          </p>
          {!dati.visura && dati.visuraTrattenuta && (
            <p className="text-[9px] text-slate-400 mt-1 truncate">
              {dati.visuraTrattenuta.nome} · non ancora letta
            </p>
          )}
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-3">
          <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Settore</p>
          <p className="text-sm font-bold text-slate-900 mt-1">{perc(dati.settore.tasso)}</p>
          <p className="text-[9px] text-slate-400 mt-1">{dati.settore.fonte}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-3">
          <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
            Debito ente
          </p>
          <p className="text-sm font-bold text-slate-900 mt-1">
            {dati.debitoEnte ? euro(dati.debitoEnte.totale) : 'non disponibile'}
          </p>
          {dati.debitoEnte &&
            (dati.debitoEnte.contabilizzato === undefined ? (
              <p className="text-[9px] text-slate-500 mt-1 leading-snug">
                {dati.debitoEnte.righe} posizioni
                {dati.debitoEnte.sanzioniNonDistinte ? ', senza riparto contributi/sanzioni' : ''}
              </p>
            ) : (
              <p className="text-[9px] text-slate-500 mt-1 leading-snug">
                {euro(dati.debitoEnte.contabilizzato)} contabilizzati
                {euro(dati.debitoEnte.daContabilizzare ?? 0)} da contabilizzare
                {(dati.debitoEnte.righeSegnalate ?? 0) > 0 && (
                  <> · {dati.debitoEnte.righeSegnalate} segnalate alle UO, fuori dal totale</>
                )}
              </p>
            ))}
          {dati.debitoEnte && (
            <p className="text-[9px] text-slate-400 mt-1 leading-snug">{dati.debitoEnte.fonte}</p>
          )}
        </div>
      </div>

      {dati.esercizi.length > 0 && dati.note.length === 0 && (
        <p className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-3 leading-relaxed">
          <span className="font-bold">Nessuna nota integrativa in archivio.</span> Le note si
          estraggono quando il bilancio viene caricato: se questo bilancio è entrato in archivio
          prima di questa lettura, ricarica il file dal passo «Analisi bilancio». Il Ponte parte
          anche senza, ma la copertura scende e il report lo dichiara.
        </p>
      )}

      {!dati.visura && dati.visuraTrattenuta && (
        <p className="text-[11px] text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-3 leading-relaxed">
          <span className="font-bold">Visura acquisita nel triage</span> (
          {dati.visuraTrattenuta.nome}
          {dati.visuraTrattenuta.caricataIl
            ? `, ${dataIt(dati.visuraTrattenuta.caricataIl.slice(0, 10))}`
            : ''}
          ): i fatti camerali si leggono con la valutazione completa. Il Ponte usa l’anagrafica e i
          dati contabili, e lo dichiara tra le fonti mancanti.
        </p>
      )}

      {!ponte && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <h3 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
            Calcola il Ponte
          </h3>
          <p className="text-xs text-slate-600 leading-relaxed">
            Il calcolo parte dall’ultimo bilancio e arriva alla Data verifica. Le assunzioni
            centrali sono ricavate dal bilancio e dal settore; potrai modificarle prima di
            confermare.
          </p>
          {debitoMancante && (
            <label className="flex items-start gap-2 text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-3">
              <input
                type="checkbox"
                checked={dichiaratoZero}
                onChange={(e) => setDichiaratoZero(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                <span className="font-bold">Dichiaro che il debito verso l’ente è zero.</span> Un
                file assente non vale zero: senza questa dichiarazione il Ponte non parte e il
                debito totale resta senza rettifica.
              </span>
            </label>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void proponiAi()}
              disabled={
                proponendo ||
                inCorso ||
                bloccato ||
                (debitoMancante && !dichiaratoZero) ||
                !dati.azienda.dataVerifica
              }
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-violet-300 text-violet-800 hover:bg-violet-50 disabled:border-slate-200 disabled:text-slate-400 text-xs font-bold uppercase tracking-wider"
            >
              {proponendo ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              {proponendo ? 'Proposta…' : 'Proponi con l’AI'}
            </button>
            <button
              type="button"
              onClick={() => void genera()}
              disabled={inCorso || bloccato || (debitoMancante && !dichiaratoZero)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-900 text-white disabled:bg-slate-400 text-xs font-bold uppercase tracking-wider"
            >
              {inCorso ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Calculator className="w-3.5 h-3.5" />
              )}
              {inCorso ? 'Calcolo…' : 'Calcola Piano-ponte'}
            </button>
          </div>
        </div>
      )}

      {ponte && output && (
        <>
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h3 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
                  Versione {ponte.versione}
                </h3>
                <p className="text-[11px] text-slate-500 mt-1">
                  Data verifica {dataIt(ponte.dataRiferimento)} · generata il{' '}
                  {new Date(ponte.createdAt).toLocaleString('it-IT')} · copertura{' '}
                  {Math.round(output.copertura.punteggio * 100)}% ({output.copertura.livello})
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={stampa}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-bold uppercase tracking-wider"
                >
                  <Printer className="w-3.5 h-3.5" /> Stampa report
                </button>
                {modificabile && (
                  <button
                    type="button"
                    onClick={() => void conferma()}
                    disabled={inCorso}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-400 text-white text-[10px] font-bold uppercase tracking-wider"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" /> Conferma
                  </button>
                )}
                {modificabile && (
                  <button
                    type="button"
                    onClick={() => void archivia()}
                    disabled={inCorso}
                    className="px-3 py-2 rounded-lg border border-slate-300 text-slate-600 text-[10px] font-bold uppercase tracking-wider"
                  >
                    Archivia
                  </button>
                )}
              </div>
            </div>
            <p className="text-xs text-slate-700 leading-relaxed">{output.sintesi}</p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
                Assunzioni
              </h3>
              {modificabile && (
                <button
                  type="button"
                  onClick={() => void proponiAi()}
                  disabled={inCorso || proponendo}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-violet-300 text-violet-800 hover:bg-violet-50 disabled:border-slate-200 disabled:text-slate-400 text-[10px] font-bold uppercase tracking-wider"
                >
                  {proponendo ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5" />
                  )}
                  Proponi con l’AI
                </button>
              )}
              {modificabile && (
                <button
                  type="button"
                  onClick={() => void salvaAssunzioni()}
                  disabled={inCorso}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 text-slate-700 text-[10px] font-bold uppercase tracking-wider"
                >
                  {inCorso ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <ShieldCheck className="w-3.5 h-3.5" />
                  )}
                  Salva e ricalcola
                </button>
              )}
            </div>
            {esitoSalvataggio && (
              <p className="text-[11px] text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-lg p-2.5 leading-relaxed">
                {esitoSalvataggio}
              </p>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="text-left text-[9px] uppercase tracking-wider text-slate-400 border-b border-slate-200">
                    <th className="py-2 pr-2">Assunzione</th>
                    <th className="py-2 pr-2">Valore</th>
                    <th className="py-2 pr-2">Fonte</th>
                    <th className="py-2">Perché</th>
                  </tr>
                </thead>
                <tbody>
                  {output.assunzioni.map((a) => (
                    <tr key={a.codice} className="border-b border-slate-100 align-top">
                      <td className="py-2 pr-2 font-semibold text-slate-800">{a.etichetta}</td>
                      <td className="py-2 pr-2">
                        {modificabile && MODIFICABILI.has(a.codice) ? (
                          <input
                            type="number"
                            step="0.1"
                            value={valori[a.codice] ?? a.valore}
                            onChange={(e) =>
                              setValori((v) => ({ ...v, [a.codice]: Number(e.target.value) }))
                            }
                            className="w-24 p-1.5 border border-slate-200 rounded text-xs bg-slate-50"
                          />
                        ) : a.unita === '%' ? (
                          perc(a.valore)
                        ) : a.unita === 'giorni' ? (
                          `${a.valore} gg`
                        ) : (
                          euro(a.valore)
                        )}
                      </td>
                      <td className="py-2 pr-2 text-slate-500">{a.fonte}</td>
                      <td className="py-2 text-slate-600">{a.motivazione}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {modificabile && (
              <p className="text-[10px] text-slate-400">
                Le assunzioni sono validate dal motore: un valore fuori intervallo viene rifiutato,
                non arrotondato in silenzio.
              </p>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
                Proiezione
              </h3>
              <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden">
                {(['ANNI', 'MESI'] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setVistaProiezione(v)}
                    className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${
                      vistaProiezione === v ? 'bg-slate-900 text-white' : 'bg-white text-slate-600'
                    }`}
                  >
                    {v === 'ANNI' ? 'Annuale' : 'Mensile'}
                  </button>
                ))}
              </div>
            </div>
            <div className="overflow-x-auto">
              {vistaProiezione === 'ANNI' ? (
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="text-left text-[9px] uppercase tracking-wider text-slate-400 border-b border-slate-200">
                      <th className="py-2 pr-2">Voce</th>
                      {output.anni.map((a) => (
                        <th key={a.anno} className="py-2 pr-2 text-right">
                          {a.anno}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ['Ricavi', 'ricaviVendite'],
                      ['EBITDA', 'ebitda'],
                      ['EBIT', 'ebit'],
                      ['Utile', 'utile'],
                      ['Flusso di cassa', 'flussoCassa'],
                      ['Cassa finale', 'disponibilitaLiquide'],
                      ['Debito totale', 'totaleDebiti'],
                      ['Patrimonio netto', 'patrimonioNetto'],
                    ].map(([label, campo]) => (
                      <tr key={campo} className="border-b border-slate-100">
                        <td className="py-2 pr-2 text-slate-700">{label}</td>
                        {output.anni.map((a) => (
                          <td key={a.anno} className="py-2 pr-2 text-right tabular-nums">
                            {euro(Number(a[campo as keyof typeof a]))}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="text-left text-[9px] uppercase tracking-wider text-slate-400 border-b border-slate-200">
                      <th className="py-2 pr-2">Voce</th>
                      {output.mesi.map((m) => (
                        <th key={m.mese} className="py-2 pr-2 text-right whitespace-nowrap">
                          {m.mese.slice(5)}/{m.mese.slice(2, 4)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ['Ricavi', 'ricaviVendite'],
                      ['EBITDA', 'ebitda'],
                      ['Utile', 'utile'],
                      ['Flusso di cassa', 'flussoCassa'],
                      ['Cassa', 'disponibilitaLiquide'],
                      ['Debito totale', 'totaleDebiti'],
                    ].map(([label, campo]) => (
                      <tr key={campo} className="border-b border-slate-100">
                        <td className="py-2 pr-2 text-slate-700 whitespace-nowrap">{label}</td>
                        {output.mesi.map((m) => (
                          <td
                            key={m.mese}
                            className="py-2 pr-2 text-right tabular-nums whitespace-nowrap"
                          >
                            {euro(Number(m[campo as keyof typeof m]))}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            {vistaProiezione === 'MESI' && (
              <p className="text-[10px] text-slate-400">
                Il mese della Data verifica è parziale: la sua frazione è dichiarata nel motore e il
                circolante resta ancorato al run-rate annuo.
              </p>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
                Copertura dei dati
              </h3>
              <span className="text-[11px] font-bold text-slate-700">
                {Math.round(output.copertura.punteggio * 100)}% — {output.copertura.livello}
              </span>
            </div>
            {output.copertura.componenti.map((c) => (
              <div
                key={c.codice}
                className="flex items-start justify-between gap-3 text-[11px] border-b border-slate-100 pb-1"
              >
                <span className="text-slate-700">{c.etichetta}</span>
                <span className="text-slate-500 text-right">
                  {c.determinato ? 'determinata' : 'assente'} · {c.dettaglio}
                </span>
              </div>
            ))}
            <p className="text-[10px] text-slate-400">
              La copertura dice quali fonti sono disponibili, non la probabilità di default.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-2">
            {[
              ['Centrale', output],
              ['Pessimistico', output.scenari.sfavorevole],
              ['Ottimistico', output.scenari.favorevole],
            ].map(([titolo, p]) => {
              const proiezione = p as typeof output;
              return (
                <div
                  key={String(titolo)}
                  className="bg-white border border-slate-200 rounded-xl p-3"
                >
                  <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                    {String(titolo)}
                  </p>
                  <p className="text-sm font-bold text-slate-900 mt-1">
                    {euro(proiezione.cassaFinale)}
                  </p>
                  <p className="text-[10px] text-slate-500">cassa finale</p>
                  <p className="text-[10px] text-slate-500 mt-2">
                    Debito {euro(proiezione.debitoFinale)} · utile {euro(proiezione.utileTotale)}
                  </p>
                  {proiezione.fabbisognoSenzaFinanziamento > 0 && (
                    <p className="text-[10px] text-amber-700 mt-1">
                      Fabbisogno {euro(proiezione.fabbisognoSenzaFinanziamento)}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <h3 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
              Riconciliazione
            </h3>
            <table className="w-full text-[11px]">
              <tbody>
                {output.riconciliazione.voci.map((v) => (
                  <tr key={v.codice} className="border-b border-slate-100">
                    <td className="py-2 pr-2 text-slate-700">{v.etichetta}</td>
                    <td className="py-2 text-right tabular-nums font-semibold">
                      {euro(v.importo)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[10px] text-slate-400">
              La rettifica per perimetro debito ente è esplicita: non è un debito nuovo e non è una
              rinuncia al credito. La cassa negativa resta fabbisogno, non diventa debito.
            </p>
          </div>

          {output.sintesiIntegrata && (
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
              <div>
                <h3 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
                  Sintesi integrata
                </h3>
                <p className="text-[11px] text-slate-500 mt-1">
                  Credito dell’ente, debito totale stimato e recupero documentato: tre termini di
                  paragone, non una compensazione.
                </p>
              </div>
              <table className="w-full text-[11px]">
                <tbody>
                  <tr className="border-b border-slate-100">
                    <td className="py-2 pr-2 text-slate-700">Credito certo dell’ente</td>
                    <td className="py-2 text-right tabular-nums font-semibold">
                      {output.sintesiIntegrata.creditoEnte === null
                        ? 'non disponibile'
                        : euro(output.sintesiIntegrata.creditoEnte)}
                    </td>
                  </tr>
                  <tr className="border-b border-slate-100">
                    <td className="py-2 pr-2 text-slate-700">
                      Debito totale stimato alla Data verifica
                    </td>
                    <td className="py-2 text-right tabular-nums font-semibold">
                      {euro(output.sintesiIntegrata.debitoTotaleStimato)}
                    </td>
                  </tr>
                  <tr className="border-b border-slate-100">
                    <td className="py-2 pr-2 text-slate-700">Incidenza del credito sul debito</td>
                    <td className="py-2 text-right tabular-nums font-semibold">
                      {output.sintesiIntegrata.incidenzaCreditoPct === null
                        ? 'non calcolabile'
                        : perc(output.sintesiIntegrata.incidenzaCreditoPct)}
                    </td>
                  </tr>
                </tbody>
              </table>
              {output.sintesiIntegrata.recupero ? (
                <div className="space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Recupero documentato
                    {output.sintesiIntegrata.rangoEtichetta
                      ? ` · rango ${output.sintesiIntegrata.rangoEtichetta}`
                      : ''}
                  </p>
                  <p className="text-[11px] text-slate-700">
                    Liquidazione giudiziale:{' '}
                    {output.sintesiIntegrata.recupero.liquidazione.netto === null
                      ? 'non calcolabile'
                      : euro(output.sintesiIntegrata.recupero.liquidazione.netto)}
                  </p>
                  <p className="text-[11px] text-slate-700">
                    Cram down omologato:{' '}
                    {output.sintesiIntegrata.recupero.cramDown.netto === null
                      ? 'non calcolabile'
                      : euro(output.sintesiIntegrata.recupero.cramDown.netto)}
                  </p>
                  <p className="text-[10px] text-slate-400">
                    Le percentuali sono quelle configurate dall’ente in Parametri › Scenari. Il
                    recupero non si sottrae al debito e non è una stima della piattaforma.
                  </p>
                </div>
              ) : (
                <p className="text-[11px] text-amber-900">
                  Recupero non calcolabile: mancano {output.sintesiIntegrata.mancanti.join('; ')}.
                </p>
              )}
              {output.sintesiIntegrata.avvisi.map((a) => (
                <p key={a} className="text-[10px] text-amber-800">
                  {a}
                </p>
              ))}
            </div>
          )}

          {output.avvisi.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-1">
              <h3 className="font-bold text-amber-900 uppercase text-[10px] tracking-wider">
                Avvertenze
              </h3>
              {output.avvisi.map((a) => (
                <p key={a.codice} className="text-[11px] text-amber-900">
                  <span className="font-bold">{a.codice}</span> — {a.testo}
                </p>
              ))}
            </div>
          )}

          <details className="bg-white border border-slate-200 rounded-xl p-4">
            <summary className="text-[11px] font-bold text-slate-700 cursor-pointer">
              Limiti del modello e storico delle versioni
            </summary>
            <ul className="mt-3 space-y-1 text-[11px] text-slate-600 list-disc pl-4">
              {output.limiti.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
            <div className="mt-4 space-y-1">
              {dati.storico.map((s) => (
                <p key={s.id} className="text-[10px] text-slate-500">
                  v{s.versione} · {s.stato} · {dataIt(s.dataRiferimento)} ·{' '}
                  {new Date(s.createdAt).toLocaleString('it-IT')}
                </p>
              ))}
            </div>
          </details>
        </>
      )}
    </div>
  );
}
