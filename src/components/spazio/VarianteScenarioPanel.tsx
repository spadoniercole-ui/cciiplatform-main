'use client';

// LA VARIANTE DELLO SCENARIO (0.159.0).
//
// Aprire lo scenario non basta: prima si dice che cosa si sta esaminando. Se è
// una proposta, tutto resta com'è. Se è un cram down o un decreto di
// liquidazione, non c'è nulla da negoziare: si carica il provvedimento, si
// leggono i riferimenti all'ente e si mette a confronto quanto il tribunale ha
// riconosciuto con quanto l'ente detiene.
//
// IL CONFRONTO È DIFFERENZIALE. Il numero del tribunale da solo non dice
// nulla: accanto c'è sempre il credito dell'ente. Se il credito non è caricato,
// la scheda lo dice invece di mostrare una differenza contro zero.

import React, { useEffect, useState } from 'react';
import { Gavel, FileText, Upload, Loader2, AlertTriangle, CheckCircle2, Scale } from 'lucide-react';
import { impostaVarianteScenarioAction } from '@/app/actions/scenari';
import {
  analizzaProvvedimentoAction,
  ottieniProvvedimentoAction,
  type ProvvedimentoScenario,
} from '@/app/actions/provvedimentoScenario';
import {
  richiedeProvvedimento,
  VARIANTI_SCENARIO,
  voceVariante,
  type VarianteScenario,
} from '@/lib/scenario/variante';

const euro = (n: number | null) =>
  n === null ? 'non rilevato' : `${n.toLocaleString('it-IT', { maximumFractionDigits: 2 })} €`;

interface Props {
  nomeSchema: string;
  scenarioId: number;
  codice: string;
  variante: VarianteScenario | null;
  /** Credito vantato dall'ente sull'azienda: il termine di confronto. */
  creditoEnte: number | null;
}

