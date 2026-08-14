'use client';

import React, { useMemo, useState } from 'react';
import type { AnalisiXbrlResult, FactRisolto } from '@/lib/xbrl/types';
import { PARAMETRI_TARGET_CCII } from '@/lib/xbrl/parametriTarget';

interface Props {
  analisi: AnalisiXbrlResult;
  onSalvataggioCompletato: (numeroSalvati: number) => void;
}

interface Override {
  chiave: string;
  tagPulito: string;
  tagOriginale: string;
  valore: number;
}

export default function FunzioneParificazioneTag({ analisi, onSalvataggioCompletato }: Props) {
  const [ricercaText, setRicercaText] = useState('');
  const [overrides, setOverrides] = useState<Record<string, Override>>({});
  const [salvataggio, setSalvataggio] = useState<'IDLE' | 'SALVANDO' | 'ERRORE'>('IDLE');
  const [erroreSalvataggio, setErroreSalvataggio] = useState<string | null>(null);

  const factCorrente = useMemo(
    () => analisi.tuttiIFact.filter((f) => f.periodo === 'corrente'),
    [analisi.tuttiIFact]
  );

  const factFiltrati = useMemo(
    () =>
      factCorrente.filter((f) => f.tagOriginale.toLowerCase().includes(ricercaText.toLowerCase())),
    [factCorrente, ricercaText]
  );

  // Per ogni parametro richiesto dagli indici CCII: qual è il fact (auto-mappato
  // o corretto manualmente) che oggi lo alimenta, e con quale valore.
  const righeTarget = useMemo(() => {
    return PARAMETRI_TARGET_CCII.map((param) => {
      const override = overrides[param.chiave];
      if (override) {
        return {
          ...param,
          tagAssegnato: override.tagOriginale,
          valore: override.valore,
          esito: 'ALLINEATO' as const,
          daOverride: true,
        };
      }
      const factAutoMappato = factCorrente.find((f) => f.chiaveMappata === param.chiave);
      if (factAutoMappato) {
        return {
          ...param,
          tagAssegnato: factAutoMappato.tagOriginale,
          valore: factAutoMappato.valore,
          esito: 'ALLINEATO' as const,
          daOverride: false,
        };
      }
      return {
        ...param,
        tagAssegnato: null,
        valore: 0,
        esito: 'ASSENTE' as const,
        daOverride: false,
      };
    });
  }, [factCorrente, overrides]);

  const assegnaTagAParametro = (chiave: string, fact: FactRisolto) => {
    setOverrides((prev) => ({
      ...prev,
      [chiave]: {
        chiave,
        tagPulito: fact.tagPulito,
        tagOriginale: fact.tagOriginale,
        valore: fact.valore,
      },
    }));
  };

  const rimuoviOverride = (chiave: string) => {
    setOverrides((prev) => {
      const copia = { ...prev };
      delete copia[chiave];
      return copia;
    });
  };

  const numeroCorrezioniPendenti = Object.keys(overrides).length;

  const salvaCorrezioni = async () => {
    if (numeroCorrezioniPendenti === 0) return;
    setSalvataggio('SALVANDO');
    setErroreSalvataggio(null);

    try {
      const res = await fetch('/api/xbrl/tag-mapping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          overrides: Object.values(overrides).map((o) => ({
            aliasTag: o.tagPulito,
            canonicalKey: o.chiave,
            note: 'Parificazione manuale da UI superadmin',
          })),
        }),
      });
      const result = await res.json();

      if (!res.ok || !result.success) {
        setSalvataggio('ERRORE');
        setErroreSalvataggio(result.error || `Errore del server: ${res.status}`);
        return;
      }

      setSalvataggio('IDLE');
      setOverrides({});
      onSalvataggioCompletato(result.salvati || numeroCorrezioniPendenti);
    } catch (err) {
      setSalvataggio('ERRORE');
      setErroreSalvataggio('Impossibile completare il salvataggio. Verifica la connessione.');
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-slate-900 text-white p-4 rounded-xl flex flex-wrap justify-between items-center gap-3 shadow-sm">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-emerald-400">
            Parificazione Tag XBRL → Indici CCII
          </h2>
          <p className="text-xs text-slate-300 mt-0.5">
            {analisi.anagrafica.ragioneSociale || 'Azienda non identificata'} — periodo corrente
          </p>
        </div>
        <button
          type="button"
          onClick={salvaCorrezioni}
          disabled={numeroCorrezioniPendenti === 0 || salvataggio === 'SALVANDO'}
          className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-bold text-xs px-4 py-2 rounded-lg transition-colors"
        >
          {salvataggio === 'SALVANDO'
            ? 'Salvataggio...'
            : `Salva ${numeroCorrezioniPendenti || ''} correzion${numeroCorrezioniPendenti === 1 ? 'e' : 'i'} su DB`.trim()}
        </button>
      </div>

      {salvataggio === 'ERRORE' && erroreSalvataggio && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          {erroreSalvataggio}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* SINISTRA: TUTTI I TAG NUMERICI DEL FILE (periodo corrente) */}
        <div className="lg:col-span-6 bg-white p-4 rounded-xl border border-slate-200 space-y-3">
          <div className="flex justify-between items-center border-b pb-2">
            <h3 className="text-xs font-bold uppercase text-slate-500">
              Tag rilevati nel file ({factFiltrati.length})
            </h3>
            <input
              type="text"
              placeholder="Filtra tag..."
              value={ricercaText}
              onChange={(e) => setRicercaText(e.target.value)}
              className="p-1.5 text-xs bg-slate-100 border rounded outline-none focus:bg-white w-40"
            />
          </div>

          <div className="overflow-y-auto max-h-[480px] border rounded-lg divide-y bg-slate-50">
            {factFiltrati.length === 0 && (
              <p className="p-3 text-xs text-slate-400 font-sans">
                Nessun tag corrisponde al filtro.
              </p>
            )}
            {factFiltrati.map((fact, i) => (
              <div
                key={`${fact.contextRef}-${fact.tagPulito}-${i}`}
                className="p-2 flex items-center justify-between text-xs bg-white gap-2"
              >
                <div className="truncate flex-1">
                  <p className="font-mono font-bold text-slate-700 truncate">{fact.tagOriginale}</p>
                  <p className="text-[10px] text-slate-400 font-mono truncate">
                    {fact.chiaveMappata ? `→ ${fact.chiaveMappata}` : 'non mappato'}
                  </p>
                </div>
                <span className="font-mono font-bold text-slate-900 bg-slate-100 px-1.5 py-0.5 rounded border shrink-0">
                  {fact.valore.toLocaleString('it-IT')}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* DESTRA: PARAMETRI RICHIESTI DAGLI INDICI CCII */}
        <div className="lg:col-span-6 bg-white p-4 rounded-xl border border-slate-200 space-y-3">
          <div className="border-b pb-2">
            <h3 className="text-xs font-bold uppercase text-slate-500">
              Parametri richiesti dagli indici CCII
            </h3>
          </div>
          <div className="space-y-2 overflow-y-auto max-h-[480px]">
            {righeTarget.map((riga) => (
              <div
                key={riga.chiave}
                className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex flex-col space-y-2"
              >
                <div className="flex justify-between items-center">
                  <div>
                    <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">
                      {riga.indiceTarget}
                    </span>
                    <p className="text-xs font-bold text-slate-800">{riga.parametroLogico}</p>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded text-[9px] font-bold ${riga.esito === 'ALLINEATO' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}
                  >
                    {riga.esito}
                  </span>
                </div>

                <div className="flex justify-between items-center text-[11px] pt-1 border-t border-slate-200/50 font-mono text-slate-500">
                  <span className="truncate max-w-[200px]">
                    Tag: {riga.tagAssegnato || '—'}
                    {riga.daOverride && (
                      <span className="ml-1 text-amber-600 font-sans font-bold">(non salvato)</span>
                    )}
                  </span>
                  <span className="font-bold text-slate-900">
                    {riga.valore.toLocaleString('it-IT')}
                  </span>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <select
                    className="text-[11px] border border-slate-200 rounded p-1 bg-white flex-1 font-mono"
                    value=""
                    onChange={(e) => {
                      const fact = factCorrente.find(
                        (f) => `${f.tagPulito}::${f.contextRef}` === e.target.value
                      );
                      if (fact) assegnaTagAParametro(riga.chiave, fact);
                    }}
                  >
                    <option value="">
                      {riga.esito === 'ALLINEATO'
                        ? 'Correggi assegnazione...'
                        : 'Assegna un tag...'}
                    </option>
                    {factCorrente.map((f, i) => (
                      <option
                        key={`${f.tagPulito}-${f.contextRef}-${i}`}
                        value={`${f.tagPulito}::${f.contextRef}`}
                      >
                        {f.tagOriginale} ({f.valore.toLocaleString('it-IT')})
                      </option>
                    ))}
                  </select>
                  {riga.daOverride && (
                    <button
                      type="button"
                      onClick={() => rimuoviOverride(riga.chiave)}
                      className="text-[10px] text-slate-400 hover:text-red-600 font-bold px-2"
                    >
                      annulla
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
