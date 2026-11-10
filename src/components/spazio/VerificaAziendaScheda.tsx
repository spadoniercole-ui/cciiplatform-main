'use client';

// VERIFICA AZIENDA — la mappa della simulazione.
//
// Le due verifiche diventano una lettura sola: gli anni depositati (contabile)
// e il debito certo della verifica amministrativa, con le proiezioni generate
// dal profilo scelto. Il check in testa è mutuamente esclusivo: standard,
// migliorativo, peggiorativo. Cambiarlo ricalcola i dati e gli indici delle
// annualità proiettate; gli anni storici non si toccano.
//
// Il documento non conclude nulla: dice che cosa accade alle ipotesi, e lascia
// alla direzione dell'ente la valutazione. In coda, la liquidazione e il cram
// down misurati sul credito dell'ente, con i parametri dello spazio.

import { useEffect, useMemo, useState } from 'react';
import { Calculator, Info, Loader2, Printer, ShieldAlert } from 'lucide-react';
import {
  calcolaVerificaAziendaAction,
  impostaConfigVerificaAziendaAction,
  type DebitoVerificaAzienda,
  type RisultatoVerificaAzienda,
} from '@/app/actions/verificaAzienda';
import {
  PROFILI,
  VOCI_MAPPA,
  type ColonnaVerificaAzienda,
  type ProfiloSimulazione,
} from '@/lib/verificaAzienda/simulazione';
import {
  RANGHI,
  calcolaScenari,
  type ParametriScenari,
  type RangoCredito,
} from '@/lib/triage/scenari';
import { ottieniParametriScenariAction } from '@/app/actions/parametriScenari';

const euro = (n: number | undefined) =>
  typeof n === 'number' && Number.isFinite(n) ? `${Math.round(n).toLocaleString('it-IT')} €` : '—';

const num = (n: unknown) =>
  typeof n === 'number' && Number.isFinite(n)
    ? n.toLocaleString('it-IT', { maximumFractionDigits: 2 })
    : 'n/d';

