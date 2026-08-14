'use client';

// Gestione Licenze Commerciali — elenco reale + creazione + modifica.
// Sostituisce il precedente wrapper che passava props finte
// (parametriIniziali/tenantId/onRefresh) a ModuloLicenza, che in realtà le
// ignorava e faceva già da sé il lavoro vero: qui il lavoro vero è reso
// esplicito, non nascosto dietro un teatro di stato che non rifletteva
// mai la realtà.
//
// Una licenza commerciale può governare 1 o più Spazi di Lavoro (vedi
// /superadmin/Spazi, dove si sceglie quale licenza commerciale collegare
// al nuovo spazio).

import React, { useEffect, useState } from 'react';
import { Key, Plus, RefreshCw } from 'lucide-react';
import ModuloLicenza from '@/components/ModuloLicenza';
import { elencaLicenzeCommerciali, type Licenza } from '@/app/actions/licenze';

export default function LicenzePage() {
  const [licenze, setLicenze] = useState<Licenza[]>([]);
  const [caricamento, setCaricamento] = useState(true);
  const [erroreLista, setErroreLista] = useState<string | null>(null);
  const [vista, setVista] = useState<
    { tipo: 'lista' } | { tipo: 'crea' } | { tipo: 'modifica'; id: string }
  >({
    tipo: 'lista',
  });

  const caricaLicenze = async () => {
    setCaricamento(true);
    setErroreLista(null);
    try {
      const risultato = await elencaLicenzeCommerciali();
      if (!risultato.success) {
        setErroreLista(risultato.error || 'Impossibile caricare le licenze.');
      }
      setLicenze(risultato.licenze);
    } catch (err: any) {
      console.error('Errore nel caricamento delle licenze:', err);
      setErroreLista(`Impossibile caricare le licenze: ${err.message || err}`);
    } finally {
      setCaricamento(false);
    }
  };

  useEffect(() => {
    caricaLicenze();
  }, []);

  if (vista.tipo === 'crea') {
    return (
      <div className="p-6 max-w-3xl">
        <ModuloLicenza
          idLicenza={null}
          onCreata={async () => {
            await caricaLicenze();
            setVista({ tipo: 'lista' });
          }}
          onTornaAllaLista={() => setVista({ tipo: 'lista' })}
        />
      </div>
    );
  }

  if (vista.tipo === 'modifica') {
    return (
      <div className="p-6 max-w-3xl">
        <ModuloLicenza idLicenza={vista.id} onTornaAllaLista={() => setVista({ tipo: 'lista' })} />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 font-sans text-sm text-slate-800 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Key className="w-5 h-5 text-blue-600" />
            Licenze Commerciali
          </h1>
          <p className="text-slate-500 text-xs mt-1">
            Ogni licenza commerciale può governare uno o più Spazi di Lavoro.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setVista({ tipo: 'crea' })}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs uppercase tracking-wider rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" /> Nuova Licenza
        </button>
      </div>

      {erroreLista && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          {erroreLista}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {caricamento && (
          <div className="p-8 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin" /> Caricamento...
          </div>
        )}

        {!caricamento && licenze.length === 0 && (
          <div className="p-8 text-center text-xs text-slate-400">
            Nessuna licenza commerciale creata finora. Creane una per poter poi creare uno Spazio di
            Lavoro collegato ad essa.
          </div>
        )}

        {!caricamento && licenze.length > 0 && (
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase text-slate-500 font-bold">
                <th className="p-3">Ragione Sociale</th>
                <th className="p-3">Chiave</th>
                <th className="p-3">Stato</th>
                <th className="p-3 text-center">Max Spazi</th>
                <th className="p-3 text-center">Max Aziende</th>
                <th className="p-3 text-center">Max Utenti</th>
                <th className="p-3">Scadenza</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {licenze.map((l) => (
                <tr
                  key={l.id_licenza}
                  onClick={() => setVista({ tipo: 'modifica', id: l.id_licenza })}
                  className="hover:bg-slate-50 cursor-pointer"
                >
                  <td className="p-3 font-bold text-slate-900">{l.ragione_sociale}</td>
                  <td className="p-3 font-mono text-slate-500">{l.id_licenza}</td>
                  <td className="p-3">
                    <span
                      className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                        l.stato === 'ATTIVA'
                          ? 'bg-emerald-100 text-emerald-800'
                          : l.stato === 'SOSPESA'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {l.stato || 'ATTIVA'}
                    </span>
                  </td>
                  <td className="p-3 text-center">{l.max_spazi}</td>
                  <td className="p-3 text-center">{l.max_aziende}</td>
                  <td className="p-3 text-center">{l.max_utenti}</td>
                  <td className="p-3 text-slate-500">
                    {l.data_scadenza
                      ? new Date(l.data_scadenza).toLocaleDateString('it-IT')
                      : 'N/D'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
