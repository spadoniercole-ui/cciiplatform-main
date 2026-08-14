'use client';

// Quando la stessa email viene usata come Admin di due spazi diversi,
// l'indice globale (email è chiave unica su tutta la piattaforma) può
// puntare a un solo schema — l'altro admin resta con l'account
// intatto ma non raggiungibile al login. La creazione di un nuovo
// spazio ora blocca questo caso in anticipo: questo strumento serve
// per i casi già successi prima di quel controllo.

import React, { useState } from 'react';
import { Search, Wrench, AlertTriangle, CheckCircle2 } from 'lucide-react';
import {
  diagnosticaEmailAdminAction,
  riparaIndiceAdminAction,
  type SpazioConEmailAdmin,
} from '@/app/actions/spazi';

export function RiparazioneIndiceAdmin() {
  const [email, setEmail] = useState('');
  const [ricercaInCorso, setRicercaInCorso] = useState(false);
  const [spazi, setSpazi] = useState<SpazioConEmailAdmin[] | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [riparazioneInCorso, setRiparazioneInCorso] = useState<string | null>(null);
  const [messaggioSuccesso, setMessaggioSuccesso] = useState<string | null>(null);

  const handleCerca = async () => {
    if (!email.trim()) return;
    setRicercaInCorso(true);
    setErrore(null);
    setMessaggioSuccesso(null);
    const risultato = await diagnosticaEmailAdminAction(email);
    if (risultato.success) setSpazi(risultato.spazi);
    else setErrore(risultato.error || 'Impossibile cercare.');
    setRicercaInCorso(false);
  };

  const handeRipara = async (nomeSchema: string, descrizione: string) => {
    setRiparazioneInCorso(nomeSchema);
    setErrore(null);
    const risultato = await riparaIndiceAdminAction(email, nomeSchema);
    if (risultato.success) {
      setMessaggioSuccesso(
        `Fatto — questa email ora punta a "${descrizione}". L'admin può accedere di nuovo lì con la propria password (invariata).`
      );
      await handleCerca();
    } else {
      setErrore(risultato.error || 'Impossibile riparare.');
    }
    setRiparazioneInCorso(null);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Wrench className="w-4 h-4 text-amber-600" />
        <h2 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
          Riparazione indice Admin di Spazio
        </h2>
      </div>
      <p className="text-[11px] text-slate-500">
        Un&apos;email non può essere Admin di due spazi contemporaneamente — se è successo per
        errore, cerca qui l&apos;email per vedere in quali spazi esiste ancora l&apos;account, e
        scegli esplicitamente a quale far puntare il login.
      </p>

      <div className="flex gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="email@esempio.it"
          className="flex-1 px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
        />
        <button
          type="button"
          onClick={handleCerca}
          disabled={ricercaInCorso || !email.trim()}
          className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white font-bold text-[10px] uppercase rounded-lg transition-colors"
        >
          <Search className="w-3.5 h-3.5" />
          {ricercaInCorso ? 'Ricerca...' : 'Cerca'}
        </button>
      </div>

      {errore && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          {errore}
        </div>
      )}
      {messaggioSuccesso && (
        <div className="flex items-start gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          {messaggioSuccesso}
        </div>
      )}

      {spazi && spazi.length === 0 && (
        <p className="text-xs text-slate-400">
          Nessuno spazio trovato con questa email come Admin.
        </p>
      )}

      {spazi && spazi.length > 0 && (
        <div className="space-y-2">
          {spazi.length === 1 && !spazi[0].puntatoDaIndice && (
            <div className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              L&apos;indice punta altrove nonostante ci sia un solo spazio con questa email — la
              riparazione qui sotto lo corregge.
            </div>
          )}
          {spazi.map((s) => (
            <div
              key={s.nomeSchema}
              className={`flex items-center justify-between gap-3 p-3 rounded-lg border ${
                s.puntatoDaIndice
                  ? 'bg-emerald-50 border-emerald-200'
                  : 'bg-slate-50 border-slate-200'
              }`}
            >
              <div>
                <span className="text-xs font-bold text-slate-900">{s.descrizioneSpazio}</span>
                <span className="text-[10px] text-slate-400 ml-2">({s.codiceSpazio})</span>
                {s.puntatoDaIndice && (
                  <span className="ml-2 text-[9px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded uppercase">
                    Login punta qui ora
                  </span>
                )}
              </div>
              {!s.puntatoDaIndice && (
                <button
                  type="button"
                  onClick={() => handeRipara(s.nomeSchema, s.descrizioneSpazio)}
                  disabled={riparazioneInCorso === s.nomeSchema}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-bold text-[9px] uppercase rounded-lg transition-colors shrink-0"
                >
                  {riparazioneInCorso === s.nomeSchema ? 'Riparazione...' : 'Fai puntare qui'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
