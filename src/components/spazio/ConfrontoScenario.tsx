'use client';

// IL DOCUMENTO DI CONFRONTO DELLO SCENARIO (0.196.0).
//
// Due basi, due documenti. Con la base amministrativa si confrontano
// liquidazione e cram down sul credito dell'ente, con le soglie e i parametri
// dello spazio. Con la base aziendale si sovrascrive il dato storico e si
// conserva la differenza rispetto alla simulazione base.
//
// Il documento non conclude: mostra i numeri che il motore calcola e lascia
// al valutatore la lettura.

import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Printer, RotateCcw, Save, Scale } from 'lucide-react';
import {
  RANGHI,
  calcolaScenari,
  type ParametriScenari,
  type RangoCredito,
} from '@/lib/triage/scenari';
import { VOCI_MAPPA, type ColonnaVerificaAzienda } from '@/lib/verificaAzienda/simulazione';
import type { DatiFinanziariPeriodo } from '@/lib/xbrl/types';
import { riepilogaSovrascritture, type Sovrascrittura } from '@/lib/scenari/confronto';
import { salvaSovrascrittureAction } from '@/app/actions/confrontoScenario';

const euro = (n: number | null) =>
  n === null
    ? '—'
    : n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 });

const pct = (n: number | null) => (n === null ? '—' : `${n.toLocaleString('it-IT')}%`);

export interface DatiSoglieDocumento {
  superate: number;
  nonDeterminabili: number;
  datiMancanti: string[];
  ente: string | null;
}

export interface SimulazioneBaseDocumento {
  profilo: string;
  annualita: number;
  colonne: ColonnaVerificaAzienda[];
}

interface Props {
  modo: 'AMMINISTRATIVA' | 'AZIENDALE';
  nomeSchema: string;
  scenarioId: number;
  ragioneSociale: string;
  nomeScenario: string;
  credito?: number | null;
  parametri?: ParametriScenari;
  soglie?: DatiSoglieDocumento | null;
  memorizzatoIl?: string | null;
  base?: SimulazioneBaseDocumento | null;
  sovrascritture?: Sovrascrittura[];
}

export function ConfrontoScenario(props: Props) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white p-5">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-blue-700">
            {props.modo === 'AMMINISTRATIVA'
              ? 'Documento di confronto · liquidazione e cram down'
              : 'Documento di confronto · base aziendale'}
          </p>
          <h1 className="mt-1 text-lg font-bold text-slate-900">{props.ragioneSociale}</h1>
          <p className="text-xs text-slate-500">
            Scenario «{props.nomeScenario}» · base{' '}
            {props.modo === 'AMMINISTRATIVA' ? 'amministrativa' : 'aziendale'}
            {props.memorizzatoIl ? ` · debito memorizzato il ${props.memorizzatoIl}` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 print:hidden"
        >
          <Printer className="h-3.5 w-3.5" /> Stampa / PDF
        </button>
      </div>

      {props.modo === 'AMMINISTRATIVA' ? (
        <DocumentoLiquidazione
          credito={props.credito ?? null}
          parametri={props.parametri}
          soglie={props.soglie ?? null}
        />
      ) : (
        <DocumentoSovrascritture
          nomeSchema={props.nomeSchema}
          scenarioId={props.scenarioId}
          base={props.base ?? null}
          sovrascritture={props.sovrascritture ?? []}
        />
      )}

      <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-[11px] leading-relaxed text-slate-600">
        I numeri sono calcolati dal motore con i dati e i parametri dello spazio. Non sono una
        conclusione giuridica né una stima dell’attivo dell’azienda: il credito è quello dell’ente e
        le percentuali sono quelle configurate nei parametri.
      </p>
    </div>
  );
}

