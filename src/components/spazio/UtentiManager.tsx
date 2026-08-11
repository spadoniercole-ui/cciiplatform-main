'use client';

// Panoramica di tutti gli Operatori/Consultatori dello spazio. Un nuovo
// operatore si crea dalla scheda dell'azienda su cui deve lavorare
// (Aziende → azienda → Operatori) — qui si rivedono le associazioni, i
// permessi per modulo e lo stato di ciascuno, non si crea né si modifica
// l'anagrafica: quella vive nella scheda azienda, dove ha senso decidere
// su quali aziende un operatore lavora.

import React, { useEffect, useState } from 'react';
import { Users, Ban, RotateCcw, KeyRound, ShieldCheck, Copy } from 'lucide-react';
import {
  ottieniUtentiSpazio,
  disabilitaUtenteSpazioAction,
  riattivaUtenteSpazioAction,
  rigeneraPasswordUtenteAction,
  type UtenteSpazio,
} from '@/app/actions/utenti';
import { ottieniAziende, type Azienda } from '@/app/actions/aziende';
import { ottieniPermessiUtente, impostaPermessoAction } from '@/app/actions/permessi';
import { MODULI_PERMESSO, type LivelloPermesso } from '@/lib/moduliPermesso';

const ETICHETTE_MODULO: Record<string, string> = {
  scenari: 'Scenari',
  checklist: 'Check List',
  indici: 'Indici',
  xbrl: 'Import XBRL',
  report: 'Proposta',
  relazione: 'Relazione AI',
};

interface Props {
  nomeSchema: string;
}

