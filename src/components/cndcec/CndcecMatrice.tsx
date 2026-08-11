import React from 'react';

export interface AtecoSectorConfig {
  code: string;
  label: string;
}

export interface CndcecMatriceRow {
  codice: string;
  nome: string;
  formulaDescrizione: string;
  valoreXBRL: number;
  sogliaAteco: number;
  operatoreConfronto: '<' | '>';
  unitaMisura: '%' | 'valore';
  isAnomalia: boolean;
  dettaglioCalcolo?: string;
}

export interface CndcecMatriceProps {
  settoreAtecoCorrente: AtecoSectorConfig;
  elencoSettoriDisponibili: AtecoSectorConfig[];
  rows: CndcecMatriceRow[];
  onSettoreChange: (nuovoSettoreCode: string) => void;
  onExportCsv?: () => void;
  isLoading?: boolean;
}

export const CndcecMatrice: React.FC<CndcecMatriceProps> = ({
  settoreAtecoCorrente,
  elencoSettoriDisponibili,
  rows,
  onSettoreChange,
  onExportCsv,
  isLoading = false,
}) => {
  return (
    <div className="space-y-6 text-slate-800">
      {/* Selector Settore ATECO */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-lg gap-4">
        <div>
          <label
            htmlFor="atecoSelect"
            className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1"
          >
            Settore di Riferimento CNDCEC
          </label>
          <select
            id="atecoSelect"
            value={settoreAtecoCorrente.code}
            onChange={(e) => onSettoreChange(e.target.value)}
            disabled={isLoading}
            className="w-full sm:w-80 px-3 py-2 bg-white border border-slate-300 rounded-md text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {elencoSettoriDisponibili.map((s) => (
              <option key={s.code} value={s.code}>
                {s.code} - {s.label}
              </option>
            ))}
          </select>
        </div>

        {onExportCsv && (
          <button
            onClick={onExportCsv}
            disabled={isLoading}
            className="px-3 py-2 border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium rounded transition"
          >
            Esporta Matrice CSV
          </button>
        )}
      </div>

      {/* Tabella Indici */}
      <div className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-100 text-slate-600 text-xs uppercase font-semibold border-b border-slate-200">
              <th className="py-3 px-4">Codice / Indice</th>
              <th className="py-3 px-4">Formula sintetizzata</th>
              <th className="py-3 px-4 text-right">Valore XBRL</th>
              <th className="py-3 px-4 text-center">Operatore</th>
              <th className="py-3 px-4 text-right">Soglia Settore</th>
              <th className="py-3 px-4 text-center">Esito</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 text-sm">
            {rows.map((row) => (
              <tr
                key={row.codice}
                className={row.isAnomalia ? 'bg-amber-50/50' : 'hover:bg-slate-50'}
              >
                <td className="py-3.5 px-4">
                  <div className="font-bold text-slate-900">{row.codice}</div>
                  <div className="text-xs text-slate-500">{row.nome}</div>
                </td>
                <td className="py-3.5 px-4 text-xs font-mono text-slate-600">
                  {row.formulaDescrizione}
                </td>
                <td className="py-3.5 px-4 text-right font-mono font-semibold text-slate-900">
                  {row.valoreXBRL} {row.unitaMisura}
                </td>
                <td className="py-3.5 px-4 text-center font-mono text-slate-500">
                  {row.operatoreConfronto}
                </td>
                <td className="py-3.5 px-4 text-right font-mono text-slate-700">
                  {row.sogliaAteco} {row.unitaMisura}
                </td>
                <td className="py-3.5 px-4 text-center">
                  <span
                    className={`inline-block px-2.5 py-1 text-xs font-semibold rounded-full ${
                      row.isAnomalia
                        ? 'bg-amber-100 text-amber-800 border border-amber-300'
                        : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    }`}
                  >
                    {row.isAnomalia ? 'Anomalia' : 'Conforme'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600">
        <strong>Nota metodologica:</strong> Ai sensi delle Linee Guida CNDCEC, l’allerta si intende
        confermata nello Step 2 soltanto se <u>tutti</u> gli indici calcolati superano
        contemporaneamente le soglie di settore previste.
      </div>
    </div>
  );
};
