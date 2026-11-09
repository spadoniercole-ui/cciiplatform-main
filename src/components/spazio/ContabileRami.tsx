'use client';

// RAMO CONTABILE PER ANNO — scheda operativa.
//
// Si parte dal bilancio XBRL: ogni anno apre il suo ramo, che resta accanto
// agli altri. Sul ramo di partenza si lanciano le simulazioni: stesse voci,
// ipotesi dichiarate, indici ricalcolati dal motore unico. Il raffronto è
// aritmetico e la valutazione è una lettura operativa — nessuna conclusione
// giuridica, e nulla che il motore non possa mostrare con i dati caricati.

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, CircleDashed, GitBranch, Loader2, Trash2 } from 'lucide-react';
import {
  creaRamoContabileAction,
  eliminaRamoContabileAction,
  elencoRamiContabileAction,
  simulaRamoContabileAction,
  type RamoContabile,
  type RisultatoRamiContabile,
} from '@/app/actions/contabileRami';
import {
  LEVE_NEUTRE,
  confrontoVoci,
  type LeveSimulazione,
  type LivelloValutazione,
} from '@/lib/contabile/rami';

const euro = (n: number) => `${Math.round(n).toLocaleString('it-IT')} €`;
const num = (v: number | 'N/D') =>
  v === 'N/D' ? 'n/d' : v.toLocaleString('it-IT', { maximumFractionDigits: 2 });
const conSegno = (n: number) =>
  `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.round(Math.abs(n)).toLocaleString('it-IT')} €`;

const COLORI_VALUTAZIONE: Record<LivelloValutazione, string> = {
  SOSTENIBILE: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  DA_APPROFONDIRE: 'bg-amber-50 text-amber-800 border-amber-200',
  NON_SOSTENIBILE: 'bg-red-50 text-red-800 border-red-200',
};

const ETICHETTA_VALUTAZIONE: Record<LivelloValutazione, string> = {
  SOSTENIBILE: 'Sostenibile sulle ipotesi',
  DA_APPROFONDIRE: 'Da approfondire',
  NON_SOSTENIBILE: 'Non sostenibile sulle ipotesi',
};