export function UtentiManager({ nomeSchema }: Props) {
  const [utenti, setUtenti] = useState<UtenteSpazio[]>([]);
  const [aziende, setAziende] = useState<Azienda[]>([]);
  const [caricamento, setCaricamento] = useState(true);
  const [erroreLista, setErroreLista] = useState<string | null>(null);

  const [utentePermessiAperto, setUtentePermessiAperto] = useState<number | null>(null);
  const [permessiCorrenti, setPermessiCorrenti] = useState<Record<string, LivelloPermesso>>({});
  const [caricamentoPermessi, setCaricamentoPermessi] = useState(false);
  const [passwordAppenaGenerata, setPasswordAppenaGenerata] = useState<{
    utenteId: number;
    password: string;
  } | null>(null);

  const carica = async () => {
    setCaricamento(true);
    setErroreLista(null);
    try {
      const [risultatoUtenti, risultatoAziende] = await Promise.all([
        ottieniUtentiSpazio(nomeSchema),
        ottieniAziende(nomeSchema),
      ]);
      if (!risultatoUtenti.success) {
        setErroreLista(risultatoUtenti.error || 'Impossibile caricare gli utenti.');
      }
      setUtenti(risultatoUtenti.utenti);
      setAziende(risultatoAziende.aziende);
    } catch (err: any) {
      setErroreLista(`Impossibile caricare gli utenti: ${err.message || err}`);
    } finally {
      setCaricamento(false);
    }
  };

  useEffect(() => {
    carica();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nomeSchema]);

  const handleToggleStato = async (utente: UtenteSpazio) => {
    const azione = utente.attivo ? disabilitaUtenteSpazioAction : riattivaUtenteSpazioAction;
    const risultato = await azione(nomeSchema, utente.id);
    if (!risultato.success) {
      alert(risultato.error || 'Operazione fallita.');
    }
    await carica();
  };

  const handleApriPermessi = async (utente: UtenteSpazio) => {
    if (utentePermessiAperto === utente.id) {
      setUtentePermessiAperto(null);
      return;
    }
    setUtentePermessiAperto(utente.id);
    setCaricamentoPermessi(true);
    const risultato = await ottieniPermessiUtente(nomeSchema, utente.id);
    if (risultato.success) setPermessiCorrenti(risultato.permessi);
    setCaricamentoPermessi(false);
  };

  const handleCambiaPermesso = async (
    utenteId: number,
    modulo: (typeof MODULI_PERMESSO)[number],
    livello: LivelloPermesso
  ) => {
    setPermessiCorrenti((prev) => ({ ...prev, [modulo]: livello }));
    await impostaPermessoAction(nomeSchema, utenteId, modulo, livello);
  };

  const handleRigeneraPassword = async (utente: UtenteSpazio) => {
    const conferma = window.confirm(
      `Rigenerare la password di ${utente.nome} ${utente.cognome}? La password attuale smetterà di funzionare.`
    );
    if (!conferma) return;
    const risultato = await rigeneraPasswordUtenteAction(nomeSchema, utente.id);
    if (!risultato.success || !risultato.passwordTemporanea) {
      alert(risultato.error || 'Impossibile rigenerare la password.');
      return;
    }
    setPasswordAppenaGenerata({ utenteId: utente.id, password: risultato.passwordTemporanea });
  };

  const nomeAzienda = (id: number) => aziende.find((a) => a.id === id)?.ragioneSociale || `#${id}`;

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
          Utenti Operativi e Consultatori
        </h2>
        <p className="text-slate-500 text-[11px] mt-1">
          Panoramica di tutti gli operatori dello spazio. Un nuovo operatore si crea dalla scheda
          dell&apos;azienda su cui deve lavorare (Aziende → azienda → Operatori) — qui puoi rivedere
          le associazioni, i permessi e lo stato di ciascuno.
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3 mb-4">
          <Users className="w-4 h-4 text-slate-500" />
          <h3 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
            Utenti esistenti ({utenti.length})
          </h3>
        </div>

        {erroreLista && (
          <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 mb-3">
            {erroreLista}
          </div>
        )}
        {caricamento && <p className="text-xs text-slate-400">Caricamento...</p>}
        {!caricamento && !erroreLista && utenti.length === 0 && (
          <p className="text-xs text-slate-400">
            Nessun utente creato finora — crealo dalla scheda dell&apos;azienda su cui deve operare.
          </p>
        )}

        <div className="space-y-2">
          {utenti.map((utente) => (
            <div key={utente.id}>
              <div
                className={`border rounded-lg p-3 flex flex-wrap justify-between items-center gap-3 ${
                  utente.attivo ? 'border-slate-200' : 'border-slate-200 bg-slate-50 opacity-70'
                }`}
              >
                <div>
                  <div className="font-bold text-slate-900 text-xs">
                    {utente.nome} {utente.cognome}
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono mt-0.5">{utente.email}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    {utente.tipologia === 'OPERATIVO' ? 'Operativo' : 'Consultatore'} ·{' '}
                    {utente.aziendeIds.length === 0
                      ? 'nessuna azienda associata'
                      : utente.aziendeIds.map(nomeAzienda).join(', ')}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                      utente.attivo
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {utente.attivo ? 'Attivo' : 'Disabilitato'}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleApriPermessi(utente)}
                    className={`p-1.5 ${utentePermessiAperto === utente.id ? 'text-blue-600' : 'text-slate-400 hover:text-blue-600'}`}
                    title="Permessi per modulo"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRigeneraPassword(utente)}
                    className="p-1.5 text-slate-400 hover:text-amber-600"
                    title="Rigenera password"
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleStato(utente)}
                    className="p-1.5 text-slate-400 hover:text-red-600"
                    title={utente.attivo ? 'Disabilita' : 'Riattiva'}
                  >
                    {utente.attivo ? (
                      <Ban className="w-3.5 h-3.5" />
                    ) : (
                      <RotateCcw className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>

              {passwordAppenaGenerata?.utenteId === utente.id && (
                <div className="mt-1.5 ml-3 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5 flex items-center gap-2">
                  <span>
                    Password temporanea: <strong>{passwordAppenaGenerata.password}</strong>
                  </span>
                  <button
                    type="button"
                    onClick={() => navigator.clipboard.writeText(passwordAppenaGenerata.password)}
                    className="text-amber-700 hover:text-amber-900"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPasswordAppenaGenerata(null)}
                    className="ml-auto underline font-bold"
                  >
                    Chiudi
                  </button>
                </div>
              )}

              {utentePermessiAperto === utente.id && (
                <div className="mt-1.5 ml-3 border-l-2 border-blue-200 pl-3 py-2 space-y-2">
                  {caricamentoPermessi ? (
                    <p className="text-[11px] text-slate-400">Caricamento permessi...</p>
                  ) : (
                    MODULI_PERMESSO.map((modulo) => (
                      <div key={modulo} className="flex items-center justify-between gap-2">
                        <span className="text-[11px] text-slate-600 font-bold">
                          {ETICHETTE_MODULO[modulo]}
                        </span>
                        <select
                          value={permessiCorrenti[modulo] || 'NESSUNO'}
                          onChange={(e) =>
                            handleCambiaPermesso(
                              utente.id,
                              modulo,
                              e.target.value as LivelloPermesso
                            )
                          }
                          className="text-[10px] font-bold px-2 py-1 border border-slate-200 rounded text-slate-900 bg-white"
                        >
                          <option value="NESSUNO">Nessun accesso</option>
                          <option value="LETTURA">Sola lettura</option>
                          <option value="SCRITTURA">Lettura e scrittura</option>
                        </select>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
