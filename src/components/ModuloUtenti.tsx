'use client';

import { useState, useEffect } from 'react';

export const dynamic = 'force-dynamic';

interface Utente {
  id: string;
  nome: string;
  email: string;
  ruolo: 'ADMIN' | 'OPERATOR' | 'VIEWER';
  stato: 'ATTIVO' | 'SOSPESO';
}

interface ModuloUtentiProps {
  utenti: Utente[];
  onUpdate: (listaAggiornata: Utente[]) => void;
}

export const ModuloUtenti = ({ utenti, onUpdate }: ModuloUtentiProps) => {
  const [editing, setEditing] = useState<Utente | null>(null);

  const handleSalva = (e: React.FormEvent) => {
    e.preventDefault();
    if (editing) {
      onUpdate(utenti.map((u) => (u.id === editing.id ? editing : u)));
      setEditing(null);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-8 max-w-4xl">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-lg font-black text-slate-900">Anagrafica Utenti & Accessi</h2>
          <p className="text-xs text-slate-500 mt-1">
            Gestione delle identità abilitate all&apos;interno del workspace.
          </p>
        </div>
        <button className="px-4 py-2 bg-blue-600 text-white text-[11px] font-bold rounded-xl hover:bg-blue-700 transition-colors">
          + Invita Nuovo Utente
        </button>
      </div>

      <div className="space-y-3">
        {utenti.map((utente) => (
          <div
            key={utente.id}
            className="grid grid-cols-12 gap-4 items-center p-4 bg-slate-50 rounded-xl border border-slate-100 hover:border-slate-200 transition-all"
          >
            <div className="col-span-5 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-600">
                {utente.nome
                  .split(' ')
                  .map((n) => n[0])
                  .join('')}
              </div>
              <div>
                <p className="text-sm font-bold text-slate-900">{utente.nome}</p>
                <p className="text-[10px] text-slate-500">{utente.email}</p>
              </div>
            </div>
            <div className="col-span-3 text-[11px] font-bold text-slate-600 uppercase">
              {utente.ruolo}
            </div>
            <div className="col-span-2">
              <span
                className={`px-2 py-1 rounded-md text-[9px] font-black uppercase ${utente.stato === 'ATTIVO' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}
              >
                {utente.stato}
              </span>
            </div>
            <div className="col-span-2 text-right">
              <button
                onClick={() => setEditing(utente)}
                className="text-[11px] font-bold text-blue-600 hover:text-blue-800"
              >
                Gestisci
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Editor Modal */}
      {editing && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <form
            onSubmit={handleSalva}
            className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl border border-slate-100"
          >
            <h3 className="text-sm font-bold text-slate-900 mb-4">
              Modifica Profilo: {editing.nome}
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                  Ruolo
                </label>
                <select
                  value={editing.ruolo}
                  onChange={(e) => setEditing({ ...editing, ruolo: e.target.value as any })}
                  className="w-full p-2 bg-slate-50 border rounded-lg text-sm"
                >
                  <option value="ADMIN">ADMIN</option>
                  <option value="OPERATOR">OPERATOR</option>
                  <option value="VIEWER">VIEWER</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                  Stato
                </label>
                <select
                  value={editing.stato}
                  onChange={(e) => setEditing({ ...editing, stato: e.target.value as any })}
                  className="w-full p-2 bg-slate-50 border rounded-lg text-sm"
                >
                  <option value="ATTIVO">ATTIVO</option>
                  <option value="SOSPESO">SOSPESO</option>
                </select>
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="flex-1 py-2 bg-slate-100 text-slate-600 text-xs font-bold rounded-lg"
              >
                Annulla
              </button>
              <button
                type="submit"
                className="flex-1 py-2 bg-blue-600 text-white text-xs font-bold rounded-lg"
              >
                Salva Modifiche
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
