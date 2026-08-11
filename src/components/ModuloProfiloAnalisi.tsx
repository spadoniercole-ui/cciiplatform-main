'use client';

import { useState, useEffect } from 'react';

export const dynamic = 'force-dynamic';

interface ProfiloAnalisi {
  id: string;
  nome: string;
  sogliaAllertaEbitda: number;
  orizzonteTemporaleAnni: number;
  abilitaBenchmarkIstat: boolean;
  pesoDatiStorici: number;
}

interface ModuloProfiloAnalisiProps {
  profilo: ProfiloAnalisi;
  onSave: (profilo: ProfiloAnalisi) => void;
}

export const ModuloProfiloAnalisi = ({ profilo, onSave }: ModuloProfiloAnalisiProps) => {
  const [formData, setFormData] = useState(profilo);
  const [isEditing, setIsEditing] = useState(false);

  const handleSave = () => {
    onSave(formData);
    setIsEditing(false);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-8 max-w-2xl">
      <div className="flex justify-between items-start mb-8">
        <div>
          <h2 className="text-lg font-black text-slate-900">Configurazione Profilo Analisi</h2>
          <p className="text-xs text-slate-500 mt-1">
            Parametri di calcolo per la pre-diagnosi e gli indicatori di crisi.
          </p>
        </div>
        {!isEditing ? (
          <button
            onClick={() => setIsEditing(true)}
            className="px-4 py-2 bg-slate-900 text-white text-[11px] font-bold rounded-xl hover:bg-slate-800"
          >
            Modifica Parametri
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={() => setIsEditing(false)}
              className="px-4 py-2 bg-slate-100 text-slate-600 text-[11px] font-bold rounded-xl"
            >
              Annulla
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-blue-600 text-white text-[11px] font-bold rounded-xl shadow-lg"
            >
              Salva
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
              Nome Profilo
            </label>
            <input
              disabled={!isEditing}
              value={formData.nome}
              onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
              className="w-full p-2 bg-slate-50 border rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
              Soglia Allerta EBITDA (%)
            </label>
            <input
              type="number"
              disabled={!isEditing}
              value={formData.sogliaAllertaEbitda}
              onChange={(e) =>
                setFormData({ ...formData, sogliaAllertaEbitda: parseFloat(e.target.value) })
              }
              className="w-full p-2 bg-slate-50 border rounded-lg text-sm"
            />
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
              Orizzonte Temporale (Anni)
            </label>
            <input
              type="number"
              disabled={!isEditing}
              value={formData.orizzonteTemporaleAnni}
              onChange={(e) =>
                setFormData({ ...formData, orizzonteTemporaleAnni: parseInt(e.target.value) })
              }
              className="w-full p-2 bg-slate-50 border rounded-lg text-sm"
            />
          </div>
          <div className="pt-6">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                disabled={!isEditing}
                checked={formData.abilitaBenchmarkIstat}
                onChange={(e) =>
                  setFormData({ ...formData, abilitaBenchmarkIstat: e.target.checked })
                }
                className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-xs font-bold text-slate-700">Abilita Benchmark ISTAT</span>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
};
