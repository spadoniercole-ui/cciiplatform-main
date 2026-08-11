import React from 'react';

export type AlertSeverity = 'GREEN' | 'YELLOW' | 'RED';

export interface CndcecStep1Data {
  patrimonioNettoContabile: number;
  rettifichePatrimonioNetto: number;
  patrimonioNettoRettificato: number;
  isSuperato: boolean;
}

export interface CndcecStep2Summary {
  indiciTotali: number;
  indiciOltreSoglia: number;
  isAllertaScattata: boolean;
}

export interface CndcecKeyMetrics {
  ricaviVendite: number;
  totaleDebiti: number;
  debitiTributariPrevidenziali: number;
  utileEsercizio: number;
}

export interface CndcecDashboardProps {
  spazioCodice: string;
  spazioDescrizione: string;
  settoreAtecoLabel: string;
  severity: AlertSeverity;
  step1: CndcecStep1Data;
  step2: CndcecStep2Summary;
  metrics: CndcecKeyMetrics;
  onSwitchToMatriceTab: () => void;
  onSwitchToAiTab: () => void;
}

export const CndcecDashboard: React.FC<CndcecDashboardProps> = ({
  spazioCodice,
  spazioDescrizione,
  settoreAtecoLabel,
  severity,
  step1,
  step2,
  metrics,
  onSwitchToMatriceTab,
  onSwitchToAiTab,
}) => {
  const getBadgeStyle = (sev: AlertSeverity) => {
    switch (sev) {
      case 'GREEN':
        return 'bg-emerald-100 text-emerald-800 border-emerald-300';
      case 'YELLOW':
        return 'bg-amber-100 text-amber-800 border-amber-300';
      case 'RED':
        return 'bg-rose-100 text-rose-800 border-rose-300';
    }
  };

  const getSeverityText = (sev: AlertSeverity) => {
    switch (sev) {
      case 'GREEN':
        return 'Nessun Segnale di Crisi';
      case 'YELLOW':
        return 'Soglie di Attenzione Superate';
      case 'RED':
        return 'Allerta Crisi Confermata ex Art. 3 CCII';
    }
  };

  return (
    <div className="space-y-6 text-slate-800">
      {/* Header Stato Generale */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-lg gap-4">
        <div>
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            {spazioCodice}
          </div>
          <h2 className="text-xl font-bold text-slate-900">{spazioDescrizione}</h2>
          <p className="text-sm text-slate-600 mt-1">
            Settore ATECO applicato:{' '}
            <span className="font-medium text-slate-900">{settoreAtecoLabel}</span>
          </p>
        </div>
        <div>
          <span
            className={`inline-block px-3 py-1.5 border text-sm font-semibold rounded-full ${getBadgeStyle(
              severity
            )}`}
          >
            {getSeverityText(severity)}
          </span>
        </div>
      </div>

      {/* Grid Step 1 & Step 2 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Step 1: Patrimonio Netto */}
        <div className="p-5 bg-white border border-slate-200 rounded-lg shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-start mb-3">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500">
                Step 1: Test Patrimonio Netto
              </h3>
              <span
                className={`text-xs px-2 py-0.5 rounded font-medium ${
                  step1.isSuperato ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                }`}
              >
                {step1.isSuperato ? 'Capiente' : 'Azzerato / Negativo'}
              </span>
            </div>
            <div className="text-2xl font-bold text-slate-900 mb-4">
              € {step1.patrimonioNettoRettificato.toLocaleString('it-IT')}
            </div>
            <div className="space-y-2 text-sm text-slate-600 border-t border-slate-100 pt-3">
              <div className="flex justify-between">
                <span>PN Contabile:</span>
                <span className="font-mono">
                  € {step1.patrimonioNettoContabile.toLocaleString('it-IT')}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Rettifiche / Crediti Soci:</span>
                <span className="font-mono">
                  € {step1.rettifichePatrimonioNetto.toLocaleString('it-IT')}
                </span>
              </div>
            </div>
          </div>
          {!step1.isSuperato && (
            <div className="mt-4 p-2.5 bg-rose-50 border border-rose-200 rounded text-xs text-rose-800">
              Il Patrimonio Netto rettificato è negativo o insufficiente. Sussiste un presupposto
              autonomo di allerta.
            </div>
          )}
        </div>

        {/* Step 2: Matrice Indici */}
        <div className="p-5 bg-white border border-slate-200 rounded-lg shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-start mb-3">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500">
                Step 2: Indici Settoriali CNDCEC
              </h3>
              <span
                className={`text-xs px-2 py-0.5 rounded font-medium ${
                  step2.isAllertaScattata
                    ? 'bg-rose-100 text-rose-700'
                    : step2.indiciOltreSoglia > 0
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-emerald-100 text-emerald-700'
                }`}
              >
                {step2.indiciOltreSoglia} / {step2.indiciTotali} Anomalie
              </span>
            </div>
            <div className="text-2xl font-bold text-slate-900 mb-4">
              {step2.isAllertaScattata ? 'Allerta Scattata' : 'Allerta Non Scattata'}
            </div>
            <p className="text-sm text-slate-600 border-t border-slate-100 pt-3">
              {step2.isAllertaScattata
                ? 'Tutti gli indici di settore hanno superato le rispettive soglie d’allerta CNDCEC.'
                : step2.indiciOltreSoglia > 0
                  ? 'Alcuni indici superano le soglie, ma non la totalità richiesta per far scattare l’allerta automatica.'
                  : 'Tutti gli indici di settore rientrano nei limiti di conformità.'}
            </p>
          </div>
          <button
            onClick={onSwitchToMatriceTab}
            className="mt-4 text-xs font-semibold text-indigo-600 hover:text-indigo-800 text-left underline"
          >
            Vedi dettaglio matrice indici &rarr;
          </button>
        </div>
      </div>

      {/* Metric Highlights */}
      <div className="bg-white border border-slate-200 rounded-lg p-5">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-4">
          Indicatori Economico-Finanziari Chiave
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-3 bg-slate-50 rounded">
            <div className="text-xs text-slate-500">Ricavi delle Vendite</div>
            <div className="text-lg font-semibold text-slate-900 font-mono mt-1">
              € {metrics.ricaviVendite.toLocaleString('it-IT')}
            </div>
          </div>
          <div className="p-3 bg-slate-50 rounded">
            <div className="text-xs text-slate-500">Totale Debiti</div>
            <div className="text-lg font-semibold text-slate-900 font-mono mt-1">
              € {metrics.totaleDebiti.toLocaleString('it-IT')}
            </div>
          </div>
          <div className="p-3 bg-slate-50 rounded">
            <div className="text-xs text-slate-500">Debiti Trib. / Prev.</div>
            <div className="text-lg font-semibold text-slate-900 font-mono mt-1">
              € {metrics.debitiTributariPrevidenziali.toLocaleString('it-IT')}
            </div>
          </div>
          <div className="p-3 bg-slate-50 rounded">
            <div className="text-xs text-slate-500">Utile / Perdita Esercizio</div>
            <div
              className={`text-lg font-semibold font-mono mt-1 ${
                metrics.utileEsercizio >= 0 ? 'text-emerald-700' : 'text-rose-700'
              }`}
            >
              € {metrics.utileEsercizio.toLocaleString('it-IT')}
            </div>
          </div>
        </div>
      </div>

      {/* Call to Action */}
      <div className="flex justify-end gap-3 pt-2">
        <button
          onClick={onSwitchToAiTab}
          className="px-4 py-2 bg-indigo-600 text-white font-medium text-sm rounded hover:bg-indigo-700 transition"
        >
          Genera Relazione AI Diagnostica &rarr;
        </button>
      </div>
    </div>
  );
};
