'use client';

// Barra di stato condivisa tra Superadmin, Admin di Spazio e Operatore —
// stesso contenuto, stessa posizione (in alto a destra), non più
// "Disconnetti" in un punto diverso a seconda del ruolo. Orologio dal
// vivo perché è gratis da avere una volta che c'è già un Client
// Component qui, e utile per chi lavora su più fusi/sessioni.

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { eseguiLogout } from '@/app/actions/auth';
import { APP_VERSION, PORTABLE_VERSION } from '@/lib/appVersion';
import { testoCopyright } from '@/lib/copyright';

// Bundle compilato per l'edizione portable? Il flag è inlinato al build da
// build-portable.mjs (NEXT_PUBLIC_PORTABLE=1); nel build cloud è assente.
const IS_PORTABLE = process.env.NEXT_PUBLIC_PORTABLE === '1';
const ETICHETTA_VERSIONE = IS_PORTABLE ? `Portable v${PORTABLE_VERSION}` : `v${APP_VERSION}`;

interface Props {
  nomeUtente: string;
  ruolo: string;
  variante?: 'chiaro' | 'scuro';
}

function formattaOra(data: Date): string {
  return data.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

function formattaData(data: Date): string {
  return data.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function TopStatusBar({ nomeUtente, ruolo, variante = 'chiaro' }: Props) {
  const router = useRouter();
  const [ora, setOra] = useState<Date | null>(null);

  useEffect(() => {
    setOra(new Date());
    const timer = setInterval(() => setOra(new Date()), 1000 * 30);
    return () => clearInterval(timer);
  }, []);

  const handleLogout = async () => {
    await eseguiLogout();
    router.push('/');
  };

  const scuro = variante === 'scuro';

  return (
    <div
      className={`flex items-center justify-end gap-4 px-4 py-2 text-[11px] border-b ${
        scuro
          ? 'bg-brand-notte border-slate-800 text-slate-400'
          : 'bg-white border-slate-200 text-slate-500'
      }`}
    >
      <div className="flex items-center gap-1.5">
        <span
          className={`font-bold uppercase tracking-wider ${scuro ? 'text-slate-200' : 'text-slate-700'}`}
        >
          {nomeUtente}
        </span>
        <span
          className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
            scuro
              ? 'bg-brand-analisi/20 text-brand-analisi'
              : 'bg-brand-analisi/10 text-brand-analisi'
          }`}
        >
          {ruolo}
        </span>
      </div>

      {ora && (
        <span className="hidden sm:inline tabular-nums">
          {formattaData(ora)} · {formattaOra(ora)}
        </span>
      )}

      <span className="hidden lg:inline opacity-70">{testoCopyright()}</span>

      <span className="hidden md:inline font-mono opacity-60">{ETICHETTA_VERSIONE}</span>

      <button
        type="button"
        onClick={handleLogout}
        className={`flex items-center gap-1.5 font-bold uppercase tracking-wider transition-colors ${
          scuro
            ? 'text-slate-400 hover:text-brand-impulso'
            : 'text-slate-500 hover:text-brand-impulso'
        }`}
      >
        <LogOut className="w-3 h-3" />
        Disconnetti
      </button>
    </div>
  );
}
