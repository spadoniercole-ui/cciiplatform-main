'use client';

// Dati di Settore — confronto con l'andamento ISTAT del gruppo ATECO
// dell'azienda. L'aggiornamento da ISTAT è sempre un'azione esplicita
// dell'operatore, mai automatica: il limite di frequenza di ISTAT (5
// richieste/minuto per IP) ha una penalità di 1-2 giorni di blocco se
// superato — vedi src/lib/settore/istatClient.ts.

import React, { useEffect, useState } from 'react';
import { RefreshCw, AlertTriangle, BarChart3 } from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  ottieniDatiSettore,
  aggiornaDatiSettoreAction,
  type RisultatoDatiSettore,
} from '@/app/actions/datiSettore';

interface Props {
  nomeSchema: string;
  aziendaId: number;
}

export function DatiSettoreScenario({ nomeSchema, aziendaId }: Props) {
  const [dati, setDati] = useState<RisultatoDatiSettore | null>(null);
  const [caricamento, setCaricamento] = useState(true);
  const [aggiornamento, setAggiornamento] = useState(false);
  const [erroreAggiornamento, setErroreAggiornamento] = useState<string | null>(null);

  const carica = async () => {
    setCaricamento(true);
    const risultato = await ottieniDatiSettore(nomeSchema, aziendaId);
    setDati(risultato);
    setCaricamento(false);
  };

  useEffect(() => {
    carica();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nomeSchema, aziendaId]);

  const handleAggiorna = async () => {
    setAggiornamento(true);
    setErroreAggiornamento(null);
    const risultato = await aggiornaDatiSettoreAction(nomeSchema, aziendaId);
    if (!risultato.success) {
      setErroreAggiornamento(risultato.error || 'Impossibile aggiornare.');
    } else {
      await carica();
    }
    setAggiornamento(false);
  };

  if (caricamento) return <p className="text-xs text-slate-400">Caricamento...</p>;
  if (!dati) return null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
          Dati di Settore
        </h2>
        <p className="text-[11px] text-slate-500 mt-1">
          Confronto con l&apos;indice ISTAT del fatturato del settore (gruppo di attività economica,
          classificazione ATECO 2007 — la statistica ufficiale non ha ancora ribasato le serie su
          ATECO 2025). Copertura nazionale, non regionale; solo alcuni settori sono coperti
          dall&apos;indice.
        </p>
      </div>

      {dati.error && !dati.info && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-4">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800">{dati.error}</p>
        </div>
      )}

      {dati.info && (
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 className="w-4 h-4 text-blue-600" />
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Settore rilevato
            </h3>
          </div>
          <div className="grid grid-cols-3 gap-4 text-xs mb-3">
            <div>
              <span className="text-[9px] text-slate-400 uppercase block">Divisione</span>
              <span className="font-bold text-slate-900">{dati.info.divisione}</span>
            </div>
            <div>
              <span className="text-[9px] text-slate-400 uppercase block">Gruppo confrontato</span>
              <span className="font-bold text-slate-900">{dati.info.gruppo}</span>
            </div>
            <div>
              <span className="text-[9px] text-slate-400 uppercase block">Sezione</span>
              <span className="font-bold text-slate-900">{dati.info.sezione || '—'}</span>
            </div>
          </div>

          {dati.livelloUsato === 'divisione' && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-[11px] text-amber-800">
                ISTAT non pubblica il dettaglio per il gruppo {dati.info.gruppo} — il confronto qui
                sotto è al livello più ampio della divisione {dati.info.divisione} (include anche
                altre attività della stessa divisione, non solo {dati.info.gruppo}).
              </p>
            </div>
          )}

          {!dati.info.dataflow && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-[11px] text-amber-800">{dati.info.motivoAssenza}</p>
            </div>
          )}

          {dati.info.dataflow && (
            <>
              <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                <span className="text-[10px] text-slate-500">
                  {dati.aggiornatoIl
                    ? `Aggiornato il ${new Date(dati.aggiornatoIl).toLocaleDateString('it-IT')}`
                    : 'Non ancora aggiornato'}
                </span>
                <button
                  type="button"
                  onClick={handleAggiorna}
                  disabled={aggiornamento}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white font-bold text-[10px] uppercase rounded-lg transition-colors"
                >
                  <RefreshCw className={`w-3 h-3 ${aggiornamento ? 'animate-spin' : ''}`} />
                  {aggiornamento ? 'Aggiornamento...' : 'Aggiorna da ISTAT'}
                </button>
              </div>

              {erroreAggiornamento && (
                <div className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-lg p-2.5 mb-3">
                  {erroreAggiornamento}
                </div>
              )}

              {dati.punti.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={dati.punti}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="periodo" tick={{ fontSize: 9 }} />
                    <YAxis tick={{ fontSize: 10 }} domain={['auto', 'auto']} />
                    <Tooltip contentStyle={{ fontSize: 11 }} />
                    <Line
                      type="monotone"
                      dataKey="valore"
                      stroke="oklch(0.7 0.14 30)"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-xs text-slate-400 italic">
                  Nessun dato ancora scaricato — premi &quot;Aggiorna da ISTAT&quot;.
                </p>
              )}
              <p className="text-[10px] text-slate-400 mt-2">
                Indice del fatturato (base 2021=100) — non un valore assoluto: misura la variazione
                nel tempo, utile per capire se la situazione dell&apos;azienda è (anche) un riflesso
                dell&apos;andamento del mercato, non solo di scelte di gestione.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
