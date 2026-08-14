'use client';

import React from 'react';
import { usePathname, useRouter } from 'next/navigation';

interface Step {
  numero: number;
  label: string;
  rotta: string;
}

export default function XbrlWizardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const steps: Step[] = [
    { numero: 1, label: 'Acquisizione & Validazione', rotta: 'superadmin/xbrl/caricamento' },
    { numero: 2, label: 'Verifica & Parificazione Tag', rotta: 'superadmin/xbrl/parificazione' },
    //    { numero: 3, label: 'Prospetti Riclassificazione', rotta: 'superadmin/xbrl/riclassificazione' },
    //    { numero: 4, label: 'Analisi Nota Integrativa', rotta: 'superadmin/xbrl/nota-integrativa' },
  ];

  const stepCorrenteIndex = steps.findIndex((s) => s.rotta === pathname);
  const stepCorrente = steps[stepCorrenteIndex] || steps[0];

  const gestisciIndietro = () => {
    if (stepCorrenteIndex > 0) {
      router.push(steps[stepCorrenteIndex - 1].rotta);
    }
  };

  const gestisciAvanti = () => {
    if (stepCorrenteIndex < steps.length - 1) {
      router.push(steps[stepCorrenteIndex + 1].rotta);
    }
  };

  return (
    <div className="w-full min-h-screen bg-slate-50 flex flex-col font-mono text-xs">
      {/* Barra di Controllo Navigazione Superiore (Wizard) */}
      <div className="bg-white border-b border-slate-200 p-4 sticky top-0 z-30 shadow-sm">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          {/* Pulsantiera di orientamento nativa */}
          <div className="flex items-center gap-2">
            <button
              onClick={gestisciIndietro}
              disabled={stepCorrenteIndex <= 0}
              className="px-3 py-1.5 border border-slate-200 rounded-lg text-slate-600 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white font-bold transition-colors"
            >
              ◀ APPLICAZIONE INDIETRO
            </button>
            <button
              onClick={gestisciAvanti}
              disabled={stepCorrenteIndex >= steps.length - 1}
              className="px-3 py-1.5 bg-slate-900 text-white rounded-lg hover:bg-slate-800 disabled:opacity-40 font-bold transition-colors"
            >
              AVANTI STEP ▶
            </button>
          </div>

          {/* Indicatore Visivo Progressivo dei 4 Step */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl overflow-x-auto">
            {steps.map((s, idx) => {
              const isAttivo = s.rotta === pathname;
              const isPrecedente = idx < stepCorrenteIndex;

              return (
                <div
                  key={s.numero}
                  className={`px-3 py-1.5 rounded-lg font-bold text-[10px] whitespace-nowrap transition-all ${
                    isAttivo
                      ? 'bg-blue-600 text-white shadow-sm'
                      : isPrecedente
                        ? 'text-emerald-700 bg-emerald-50 border border-emerald-100'
                        : 'text-slate-400 bg-transparent'
                  }`}
                >
                  {s.numero}. {s.label}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Area Contenuto Dinamico dello Step */}
      <main className="flex-1 p-6">
        <div className="max-w-7xl mx-auto space-y-4">
          <div className="bg-slate-900 text-slate-400 p-3 rounded-xl border border-slate-800 flex justify-between items-center text-[10px]">
            <span>
              FLUSSO DI CONFIGURAZIONE ATTIVO:{' '}
              <strong className="text-white uppercase">{stepCorrente.label}</strong>
            </span>
            <span className="text-blue-400 font-bold bg-blue-950 px-2 py-0.5 rounded border border-blue-900/50">
              STEP {stepCorrente.numero} DI 4
            </span>
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