function DocumentoLiquidazione({
  credito,
  parametri,
  soglie,
}: {
  credito: number | null;
  parametri: ParametriScenari | undefined;
  soglie: DatiSoglieDocumento | null;
}) {
  const [rango, setRango] = useState<RangoCredito>('CHIROGRAFARIO');

  const esito = useMemo(
    () =>
      calcolaScenari({
        credito,
        rango,
        parametri: parametri ?? {
          costiProceduraPct: null,
          ranghi: RANGHI.map((r) => ({
            rango: r.codice,
            tassoLiquidazionePct: null,
            cramDownPct: null,
          })),
        },
      }),
    [credito, rango, parametri]
  );

  const riga = parametri?.ranghi.find((r) => r.rango === rango) ?? null;

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <Riquadro etichetta="Credito dell’ente" valore={euro(credito)} />
        <Riquadro
          etichetta="Soglie superate"
          valore={soglie ? String(soglie.superate) : '—'}
          nota={soglie ? `${soglie.nonDeterminabili} non determinabili` : 'soglie non disponibili'}
          allerta={Boolean(soglie && soglie.superate > 0)}
        />
        <Riquadro
          etichetta="Spese di procedura"
          valore={pct(parametri?.costiProceduraPct ?? null)}
          nota="sottratte solo nella liquidazione"
        />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500">
          Rango del credito dell’ente
          <select
            value={rango}
            onChange={(event) => setRango(event.target.value as RangoCredito)}
            className="mt-1 block w-full max-w-sm rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-800"
          >
            {RANGHI.map((r) => (
              <option key={r.codice} value={r.codice}>
                {r.etichetta}
              </option>
            ))}
          </select>
        </label>
        <p className="mt-2 max-w-2xl text-[11px] leading-relaxed text-slate-500">
          {RANGHI.find((r) => r.codice === rango)?.aiuto}
        </p>
        {(parametri?.costiProceduraPct === null ||
          riga?.tassoLiquidazionePct === null ||
          riga?.cramDownPct === null) && (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-900">
            I parametri di questo rango non sono completi: le ipotesi non calcolabili restano
            dichiarate, senza sostituire zeri o medie di settore.
          </p>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <IpotesiCard
          titolo={esito.liquidazione.nome}
          esito={esito.liquidazione}
          colonne={[
            ['Percentuale di realizzo', pct(esito.liquidazione.percentuale)],
            ['Realizzo lordo', euro(esito.liquidazione.lordo)],
            ['Spese di procedura', euro(esito.liquidazione.costi)],
            ['Netto all’ente', euro(esito.liquidazione.netto)],
          ]}
          evidenza={esito.liquidazione.netto}
        />
        <IpotesiCard
          titolo={esito.cramDown.nome}
          esito={esito.cramDown}
          colonne={[
            ['Percentuale di soddisfacimento', pct(esito.cramDown.percentuale)],
            ['Importo omologato', euro(esito.cramDown.netto)],
            ['Costi sottratti', 'nessuno'],
          ]}
          evidenza={esito.cramDown.netto}
        />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Confronto</p>
        <p className="mt-2 text-sm font-semibold text-slate-900">
          {esito.confronto
            ? esito.confronto.testo
            : 'Le due ipotesi non sono entrambe calcolabili: mancano i dati elencati qui sotto.'}
        </p>
        {!esito.confronto && esito.mancanti.length > 0 && (
          <ul className="mt-3 space-y-1 text-[11px] text-slate-600">
            {esito.mancanti.map((m) => (
              <li key={m}>· {m}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
            Parametri usati
          </p>
          <table className="mt-2 w-full text-left text-[11px]">
            <tbody className="divide-y divide-slate-100">
              <tr>
                <td className="py-1.5 text-slate-500">Spese di procedura</td>
                <td className="py-1.5 text-right font-semibold">
                  {pct(parametri?.costiProceduraPct ?? null)}
                </td>
              </tr>
              <tr>
                <td className="py-1.5 text-slate-500">
                  Realizzo · {RANGHI.find((r) => r.codice === rango)?.etichetta}
                </td>
                <td className="py-1.5 text-right font-semibold">
                  {pct(riga?.tassoLiquidazionePct ?? null)}
                </td>
              </tr>
              <tr>
                <td className="py-1.5 text-slate-500">
                  Cram down · {RANGHI.find((r) => r.codice === rango)?.etichetta}
                </td>
                <td className="py-1.5 text-right font-semibold">
                  {pct(riga?.cramDownPct ?? null)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
            Soglie dell’esito amministrativo
          </p>
          {soglie ? (
            <>
              <div className="mt-2 flex gap-4 text-sm">
                <span>
                  <strong className="text-slate-900">{soglie.superate}</strong>{' '}
                  <span className="text-slate-500">superate</span>
                </span>
                <span>
                  <strong className="text-slate-900">{soglie.nonDeterminabili}</strong>{' '}
                  <span className="text-slate-500">non determinabili</span>
                </span>
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                {soglie.ente
                  ? `Ente di riferimento: ${soglie.ente}.`
                  : 'Ente di riferimento non determinato.'}
              </p>
              {soglie.datiMancanti.length > 0 && (
                <details className="mt-2 text-[11px] text-slate-600">
                  <summary className="cursor-pointer font-semibold text-slate-700">
                    Dati mancanti ({soglie.datiMancanti.length})
                  </summary>
                  <ul className="mt-1 space-y-1">
                    {soglie.datiMancanti.slice(0, 8).map((m) => (
                      <li key={m}>· {m}</li>
                    ))}
                  </ul>
                </details>
              )}
            </>
          ) : (
            <p className="mt-2 text-[11px] text-slate-500">
              Le soglie non sono state valutate: apri l’esito amministrativo dell’azienda.
            </p>
          )}
        </div>
      </div>
    </>
  );
}

function Riquadro({
  etichetta,
  valore,
  nota,
  allerta,
}: {
  etichetta: string;
  valore: string;
  nota?: string;
  allerta?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border bg-white p-4 ${allerta ? 'border-amber-300' : 'border-slate-200'}`}
    >
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{etichetta}</p>
      <p className="mt-1 text-lg font-bold text-slate-900">{valore}</p>
      {nota && <p className="mt-0.5 text-[10px] text-slate-500">{nota}</p>}
    </div>
  );
}

function IpotesiCard({
  titolo,
  esito,
  colonne,
  evidenza,
}: {
  titolo: string;
  esito: { calcolabile: boolean; motivo: string | null; dettaglio: string };
  colonne: [string, string][];
  evidenza: number | null;
}) {
  return (
    <div
      className={`rounded-xl border bg-white p-5 ${esito.calcolabile ? 'border-slate-200' : 'border-dashed border-slate-300'}`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{titolo}</p>
        {esito.calcolabile ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-label="Calcolabile" />
        ) : (
          <AlertTriangle className="h-4 w-4 text-amber-600" aria-label="Non calcolabile" />
        )}
      </div>
      <p className="mt-2 text-2xl font-bold text-slate-900">{euro(evidenza)}</p>
      <dl className="mt-3 space-y-1.5 text-[11px]">
        {colonne.map(([label, valore]) => (
          <div key={label} className="flex justify-between gap-2">
            <dt className="text-slate-500">{label}</dt>
            <dd className="font-semibold text-slate-800">{valore}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 border-t border-slate-100 pt-2 text-[11px] leading-relaxed text-slate-600">
        {esito.calcolabile ? esito.dettaglio : `Non calcolabile: ${esito.motivo}`}
      </p>
    </div>
  );
}

function DocumentoSovrascritture({
  nomeSchema,
  scenarioId,
  base,
  sovrascritture,
}: {
  nomeSchema: string;
  scenarioId: number;
  base: SimulazioneBaseDocumento | null;
  sovrascritture: Sovrascrittura[];
}) {
  const storiche = useMemo(
    () =>
      (base?.colonne ?? [])
        .filter((c) => c.tipo === 'STORICO')
        .slice()
        .sort((a, b) => a.anno - b.anno),
    [base]
  );

  const salvate = useMemo(
    () => new Map(sovrascritture.map((r) => [`${r.anno}|${r.voce}`, r])),
    [sovrascritture]
  );

  const [edits, setEdits] = useState<Record<string, string>>({});
  const [righe, setRighe] = useState<Sovrascrittura[]>(sovrascritture);
  const [errore, setErrore] = useState<string | null>(null);
  const [salvataggio, setSalvataggio] = useState(false);
  const [esito, setEsito] = useState<string | null>(null);

  const statistiche = riepilogaSovrascritture(righe);

  if (!base) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6">
        <p className="text-sm font-semibold text-slate-900">Simulazione base non disponibile</p>
        <p className="mt-1 text-[11px] text-slate-600">
          Lo scenario è nato su base aziendale, ma la simulazione salvata non c’è più. Riapri la
          verifica azienda, rilancia la simulazione e salva la base.
        </p>
      </div>
    );
  }

  if (storiche.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6">
        <p className="text-sm font-semibold text-slate-900">Nessun anno storico nella base</p>
        <p className="mt-1 text-[11px] text-slate-600">
          La simulazione contiene solo proiezioni: non c’è un dato dell’azienda da sovrascrivere.
        </p>
      </div>
    );
  }

  const valoreBase = (anno: number, chiave: string): number | null => {
    const colonna = storiche.find((c) => c.anno === anno);
    const valore = colonna?.dati?.[chiave as keyof DatiFinanziariPeriodo];
    return typeof valore === 'number' && Number.isFinite(valore) ? valore : null;
  };

  const valoreCorrente = (anno: number, chiave: string): string => {
    const key = `${anno}|${chiave}`;
    if (edits[key] !== undefined) return edits[key];
    const salvata = salvate.get(key);
    const valore = salvata ? salvata.valoreInserito : valoreBase(anno, chiave);
    return valore === null || valore === undefined ? '' : String(valore);
  };

  const modificate = Object.values(edits).filter((v) => v.trim() !== '').length;

  const salva = async () => {
    setSalvataggio(true);
    setErrore(null);
    setEsito(null);
    const payload = Object.entries(edits)
      .map(([key, valore]) => {
        const [anno, voce] = key.split('|');
        const numero = Number(valore.replace(',', '.'));
        if (valore.trim() === '' || !Number.isFinite(numero)) return null;
        return { anno: Number(anno), voce, valoreInserito: numero };
      })
      .filter((r): r is { anno: number; voce: string; valoreInserito: number } => r !== null);

    try {
      const risultato = await salvaSovrascrittureAction(nomeSchema, scenarioId, payload);
      if (!risultato.success || !risultato.sovrascritture) {
        setErrore(risultato.error ?? 'Salvataggio non riuscito.');
        return;
      }
      setRighe(risultato.sovrascritture);
      setEdits({});
      setEsito(
        risultato.statistiche?.numero
          ? `Salvate ${risultato.statistiche.numero} sovrascritture; scostamento medio ${euro(risultato.statistiche.mediaAssoluta)}.`
          : 'Nessuna sovrascrittura: il dato coincide con la base.'
      );
    } catch (error) {
      setErrore((error as Error).message);
    } finally {
      setSalvataggio(false);
    }
  };

  return (
    <>
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
              Dato storico dell’azienda
            </p>
            <p className="mt-1 text-[11px] text-slate-600">
              Profilo {base.profilo} · {base.annualita} annualità simulate. Il valore inserito non
              modifica la simulazione base: viene registrata la differenza.
            </p>
          </div>
          <div className="flex items-center gap-2 print:hidden">
            <button
              type="button"
              onClick={() => setEdits({})}
              disabled={modificate === 0 || salvataggio}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Annulla modifiche
            </button>
            <button
              type="button"
              onClick={salva}
              disabled={modificate === 0 || salvataggio}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-3 py-2 text-xs font-bold text-white hover:bg-blue-800 disabled:opacity-40"
            >
              <Save className="h-3.5 w-3.5" /> {salvataggio ? 'Salvo…' : 'Salva sovrascritture'}
            </button>
          </div>
        </div>

        {errore && (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-[11px] text-red-800">
            {errore}
          </p>
        )}
        {esito && (
          <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-[11px] text-emerald-900">
            {esito}
          </p>
        )}

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-[11px]">
            <thead>
              <tr className="border-b border-slate-200 text-[9px] uppercase tracking-wider text-slate-500">
                <th className="py-2 pr-3 font-bold">Voce</th>
                {storiche.map((c) => (
                  <th key={c.anno} className="px-2 py-2 text-right font-bold">
                    {c.anno}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {VOCI_MAPPA.map((voce) => (
                <tr key={voce.chiave}>
                  <td
                    className={`py-2 pr-3 ${voce.forte ? 'font-semibold text-slate-900' : 'text-slate-600'}`}
                  >
                    {voce.etichetta}
                  </td>
                  {storiche.map((colonna) => {
                    const key = `${colonna.anno}|${voce.chiave}`;
                    const baseVoce = valoreBase(colonna.anno, voce.chiave);
                    const valore = valoreCorrente(colonna.anno, voce.chiave);
                    const numero = valore.trim() === '' ? null : Number(valore.replace(',', '.'));
                    const delta =
                      numero !== null && Number.isFinite(numero) && baseVoce !== null
                        ? Math.round((numero - baseVoce) * 100) / 100
                        : null;
                    const cambiata = delta !== null && Math.abs(delta) >= 0.005;
                    const salvata = salvate.get(key);
                    return (
                      <td key={key} className="px-2 py-1.5 text-right align-top">
                        <input
                          inputMode="decimal"
                          value={valore}
                          onChange={(event) =>
                            setEdits((precedenti) => ({ ...precedenti, [key]: event.target.value }))
                          }
                          aria-label={`${voce.etichetta} ${colonna.anno}`}
                          className={`w-24 rounded border px-2 py-1 text-right font-mono text-[11px] ${
                            cambiata ? 'border-amber-400 bg-amber-50' : 'border-slate-300 bg-white'
                          }`}
                        />
                        <span className="mt-0.5 block text-[9px] text-slate-400">
                          base {euro(baseVoce)}
                        </span>
                        {cambiata && (
                          <span
                            className={`block text-[9px] font-semibold ${delta > 0 ? 'text-emerald-700' : 'text-red-700'}`}
                          >
                            {delta > 0 ? '+' : ''}
                            {euro(delta)}
                          </span>
                        )}
                        {salvata && !cambiata && (
                          <span className="block text-[9px] text-slate-400">sovrascritta</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Riquadro etichetta="Celle sovrascritte" valore={String(statistiche.numero)} />
        <Riquadro etichetta="Scostamento assoluto" valore={euro(statistiche.sommaAssoluta)} />
        <Riquadro etichetta="Scostamento medio" valore={euro(statistiche.mediaAssoluta)} />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-2">
          <Scale className="h-4 w-4 text-blue-700" />
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
            Differenze rispetto alla simulazione base
          </p>
        </div>
        {righe.length === 0 ? (
          <p className="mt-2 text-[11px] text-slate-500">
            Nessuna sovrascrittura registrata: il documento usa il dato dell’azienda così com’è.
          </p>
        ) : (
          <>
            <table className="mt-3 w-full text-left text-[11px]">
              <thead>
                <tr className="border-b border-slate-200 text-[9px] uppercase tracking-wider text-slate-500">
                  <th className="py-1.5 font-bold">Anno</th>
                  <th className="py-1.5 font-bold">Voce</th>
                  <th className="py-1.5 text-right font-bold">Base</th>
                  <th className="py-1.5 text-right font-bold">Inserito</th>
                  <th className="py-1.5 text-right font-bold">Differenza</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {righe.map((riga) => (
                  <tr key={`${riga.anno}|${riga.voce}`}>
                    <td className="py-1.5 text-slate-500">{riga.anno}</td>
                    <td className="py-1.5 text-slate-700">
                      {VOCI_MAPPA.find((v) => v.chiave === riga.voce)?.etichetta ?? riga.voce}
                    </td>
                    <td className="py-1.5 text-right font-mono">{euro(riga.valoreBase)}</td>
                    <td className="py-1.5 text-right font-mono">{euro(riga.valoreInserito)}</td>
                    <td
                      className={`py-1.5 text-right font-mono font-semibold ${riga.differenza > 0 ? 'text-emerald-700' : 'text-red-700'}`}
                    >
                      {riga.differenza > 0 ? '+' : ''}
                      {euro(riga.differenza)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-[10px] text-slate-500">
              {statistiche.perAnno
                .map((a) => `${a.anno}: ${a.numero} voci, ${euro(a.sommaAssoluta)} di scostamento`)
                .join(' · ')}
              {righe[0]?.autore ? ` · ultima modifica di ${righe[0].autore}` : ''}
            </p>
          </>
        )}
      </div>
    </>
  );
}
