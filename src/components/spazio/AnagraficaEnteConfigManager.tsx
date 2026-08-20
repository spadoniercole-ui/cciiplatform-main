'use client';

import React, { useEffect, useState } from 'react';
import { useDichiaraContestoAssistente } from '@/components/ContestoAssistenteContext';
import { Building2 } from 'lucide-react';
import {
  ottieniEtichetteAnagraficaEnte,
  aggiornaEtichettaAnagraficaEnteAction,
  type EtichettaAnagraficaEnte,
} from '@/app/actions/anagraficaEnteConfig';

interface Props {
  nomeSchema: string;
}

export function AnagraficaEnteConfigManager({ nomeSchema }: Props) {
  useDichiaraContestoAssistente({
    pagina: 'parametri',
    nomeSchema,
    sezioneParametri: 'Anagrafica Ente (etichette dei campi)',
  });
  const [etichette, setEtichette] = useState<EtichettaAnagraficaEnte[]>([]);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setCaricamento(true);
      const risultato = await ottieniEtichetteAnagraficaEnte(nomeSchema);
      if (risultato.success) setEtichette(risultato.etichette);
      else setErrore(risultato.error || 'Impossibile caricare le etichette.');
      setCaricamento(false);
    })();
  }, [nomeSchema]);

  const handleCambia = async (campo: number, dati: { etichetta?: string; attivo?: boolean }) => {
    setEtichette((prev) => prev.map((e) => (e.campo === campo ? { ...e, ...dati } : e)));
    await aggiornaEtichettaAnagraficaEnteAction(nomeSchema, campo, dati);
  };

  if (caricamento) return <p className="text-xs text-slate-400">Caricamento...</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Building2 className="w-4 h-4 text-blue-600" />
        <h2 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
          Anagrafica Ente — campi
        </h2>
      </div>
      <p className="text-[11px] text-slate-500">
        Ogni ente identifica un&apos;azienda a modo suo (INPS: matricola, posizione gestione
        separata, codici CSC/CA...). Fino a 10 campi liberi, ciascuno disattivabile e
        rietichettabile secondo la nomenclatura dell&apos;ente di questo spazio — solo i campi
        attivi compaiono nel form. L&apos;ID Ente resta sempre presente, come riferimento
        facoltativo. L&apos;etichetta e l&apos;attivazione valgono per tutti gli scenari di questo
        spazio; i valori si compilano scenario per scenario, in Posizione Ente.
      </p>

      {errore && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          {errore}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
        {etichette.map((e) => (
          <div key={e.campo} className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={e.attivo}
              onChange={(ev) => handleCambia(e.campo, { attivo: ev.target.checked })}
              title="Attiva/disattiva"
            />
            <span className="text-[10px] font-bold text-slate-400 uppercase w-16 shrink-0">
              Campo {e.campo}
            </span>
            <input
              type="text"
              value={e.etichetta}
              disabled={!e.attivo}
              onChange={(ev) => handleCambia(e.campo, { etichetta: ev.target.value })}
              className="flex-1 p-2 text-xs border border-slate-200 rounded-lg text-slate-900 bg-white disabled:bg-slate-50 disabled:text-slate-400"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
