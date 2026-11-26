'use client';

// PARAMETRI DEGLI SCENARI — le percentuali che l'ente fissa, a VERSIONI CON
// DECORRENZA (0.256.33).
//
// Prima erano un valore solo: salvare voleva dire sovrascrivere. Ora ogni
// salvataggio registra una versione con il giorno da cui vale, e la scheda
// sotto dice quali versioni esistono, quale è in vigore e quale è programmata.
//
// Perché serve: un documento chiuso (una verifica aziendale, un progetto del
// piano) non può cambiare numeri perché l'ente ha aggiornato le percentuali
// dopo. I calcoli nuovi prendono l'ultima versione in vigore; quelli chiusi
// restano sulla loro.
//
// VUOTO NON È ZERO. Un campo lasciato vuoto non diventa 0%: il triage dirà
// «ipotesi non calcolabile» e indicherà quale percentuale manca. È l'unico
// modo per non far sembrare un dato che nessuno ha scritto una stima della
// piattaforma.

import React, { useEffect, useState } from 'react';
import { CalendarClock, History, Save, Loader2, Info, Search } from 'lucide-react';
import {
  cercaParametriScenariWebAction,
  ottieniParametriScenariAction,
  salvaParametriScenariAction,
  type SuggerimentoScenari,
} from '@/app/actions/parametriScenari';
import {
  PARAMETRI_VUOTI,
  RANGHI,
  validaParametri,
  type ParametriScenari,
} from '@/lib/triage/scenari';
import { ETICHETTA_BASE, baseDaValidare } from '@/lib/triage/suggerimentoScenari';
import {
  dataItaliana,
  oggiIso,
  propostaDecorrenza,
  riepilogoVersione,
  statoVersione,
  type VersioneParametri,
} from '@/lib/triage/versioniParametri';

const CLASSE =
  'w-full border border-slate-300 rounded-lg px-2 py-1.5 text-xs text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-sky-500';

const numero = (v: string): number | null => (v.trim() === '' ? null : Number(v));

const ETICHETTA_STATO: Record<ReturnType<typeof statoVersione>, string> = {
  IN_VIGORE: 'In vigore',
  PROGRAMMATA: 'Programmata',
  SUPERATA: 'Superata',
};

const CLASSE_STATO: Record<ReturnType<typeof statoVersione>, string> = {
  IN_VIGORE: 'text-emerald-800 bg-emerald-50 border-emerald-200',
  PROGRAMMATA: 'text-sky-800 bg-sky-50 border-sky-200',
  SUPERATA: 'text-slate-500 bg-slate-50 border-slate-200',
};

const pct = (n: number | null) =>
  n === null ? '—' : `${n.toLocaleString('it-IT', { maximumFractionDigits: 2 })}%`;

