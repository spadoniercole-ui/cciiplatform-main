'use client';

import React, { useEffect, useState } from 'react';
import { useDichiaraContestoAssistente } from '@/components/ContestoAssistenteContext';
import { Scale } from 'lucide-react';
import {
  ottieniEtichetteTipoDebito,
  aggiornaEtichettaTipoDebitoAction,
  type EtichettaTipoDebito,
} from '@/app/actions/tipoDebitoConfig';

interface Props {
  nomeSchema: string;
}

export function TipoDebitoConfigManager({ nomeSchema }: Props) {
  useDichiaraContestoAssistente({
    pagina: 'parametri',
    nomeSchema,
    sezioneParametri: 'Tipo Debito (etichette CLE/CEN/CEC/CEA)',
  });
  const [etichette, setEtichette] = useState<EtichettaTipoDebito[]>([]);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setCaricamento(true);
      const risultato = await ottieniEtichetteTipoDebito(nomeSchema);
      if (risultato.success) setEtichette(risultato.etichette);
      else setErrore(risultato.error || 'Impossibile caricare le etichette.');
      setCaricamento(false);
    })();
  }, [nomeSchema]);

  const handleCambia = async (codice: EtichettaTipoDebito['codice'], etichetta: string) => {
    setEtichette((prev) => prev.map((e) => (e.codice === codice ? { ...e, etichetta } : e)));
    await aggiornaEtichettaTipoDebitoAction(nomeSchema, codice, etichetta || codice);
  };

  if (caricamento) return <p className="text-xs text-slate-400">Caricamento...</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Scale className="w-4 h-4 text-blue-600" />
        <h2 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
          Tipo Debito — etichette (Situazione Debitoria)
        </h2>
      </div>
      <p className="text-[11px] text-slate-500">
        Il codice (CLE/CEN/CEC/CEA) resta sempre lo stesso — è quello salvato e usato dal calcolo,
        una classificazione fissa (Certo Liquido Esigibile / Certo Emesso Notificato / Certo
        Esigibile Contenzioso / Certo Esigibile Agente della Riscossione). Solo l&apos;etichetta
        mostrata è personalizzabile, per un ente che usa una propria nomenclatura interna (es. CEA
        chiamato con un proprio codice). Vale per tutti gli scenari di questo spazio.
      </p>

      {errore && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          {errore}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
        {etichette.map((e) => (
          <div key={e.codice} className="flex items-center gap-3">
            <span className="text-[10px] font-bold text-slate-400 uppercase w-16 shrink-0">
              {e.codice}
            </span>
            <input
              type="text"
              value={e.etichetta}
              onChange={(ev) => handleCambia(e.codice, ev.target.value)}
              className="flex-1 p-2 text-xs border border-slate-200 rounded-lg text-slate-900 bg-white"
            />
            <span className="text-[10px] text-slate-400 w-56 shrink-0">{e.descrizione}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
