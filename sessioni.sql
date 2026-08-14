'use client';

// Login reale del sistema. Dopo l'autenticazione del superadmin, uno step
// intermedio chiede dove vuole operare: la propria dashboard operativa, o
// un singolo spazio da ispezionare (modalità "salvagente", vedi
// entraComeSalvagenteAction). Se non esiste ancora nessuno spazio
// provisionato, la combo mostra solo la scelta della dashboard.

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { eseguiAutenticazione } from '@/app/actions/auth';
import {
  ottieniSpaziPerScelta,
  entraComeSalvagenteAction,
  type SpazioPerScelta,
} from '@/app/actions/spazi';
import { Logo } from '@/components/brand/Logo';
import { APP_VERSION, PORTABLE_VERSION } from '@/lib/appVersion';

const DASHBOARD_VALUE = '__dashboard__';

// Versione mostrata in fondo alla pagina di login. Presa dalle costanti di
// appVersion.ts — NON importando package.json, che (a) trascinerebbe l'intero
// package.json nel bundle client e (b) fa sì che il resolver di webpack
// legga i package.json come "directory description file", rompendo la build
// se ne trova uno malformato nell'albero (es. uno spurio in src/).
const ETICHETTA_VERSIONE =
  process.env.NEXT_PUBLIC_PORTABLE === '1' ? `Portable v${PORTABLE_VERSION}` : `v${APP_VERSION}`;

/** Il tracciato ECG del logo, ripetuto come filo conduttore sottile
 * lungo il bordo della schermata — un solo elemento di rischio
 * estetico, il resto della pagina resta disciplinato. */
function TracciatoDiSfondo() {
  return (
    <svg
      viewBox="0 0 400 60"
      preserveAspectRatio="none"
      className="absolute inset-x-0 top-0 w-full h-16 text-white/10"
      aria-hidden="true"
    >
      <path
        d="M 0 30 L 90 30 L 105 8 L 125 52 L 145 30 L 220 30 L 235 12 L 255 48 L 275 30 L 400 30"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [utente, setUtente] = useState('');
  const [password, setPassword] = useState('');
  const [caricamento, setCaricamento] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  // Step 2: scelta destinazione (solo per il superadmin)
  const [mostraSceltaDestinazione, setMostraSceltaDestinazione] = useState(false);
  const [spaziDisponibili, setSpaziDisponibili] = useState<SpazioPerScelta[]>([]);
  const [destinazioneScelta, setDestinazioneScelta] = useState(DASHBOARD_VALUE);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCaricamento(true);
    setErrore(null);

    try {
      const risultato = await eseguiAutenticazione(utente, password);

      if (!risultato.success) {
        setErrore(risultato.error || 'Credenziali non valide.');
        return;
      }

      if (risultato.role === 'SUPERADMIN') {
        const spazi = await ottieniSpaziPerScelta();
        setSpaziDisponibili(spazi);
        setDestinazioneScelta(DASHBOARD_VALUE);
        setMostraSceltaDestinazione(true);
      } else {
        router.push(`/spazio/${risultato.tenantName}`);
      }
    } catch (err) {
      console.error('Errore durante il login:', err);
      setErrore('Errore imprevisto durante il login. Riprova.');
    } finally {
      setCaricamento(false);
    }
  };

  const handleContinua = async () => {
    if (destinazioneScelta === DASHBOARD_VALUE) {
      router.push('/superadmin/Parametri');
      return;
    }

    setCaricamento(true);
    setErrore(null);
    try {
      const spazio = spaziDisponibili.find((s) => String(s.id) === destinazioneScelta);
      if (!spazio) return;

      const risultato = await entraComeSalvagenteAction(spazio.id);
      if (!risultato.success) {
        setErrore(risultato.error || 'Impossibile entrare in questo spazio.');
        return;
      }
      window.open(`/spazio/${spazio.codice}`, '_blank', 'noopener,noreferrer');
      router.push('/superadmin/Parametri');
    } catch (err) {
      console.error("Errore durante l'ingresso nello spazio:", err);
      setErrore('Impossibile completare la richiesta. Verifica la connessione.');
    } finally {
      setCaricamento(false);
    }
  };

  if (mostraSceltaDestinazione) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-950 via-slate-950 to-blue-900 flex items-center justify-center p-4 relative overflow-hidden">
        <TracciatoDiSfondo />
        <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl shadow-blue-950/50 p-8 space-y-6 border border-slate-200 animate-fade-in">
          <div className="text-center space-y-2">
            <Logo variante="icon" dimensione={44} className="mx-auto" />
            <p className="text-[10px] font-bold text-slate-400 tracking-widest uppercase">
              Dove vuoi operare?
            </p>
          </div>

          {errore && (
            <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
              {errore}
            </div>
          )}

          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
              Destinazione
            </label>
            <select
              value={destinazioneScelta}
              onChange={(e) => setDestinazioneScelta(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value={DASHBOARD_VALUE}>👑 La mia Dashboard Operativa (superadmin)</option>
              {spaziDisponibili.map((s) => (
                <option key={s.id} value={String(s.id)}>
                  🏢 {s.descrizione} ({s.codice})
                </option>
              ))}
            </select>
            {spaziDisponibili.length === 0 && (
              <p className="text-[10px] text-slate-400 mt-1">
                Nessuno spazio ancora provisionato: solo la dashboard è disponibile per ora.
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={handleContinua}
            disabled={caricamento}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-bold rounded-lg uppercase tracking-wider text-xs shadow-lg shadow-blue-600/25 transition-all hover:shadow-xl hover:shadow-blue-600/30 hover:-translate-y-0.5"
          >
            {caricamento ? 'Ingresso in corso...' : 'Continua'}
          </button>

          <button
            type="button"
            onClick={() => setMostraSceltaDestinazione(false)}
            className="w-full text-[10px] text-slate-400 hover:text-blue-600 uppercase tracking-wider transition-colors"
          >
            ← Torna al login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-950 via-slate-950 to-blue-900 flex items-center justify-center p-4 relative overflow-hidden">
      <TracciatoDiSfondo />
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl shadow-blue-950/50 p-8 space-y-6 border border-slate-200 animate-fade-in">
        <div className="text-center space-y-1">
          <Logo variante="full" dimensione={40} className="justify-center" />
          <p className="text-[10px] font-bold text-slate-400 tracking-widest uppercase pt-1">
            Controllo Crisi d&apos;Impresa
          </p>
        </div>
        <div className="text-center pt-2 border-t border-slate-100">
          <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider font-display">
            Porta di Accesso Unica
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
              Nome utente
            </label>
            <input
              type="text"
              value={utente}
              onChange={(e) => setUtente(e.target.value)}
              placeholder="es. mario.rossi"
              autoComplete="username"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 transition-shadow"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
              Parola chiave
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 transition-shadow"
            />
          </div>

          {errore && (
            <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
              {errore}
            </div>
          )}

          <button
            type="submit"
            disabled={caricamento}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-bold rounded-lg uppercase tracking-wider text-xs shadow-lg shadow-blue-600/25 transition-all hover:shadow-xl hover:shadow-blue-600/30 hover:-translate-y-0.5"
          >
            {caricamento ? 'Verifica in corso...' : 'Autenticazione Sistema'}
          </button>
        </form>

        <div className="pt-4 border-t border-slate-100 text-center">
          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">
            Architettura Postgres dinamica per schema attiva
          </span>
          <span className="text-[9px] text-slate-300 font-mono block mt-1">
            {ETICHETTA_VERSIONE}
          </span>
        </div>
      </div>
    </div>
  );
}
