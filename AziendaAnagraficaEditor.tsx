'use client';

import React, { useEffect, useState } from 'react';
import { Settings2 } from 'lucide-react';
import { useDichiaraContestoAssistente } from '@/components/ContestoAssistenteContext';
import {
  ottieniLicenzaOperativaSpazio,
  type LicenzaOperativaSpazio,
} from '@/app/actions/licenzaOperativaSpazio';

interface Props {
  nomeSchema: string;
}

export function ParametriSistemaViewer({ nomeSchema }: Props) {
  useDichiaraContestoAssistente({
    pagina: 'parametri',
    nomeSchema,
    sezioneParametri: 'Parametri di sistema (licenza operativa, ereditata dal superadmin)',
  });
  const [licenza, setLicenza] = useState<LicenzaOperativaSpazio | null>(null);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setCaricamento(true);
      const risultato = await ottieniLicenzaOperativaSpazio(nomeSchema);
      if (risultato.success) setLicenza(risultato.licenza);
      else setErrore(risultato.error || 'Impossibile caricare la licenza.');
      setCaricamento(false);
    })();
  }, [nomeSchema]);

  if (caricamento) return <p className="text-xs text-slate-400">Caricamento...</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Settings2 className="w-4 h-4 text-slate-400" />
        <h2 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
          Parametri di sistema (licenza operativa, sola lettura)
        </h2>
      </div>
      <p className="text-[11px] text-slate-500">
        Impostati dal superadmin sulla licenza commerciale che governa questo spazio — modificabili
        da lì o da Manutenzione Spazi, non da qui.
      </p>

      {errore && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          {errore}
        </div>
      )}

      {licenza ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div className="text-xs border border-slate-100 rounded-lg p-2">
            <span className="text-slate-500">Licenza commerciale: </span>
            <span className="font-bold text-slate-900">
              {licenza.ragioneSocialeLicenzaCommerciale || 'N/D'}
            </span>
          </div>
          <div className="text-xs border border-slate-100 rounded-lg p-2">
            <span className="text-slate-500">Tier: </span>
            <span className="font-bold text-slate-900">{licenza.tier}</span>
          </div>
          <div className="text-xs border border-slate-100 rounded-lg p-2">
            <span className="text-slate-500">Stato: </span>
            <span className="font-bold text-slate-900">{licenza.statoLicenza}</span>
          </div>
          <div className="text-xs border border-slate-100 rounded-lg p-2">
            <span className="text-slate-500">Scadenza: </span>
            <span className="font-bold text-slate-900">
              {licenza.dataScadenza
                ? new Date(licenza.dataScadenza).toLocaleDateString('it-IT')
                : 'Nessuna'}
            </span>
          </div>
          <div className="text-xs border border-slate-100 rounded-lg p-2">
            <span className="text-slate-500">Max utenti: </span>
            <span className="font-bold text-slate-900">{licenza.maxUtenti}</span>
          </div>
          <div className="text-xs border border-slate-100 rounded-lg p-2">
            <span className="text-slate-500">Max aziende: </span>
            <span className="font-bold text-slate-900">{licenza.maxAziende}</span>
          </div>
          <div className="sm:col-span-2 text-xs border border-slate-100 rounded-lg p-2">
            <span className="text-slate-500 block mb-1">Funzioni plus: </span>
            <div className="flex flex-wrap gap-1.5">
              {[
                { attiva: licenza.plusDatiSettore, etichetta: 'Dati di Settore' },
                { attiva: licenza.plusSimulazione, etichetta: 'Simulazione' },
                { attiva: licenza.plusRelazioneAi, etichetta: 'Relazione AI' },
              ].map((f) => (
                <span
                  key={f.etichetta}
                  className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                    f.attiva ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'
                  }`}
                >
                  {f.etichetta}
                </span>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <p className="text-xs text-slate-400">
          Nessuna licenza operativa trovata per questo spazio.
        </p>
      )}
    </div>
  );
}
