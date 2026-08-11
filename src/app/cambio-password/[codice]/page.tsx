'use client';

// Pagina obbligatoria dopo il primo accesso (creazione) o dopo una
// rigenerazione: l'Admin di Spazio deve impostare una password propria
// prima di poter usare qualunque altra funzione. Il layout dello spazio
// reindirizza qui automaticamente finché admin_workspace.passwordTemporanea
// non torna a NULL.

import React, { useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { KeyRound } from 'lucide-react';
import {
  ottieniContestoAccessoSpazio,
  impostaNuovaPasswordAdminAction,
  impostaNuovaPasswordUtenteAction,
} from '@/app/actions/spazi';

export default function ImpostaPasswordPage() {
  const router = useRouter();
  const params = useParams<{ codice: string }>();
  const [nuovaPassword, setNuovaPassword] = useState('');
  const [confermaPassword, setConfermaPassword] = useState('');
  const [salvataggio, setSalvataggio] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrore(null);

    if (nuovaPassword !== confermaPassword) {
      setErrore('Le due password non coincidono.');
      return;
    }
    if (nuovaPassword.length < 8) {
      setErrore('La password deve contenere almeno 8 caratteri.');
      return;
    }

    setSalvataggio(true);
    try {
      const contesto = await ottieniContestoAccessoSpazio(params.codice);
      if (!contesto) {
        setErrore('Sessione non valida: effettua nuovamente il login.');
        return;
      }

      let risultato;
      if (contesto.modalita === 'ADMIN_SPAZIO' && contesto.adminId) {
        risultato = await impostaNuovaPasswordAdminAction(
          contesto.nomeSchema,
          contesto.adminId,
          nuovaPassword
        );
      } else if (contesto.modalita === 'OPERATORE' && contesto.utenteId) {
        risultato = await impostaNuovaPasswordUtenteAction(
          contesto.nomeSchema,
          contesto.utenteId,
          nuovaPassword
        );
      } else {
        setErrore('Sessione non valida: effettua nuovamente il login.');
        return;
      }

      if (!risultato.success) {
        setErrore(risultato.error || 'Impossibile impostare la nuova password.');
        return;
      }

      router.push(`/spazio/${params.codice}`);
      router.refresh();
    } catch (err) {
      console.error('Errore durante il cambio password:', err);
      setErrore('Impossibile completare la richiesta.');
    } finally {
      setSalvataggio(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4 font-sans">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8 space-y-6 border border-slate-200">
        <div className="text-center space-y-2">
          <div className="inline-flex p-3 bg-blue-50 rounded-full">
            <KeyRound className="w-6 h-6 text-blue-600" />
          </div>
          <h1 className="text-lg font-bold text-slate-900">Imposta la tua password</h1>
          <p className="text-xs text-slate-500">
            Stai usando una password temporanea. Per continuare, imposta una password tua che solo
            tu conosci.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
              Nuova password
            </label>
            <input
              type="password"
              value={nuovaPassword}
              onChange={(e) => setNuovaPassword(e.target.value)}
              placeholder="Almeno 8 caratteri"
              autoComplete="new-password"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
              Conferma password
            </label>
            <input
              type="password"
              value={confermaPassword}
              onChange={(e) => setConfermaPassword(e.target.value)}
              autoComplete="new-password"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          {errore && (
            <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
              {errore}
            </div>
          )}

          <button
            type="submit"
            disabled={salvataggio}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-bold rounded-lg uppercase tracking-wider text-xs shadow-md transition-all"
          >
            {salvataggio ? 'Salvataggio...' : 'Imposta e continua'}
          </button>
        </form>
      </div>
    </div>
  );
}