export function VarianteScenarioPanel({
  nomeSchema,
  scenarioId,
  codice,
  variante,
  creditoEnte,
}: Props) {
  const [scelta, setScelta] = useState<VarianteScenario | null>(variante);
  const [salvataggio, setSalvataggio] = useState(false);
  const [provvedimento, setProvvedimento] = useState<ProvvedimentoScenario | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [lettura, setLettura] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [avviso, setAvviso] = useState<string | null>(null);

  useEffect(() => {
    let annullato = false;
    void ottieniProvvedimentoAction(nomeSchema, scenarioId).then((r) => {
      if (annullato) return;
      if (r.success) setProvvedimento(r.provvedimento);
    });
    return () => {
      annullato = true;
    };
  }, [nomeSchema, scenarioId]);

  const scegli = async (valore: VarianteScenario) => {
    setScelta(valore);
    setSalvataggio(true);
    setErrore(null);
    setAvviso(null);
    const r = await impostaVarianteScenarioAction(nomeSchema, scenarioId, valore);
    if (!r.success) setErrore(r.error ?? 'Variante non salvata.');
    else setAvviso('Variante salvata: da qui in poi lo scenario si legge in questo modo.');
    setSalvataggio(false);
  };

  const analizza = async () => {
    if (!file || !scelta || !richiedeProvvedimento(scelta)) return;
    setLettura(true);
    setErrore(null);
    setAvviso(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('codice', codice);
      const up = await fetch('/api/blob-upload', { method: 'POST', body: fd });
      const corpo = await up.json().catch(() => ({}));
      if (!up.ok || corpo.error) {
        setErrore(`Caricamento non riuscito: ${corpo.error ?? `HTTP ${up.status}`}`);
        return;
      }
      const r = await analizzaProvvedimentoAction(
        nomeSchema,
        scenarioId,
        scelta,
        corpo.url as string,
        file.name
      );
      if (r.success && r.provvedimento) {
        setProvvedimento(r.provvedimento);
        setFile(null);
        setAvviso('Provvedimento letto: i riferimenti all’ente sono nella scheda qui sotto.');
      } else {
        setErrore(r.error ?? 'Lettura non riuscita.');
      }
    } catch (e) {
      setErrore(`Lettura non riuscita: ${String(e)}`);
    } finally {
      setLettura(false);
    }
  };

  const voce = voceVariante(scelta);
  const importoEnte = provvedimento?.importi?.importoEnte ?? null;
  const differenza =
    importoEnte !== null && creditoEnte !== null ? importoEnte - creditoEnte : null;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
      <div>
        <h2 className="flex items-center gap-2 font-bold text-slate-900 uppercase text-xs tracking-wider">
          <Scale className="w-4 h-4 text-slate-500" />
          Che cosa stai esaminando
        </h2>
        <p className="text-[11px] text-slate-500 mt-1 max-w-3xl leading-relaxed">
          La variante decide che cosa si guarda. Cambiarla non cancella nulla: i dati già inseriti
          restano, e il percorso di trattativa è sempre disponibile.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        {VARIANTI_SCENARIO.map((v) => (
          <button
            key={v.valore}
            type="button"
            onClick={() => void scegli(v.valore)}
            disabled={salvataggio}
            className={`text-left rounded-xl border p-3 transition-colors disabled:opacity-60 ${
              scelta === v.valore
                ? 'border-sky-500 bg-sky-50'
                : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
          >
            <span className="flex items-center gap-1.5 text-[11px] font-bold text-slate-900">
              <Gavel className="w-3.5 h-3.5 text-slate-500" />
              {v.etichetta}
            </span>
            <span className="block text-[10px] text-slate-500 mt-1 leading-relaxed">
              {v.descrizione}
            </span>
          </button>
        ))}
      </div>

      {errore && (
        <p className="flex items-start gap-1.5 text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>{errore}</span>
        </p>
      )}
      {avviso && (
        <p className="flex items-start gap-1.5 text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg p-2.5">
          <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>{avviso}</span>
        </p>
      )}

      {voce && richiedeProvvedimento(scelta) ? (
        <div className="space-y-3 border-t border-slate-200 pt-4">
          <p className="text-[11px] text-slate-600 leading-relaxed">
            Carica il provvedimento: si cercano i riferimenti all’ente e l’importo riconosciuto. Non
            si esamina la proposta né si negozia nulla — il confronto è tra quanto l’ente detiene e
            quanto il tribunale ha disposto.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[10px] uppercase rounded-lg cursor-pointer">
              <Upload className="w-3.5 h-3.5" />
              {file ? file.name : 'Carica il provvedimento (PDF)'}
              <input
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <button
              type="button"
              onClick={() => void analizza()}
              disabled={!file || lettura}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white font-bold uppercase tracking-wider rounded-lg text-[10px]"
            >
              {lettura ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <FileText className="w-3.5 h-3.5" />
              )}
              {lettura
                ? 'Lettura in corso…'
                : provvedimento
                  ? 'Rileggi il provvedimento'
                  : 'Leggi il provvedimento'}
            </button>
          </div>

          {provvedimento?.errore && (
            <p className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
              {provvedimento.errore}
            </p>
          )}

          {provvedimento && !provvedimento.errore && (
            <div className="space-y-3">
              <table className="w-full border-collapse text-xs">
                <tbody>
                  <tr>
                    <td className="border-b border-slate-100 px-2 py-2 text-slate-600">
                      Documento
                    </td>
                    <td className="border-b border-slate-100 px-2 py-2 text-slate-900">
                      {provvedimento.nomeFile ?? '—'}
                    </td>
                  </tr>
                  <tr>
                    <td className="border-b border-slate-100 px-2 py-2 text-slate-600">
                      Credito vantato dall’ente
                    </td>
                    <td className="border-b border-slate-100 px-2 py-2 font-bold text-slate-900">
                      {creditoEnte === null
                        ? 'non caricato: il confronto non è possibile'
                        : euro(creditoEnte)}
                    </td>
                  </tr>
                  <tr>
                    <td className="border-b border-slate-100 px-2 py-2 text-slate-600">
                      Riconosciuto dal tribunale all’ente
                    </td>
                    <td className="border-b border-slate-100 px-2 py-2 font-bold text-slate-900">
                      {euro(importoEnte)}
                      {provvedimento.importi?.percentualeEnte !== null &&
                        provvedimento.importi?.percentualeEnte !== undefined && (
                          <span className="font-normal text-slate-500">
                            {' '}
                            ({provvedimento.importi.percentualeEnte}% del credito)
                          </span>
                        )}
                    </td>
                  </tr>
                  <tr>
                    <td className="border-b border-slate-100 px-2 py-2 text-slate-600">
                      Differenza rispetto al credito
                    </td>
                    <td className="border-b border-slate-100 px-2 py-2 font-bold text-slate-900">
                      {differenza === null ? 'non calcolabile' : euro(differenza)}
                    </td>
                  </tr>
                </tbody>
              </table>

              {provvedimento.importi?.riferimenti.length ? (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Riferimenti all’ente nel provvedimento
                  </p>
                  <ul className="mt-1 space-y-1">
                    {provvedimento.importi.riferimenti.map((r, i) => (
                      <li key={i} className="text-[11px] text-slate-700">
                        {r}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                  Il provvedimento non contiene riferimenti espliciti all’ente: l’importo
                  riconosciuto non si può ricavare con certezza, e la scheda non lo inventa.
                </p>
              )}

              {provvedimento.importi?.passaggi.length ? (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Passaggi che riguardano l’ente
                  </p>
                  <ul className="mt-1 space-y-1">
                    {provvedimento.importi.passaggi.map((p, i) => (
                      <li
                        key={i}
                        className="text-[11px] text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-2"
                      >
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <p className="text-[10px] text-slate-400 leading-relaxed">
                La lettura è automatica e va riscontrata sul testo del provvedimento: la piattaforma
                riporta ciò che il documento dice, non lo interpreta al posto di chi decide.
              </p>
            </div>
          )}
        </div>
      ) : (
        <p className="text-[11px] text-slate-500 leading-relaxed border-t border-slate-200 pt-4">
          Con la proposta dell’azienda si lavora come sempre: righe di proposta, requisiti, piano e
          Relazione. Nessun provvedimento da caricare.
        </p>
      )}
    </div>
  );
}
