'use client';

// Operatori di questa azienda: punto di ingresso per la CREAZIONE di un
// nuovo Operatore/Consultatore (che parte associato a questa azienda —
// ma resta associabile anche ad altre in seguito, si gestisce da qui o
// dalla panoramica Utenti dello spazio) e per associare un operatore già
// esistente altrove nello spazio. La panoramica completa (permessi, stato,
// tutte le associazioni) resta in Utenti, nella sidebar dello spazio.

import React, { useEffect, useState } from 'react';
import { Plus, UserPlus, X, Ban, RotateCcw, Download, Copy } from 'lucide-react';
import {
  ottieniUtentiSpazio,
  creaUtenteSpazioAction,
  modificaUtenteSpazioAction,
  disabilitaUtenteSpazioAction,
  riattivaUtenteSpazioAction,
  type UtenteSpazio,
  type TipologiaUtente,
} from '@/app/actions/utenti';

interface Props {
  nomeSchema: string;
  aziendaId: number;
}

const FORM_VUOTO = {
  nome: '',
  cognome: '',
  email: '',
  tipologia: 'OPERATIVO' as TipologiaUtente,
};

export function AziendaUtentiManager({ nomeSchema, aziendaId }: Props) {
  const [utenti, setUtenti] = useState<UtenteSpazio[]>([]);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);

  const [mostraForm, setMostraForm] = useState(false);
  const [form, setForm] = useState(FORM_VUOTO);
  const [salvataggio, setSalvataggio] = useState(false);
  const [passwordGenerata, setPasswordGenerata] = useState<string | null>(null);
  const [usernameGenerato, setUsernameGenerato] = useState<string | null>(null);
  // Snapshot dell'anagrafica al momento della creazione, per il file
  // credenziali (il form può essere già stato svuotato/ricompilato).
  const [datiCreato, setDatiCreato] = useState<{
    nome: string;
    cognome: string;
    email: string;
    tipologia: TipologiaUtente;
  } | null>(null);

  const [utenteDaAssociare, setUtenteDaAssociare] = useState<number | ''>('');

  const handleScaricaCredenziali = () => {
    if (!usernameGenerato || !passwordGenerata) return;
    const nomeCompleto = datiCreato ? `${datiCreato.nome} ${datiCreato.cognome}`.trim() : '';
    const ruolo = datiCreato?.tipologia === 'CONSULTATORE' ? 'Consultatore' : 'Operativo';
    const contenuto = `Credenziali di accesso — ${ruolo}${nomeCompleto ? ` ${nomeCompleto}` : ''}
Generate il ${new Date().toLocaleString('it-IT')}

Login (nome utente): ${usernameGenerato}
Password temporanea: ${passwordGenerata}
Email di contatto: ${datiCreato?.email || '—'}

Si accede con il NOME UTENTE (non con l'email). La password è temporanea e va cambiata al primo accesso.
Conserva questo file in un posto sicuro e cancellalo dopo aver comunicato le credenziali — non è recuperabile una seconda volta da qui.`;
    const blob = new Blob([contenuto], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `credenziali-${usernameGenerato}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const carica = async () => {
    setCaricamento(true);
    const risultato = await ottieniUtentiSpazio(nomeSchema);
    if (risultato.success) setUtenti(risultato.utenti);
    else setErrore(risultato.error || 'Impossibile caricare gli operatori.');
    setCaricamento(false);
  };

  useEffect(() => {
    carica();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nomeSchema, aziendaId]);

  const associati = utenti.filter((u) => u.aziendeIds.includes(aziendaId));
  const nonAssociati = utenti.filter((u) => !u.aziendeIds.includes(aziendaId));

  const handleCrea = async (e: React.FormEvent) => {
    e.preventDefault();
    setSalvataggio(true);
    setErrore(null);
    try {
      const risultato = await creaUtenteSpazioAction(nomeSchema, {
        ...form,
        aziendeIds: [aziendaId],
      });
      if (!risultato.success) {
        setErrore(risultato.error || "Impossibile creare l'operatore.");
        return;
      }
      if (risultato.passwordTemporanea) {
        setPasswordGenerata(risultato.passwordTemporanea);
        setUsernameGenerato(risultato.username || null);
        setDatiCreato({
          nome: form.nome,
          cognome: form.cognome,
          email: form.email,
          tipologia: form.tipologia,
        });
      } else {
        setMostraForm(false);
        setForm(FORM_VUOTO);
      }
      await carica();
    } finally {
      setSalvataggio(false);
    }
  };

  const handleAssocia = async () => {
    if (utenteDaAssociare === '') return;
    const utente = utenti.find((u) => u.id === utenteDaAssociare);
    if (!utente) return;
    await modificaUtenteSpazioAction(nomeSchema, utente.id, {
      nome: utente.nome,
      cognome: utente.cognome,
      email: utente.email,
      tipologia: utente.tipologia,
      aziendeIds: [...utente.aziendeIds, aziendaId],
    });
    setUtenteDaAssociare('');
    await carica();
  };

  const handleRimuovi = async (utente: UtenteSpazio) => {
    if (utente.aziendeIds.length <= 1) {
      alert(
        "Questo operatore è associato solo a questa azienda: rimuoverlo lo lascerebbe senza alcuna azienda su cui lavorare. Associalo prima a un'altra azienda, oppure disabilitalo dalla panoramica Utenti."
      );
      return;
    }
    await modificaUtenteSpazioAction(nomeSchema, utente.id, {
      nome: utente.nome,
      cognome: utente.cognome,
      email: utente.email,
      tipologia: utente.tipologia,
      aziendeIds: utente.aziendeIds.filter((id) => id !== aziendaId),
    });
    await carica();
  };

  const handleToggleStato = async (utente: UtenteSpazio) => {
    const azione = utente.attivo ? disabilitaUtenteSpazioAction : riattivaUtenteSpazioAction;
    await azione(nomeSchema, utente.id);
    await carica();
  };

  if (caricamento) return <p className="text-xs text-slate-400">Caricamento...</p>;

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
            Operatori di questa azienda
          </h2>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Un operatore può lavorare su più aziende: qui gestisci quelli di questa.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setForm(FORM_VUOTO);
            setErrore(null);
            setPasswordGenerata(null);
            setMostraForm(true);
          }}
          className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-[10px] uppercase rounded-lg transition-colors shrink-0"
        >
          <Plus className="w-3.5 h-3.5" /> Nuovo operatore
        </button>
      </div>

      {errore && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          {errore}
        </div>
      )}

      {mostraForm && (
        <form
          onSubmit={handleCrea}
          className="bg-white border border-slate-200 rounded-xl p-5 space-y-3"
        >
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
              Nuovo operatore
            </h3>
            <button
              type="button"
              onClick={() => setMostraForm(false)}
              className="text-slate-400 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {passwordGenerata ? (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-xs text-emerald-800 space-y-2">
              <div className="font-bold uppercase tracking-wider text-[10px]">
                Operatore creato — credenziali mostrate una sola volta
              </div>
              {usernameGenerato && (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase text-emerald-700 w-24 shrink-0">
                    Nome utente
                  </span>
                  <code className="font-mono bg-white px-2 py-1 rounded border border-emerald-200">
                    {usernameGenerato}
                  </code>
                  <button
                    type="button"
                    onClick={() => navigator.clipboard.writeText(usernameGenerato)}
                    className="text-emerald-700 hover:text-emerald-900"
                    title="Copia"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase text-emerald-700 w-24 shrink-0">
                  Password
                </span>
                <code className="font-mono bg-white px-2 py-1 rounded border border-emerald-200">
                  {passwordGenerata}
                </code>
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(passwordGenerata)}
                  className="text-emerald-700 hover:text-emerald-900"
                  title="Copia"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="text-[10px]">
                L&apos;operatore accede con il <strong>nome utente</strong> (non con l&apos;email) e
                dovrà cambiare la password al primo accesso.
              </p>
              <div className="flex items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={handleScaricaCredenziali}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-emerald-300 hover:bg-emerald-100 text-emerald-800 font-bold text-[10px] uppercase rounded-lg transition-colors"
                >
                  <Download className="w-3.5 h-3.5" /> Scarica credenziali (.txt)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMostraForm(false);
                    setPasswordGenerata(null);
                    setUsernameGenerato(null);
                    setDatiCreato(null);
                    setForm(FORM_VUOTO);
                  }}
                  className="text-emerald-700 underline font-bold"
                >
                  Chiudi
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  value={form.nome}
                  onChange={(e) => setForm({ ...form, nome: e.target.value })}
                  placeholder="Nome"
                  className="p-2 text-sm border border-slate-200 rounded-lg text-slate-900"
                  required
                />
                <input
                  type="text"
                  value={form.cognome}
                  onChange={(e) => setForm({ ...form, cognome: e.target.value })}
                  placeholder="Cognome"
                  className="p-2 text-sm border border-slate-200 rounded-lg text-slate-900"
                  required
                />
              </div>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="Email"
                className="w-full p-2 text-sm border border-slate-200 rounded-lg text-slate-900"
                required
              />
              <select
                value={form.tipologia}
                onChange={(e) => setForm({ ...form, tipologia: e.target.value as TipologiaUtente })}
                className="w-full p-2 text-sm border border-slate-200 rounded-lg text-slate-900 bg-white"
              >
                <option value="OPERATIVO">Operativo</option>
                <option value="CONSULTATORE">Consultatore</option>
              </select>
              <button
                type="submit"
                disabled={salvataggio}
                className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white font-bold uppercase tracking-wider rounded-lg text-xs transition-colors"
              >
                {salvataggio ? 'Creazione...' : 'Crea operatore'}
              </button>
            </>
          )}
        </form>
      )}

      {nonAssociati.length > 0 && (
        <div className="flex gap-2">
          <select
            value={utenteDaAssociare}
            onChange={(e) => setUtenteDaAssociare(e.target.value ? Number(e.target.value) : '')}
            className="flex-1 p-2 text-xs border border-slate-200 rounded-lg text-slate-900 bg-white"
          >
            <option value="">Associa un operatore già esistente nello spazio...</option>
            {nonAssociati.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nome} {u.cognome} ({u.tipologia === 'OPERATIVO' ? 'Operativo' : 'Consultatore'})
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleAssocia}
            disabled={utenteDaAssociare === ''}
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-50 hover:bg-blue-100 disabled:opacity-50 text-blue-700 font-bold text-[10px] uppercase rounded-lg transition-colors shrink-0"
          >
            <UserPlus className="w-3.5 h-3.5" /> Associa
          </button>
        </div>
      )}

      <div className="space-y-2">
        {associati.map((u) => (
          <div
            key={u.id}
            className={`border rounded-lg p-3 flex flex-wrap justify-between items-center gap-3 ${
              u.attivo ? 'border-slate-200' : 'border-slate-200 bg-slate-50 opacity-70'
            }`}
          >
            <div>
              <span className="font-bold text-slate-900 text-xs">
                {u.nome} {u.cognome}
              </span>
              <div className="text-[10px] text-slate-400">
                {u.email} — {u.tipologia === 'OPERATIVO' ? 'Operativo' : 'Consultatore'}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                  u.attivo ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                }`}
              >
                {u.attivo ? 'Attivo' : 'Disabilitato'}
              </span>
              <button
                type="button"
                onClick={() => handleToggleStato(u)}
                className="p-1.5 text-slate-400 hover:text-red-600"
                title={u.attivo ? 'Disabilita' : 'Riattiva'}
              >
                {u.attivo ? <Ban className="w-3.5 h-3.5" /> : <RotateCcw className="w-3.5 h-3.5" />}
              </button>
              <button
                type="button"
                onClick={() => handleRimuovi(u)}
                className="p-1.5 text-slate-400 hover:text-red-600"
                title="Rimuovi da questa azienda"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
        {associati.length === 0 && (
          <p className="text-xs text-slate-400">Nessun operatore associato a questa azienda.</p>
        )}
      </div>
    </div>
  );
}