export function ParametriScenariManager({ nomeSchema }: { nomeSchema: string }) {
  const [parametri, setParametri] = useState<ParametriScenari>(PARAMETRI_VUOTI);
  const [versioni, setVersioni] = useState<VersioneParametri[]>([]);
  const [versioneInVigore, setVersioneInVigore] = useState<VersioneParametri | null>(null);
  const [decorrenza, setDecorrenza] = useState(oggiIso());
  const [nota, setNota] = useState('');
  const [caricamento, setCaricamento] = useState(true);
  const [salvataggio, setSalvataggio] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [avviso, setAvviso] = useState<string | null>(null);
  const [ricercaWeb, setRicercaWeb] = useState(false);
  const [suggerimento, setSuggerimento] = useState<SuggerimentoScenari | null>(null);

  const oggi = oggiIso();

  const carica = async () => {
    const r = await ottieniParametriScenariAction(nomeSchema);
    if (!r.success || !r.parametri) {
      setErrore(r.error ?? 'Parametri non leggibili.');
      return;
    }
    const elenco = r.versioni ?? [];
    setParametri(r.parametri);
    setVersioni(elenco);
    setVersioneInVigore(r.versione ?? null);
    setDecorrenza(propostaDecorrenza(elenco, oggi));
    setNota('');
  };

  useEffect(() => {
    let annullato = false;
    void ottieniParametriScenariAction(nomeSchema).then((r) => {
      if (annullato) return;
      if (r.success && r.parametri) {
        const elenco = r.versioni ?? [];
        setParametri(r.parametri);
        setVersioni(elenco);
        setVersioneInVigore(r.versione ?? null);
        setDecorrenza(propostaDecorrenza(elenco, oggiIso()));
      } else setErrore(r.error ?? 'Parametri non leggibili.');
      setCaricamento(false);
    });
    return () => {
      annullato = true;
    };
  }, [nomeSchema]);

  const aggiornaRango = (
    rango: (typeof RANGHI)[number]['codice'],
    campo: 'tassoLiquidazionePct' | 'cramDownPct',
    valore: number | null
  ) => {
    setParametri((prev) => ({
      ...prev,
      ranghi: prev.ranghi.map((r) => (r.rango === rango ? { ...r, [campo]: valore } : r)),
    }));
    setAvviso(null);
  };

  const salva = async () => {
    const errori = validaParametri(parametri);
    if (errori.length > 0) {
      setErrore(errori.join(' '));
      return;
    }
    if (!decorrenza) {
      setErrore('La decorrenza è la data da cui valgono questi valori: scrivila.');
      return;
    }
    setSalvataggio(true);
    setErrore(null);
    setAvviso(null);
    const r = await salvaParametriScenariAction(nomeSchema, parametri, {
      validiDa: decorrenza,
      nota: nota || null,
    });
    if (r.success) {
      setAvviso(
        `Versione registrata con decorrenza ${dataItaliana(decorrenza)}: i calcoli nuovi la usano ${
          decorrenza <= oggi ? 'da adesso' : 'da quel giorno'
        }, i documenti già chiusi restano sulla loro.`
      );
      await carica();
    } else setErrore(r.error ?? 'Salvataggio non riuscito.');
    setSalvataggio(false);
  };

  const cercaSulWeb = async () => {
    setRicercaWeb(true);
    setErrore(null);
    setAvviso(null);
    setSuggerimento(null);
    const r = await cercaParametriScenariWebAction(nomeSchema);
    if (r.success && r.suggerimento) {
      setParametri(r.suggerimento.parametri);
      setSuggerimento(r.suggerimento);
      setAvviso(
        'Percentuali proposte dalla ricerca web: controllale e salvale solo se le condividi.'
      );
    } else {
      setErrore(r.error ?? 'Ricerca web non riuscita.');
    }
    setRicercaWeb(false);
  };

  if (caricamento) return <p className="text-xs text-slate-400">Caricamento…</p>;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
          Scenari del triage
        </h2>
        <p className="text-[11px] text-slate-500 mt-1 max-w-3xl leading-relaxed">
          Le percentuali con cui il triage confronta il credito dell’ente con la liquidazione
          giudiziale e con un cram down omologato. Non c’è un valore di default: finché una riga è
          vuota, l’ipotesi corrispondente si dichiara non calcolabile invece di usare un numero
          della piattaforma.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-1">
        <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-600">
          <CalendarClock className="w-3.5 h-3.5 text-sky-600" /> Versione in vigore
        </p>
        {versioneInVigore ? (
          <>
            <p className="text-[11px] text-slate-700">
              Dal <strong>{dataItaliana(versioneInVigore.validiDa)}</strong> — versione n.{' '}
              {versioneInVigore.id}
              {versioneInVigore.nota ? ` · ${versioneInVigore.nota}` : ''}
            </p>
            <p className="text-[10px] text-slate-500 leading-relaxed">
              {riepilogoVersione(versioneInVigore)}
            </p>
          </>
        ) : (
          <p className="text-[11px] text-amber-800 leading-relaxed">
            Nessuna versione registrata: al triage valgono i parametri correnti, che sono
            l’impostazione storica dello spazio. Salvando qui sotto nasce la prima versione.
          </p>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
              Nuova versione
            </p>
            <p className="text-[10px] text-slate-500 leading-relaxed max-w-2xl mt-0.5">
              Salvare non sovrascrive: registra una versione che vale dal giorno che scrivi. Le
              verifiche e i progetti già chiusi restano sulle percentuali con cui sono nati.
            </p>
          </div>
          <div className="flex items-end gap-2">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
              Vale dal
              <input
                type="date"
                value={decorrenza}
                onChange={(e) => setDecorrenza(e.target.value)}
                className={`${CLASSE} mt-1 w-40`}
                aria-label="Decorrenza della versione"
              />
            </label>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
              Nota
              <input
                type="text"
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                placeholder="perché cambiano (facoltativa)"
                className={`${CLASSE} mt-1 w-64`}
                maxLength={200}
              />
            </label>
          </div>
        </div>

        <label className="block max-w-xs text-[10px] font-bold uppercase tracking-wider text-slate-600">
          Spese di procedura (% sul realizzo lordo)
          <input
            type="number"
            min={0}
            max={100}
            step="0.01"
            value={parametri.costiProceduraPct ?? ''}
            onChange={(e) =>
              setParametri((prev) => ({ ...prev, costiProceduraPct: numero(e.target.value) }))
            }
            className={`${CLASSE} mt-1`}
          />
        </label>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-slate-500">
                <th className="border-b border-slate-200 px-2 py-2">Rango</th>
                <th className="border-b border-slate-200 px-2 py-2">Realizzo in liquidazione %</th>
                <th className="border-b border-slate-200 px-2 py-2">Cram down %</th>
                <th className="border-b border-slate-200 px-2 py-2">A cosa serve</th>
              </tr>
            </thead>
            <tbody>
              {RANGHI.map((r) => {
                const riga = parametri.ranghi.find((x) => x.rango === r.codice);
                return (
                  <tr key={r.codice}>
                    <td className="border-b border-slate-100 px-2 py-2 font-bold text-slate-800">
                      {r.etichetta}
                    </td>
                    <td className="border-b border-slate-100 px-2 py-2">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step="0.01"
                        value={riga?.tassoLiquidazionePct ?? ''}
                        onChange={(e) =>
                          aggiornaRango(r.codice, 'tassoLiquidazionePct', numero(e.target.value))
                        }
                        className={CLASSE}
                        aria-label={`Realizzo in liquidazione ${r.etichetta}`}
                      />
                    </td>
                    <td className="border-b border-slate-100 px-2 py-2">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step="0.01"
                        value={riga?.cramDownPct ?? ''}
                        onChange={(e) =>
                          aggiornaRango(r.codice, 'cramDownPct', numero(e.target.value))
                        }
                        className={CLASSE}
                        aria-label={`Cram down ${r.etichetta}`}
                      />
                    </td>
                    <td className="border-b border-slate-100 px-2 py-2 text-[10px] text-slate-500">
                      {r.aiuto}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="flex items-start gap-1.5 text-[10px] text-slate-500 max-w-3xl">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          La liquidazione sottrae le spese di procedura dal realizzo lordo; il cram down no, perché
          la percentuale è già l’esito dell’omologazione. Le percentuali valgono per tutte le
          aziende dello spazio.
        </p>

        {suggerimento && (
          <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-sky-900">
              Proposta della ricerca web — da verificare
            </p>
            <p
              className={`text-[10px] font-bold ${
                baseDaValidare(suggerimento.base) ? 'text-amber-900' : 'text-emerald-900'
              }`}
            >
              {ETICHETTA_BASE[suggerimento.base]}
              {baseDaValidare(suggerimento.base)
                ? ' — sono stime: vanno validate prima del salvataggio'
                : ' — valori da statistiche ufficiali'}
            </p>
            <p className="text-[11px] text-sky-900 leading-relaxed">
              {suggerimento.note || 'La ricerca non ha aggiunto note.'}
            </p>
            {suggerimento.fonti.length > 0 && (
              <ul className="space-y-0.5">
                {suggerimento.fonti.map((f, i) => (
                  <li key={`${f.url}-${i}`} className="text-[10px] text-sky-800">
                    <a href={f.url} target="_blank" rel="noreferrer" className="underline">
                      {f.titolo || f.url}
                    </a>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-[10px] text-sky-700 leading-relaxed">
              I campi sono stati compilati ma non salvati: controlla i valori e premi «Salva
              parametri». Le percentuali ricavate da casistica o prassi sono stime dichiarate, non
              dati osservati: vanno validate sulle posizioni del tuo ente.
            </p>
          </div>
        )}

        {errore && (
          <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">
            {errore}
          </p>
        )}
        {avviso && (
          <p className="text-[11px] text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-2">
            {avviso}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void salva()}
            disabled={salvataggio || ricercaWeb}
            className="flex items-center gap-1.5 bg-slate-900 text-white px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider hover:bg-slate-800 disabled:bg-slate-300"
          >
            {salvataggio ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            Salva parametri
          </button>
          <button
            type="button"
            onClick={() => void cercaSulWeb()}
            disabled={ricercaWeb || salvataggio}
            title="Cerca sul web tassi di recupero e valori di riferimento: i campi restano modificabili"
            className="flex items-center gap-1.5 border border-slate-300 bg-white text-slate-700 px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider hover:border-sky-300 hover:text-sky-700 disabled:opacity-40"
          >
            {ricercaWeb ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Search className="w-3.5 h-3.5" />
            )}
            {ricercaWeb ? 'Ricerca in corso…' : 'Cerca sul web'}
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
        <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-600">
          <History className="w-3.5 h-3.5 text-slate-500" /> Le versioni ({versioni.length})
        </p>
        {versioni.length === 0 ? (
          <p className="text-[11px] text-slate-500">
            Nessuna versione: i parametri correnti valgono da sempre. Il primo salvataggio qui sopra
            apre la storia.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-slate-500">
                  <th className="border-b border-slate-200 px-2 py-2">Vale dal</th>
                  <th className="border-b border-slate-200 px-2 py-2">Stato</th>
                  <th className="border-b border-slate-200 px-2 py-2">Spese</th>
                  {RANGHI.map((r) => (
                    <th key={r.codice} className="border-b border-slate-200 px-2 py-2">
                      {r.etichetta}
                      <span className="block text-[9px] font-normal normal-case tracking-normal text-slate-400">
                        realizzo / cram down
                      </span>
                    </th>
                  ))}
                  <th className="border-b border-slate-200 px-2 py-2">Nota</th>
                </tr>
              </thead>
              <tbody>
                {versioni.map((v) => {
                  const stato = statoVersione(v, versioni, oggi);
                  return (
                    <tr key={v.id}>
                      <td className="border-b border-slate-100 px-2 py-2 font-bold text-slate-800 tabular-nums">
                        {dataItaliana(v.validiDa)}
                      </td>
                      <td className="border-b border-slate-100 px-2 py-2">
                        <span
                          className={`inline-flex px-1.5 py-0.5 rounded border text-[9px] font-bold uppercase tracking-wider ${CLASSE_STATO[stato]}`}
                        >
                          {ETICHETTA_STATO[stato]}
                        </span>
                      </td>
                      <td className="border-b border-slate-100 px-2 py-2 tabular-nums text-slate-700">
                        {pct(v.parametri.costiProceduraPct)}
                      </td>
                      {RANGHI.map((r) => {
                        const riga = v.parametri.ranghi.find((x) => x.rango === r.codice);
                        return (
                          <td
                            key={r.codice}
                            className="border-b border-slate-100 px-2 py-2 tabular-nums text-slate-700"
                          >
                            {pct(riga?.tassoLiquidazionePct ?? null)} /{' '}
                            {pct(riga?.cramDownPct ?? null)}
                          </td>
                        );
                      })}
                      <td className="border-b border-slate-100 px-2 py-2 text-[10px] text-slate-500">
                        {v.nota ?? '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[10px] text-slate-400 leading-relaxed max-w-3xl">
          Una versione non si modifica: per cambiare le percentuali si registra una versione nuova.
          Così un documento chiuso il mese scorso continua a dire i numeri con cui è stato chiuso.
        </p>
      </div>
    </div>
  );
}
