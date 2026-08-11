'use client';

import { useState, useEffect } from 'react';

export const dynamic = 'force-dynamic';

// ==========================================
// INTERFACCIA E TIPOLOGIA DATI FINANZIARI
// ==========================================
interface PeriodoPrevisionale {
  periodoId: number;
  denominazione: string; // Es. "Semestre 1", "Anno 2026"
  flussoInboundAtteso: number;
  flussoOutboundAtteso: number;
  flussoNettoNominale: number; // Calcolato: Inbound - Outbound
  fattoreSconto: number; // Calcolato: 1 / (1 + r)^t
  flussoAttualizzato: number; // Calcolato: FlussoNetto * FattoreSconto
}

interface ParametriManovra {
  tassoScontoAnnuo: number; // Espresso in percentuale (es. 6.5 per 6.5%)
  massaDebitoriaTotale: number; // Debito complessivo oggetto di ristrutturazione/accordo
  stralcioPropostoPercentuale: number; // Saldo e stralcio (es. 20%)
}

export default function TabAttualizzato() {
  // ==========================================
  // STATO INIZIALE DEI PARAMETRI FINANZIARI
  // ==========================================
  const [parametri, setParametri] = useState<ParametriManovra>({
    tassoScontoAnnuo: 6.0, // Tasso di attualizzazione stimato (WACC adjusted per il rischio)
    massaDebitoriaTotale: 280000.0, // Debito complessivo censito nei moduli precedenti
    stralcioPropostoPercentuale: 15, // Percentuale di abbattimento ipotizzata nell'accordo di ristrutturazione
  });

  const [pianiPrevisionali, setPianiPrevisionali] = useState<PeriodoPrevisionale[]>([
    {
      periodoId: 1,
      denominazione: 'Semestre 1 (Rilancio)',
      flussoInboundAtteso: 180000.0,
      flussoOutboundAtteso: 155000.0,
      flussoNettoNominale: 0,
      fattoreSconto: 0,
      flussoAttualizzato: 0,
    },
    {
      periodoId: 2,
      denominazione: 'Semestre 2 (Regime)',
      flussoInboundAtteso: 210000.0,
      flussoOutboundAtteso: 168000.0,
      flussoNettoNominale: 0,
      fattoreSconto: 0,
      flussoAttualizzato: 0,
    },
    {
      periodoId: 3,
      denominazione: 'Semestre 3 (Sviluppo)',
      flussoInboundAtteso: 235000.0,
      flussoOutboundAtteso: 172000.0,
      flussoNettoNominale: 0,
      fattoreSconto: 0,
      flussoAttualizzato: 0,
    },
    {
      periodoId: 4,
      denominazione: 'Semestre 4 (Consolidamento)',
      flussoInboundAtteso: 250000.0,
      flussoOutboundAtteso: 180000.0,
      flussoNettoNominale: 0,
      fattoreSconto: 0,
      flussoAttualizzato: 0,
    },
    {
      periodoId: 5,
      denominazione: 'Semestre 5 (Maturità)',
      flussoInboundAtteso: 260000.0,
      flussoOutboundAtteso: 185000.0,
      flussoNettoNominale: 0,
      fattoreSconto: 0,
      flussoAttualizzato: 0,
    },
    {
      periodoId: 6,
      denominazione: 'Semestre 6 (Target)',
      flussoInboundAtteso: 275000.0,
      flussoOutboundAtteso: 190000.0,
      flussoNettoNominale: 0,
      fattoreSconto: 0,
      flussoAttualizzato: 0,
    },
  ]);

  // ==========================================
  // MOTORE DI CALCOLO ATTUARIALE / DCF
  // ==========================================
  const calcolaModelloFinanziario = () => {
    // Nota tecnica: Trattandosi di scadenze semestrali, il tasso annuo viene convertito in tasso semestrale equivalente
    // Formila tasso equivalente: r_semestrale = (1 + r_annuo)^(1/2) - 1
    const rAnnuoDecimale: number = parametri.tassoScontoAnnuo / 100;
    const rSemestrale = Math.pow(1 + rAnnuoDecimale, 0.5) - 1;

    return pianiPrevisionali.map((piano) => {
      const nettoNominale = piano.flussoInboundAtteso - piano.flussoOutboundAtteso;
      // t rappresenta l'esponente temporale (il numero del semestre)
      const fattore = 1 / Math.pow(1 + rSemestrale, piano.periodoId);
      const attualizzato = nettoNominale * fattore;

      return {
        ...piano,
        flussoNettoNominale: nettoNominale,
        fattoreSconto: fattore,
        flussoAttualizzato: attualizzato,
      };
    });
  };

  const pianiCalcolati = calcolaModelloFinanziario();

  // Consolidamento dei totali di sintesi
  const totaleFlussiNominali = pianiCalcolati.reduce((acc, c) => acc + c.flussoNettoNominale, 0);
  const valoreAttualeDeiFlussi = pianiCalcolati.reduce((acc, c) => acc + c.flussoAttualizzato, 0);

  // Calcolo della massa debitoria netta post stralcio legale cooperativo
  const debitoAbbattuto =
    (parametri.massaDebitoriaTotale * parametri.stralcioPropostoPercentuale) / 100;
  const debitoRistrutturatoTarget = parametri.massaDebitoriaTotale - debitoAbbattuto;

  // Il Valore Attuale Netto (VAN) della manovra indica se i flussi generati coprono il debito residuo
  const vanManovraRisanamento = valoreAttualeDeiFlussi - debitoRistrutturatoTarget;
  const indiceCoperturaFlussi =
    debitoRistrutturatoTarget > 0 ? valoreAttualeDeiFlussi / debitoRistrutturatoTarget : 0;

  // ==========================================
  // GESTIONE DEGLI INPUT DELLO UTENTE
  // ==========================================
  const aggiornaValoreFlusso = (periodoId: number, campo: 'IN' | 'OUT', valoreStr: string) => {
    const valoreNum = parseFloat(valoreStr) || 0;
    setPianiPrevisionali((prev) =>
      prev.map((p) => {
        if (p.periodoId === periodoId) {
          return {
            ...p,
            flussoInboundAtteso: campo === 'IN' ? valoreNum : p.flussoInboundAtteso,
            flussoOutboundAtteso: campo === 'OUT' ? valoreNum : p.flussoOutboundAtteso,
          };
        }
        return p;
      })
    );
  };

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* SEZIONE INTESTAZIONE TAVOLA FINANZIARIA */}
      <div className="bg-slate-900 text-white p-6 rounded-xl border border-slate-800 shadow-lg flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 bg-indigo-500 rounded text-[10px] font-bold font-mono tracking-wider">
              MOD_02_DCF
            </span>
            <h3 className="text-lg font-bold tracking-tight">
              Attualizzazione Flussi Previsionali & Sostenibilità Manovra
            </h3>
          </div>
          <p className="text-slate-400 text-xs mt-1">
            Algoritmo di attualizzazione finanziaria dei flussi di cassa liberi (FCFE) generati dal
            piano industriale per la verifica della sostenibilità del debito ristrutturato.
          </p>
        </div>
      </div>

      {/* DASHBOARD DELLE METRICHE DI SOGLIA E SOSTENIBILITÀ CRITICA */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="bg-white p-5 border border-slate-200 rounded-xl shadow-xs">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
            Valore Attuale dei Flussi (DCF)
          </span>
          <div className="text-xl font-mono font-black text-slate-900 mt-1">
            €{' '}
            {valoreAttualeDeiFlussi.toLocaleString('it-IT', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            Capacità di generazione monetaria effettiva attualizzata al tasso del{' '}
            <span className="font-bold text-slate-600">{parametri.tassoScontoAnnuo}%</span>.
          </p>
        </div>

        <div className="bg-white p-5 border border-slate-200 rounded-xl shadow-xs">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
            Fabbisogno Ristrutturato Target
          </span>
          <div className="text-xl font-mono font-black text-blue-700 mt-1">
            €{' '}
            {debitoRistrutturatoTarget.toLocaleString('it-IT', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            Massa originaria ridotta del{' '}
            <span className="font-bold text-slate-600">
              {parametri.stralcioPropostoPercentuale}%
            </span>{' '}
            (Abbattimento: € {debitoAbbattuto.toLocaleString('it-IT')}).
          </p>
        </div>

        <div
          className={`p-5 border rounded-xl shadow-xs transition-colors ${
            vanManovraRisanamento >= 0
              ? 'bg-emerald-50/60 border-emerald-200'
              : 'bg-rose-50/60 border-rose-200'
          }`}
        >
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
            Surplus / Deficit di Manovra (VAN)
          </span>
          <div
            className={`text-xl font-mono font-black mt-1 ${vanManovraRisanamento >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}
          >
            €{' '}
            {vanManovraRisanamento.toLocaleString('it-IT', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </div>
          <div className="text-[11px] mt-1 font-medium">
            {vanManovraRisanamento >= 0 ? (
              <span className="text-emerald-700">
                ✓ PIANO CAPACE: I flussi coprono interamente gli impegni finanziari concordati.
              </span>
            ) : (
              <span className="text-rose-700 font-bold">
                🛑 INSUFFICIENZA: Flussi insufficienti. Rivedere lo stralcio o ottimizzare i costi
                op.
              </span>
            )}
          </div>
        </div>
      </div>

      {/* PANNELLO DI CONFIGURAZIONE DEI PARAMETRI FINANZIARI DI BASE */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block mb-4">
          Configurazione Variabili di Attualizzazione e Ristrutturazione Coatta
        </span>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <label className="block text-[11px] uppercase font-bold text-slate-500 mb-1.5">
              Tasso Sconto Annuo (WACC / Costo Capitale %)
            </label>
            <input
              type="number"
              step="0.1"
              value={parametri.tassoScontoAnnuo}
              onChange={(e) =>
                setParametri({ ...parametri, tassoScontoAnnuo: parseFloat(e.target.value) || 0 })
              }
              className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg font-mono text-xs font-bold text-slate-800 focus:outline-none focus:border-indigo-600 focus:bg-white"
            />
          </div>

          <div>
            <label className="block text-[11px] uppercase font-bold text-slate-500 mb-1.5">
              Massa Debitoria Complessiva Censita (€)
            </label>
            <input
              type="number"
              value={parametri.massaDebitoriaTotale}
              onChange={(e) =>
                setParametri({
                  ...parametri,
                  massaDebitoriaTotale: parseFloat(e.target.value) || 0,
                })
              }
              className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg font-mono text-xs font-bold text-slate-800 focus:outline-none focus:border-indigo-600 focus:bg-white"
            />
          </div>

          <div>
            <label className="block text-[11px] uppercase font-bold text-slate-500 mb-1.5">
              Percentuale di Stralcio Ipotizzata (%)
            </label>
            <input
              type="number"
              max="100"
              value={parametri.stralcioPropostoPercentuale}
              onChange={(e) =>
                setParametri({
                  ...parametri,
                  stralcioPropostoPercentuale: parseFloat(e.target.value) || 0,
                })
              }
              className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg font-mono text-xs font-bold text-slate-800 focus:outline-none focus:border-indigo-600 focus:bg-white"
            />
          </div>
        </div>
      </div>

      {/* MATRICE DINAMICA DI INPUT ED ELABORAZIONE FLUSSI PREVISIONALI */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <h4 className="font-bold text-slate-900 text-sm">
            Sviluppo della Pipeline Finanziaria Previsionale (DCF Matrix)
          </h4>
          <p className="text-xs text-slate-400 mt-0.5">
            Modifica le entrate e le uscite stimate per ciascun orizzonte per ricalcolare in tempo
            reale i fattori di sconto attuariali.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                <th className="p-3 font-mono">Index (t)</th>
                <th className="p-3">Orizzonte Temporale</th>
                <th className="p-3 w-[20%]">Flussi di Cassa Entrate (€)</th>
                <th className="p-3 w-[20%]">Flussi di Cassa Uscite (€)</th>
                <th className="p-3 text-right">Saldo Nominale Periodo (€)</th>
                <th className="p-3 text-right font-mono">Fattore Sconto [1/(1+r)^t]</th>
                <th className="p-3 text-right font-bold text-indigo-900 bg-indigo-50/40">
                  Flusso Attualizzato (€)
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {pianiCalcolati.map((piano) => (
                <tr key={piano.periodoId} className="hover:bg-slate-50/50 transition-colors">
                  <td className="p-3 font-mono text-slate-400">t = {piano.periodoId}</td>
                  <td className="p-3 font-bold text-slate-900">{piano.denominazione}</td>

                  {/* Input Entrate */}
                  <td className="p-3">
                    <input
                      type="number"
                      value={piano.flussoInboundAtteso}
                      onChange={(e) => aggiornaValoreFlusso(piano.periodoId, 'IN', e.target.value)}
                      className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-xs font-mono font-bold focus:outline-none focus:border-indigo-500"
                    />
                  </td>

                  {/* Input Uscite */}
                  <td className="p-3">
                    <input
                      type="number"
                      value={piano.flussoOutboundAtteso}
                      onChange={(e) => aggiornaValoreFlusso(piano.periodoId, 'OUT', e.target.value)}
                      className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-xs font-mono font-bold focus:outline-none focus:border-indigo-500"
                    />
                  </td>

                  {/* Saldo Nominale Calcolato */}
                  <td
                    className={`p-3 text-right font-mono font-bold ${piano.flussoNettoNominale >= 0 ? 'text-slate-700' : 'text-rose-600'}`}
                  >
                    €{' '}
                    {piano.flussoNettoNominale.toLocaleString('it-IT', {
                      minimumFractionDigits: 2,
                    })}
                  </td>

                  {/* Fattore di Sconto Sviluppato */}
                  <td className="p-3 text-right font-mono text-slate-500 text-[11px]">
                    {piano.fattoreSconto.toFixed(5)}
                  </td>

                  {/* Flusso Attualizzato Risultante */}
                  <td
                    className={`p-3 text-right font-mono font-black bg-indigo-50/20 ${piano.flussoAttualizzato >= 0 ? 'text-indigo-900' : 'text-rose-700'}`}
                  >
                    €{' '}
                    {piano.flussoAttualizzato.toLocaleString('it-IT', { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}
            </tbody>

            {/* RIGA DEI TOTALI DI RACCORDO */}
            <tfoot>
              <tr className="bg-slate-50 font-black border-t-2 border-slate-200 text-slate-900">
                <td colSpan={2} className="p-4 text-xs uppercase font-extrabold tracking-wider">
                  Totale Consolidato Previsionale
                </td>
                <td className="p-4"></td>
                <td className="p-4"></td>
                <td className="p-4 text-right font-mono">
                  € {totaleFlussiNominali.toLocaleString('it-IT', { minimumFractionDigits: 2 })}
                </td>
                <td className="p-4"></td>
                <td className="p-4 text-right font-mono text-indigo-900 bg-indigo-50 border-l border-indigo-100 text-sm">
                  € {valoreAttualeDeiFlussi.toLocaleString('it-IT', { minimumFractionDigits: 2 })}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* METRICHE COMPLEMENTARI DI COPERTURA E DEPOSITI DB */}
      <div className="flex flex-col sm:flex-row justify-between items-center bg-slate-100 rounded-xl p-4 border border-slate-200 text-xs gap-3">
        <div className="font-mono text-slate-600">
          Indice di Copertura Finanziaria del Piano (PV/Debt):{' '}
          <span
            className={`font-black px-1.5 py-0.5 rounded ${indiceCoperturaFlussi >= 1 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}
          >
            {indiceCoperturaFlussi.toFixed(2)}x
          </span>
        </div>
        <div className="text-[11px] text-slate-400 font-mono text-right">
          Database Target Allineato:{' '}
          <span className="font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">
            tb_flussi_attualizzati
          </span>
        </div>
      </div>
    </div>
  );
}
