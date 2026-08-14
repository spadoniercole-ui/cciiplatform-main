'use client';

// Pulsante per rigenerare la password temporanea di un Admin di Spazio già
// esistente. Prima non esisteva alcun modo per recuperarla se persa (la
// password mostrata alla creazione si vede una sola volta) — specialmente
// un problema per gli admin creati prima che questo pulsante esistesse.

import React, { useState } from 'react';
import { KeyRound, Copy, RefreshCw, Download } from 'lucide-react';
import { rigeneraPasswordAdminSpazioAction } from '@/app/actions/spazi';

interface Props {
  nomeSchema: string;
  adminId: number;
  email: string;
  /** Nome utente di login (nome.cognome). Se assente ricade sull'email. */
  username?: string | null;
}

export function RigeneraPasswordAdmin({ nomeSchema, adminId, email, username }: Props) {
  const [caricamento, setCaricamento] = useState(false);
  const [passwordGenerata, setPasswordGenerata] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);

  const handleScaricaCredenziali = () => {
    if (!passwordGenerata) return;
    const contenuto = `Credenziali di accesso
Generate il ${new Date().toLocaleString('it-IT')}

Login (nome utente): ${username || '(vedi pannello)'}
Password temporanea: ${passwordGenerata}
Email di contatto: ${email || '—'}

Si accede con il NOME UTENTE (non con l'email). La password è temporanea e va cambiata al primo accesso.
Conserva questo file in un posto sicuro e cancellalo dopo aver comunicato le credenziali — non è recuperabile una seconda volta da qui.`;
    const blob = new Blob([contenuto], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `credenziali-${username || email || 'admin'}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleRigenera = async () => {
    const conferma = window.confirm(
      "ATTENZIONE: la password attuale di questo admin smetterà di funzionare non appena generi quella nuova. Assicurati di poterla comunicare subito all'interessato. Procedere?"
    );
    if (!conferma) return;

    setCaricamento(true);
    setErrore(null);
    setPasswordGenerata(null);
    try {
      const risultato = await rigeneraPasswordAdminSpazioAction(nomeSchema, adminId);
      if (!risultato.success || !risultato.passwordTemporanea) {
        setErrore(risultato.error || 'Impossibile rigenerare la password.');
        return;
      }
      setPasswordGenerata(risultato.passwordTemporanea);
    } catch (err) {
      console.error('Errore durante la rigenerazione della password:', err);
      setErrore('Impossibile completare la richiesta.');
    } finally {
      setCaricamento(false);
    }
  };

  return (
    <div className="mt-2">
      {!passwordGenerata && (
        <button
          type="button"
          onClick={handleRigenera}
          disabled={caricamento}
          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 font-bold text-[10px] uppercase tracking-wider rounded-md transition-colors"
        >
          <KeyRound className="w-3 h-3" />
          {caricamento ? 'Generazione...' : 'Rigenera Password'}
        </button>
      )}

      {errore && <p className="text-[10px] text-red-600 mt-1">{errore}</p>}

      {passwordGenerata && (
        <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5 mt-1 space-y-1">
          <div className="font-bold uppercase tracking-wider text-[9px]">
            Nuova password — mostrata una sola volta
          </div>
          <div className="flex items-center gap-2">
            <code className="font-mono bg-white px-2 py-1 rounded border border-amber-200">
              {passwordGenerata}
            </code>
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(passwordGenerata)}
              className="text-amber-700 hover:text-amber-900"
              title="Copia"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleRigenera}
              disabled={caricamento}
              className="text-amber-700 hover:text-amber-900 ml-auto"
              title="Rigenera di nuovo"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${caricamento ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <p>Comunicala subito all&apos;interessato: la vecchia password non funziona più.</p>
          <button
            type="button"
            onClick={handleScaricaCredenziali}
            className="flex items-center gap-1.5 px-2 py-1 bg-white border border-amber-300 hover:bg-amber-100 text-amber-800 font-bold text-[9px] uppercase rounded transition-colors"
          >
            <Download className="w-3 h-3" /> Scarica credenziali (.txt)
          </button>
        </div>
      )}
    </div>
  );
}
