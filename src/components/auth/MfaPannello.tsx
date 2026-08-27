'use client';

// Pannello MFA a tre fattori, mostrato dopo la password. Pilota la sequenza
// TOTP (enrollment o verifica) → PIN (impostazione o verifica) leggendo lo
// stato dal server (mfaStato) e avanzando a ogni passo superato. Al termine
// consegna al chiamante i dati di navigazione (ruolo/spazio).

import React, { useEffect, useState } from 'react';
import { ShieldCheck, KeyRound, Smartphone, Loader2 } from 'lucide-react';
import { mfaStato, mfaVerificaTotp, mfaInviaPin, mfaAnnulla } from '@/app/actions/mfa';
import type { StatoMfa, FattoreMfa } from '@/lib/mfa/tipi';

export interface EsitoMfaCompletato {
  role: 'SUPERADMIN' | 'USER';
  goToChoice: boolean;
  tenantName: string | null;
  tenantId: string | null;
}

interface Props {
  onCompletato: (esito: EsitoMfaCompletato) => void;
  onAnnulla: () => void;
}

export function MfaPannello({ onCompletato, onAnnulla }: Props) {
  const [stato, setStato] = useState<StatoMfa | null>(null);
  const [codice, setCodice] = useState('');
  const [pin, setPin] = useState('');
  const [pinConferma, setPinConferma] = useState('');
  const [errore, setErrore] = useState<string | null>(null);
  const [inCorso, setInCorso] = useState(false);
  const [mostraSegreto, setMostraSegreto] = useState(false);

  const caricaStato = async () => {
    const s = await mfaStato();
    if (!s.attivo) {
      // Challenge scaduta o assente: torna al login.
      onAnnulla();
      return;
    }
    setStato(s);
    setCodice('');
    setPin('');
    setPinConferma('');
  };

  useEffect(() => {
    caricaStato();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const gestisciEsito = async (r: Awaited<ReturnType<typeof mfaVerificaTotp>>) => {
    if (!r.success) {
      setErrore(r.error);
      return;
    }
    if (r.completato) {
      onCompletato({
        role: r.role,
        goToChoice: r.goToChoice,
        tenantName: r.tenantName,
        tenantId: r.tenantId,
      });
    } else {
      setErrore(null);
      await caricaStato();
    }
  };

  const submitTotp = async (e: React.FormEvent) => {
    e.preventDefault();
    setInCorso(true);
    setErrore(null);
    try {
      await gestisciEsito(await mfaVerificaTotp(codice));
    } finally {
      setInCorso(false);
    }
  };

  const submitPin = async (e: React.FormEvent) => {
    e.preventDefault();
    const fase = stato?.fase;
    if (fase === 'PIN_SETUP' && pin !== pinConferma) {
      setErrore('I due PIN non coincidono.');
      return;
    }
    setInCorso(true);
    setErrore(null);
    try {
      await gestisciEsito(await mfaInviaPin(pin));
    } finally {
      setInCorso(false);
    }
  };

  const annulla = async () => {
    await mfaAnnulla();
    onAnnulla();
  };

  const fase: FattoreMfa | undefined = stato?.fase;
  const passo = fase === 'TOTP_ENROLL' || fase === 'TOTP' ? 1 : fase ? 2 : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-950 via-slate-950 to-blue-900 flex items-center justify-center p-4 relative overflow-hidden">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl shadow-blue-950/50 p-8 space-y-5 border border-slate-200 animate-fade-in">
        <div className="text-center space-y-2">
          <div className="inline-flex p-2.5 rounded-xl bg-blue-50 text-blue-600">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <p className="text-[10px] font-bold text-slate-400 tracking-widest uppercase">
            Verifica in due passaggi · Fattore {passo} di 2
          </p>
        </div>

        {!stato ? (
          <div className="flex items-center justify-center gap-2 text-sm text-slate-400 py-6">
            <Loader2 className="w-4 h-4 animate-spin" /> Caricamento…
          </div>
        ) : fase === 'TOTP_ENROLL' ? (
          <form onSubmit={submitTotp} className="space-y-4">
            <div className="text-center">
              <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                <Smartphone className="w-4 h-4 text-blue-600" /> Configura l&apos;app authenticator
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Inquadra il QR con Google Authenticator, Microsoft Authenticator o simili, poi
                inserisci il codice a 6 cifre generato.
              </p>
            </div>
            {stato.enroll && (
              <div className="flex flex-col items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={stato.enroll.qrDataUrl}
                  alt="QR per configurare l'app authenticator"
                  className="w-44 h-44 border border-slate-200 rounded-lg"
                />
                <button
                  type="button"
                  onClick={() => setMostraSegreto((v) => !v)}
                  className="text-[10px] text-blue-600 hover:underline uppercase tracking-wider font-bold"
                >
                  {mostraSegreto ? 'Nascondi chiave' : 'Non puoi scansionare? Mostra la chiave'}
                </button>
                {mostraSegreto && (
                  <code className="text-[11px] font-mono bg-slate-50 border border-slate-200 rounded px-2 py-1 break-all text-slate-700 select-all">
                    {stato.enroll.segreto}
                  </code>
                )}
              </div>
            )}
            <CampoCodice valore={codice} onChange={setCodice} />
            {errore && <Errore testo={errore} />}
            <Bottone inCorso={inCorso} testo="Attiva e continua" />
          </form>
        ) : fase === 'TOTP' ? (
          <form onSubmit={submitTotp} className="space-y-4">
            <div className="text-center">
              <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                <Smartphone className="w-4 h-4 text-blue-600" /> Codice dall&apos;app authenticator
              </div>
              <p className="text-[11px] text-slate-500">Inserisci il codice a 6 cifre corrente.</p>
            </div>
            <CampoCodice valore={codice} onChange={setCodice} />
            {errore && <Errore testo={errore} />}
            <Bottone inCorso={inCorso} testo="Verifica codice" />
          </form>
        ) : fase === 'PIN_SETUP' ? (
          <form onSubmit={submitPin} className="space-y-4">
            <div className="text-center">
              <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                <KeyRound className="w-4 h-4 text-blue-600" /> Imposta il tuo PIN
              </div>
              <p className="text-[11px] text-slate-500">
                Un PIN personale di 4-6 cifre, distinto dalla password. Ti verrà chiesto a ogni
                accesso.
              </p>
            </div>
            <CampoPin valore={pin} onChange={setPin} placeholder="Nuovo PIN" />
            <CampoPin valore={pinConferma} onChange={setPinConferma} placeholder="Conferma PIN" />
            {errore && <Errore testo={errore} />}
            <Bottone inCorso={inCorso} testo="Imposta PIN e accedi" />
          </form>
        ) : fase === 'PIN' ? (
          <form onSubmit={submitPin} className="space-y-4">
            <div className="text-center">
              <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                <KeyRound className="w-4 h-4 text-blue-600" /> Inserisci il PIN
              </div>
              <p className="text-[11px] text-slate-500">Il tuo PIN personale di accesso.</p>
            </div>
            <CampoPin valore={pin} onChange={setPin} placeholder="PIN" />
            {errore && <Errore testo={errore} />}
            <Bottone inCorso={inCorso} testo="Accedi" />
          </form>
        ) : null}

        <button
          type="button"
          onClick={annulla}
          className="w-full text-[10px] text-slate-400 hover:text-blue-600 uppercase tracking-wider transition-colors"
        >
          ← Torna al login
        </button>
      </div>
    </div>
  );
}

function CampoCodice({ valore, onChange }: { valore: string; onChange: (v: string) => void }) {
  return (
    <input
      type="text"
      inputMode="numeric"
      autoComplete="one-time-code"
      value={valore}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
      placeholder="000000"
      autoFocus
      className="w-full px-3 py-3 bg-slate-50 border border-slate-300 rounded-lg text-center text-2xl font-mono tracking-[0.4em] text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
    />
  );
}

function CampoPin({
  valore,
  onChange,
  placeholder,
}: {
  valore: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <input
      type="password"
      inputMode="numeric"
      autoComplete="off"
      value={valore}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
      placeholder={placeholder}
      className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-center text-lg font-mono tracking-[0.3em] text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
    />
  );
}

function Errore({ testo }: { testo: string }) {
  return (
    <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
      {testo}
    </div>
  );
}

function Bottone({ inCorso, testo }: { inCorso: boolean; testo: string }) {
  return (
    <button
      type="submit"
      disabled={inCorso}
      className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-bold rounded-lg uppercase tracking-wider text-xs shadow-lg shadow-blue-600/25 transition-all hover:shadow-xl hover:shadow-blue-600/30 hover:-translate-y-0.5"
    >
      {inCorso ? 'Verifica in corso…' : testo}
    </button>
  );
}
