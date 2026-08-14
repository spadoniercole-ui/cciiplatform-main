'use client';

// Scheda di un Admin di Spazio nel pannello di gestione. Mostra il NOME
// UTENTE di login (nome.cognome, chiave d'accesso dalla 0.109), l'email di
// contatto — ora modificabile direttamente da qui, come richiesto per la
// manutenzione dello spazio — e il pulsante di rigenerazione password.
//
// L'email non è più la chiave di login: cambiarla è un'operazione sicura
// (non tocca l'accesso). Il nome utente, invece, è stabile e non
// modificabile: è l'identità con cui la persona si è sempre autenticata.

import React, { useState } from 'react';
import { AtSign, Check, Pencil, X, User } from 'lucide-react';
import { aggiornaEmailAdminAction, type AdminSpazio } from '@/app/actions/spazi';
import { RigeneraPasswordAdmin } from '@/components/spazi/RigeneraPasswordAdmin';

interface Props {
  nomeSchema: string;
  admin: AdminSpazio;
}

export function AdminSpazioCard({ nomeSchema, admin }: Props) {
  const [emailCorrente, setEmailCorrente] = useState(admin.email || '');
  const [inModifica, setInModifica] = useState(false);
  const [bozzaEmail, setBozzaEmail] = useState(admin.email || '');
  const [salvataggio, setSalvataggio] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  const handleSalva = async () => {
    setSalvataggio(true);
    setErrore(null);
    try {
      const esito = await aggiornaEmailAdminAction(nomeSchema, admin.id, bozzaEmail);
      if (!esito.success) {
        setErrore(esito.error || "Impossibile aggiornare l'email.");
        return;
      }
      setEmailCorrente(bozzaEmail.trim().toLowerCase());
      setInModifica(false);
    } finally {
      setSalvataggio(false);
    }
  };

  return (
    <div className="border border-slate-200 rounded-lg p-3">
      <div className="font-bold text-slate-900 text-xs">
        {admin.nome} {admin.cognome}
      </div>

      <div className="flex items-center gap-1.5 text-[11px] text-slate-600 font-mono mt-1">
        <User className="w-3 h-3 text-slate-400" />
        <span className="text-slate-400">nome utente:</span>
        <span className="font-bold">{admin.username || '—'}</span>
      </div>

      {/* Email di contatto — modificabile */}
      <div className="mt-1">
        {!inModifica ? (
          <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-mono">
            <AtSign className="w-3 h-3 text-slate-400" />
            <span>{emailCorrente || '(nessuna email)'}</span>
            <button
              type="button"
              onClick={() => {
                setBozzaEmail(emailCorrente);
                setErrore(null);
                setInModifica(true);
              }}
              className="text-slate-400 hover:text-blue-600 ml-1"
              title="Modifica email di contatto"
            >
              <Pencil className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <input
              type="email"
              value={bozzaEmail}
              onChange={(e) => setBozzaEmail(e.target.value)}
              placeholder="email di contatto"
              className="text-[11px] px-2 py-1 bg-slate-50 border border-slate-300 rounded font-mono text-slate-900 outline-none focus:border-blue-500 w-56"
            />
            <button
              type="button"
              onClick={handleSalva}
              disabled={salvataggio}
              className="p-1 text-emerald-600 hover:text-emerald-800 disabled:opacity-50"
              title="Salva"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                setInModifica(false);
                setErrore(null);
              }}
              className="p-1 text-slate-400 hover:text-slate-600"
              title="Annulla"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        {errore && <p className="text-[10px] text-red-600 mt-1">{errore}</p>}
      </div>

      <div className="text-[11px] text-slate-400 mt-0.5">{admin.cellulare}</div>

      <RigeneraPasswordAdmin
        nomeSchema={nomeSchema}
        adminId={admin.id}
        email={emailCorrente}
        username={admin.username}
      />
    </div>
  );
}