export function VerificaAziendaScheda({
  nomeSchema,
  aziendaId,
  ragioneSociale,
  annualitaIniziale,
}: {
  nomeSchema: string;
  aziendaId: number;
  ragioneSociale: string;
  annualitaIniziale: number;
}) {
  const [profilo, setProfilo] = useState<ProfiloSimulazione>('STANDARD');
  const [annualita, setAnnualita] = useState(annualitaIniziale);
  const [annualitaSalvata, setAnnualitaSalvata] = useState(annualitaIniziale);
  const [risultato, setRisultato] = useState<RisultatoVerificaAzienda | null>(null);
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [messaggio, setMessaggio] = useState<string | null>(null);
  const [parametri, setParametri] = useState<ParametriScenari | null>(null);
  const [rango, setRango] = useState<RangoCredito>('CHIROGRAFARIO');

  const calcola = async (p: ProfiloSimulazione) => {
    setInCorso(true);
    setErrore(null);
    setMessaggio(null);
    const r = await calcolaVerificaAziendaAction(nomeSchema, aziendaId, p, annualitaSalvata);
    setInCorso(false);
    if (!r.success) {
      setErrore(r.error ?? 'Simulazione non riuscita.');
      return;
    }
    setRisultato(r);
  };

  useEffect(() => {
    void calcola('STANDARD');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nomeSchema, aziendaId]);

  useEffect(() => {
    (async () => {
      const r = await ottieniParametriScenariAction(nomeSchema);
      if (r.success) setParametri(r.parametri ?? null);
    })();
  }, [nomeSchema]);

  const colonne: ColonnaVerificaAzienda[] = risultato?.esito?.colonne ?? [];
  const debito: DebitoVerificaAzienda | null = risultato?.debito ?? null;
  const esitoScenari = useMemo(
    () =>
      debito && parametri ? calcolaScenari({ credito: debito.totale, rango, parametri }) : null,
    [debito, parametri, rango]
  );

  const scegliProfilo = async (p: ProfiloSimulazione) => {
    setProfilo(p);
    await calcola(p);
  };

  const salvaAnnualita = async () => {
    const r = await impostaConfigVerificaAziendaAction(nomeSchema, annualita);
    if (!r.success) {
      setErrore(r.error ?? 'Annualità non salvate.');
      return;
    }
    setAnnualitaSalvata(r.annualita);
    setAnnualita(r.annualita);
    setMessaggio(
      `Annualità di proiezione impostate a ${r.annualita} per tutte le aziende dello spazio.`
    );
    await calcola(profilo);
  };

  const primaProiezione = colonne.findIndex((c) => c.tipo === 'PROIEZIONE');

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
        <h1 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <Calculator className="w-4 h-4 text-blue-600" />
          Verifica azienda — {ragioneSociale}
        </h1>
        <p className="text-xs text-slate-500 leading-relaxed max-w-3xl">
          Il dato storico della verifica contabile e il debito certo della verifica amministrativa,
          letti insieme. Le colonne storiche non si modificano: le annualità successive sono
          proiezioni dichiarate, e cambiano con il profilo scelto qui sopra. La verifica
          amministrativa è un dato attuale; questa simulazione è un’ipotesi costruita sul dato
          storico, con inferenza e interpolazione — non una previsione.
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
          Profilo della simulazione
        </p>
        <div className="grid sm:grid-cols-3 gap-2">
          {PROFILI.map((p) => (
            <button
              key={p.codice}
              type="button"
              onClick={() => void scegliProfilo(p.codice)}
              disabled={inCorso}
              className={`text-left rounded-lg border p-3 transition-colors disabled:opacity-60 ${
                profilo === p.codice
                  ? 'border-blue-400 bg-blue-50 text-blue-900'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
              }`}
            >
              <span className="text-xs font-bold">{p.etichetta}</span>
              <span className="block text-[10px] text-slate-500 mt-0.5 leading-relaxed">
                {p.descrizione}
              </span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-2 pt-1 border-t border-slate-100">
          <label className="text-[10px] text-slate-600">
            Annualità di proiezione
            <input
              type="number"
              min={1}
              max={8}
              value={annualita}
              onChange={(e) => setAnnualita(Number(e.target.value))}
              className="mt-0.5 w-24 rounded border border-slate-300 px-2 py-1 text-xs"
            />
          </label>
          <button
            type="button"
            onClick={salvaAnnualita}
            disabled={inCorso || annualita === annualitaSalvata}
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white hover:bg-slate-800 disabled:opacity-40"
          >
            Salva per lo spazio
          </button>
          <span className="text-[10px] text-slate-400">
            Vale per tutte le aziende: stesso orizzonte, confronti possibili.
          </span>
        </div>
        {risultato?.esito && (
          <p className="text-[10px] text-slate-500">
            Crescita storica composta: {risultato.esito.crescitaStoricaPct ?? 'non calcolabile'}% ·
            crescita applicata ai ricavi: {risultato.esito.crescitaApplicataPct}%
          </p>
        )}
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

      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
          Debito dell’ente — dato certo della simulazione
        </p>
        {debito ? (
          <p className="text-xs text-slate-700">
            <strong className="text-base tabular-nums">{euro(debito.totale)}</strong>{' '}
            <span className="text-slate-500">
              dalla verifica amministrativa
              {debito.memorizzatoIl ? ` del ${debito.memorizzatoIl}` : ''} — {debito.fonte}
            </span>
          </p>
        ) : (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
            Nessun debito memorizzato: la simulazione non iscrive alcun debito dell’ente. Chiudi la
            verifica amministrativa, oppure rinnova il dato dalla sua scheda.
          </p>
        )}
      </div>

      {risultato?.esito?.motivo && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
          {risultato.esito.motivo}
        </p>
      )}
      {risultato?.esito?.avvertenze.map((a, i) => (
        <p
          key={i}
          className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5"
        >
          {a}
        </p>
      ))}

      {colonne.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Mappa a sezioni affiancate
            </p>
            <div className="flex items-center gap-2">
              {inCorso && <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />}
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-blue-700 hover:text-blue-800"
              >
                <Printer className="w-3 h-3" /> Stampa
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-[9px] uppercase text-slate-400 border-b border-slate-200">
                  <th className="text-left py-1.5 pr-2">Voce</th>
                  {colonne.map((c) => (
                    <th key={c.anno} className="text-right py-1.5 px-1 whitespace-nowrap">
                      {c.anno}
                      <span
                        className={`block text-[8px] font-normal ${
                          c.tipo === 'PROIEZIONE' ? 'text-blue-600' : 'text-slate-400'
                        }`}
                      >
                        {c.tipo === 'PROIEZIONE' ? 'proiezione' : 'storico'}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {VOCI_MAPPA.map((v) => (
                  <tr key={v.chiave} className={v.forte ? 'bg-slate-50/60' : undefined}>
                    <td
                      className={`py-1 pr-2 ${v.forte ? 'font-bold text-slate-800' : 'text-slate-600'}`}
                    >
                      {v.etichetta}
                    </td>
                    {colonne.map((c) => (
                      <td
                        key={c.anno}
                        className={`py-1 px-1 text-right tabular-nums ${
                          v.forte ? 'font-bold text-slate-900' : 'text-slate-700'
                        }`}
                      >
                        {euro(c.dati[v.chiave] as number | undefined)}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="border-t-2 border-slate-200">
                  <td className="py-1 pr-2 font-bold text-slate-800">
                    Posizione finanziaria netta
                  </td>
                  {colonne.map((c) => (
                    <td
                      key={c.anno}
                      className="py-1 px-1 text-right tabular-nums font-bold text-slate-900"
                    >
                      {euro(c.dati.debitiBanche - c.dati.disponibilitaLiquide)}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          {primaProiezione > 0 && (
            <p className="text-[10px] text-slate-400 leading-relaxed">
              Il debito dell’ente entra nella prima annualità proiettata (
              {colonne[primaProiezione].anno}). Gli anni storici sono quelli depositati, senza
              modifiche.
            </p>
          )}

          <div className="overflow-x-auto pt-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              Indici per colonna
            </p>
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-[9px] uppercase text-slate-400 border-b border-slate-200">
                  <th className="text-left py-1.5 pr-2">Indice</th>
                  <th className="text-right py-1.5 px-1">Soglia</th>
                  {colonne.map((c) => (
                    <th key={c.anno} className="text-right py-1.5 px-1">
                      {c.anno}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {(colonne[0]?.indici ?? []).map((ind) => (
                  <tr key={ind.codice}>
                    <td className="py-1 pr-2 text-slate-700">
                      <span className="font-mono text-[9px] text-slate-400 mr-1">{ind.codice}</span>
                      {ind.nome.replace(new RegExp(`^${ind.codice}\\s*[—-]\\s*`), '')}
                    </td>
                    <td className="py-1 px-1 text-right text-slate-500 text-[10px]">
                      {ind.soglia}
                    </td>
                    {colonne.map((c) => {
                      const v = c.indici.find((x) => x.codice === ind.codice);
                      return (
                        <td
                          key={c.anno}
                          title={v?.note}
                          className={`py-1 px-1 text-right tabular-nums ${
                            v?.esito === 'VIOLATO'
                              ? 'text-red-700 font-bold'
                              : v?.esito === 'OK'
                                ? 'text-emerald-700'
                                : 'text-slate-400'
                          }`}
                        >
                          {v ? num(v.valore) : '—'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
          <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
          Liquidazione giudiziale e cram down
        </h2>
        <p className="text-[11px] text-slate-500 leading-relaxed">
          Quanto resterebbe all’ente sul proprio credito nelle due ipotesi, con le percentuali
          fissate nei parametri dello spazio. Sono termini di paragone, non previsioni e non
          conclusioni giuridiche: il rango del credito lo dichiara l’ente.
        </p>
        <label className="text-[10px] text-slate-600 block">
          Rango del credito dell’ente
          <select
            value={rango}
            onChange={(e) => setRango(e.target.value as RangoCredito)}
            className="mt-0.5 w-full max-w-sm rounded border border-slate-300 px-2 py-1 text-xs"
          >
            {RANGHI.map((r) => (
              <option key={r.codice} value={r.codice}>
                {r.etichetta}
              </option>
            ))}
          </select>
        </label>

        {!debito ? (
          <p className="text-[11px] text-slate-500">
            Serve il debito memorizzato: senza credito non c’è nulla su cui applicare le
            percentuali.
          </p>
        ) : !parametri ? (
          <p className="text-[11px] text-slate-500">
            Parametri degli scenari non disponibili: le due ipotesi restano non calcolabili.
          </p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {[esitoScenari?.liquidazione, esitoScenari?.cramDown].map((ipotesi, i) =>
              ipotesi ? (
                <div
                  key={i}
                  className={`rounded-lg border p-3 ${
                    ipotesi.calcolabile
                      ? 'border-slate-200 bg-slate-50'
                      : 'border-amber-200 bg-amber-50'
                  }`}
                >
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
                    {ipotesi.nome}
                  </p>
                  <p className="text-lg font-bold text-slate-900 tabular-nums mt-1">
                    {ipotesi.netto !== null ? euro(ipotesi.netto) : 'non calcolabile'}
                  </p>
                  <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">
                    {ipotesi.dettaglio}
                  </p>
                </div>
              ) : null
            )}
          </div>
        )}
        {esitoScenari?.confronto && (
          <p className="text-[11px] text-slate-700 flex items-start gap-1.5">
            <Info className="w-3.5 h-3.5 mt-0.5 text-slate-400 shrink-0" />
            {esitoScenari.confronto.testo}
          </p>
        )}
        {esitoScenari && !esitoScenari.calcolabile && esitoScenari.mancanti.length > 0 && (
          <p className="text-[10px] text-amber-800">Mancano: {esitoScenari.mancanti.join('; ')}.</p>
        )}
      </div>

      <p className="text-[11px] text-slate-500 leading-relaxed">
        Il documento è messo a disposizione della direzione dell’ente per le valutazioni del caso.
        La simulazione è un’ipotesi dichiarata su un dato storico; la verifica amministrativa resta
        il dato attuale. Nessuna conclusione giuridica.
      </p>
    </div>
  );
}
