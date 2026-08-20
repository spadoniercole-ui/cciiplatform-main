'use client';

// Tetto di token in OUTPUT per il questionario di Screening generato dall'AI.
// Parametro PER-SPAZIO con default di sistema (vedi
// src/lib/parametriGenerazione.ts). Collocato qui, nella pagina delle
// Direttrici Ente, perché è dove si configura lo Screening: se il questionario
// viene troncato a metà (molte direttrici / molte domande), da qui si alza il
// tetto e si rigenera.

import React, { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import {
  ottieniScreeningMaxTokens,
  aggiornaScreeningMaxTokensAction,
} from '@/app/actions/parametriSpazio';
import {
  SCREENING_MAX_TOKENS_DEFAULT,
  SCREENING_MAX_TOKENS_MIN,
  SCREENING_MAX_TOKENS_LIMITE,
} from '@/lib/parametriGenerazione';

interface Props {
  nomeSchema: string;
}

export function ScreeningMaxTokensControl({ nomeSchema }: Props) {
  const [tokens, setTokens] = useState<number>(SCREENING_MAX_TOKENS_DEFAULT);
  const [usaDefault, setUsaDefault] = useState<boolean>(true);
  const [caricamento, setCaricamento] = useState(true);
  const [salvataggio, setSalvataggio] = useState(false);
  const [salvato, setSalvato] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setCaricamento(true);
      const r = await ottieniScreeningMaxTokens(nomeSchema);
      if (r.success) {
        setTokens(r.maxTokens);
        setUsaDefault(!r.personalizzato);
      } else {
        setErrore(r.error || 'Impossibile caricare il parametro.');
      }
      setCaricamento(false);
    })();
  }, [nomeSchema]);

  const handleSalva = async () => {
    setSalvataggio(true);
    setSalvato(false);
    setErrore(null);
    const r = await aggiornaScreeningMaxTokensAction(nomeSchema, usaDefault ? null : tokens);
    if (r.success) setSalvato(true);
    else setErrore(r.error || 'Impossibile salvare.');
    setSalvataggio(false);
  };

  if (caricamento) return <p className="text-xs text-slate-400">Caricamento...</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-blue-600" />
        <h2 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
          Lunghezza massima del questionario (AI)
        </h2>
      </div>
      <p className="text-[11px] text-slate-500">
        Tetto massimo di token in <span className="font-bold">output</span> per il questionario di
        Screening generato dall&apos;AI. Se lo Screening viene{' '}
        <span className="font-bold">troncato a metà</span> (tante direttrici e tante domande), alza
        questo valore e rigenera. Consentito da {SCREENING_MAX_TOKENS_MIN} a{' '}
        {SCREENING_MAX_TOKENS_LIMITE}; default di sistema {SCREENING_MAX_TOKENS_DEFAULT}.
      </p>

      {errore && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          {errore}
        </div>
      )}

      <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
        <input
          type="checkbox"
          checked={usaDefault}
          onChange={(e) => {
            setUsaDefault(e.target.checked);
            if (e.target.checked) setTokens(SCREENING_MAX_TOKENS_DEFAULT);
            setSalvato(false);
          }}
        />
        Usa il default di sistema ({SCREENING_MAX_TOKENS_DEFAULT} token)
      </label>

      <div className="flex items-end gap-3">
        <div>
          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
            Tetto token output
          </label>
          <input
            type="number"
            min={SCREENING_MAX_TOKENS_MIN}
            max={SCREENING_MAX_TOKENS_LIMITE}
            step={1000}
            value={tokens}
            disabled={usaDefault}
            onChange={(e) => {
              const v = Number(e.target.value);
              setTokens(Number.isNaN(v) ? SCREENING_MAX_TOKENS_MIN : v);
              setSalvato(false);
            }}
            className="w-28 p-2 text-sm border border-slate-200 rounded-lg text-slate-900 bg-white disabled:bg-slate-100 disabled:text-slate-400"
          />
        </div>
        <button
          type="button"
          onClick={handleSalva}
          disabled={salvataggio}
          className="px-3 py-2 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white font-bold text-[10px] uppercase rounded-lg transition-colors"
        >
          {salvataggio ? 'Salvataggio...' : 'Salva'}
        </button>
      </div>

      {salvato && (
        <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
          Impostazione salvata. Vale per la generazione dello Screening di questo spazio.
        </div>
      )}
    </div>
  );
}