export function ContabileRami({
  nomeSchema,
  scenarioId,
  codice,
  ragioneSociale,
}: {
  nomeSchema: string;
  scenarioId: number;
  codice: string;
  ragioneSociale: string;
}) {
  const [dati, setDati] = useState<RisultatoRamiContabile | null>(null);
  const [sceltoId, setSceltoId] = useState<number | null>(null);
  const [leve, setLeve] = useState<LeveSimulazione>(LEVE_NEUTRE);
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [messaggio, setMessaggio] = useState<string | null>(null);

  const ricarica = useCallback(
    async (seleziona?: number | null) => {
      const r = await elencoRamiContabileAction(nomeSchema, scenarioId);
      setDati(r);
      if (!r.success) {
        setErrore(r.error ?? 'Rami contabili non disponibili.');
        return;
      }
      setErrore(null);
      setSceltoId(
        (prima) => seleziona ?? prima ?? r.rami.find((x) => x.tipo === 'PARTENZA')?.id ?? null
      );
    },
    [nomeSchema, scenarioId]
  );

  useEffect(() => {
    void ricarica();
  }, [ricarica]);

  const rami = useMemo(() => dati?.rami ?? [], [dati]);
  const anni = dati?.anni ?? [];
  const scelto = rami.find((r) => r.id === sceltoId) ?? null;
  const base =
    scelto?.tipo === 'PARTENZA' ? scelto : (rami.find((r) => r.id === scelto?.baseId) ?? null);
  const simulazioni = base ? rami.filter((r) => r.baseId === base.id) : [];
  const confronto =
    scelto?.tipo === 'SIMULAZIONE' && base
      ? (scelto.confronto ?? confrontoVoci(base.dati, scelto.dati))
      : null;
  const pfns = new Map(rami.map((r) => [r.id, r.situazioneDebitoria.pfn]));
  const colonne = base ? [base, ...simulazioni] : [];

  const apriRamo = async (anno: number) => {
    setInCorso(true);
    setErrore(null);
    setMessaggio(null);
    const r = await creaRamoContabileAction(nomeSchema, scenarioId, anno);
    setInCorso(false);
    if (!r.success) {
      setErrore(r.error ?? 'Impossibile aprire il ramo.');
      return;
    }
    setMessaggio(
      `Ramo contabile ${anno} aperto: il bilancio depositato è accanto agli altri anni.`
    );
    await ricarica(r.ramo?.id ?? null);
  };

  const lanciaSimulazione = async () => {
    if (!base) return;
    setInCorso(true);
    setErrore(null);
    setMessaggio(null);
    const r = await simulaRamoContabileAction(nomeSchema, scenarioId, base.id, leve);
    setInCorso(false);
    if (!r.success) {
      setErrore(r.error ?? 'Impossibile lanciare la simulazione.');
      return;
    }
    setMessaggio(
      'Simulazione creata accanto al ramo di partenza: il bilancio depositato non è stato toccato.'
    );
    setLeve(LEVE_NEUTRE);
    await ricarica(r.ramo?.id ?? null);
  };

  const elimina = async (ramo: RamoContabile) => {
    setInCorso(true);
    setErrore(null);
    setMessaggio(null);
    const r = await eliminaRamoContabileAction(nomeSchema, ramo.id);
    setInCorso(false);
    if (!r.success) {
      setErrore(r.error ?? 'Impossibile eliminare il ramo.');
      return;
    }
    await ricarica(ramo.tipo === 'SIMULAZIONE' ? (ramo.baseId ?? null) : null);
  };

  if (!dati) return <p className="text-xs text-slate-400">Caricamento dei rami contabili…</p>;

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
        <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-blue-600" />
          Ramo contabile per anno
        </h2>
        <p className="text-xs text-slate-500 leading-relaxed">
          {ragioneSociale}. Dal bilancio XBRL depositato si apre il ramo contabile del suo anno; i
          rami restano accanto, non si sovrascrivono. Sul ramo di partenza si lanciano le
          simulazioni: le ipotesi entrano nei prospetti e gli indici si ricalcolano con lo stesso
          motore del resto della piattaforma. Il debito dell’ente che porti dalla verifica
          amministrativa è una delle leve.
        </p>
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

      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
          Anni di bilancio in archivio
        </h3>
        {anni.length === 0 ? (
          <div className="space-y-1">
            <p className="text-xs text-slate-500">
              Nessun bilancio XBRL su questa azienda: senza bilancio il ramo contabile non parte.
            </p>
            <Link
              href={`/spazio/${codice}/scenari/${scenarioId}/xbrl`}
              className="text-[10px] font-bold uppercase tracking-wider text-blue-700 hover:text-blue-800"
            >
              Carica il bilancio XBRL
            </Link>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-2">
            {anni.map((a) => {
              const baseDellAnno = rami.find((x) => x.anno === a.anno && x.tipo === 'PARTENZA');
              return (
                <div
                  key={a.anno}
                  className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 p-2.5"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900">Bilancio {a.anno}</p>
                    <p
                      className="text-[10px] text-slate-500 truncate"
                      title={a.nomeFile ?? undefined}
                    >
                      {a.ramiAperti > 0
                        ? `Ramo aperto · ${rami.filter((x) => x.anno === a.anno && x.tipo === 'SIMULAZIONE').length} simulazioni`
                        : (a.nomeFile ?? 'File XBRL archiviato')}
                    </p>
                  </div>
                  {baseDellAnno ? (
                    <button
                      type="button"
                      onClick={() => setSceltoId(baseDellAnno.id)}
                      className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-blue-700 hover:text-blue-800"
                    >
                      Apri
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => apriRamo(a.anno)}
                      disabled={inCorso}
                      className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-blue-700 hover:text-blue-800 disabled:opacity-50"
                    >
                      Apri il ramo
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {rami.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
            Rami aperti
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {rami.map((r) => {
              const attivo = r.id === sceltoId;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setSceltoId(r.id)}
                  className={`px-2.5 py-1.5 rounded-lg border text-[10px] font-bold ${
                    attivo
                      ? 'border-blue-300 bg-blue-50 text-blue-800'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                  }`}
                >
                  {r.tipo === 'PARTENZA' ? '◧' : '◇'} {r.etichetta}
                </button>
              );
            })}
          </div>

          {base && (
            <div className="grid lg:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Prospetto {base.anno}
                  {scelto && scelto.tipo === 'SIMULAZIONE' ? ` · ${scelto.etichetta}` : ''}
                </p>
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="text-[9px] uppercase text-slate-400 border-b border-slate-100">
                      <th className="text-left py-1">Voce</th>
                      <th className="text-right py-1">Ramo di partenza</th>
                      {scelto?.tipo === 'SIMULAZIONE' && (
                        <>
                          <th className="text-right py-1">Simulazione</th>
                          <th className="text-right py-1">Differenza</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {(confronto
                      ? confronto.map((v) => ({
                          etichetta: v.etichetta,
                          base: v.base,
                          simulato: v.simulato,
                          delta: v.delta,
                        }))
                      : [
                          {
                            etichetta: 'Ricavi delle vendite',
                            base: base.dati.ricaviVendite,
                            simulato: 0,
                            delta: 0,
                          },
                          {
                            etichetta: 'Valore della produzione',
                            base: base.dati.valoreProduzione,
                            simulato: 0,
                            delta: 0,
                          },
                          { etichetta: 'EBITDA', base: base.dati.ebitda, simulato: 0, delta: 0 },
                          {
                            etichetta: 'Risultato d’esercizio',
                            base: base.dati.utileEsercizio,
                            simulato: 0,
                            delta: 0,
                          },
                          {
                            etichetta: 'Patrimonio netto',
                            base: base.dati.patrimonioNetto,
                            simulato: 0,
                            delta: 0,
                          },
                          {
                            etichetta: 'Totale debiti',
                            base: base.dati.totaleDebiti,
                            simulato: 0,
                            delta: 0,
                          },
                        ]
                    ).map((v) => (
                      <tr key={v.etichetta}>
                        <td className="py-1 text-slate-600">{v.etichetta}</td>
                        <td className="py-1 text-right tabular-nums text-slate-900">
                          {euro(v.base)}
                        </td>
                        {scelto?.tipo === 'SIMULAZIONE' && (
                          <>
                            <td className="py-1 text-right tabular-nums text-slate-900">
                              {euro(v.simulato)}
                            </td>
                            <td
                              className={`py-1 text-right tabular-nums ${
                                v.delta < 0
                                  ? 'text-red-700'
                                  : v.delta > 0
                                    ? 'text-emerald-700'
                                    : 'text-slate-400'
                              }`}
                            >
                              {conSegno(v.delta)}
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {scelto?.tipo === 'SIMULAZIONE' && scelto.valutazione && (
                  <div
                    className={`mt-2 rounded-lg border p-2 text-[10px] ${
                      COLORI_VALUTAZIONE[scelto.valutazione.livello]
                    }`}
                  >
                    <p className="font-bold uppercase tracking-wider">
                      {ETICHETTA_VALUTAZIONE[scelto.valutazione.livello]}
                    </p>
                    <ul className="mt-1 space-y-0.5">
                      {scelto.valutazione.punti.map((p, i) => (
                        <li key={i}>· {p}</li>
                      ))}
                    </ul>
                    <p className="mt-1 opacity-80">{scelto.valutazione.avvertenza}</p>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Ipotesi della simulazione su {base.anno}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-[10px] text-slate-600">
                    Ricavi (%)
                    <input
                      type="number"
                      step="0.5"
                      min={-90}
                      max={90}
                      value={leve.variazioneRicaviPct}
                      onChange={(e) =>
                        setLeve((l) => ({ ...l, variazioneRicaviPct: Number(e.target.value) }))
                      }
                      className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1 text-xs"
                    />
                  </label>
                  <label className="text-[10px] text-slate-600">
                    Costi (%)
                    <input
                      type="number"
                      step="0.5"
                      min={-90}
                      max={90}
                      value={leve.variazioneCostiPct}
                      onChange={(e) =>
                        setLeve((l) => ({ ...l, variazioneCostiPct: Number(e.target.value) }))
                      }
                      className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1 text-xs"
                    />
                  </label>
                  <label className="text-[10px] text-slate-600 col-span-2">
                    Debito dell’ente che entra nel passivo (€)
                    <input
                      type="number"
                      step="1000"
                      min={0}
                      value={leve.debitoEnteEuro}
                      onChange={(e) =>
                        setLeve((l) => ({ ...l, debitoEnteEuro: Number(e.target.value) }))
                      }
                      className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1 text-xs"
                    />
                  </label>
                  <label className="text-[10px] text-slate-600 col-span-2">
                    Natura del debito dell’ente
                    <select
                      value={leve.naturaDebitoEnte}
                      onChange={(e) =>
                        setLeve((l) => ({
                          ...l,
                          naturaDebitoEnte:
                            e.target.value === 'tributario' ? 'tributario' : 'previdenziale',
                        }))
                      }
                      className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1 text-xs"
                    >
                      <option value="previdenziale">Previdenziale (INPS/INAIL)</option>
                      <option value="tributario">Tributario (Agenzia delle Entrate)</option>
                    </select>
                  </label>
                </div>
                <button
                  type="button"
                  onClick={lanciaSimulazione}
                  disabled={inCorso}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white hover:bg-blue-800 disabled:opacity-50"
                >
                  {inCorso ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <GitBranch className="w-3 h-3" />
                  )}
                  Genera la simulazione
                </button>
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  Il ramo di partenza non viene modificato: la simulazione è un ramo nuovo, e si può
                  rifare con altre ipotesi quante volte serve.
                </p>
                {simulazioni.length > 0 && (
                  <ul className="space-y-1 pt-1 border-t border-slate-100">
                    {simulazioni.map((s) => (
                      <li key={s.id} className="flex items-start justify-between gap-2 text-[10px]">
                        <button
                          type="button"
                          onClick={() => setSceltoId(s.id)}
                          className={`text-left ${
                            s.id === sceltoId ? 'font-bold text-blue-800' : 'text-slate-600'
                          }`}
                        >
                          {s.valutazione?.livello === 'SOSTENIBILE' ? (
                            <CheckCircle2 className="w-3 h-3 inline mr-1 text-emerald-600" />
                          ) : (
                            <CircleDashed className="w-3 h-3 inline mr-1 text-amber-600" />
                          )}
                          {s.etichetta.replace(/^Simulazione /, '')}
                        </button>
                        <button
                          type="button"
                          onClick={() => elimina(s)}
                          disabled={inCorso}
                          title="Elimina la simulazione"
                          className="text-slate-400 hover:text-red-600 disabled:opacity-40"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          {base && (
            <div className="pt-2 border-t border-slate-100">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                Indici sul ramo di partenza {base.anno} e sulle simulazioni
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="text-[9px] uppercase text-slate-400 border-b border-slate-100">
                      <th className="text-left py-1">Indice</th>
                      <th className="text-right py-1">Soglia</th>
                      {colonne.map((c) => (
                        <th key={c.id} className="text-right py-1">
                          {c.tipo === 'PARTENZA' ? c.anno : 'Sim.'}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {base.indici.map((ind) => (
                      <tr key={ind.codice}>
                        <td className="py-1 text-slate-700">
                          <span className="font-mono text-[9px] text-slate-400 mr-1">
                            {ind.codice}
                          </span>
                          {ind.nome.replace(new RegExp(`^${ind.codice}\\s*[—-]\\s*`), '')}
                        </td>
                        <td className="py-1 text-right text-slate-500 text-[10px]">{ind.soglia}</td>
                        {colonne.map((c) => {
                          const v = c.indici.find((x) => x.codice === ind.codice);
                          return (
                            <td
                              key={c.id}
                              className={`py-1 text-right tabular-nums ${
                                v?.esito === 'VIOLATO'
                                  ? 'text-red-700 font-bold'
                                  : v?.esito === 'OK'
                                    ? 'text-emerald-700'
                                    : 'text-slate-400'
                              }`}
                              title={v?.note}
                            >
                              {v ? num(v.valore) : '—'}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                    <tr className="border-t-2 border-slate-200">
                      <td className="py-1 font-bold text-slate-800" colSpan={2}>
                        Posizione finanziaria netta
                      </td>
                      {colonne.map((c) => (
                        <td key={c.id} className="py-1 text-right tabular-nums text-slate-900">
                          {euro(pfns.get(c.id) ?? 0)}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="mt-1 text-[10px] text-slate-400 leading-relaxed">
                Stesse formule del resto della piattaforma. In rosso i valori oltre soglia:
                strumenti operativi di lettura, non parametri normativi.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
