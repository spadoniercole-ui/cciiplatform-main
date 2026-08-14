'use client';

// Limiti di ricevibilità della proposta per categoria di creditore —
// estratto da Parametri di Spazio (che era diventata chilometrica) in una
// pagina dedicata, stesso principio già applicato alla Check List.

import React, { useEffect, useState } from 'react';
import { useDichiaraContestoAssistente } from '@/components/ContestoAssistenteContext';
import { ShieldCheck, Plus } from 'lucide-react';
import {
  ottieniLimitiRicevibilita,
  aggiornaLimiteRicevibilitaAction,
  creaCategoriaLimiteAction,
  ottieniLimitiRicevibilitaRango,
  aggiornaLimiteRicevibilitaRangoAction,
  type LimiteRicevibilita,
  type LimiteRicevibilitaRango,
} from '@/app/actions/parametriSpazio';
import { CATEGORIA_SENTINELLA_ENTE } from '@/lib/costantiRicevibilita';
import { etichettaRango, type RangoLegale } from '@/lib/proposta/rangoLegale';

interface Props {
  nomeSchema: string;
  tipoSpazio: 'ENTE' | 'NON_ENTE';
}

export function RicevibilitaManager({ nomeSchema, tipoSpazio }: Props) {
  useDichiaraContestoAssistente({
    pagina: 'parametri',
    nomeSchema,
    sezioneParametri: 'Limiti di ricevibilità',
  });
  const [limiti, setLimiti] = useState<LimiteRicevibilita[]>([]);
  const [limitiRango, setLimitiRango] = useState<LimiteRicevibilitaRango[]>([]);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);
  const [nuovaCategoria, setNuovaCategoria] = useState('');

  const carica = async () => {
    setCaricamento(true);
    const [risultato, risultatoRango] = await Promise.all([
      ottieniLimitiRicevibilita(nomeSchema, tipoSpazio),
      ottieniLimitiRicevibilitaRango(nomeSchema),
    ]);
    if (risultato.success) setLimiti(risultato.limiti);
    else setErrore(risultato.error || 'Impossibile caricare i limiti.');
    if (risultatoRango.success) setLimitiRango(risultatoRango.limiti);
    setCaricamento(false);
  };

  useEffect(() => {
    carica();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nomeSchema]);

  const handleAggiornaLimiteRango = async (
    limite: LimiteRicevibilitaRango,
    campo: keyof LimiteRicevibilitaRango,
    valore: any
  ) => {
    const aggiornato = { ...limite, [campo]: valore };
    setLimitiRango((prev) =>
      prev.map((l) => (l.rangoLegale === limite.rangoLegale ? aggiornato : l))
    );
    await aggiornaLimiteRicevibilitaRangoAction(nomeSchema, limite.rangoLegale, {
      percentualeMinima: aggiornato.percentualeMinima,
      unicaSoluzioneAmmessa: aggiornato.unicaSoluzioneAmmessa,
      rateizzazioneAmmessa: aggiornato.rateizzazioneAmmessa,
      note: aggiornato.note,
      valoreLiquidazioneStimato: aggiornato.valoreLiquidazioneStimato,
    });
  };

  const handleAggiornaLimite = async (
    limite: LimiteRicevibilita,
    campo: keyof LimiteRicevibilita,
    valore: any
  ) => {
    const aggiornato = { ...limite, [campo]: valore };
    setLimiti((prev) => prev.map((l) => (l.id === limite.id ? aggiornato : l)));
    await aggiornaLimiteRicevibilitaAction(nomeSchema, limite.id, {
      percentualeMinima: aggiornato.percentualeMinima,
      unicaSoluzioneAmmessa: aggiornato.unicaSoluzioneAmmessa,
      rateizzazioneAmmessa: aggiornato.rateizzazioneAmmessa,
      note: aggiornato.note,
      valoreLiquidazioneStimato: aggiornato.valoreLiquidazioneStimato,
      alias: aggiornato.alias,
    });
  };

  const handleCreaCategoria = async () => {
    if (!nuovaCategoria.trim()) return;
    await creaCategoriaLimiteAction(nomeSchema, nuovaCategoria);
    setNuovaCategoria('');
    await carica();
  };

  if (caricamento) return <p className="text-xs text-slate-400">Caricamento...</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 text-blue-600" />
        <h2 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
          {tipoSpazio === 'ENTE'
            ? 'Soglia di ricevibilità'
            : 'Limiti di ricevibilità della proposta'}
        </h2>
      </div>
      <p className="text-[11px] text-slate-500">
        {tipoSpazio === 'ENTE'
          ? 'Un solo valore, non una categoria per creditore — questo spazio rappresenta un ente a scopo singolo, conta solo la soglia con cui questo ente valuta le proposte che riceve. Criterio corretto ex CCII: ricevibile se offre non meno di quanto si otterrebbe in liquidazione giudiziale.'
          : 'Criterio corretto ex CCII: una proposta è ricevibile se offre al creditore non meno di quanto otterrebbe in liquidazione giudiziale — non una percentuale minima fissa. Se per una categoria è stato stimato un valore di liquidazione (in euro), è quello il test principale; la % minima resta un pavimento aggiuntivo solo se impostata sopra zero.'}
      </p>

      {errore && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          {errore}
        </div>
      )}

      <div className="space-y-3">
        {limiti.map((l) => (
          <div key={l.id} className="border border-slate-200 rounded-lg p-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="font-bold text-slate-900 text-xs">
                {l.categoriaCreditore === CATEGORIA_SENTINELLA_ENTE
                  ? "Soglia dell'ente"
                  : l.categoriaCreditore}
              </span>
              <div className="flex items-center gap-2">
                <label className="text-[10px] text-slate-500">Valore liquidazione €</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={l.valoreLiquidazioneStimato ?? ''}
                  placeholder="non stimato"
                  onChange={(e) =>
                    handleAggiornaLimite(
                      l,
                      'valoreLiquidazioneStimato',
                      e.target.value === '' ? null : Number(e.target.value)
                    )
                  }
                  className="w-28 p-1.5 text-xs border border-slate-200 rounded text-slate-900 bg-white"
                />
                <label className="text-[10px] text-slate-500">% minima</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={l.percentualeMinima}
                  onChange={(e) =>
                    handleAggiornaLimite(l, 'percentualeMinima', Number(e.target.value))
                  }
                  className="w-16 p-1.5 text-xs border border-slate-200 rounded text-slate-900 bg-white"
                />
                <label className="flex items-center gap-1 text-[10px] text-slate-500">
                  <input
                    type="checkbox"
                    checked={l.unicaSoluzioneAmmessa}
                    onChange={(e) =>
                      handleAggiornaLimite(l, 'unicaSoluzioneAmmessa', e.target.checked)
                    }
                  />
                  Unica soluzione
                </label>
                <label className="flex items-center gap-1 text-[10px] text-slate-500">
                  <input
                    type="checkbox"
                    checked={l.rateizzazioneAmmessa}
                    onChange={(e) =>
                      handleAggiornaLimite(l, 'rateizzazioneAmmessa', e.target.checked)
                    }
                  />
                  Rateale
                </label>
              </div>
            </div>
            <input
              type="text"
              value={l.note || ''}
              onChange={(e) => handleAggiornaLimite(l, 'note', e.target.value)}
              placeholder="Note (facoltativo)..."
              className="w-full mt-2 p-1.5 text-[11px] bg-slate-50 border border-slate-200 rounded outline-none focus:border-blue-500 text-slate-700"
            />
            <div className="mt-2">
              <label className="text-[10px] text-slate-400 block mb-1">
                Alias — altri nomi o termini con cui questo creditore può comparire in un documento,
                separati da virgola (es. per l&apos;Agenzia delle Entrate: ente fiscale, debiti
                tributari, fiscali, erariali)
              </label>
              <input
                type="text"
                defaultValue={l.alias.join(', ')}
                onBlur={(e) =>
                  handleAggiornaLimite(
                    l,
                    'alias',
                    e.target.value
                      .split(',')
                      .map((a) => a.trim())
                      .filter(Boolean)
                  )
                }
                placeholder="Nessun alias configurato"
                className="w-full p-1.5 text-[11px] bg-slate-50 border border-slate-200 rounded outline-none focus:border-blue-500 text-slate-700"
              />
            </div>
          </div>
        ))}
      </div>

      {tipoSpazio === 'NON_ENTE' && (
        <div className="border-t border-slate-200 pt-4 mt-2">
          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-1">
            Limiti per rango legale (secondo livello)
          </h3>
          <p className="text-[11px] text-slate-500 mb-3">
            Usati quando una riga della proposta non combacia per nome esatto con nessuna categoria
            sopra (es. una riga chiamata &quot;Enti previdenziali&quot; non trova &quot;INPS&quot;).
            Il rango legale della riga (Prededucibile, Privilegiato, Chirografario, Postergato...)
            fa da ripiego prima di ricadere su Generale — un insieme chiuso di 6 valori, non un nome
            libero che può non corrispondere mai.
          </p>
          <div className="space-y-3">
            {limitiRango.map((l) => (
              <div key={l.rangoLegale} className="border border-slate-200 rounded-lg p-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="font-bold text-slate-900 text-xs">
                    {etichettaRango(l.rangoLegale)}
                  </span>
                  <div className="flex items-center gap-2">
                    <label className="text-[10px] text-slate-500">Valore liquidazione €</label>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={l.valoreLiquidazioneStimato ?? ''}
                      placeholder="non stimato"
                      onChange={(e) =>
                        handleAggiornaLimiteRango(
                          l,
                          'valoreLiquidazioneStimato',
                          e.target.value === '' ? null : Number(e.target.value)
                        )
                      }
                      className="w-28 p-1.5 text-xs border border-slate-200 rounded text-slate-900 bg-white"
                    />
                    <label className="text-[10px] text-slate-500">% minima</label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={l.percentualeMinima}
                      onChange={(e) =>
                        handleAggiornaLimiteRango(l, 'percentualeMinima', Number(e.target.value))
                      }
                      className="w-16 p-1.5 text-xs border border-slate-200 rounded text-slate-900 bg-white"
                    />
                    <label className="flex items-center gap-1 text-[10px] text-slate-500">
                      <input
                        type="checkbox"
                        checked={l.unicaSoluzioneAmmessa}
                        onChange={(e) =>
                          handleAggiornaLimiteRango(l, 'unicaSoluzioneAmmessa', e.target.checked)
                        }
                      />
                      Unica soluzione
                    </label>
                    <label className="flex items-center gap-1 text-[10px] text-slate-500">
                      <input
                        type="checkbox"
                        checked={l.rateizzazioneAmmessa}
                        onChange={(e) =>
                          handleAggiornaLimiteRango(l, 'rateizzazioneAmmessa', e.target.checked)
                        }
                      />
                      Rateale
                    </label>
                  </div>
                </div>
                <input
                  type="text"
                  value={l.note || ''}
                  onChange={(e) => handleAggiornaLimiteRango(l, 'note', e.target.value)}
                  placeholder="Note (facoltativo)..."
                  className="w-full mt-2 p-1.5 text-[11px] bg-slate-50 border border-slate-200 rounded outline-none focus:border-blue-500 text-slate-700"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {tipoSpazio === 'NON_ENTE' && (
        <div className="flex gap-2">
          <input
            type="text"
            value={nuovaCategoria}
            onChange={(e) => setNuovaCategoria(e.target.value)}
            placeholder="Nuova categoria di creditore..."
            className="flex-1 p-2 text-xs bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-blue-500 text-slate-900"
          />
          <button
            type="button"
            onClick={handleCreaCategoria}
            disabled={!nuovaCategoria.trim()}
            className="flex items-center gap-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-bold text-[10px] uppercase rounded-lg transition-colors"
          >
            <Plus className="w-3 h-3" /> Aggiungi
          </button>
        </div>
      )}
    </div>
  );
}
