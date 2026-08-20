'use client';

import React, { useEffect, useState } from 'react';
import { useDichiaraContestoAssistente } from '@/components/ContestoAssistenteContext';
import { FileSpreadsheet } from 'lucide-react';
import {
  ottieniTabXbrlAbilitate,
  impostaTabXbrlAbilitataAction,
  type TabXbrl,
} from '@/app/actions/parametriSpazio';

interface Props {
  nomeSchema: string;
}

export function TabXbrlManager({ nomeSchema }: Props) {
  useDichiaraContestoAssistente({ pagina: 'parametri', nomeSchema, sezioneParametri: 'Tab XBRL' });
  const [tabXbrl, setTabXbrl] = useState<TabXbrl[]>([]);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);

  const carica = async () => {
    setCaricamento(true);
    const risultato = await ottieniTabXbrlAbilitate(nomeSchema);
    if (risultato.success) setTabXbrl(risultato.tab);
    else setErrore(risultato.error || 'Impossibile caricare le tab XBRL.');
    setCaricamento(false);
  };

  useEffect(() => {
    carica();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nomeSchema]);

  const handleToggleTabXbrl = async (t: TabXbrl) => {
    const nuovoValore = !t.abilitato;
    setTabXbrl((prev) =>
      prev.map((x) => (x.codice === t.codice ? { ...x, abilitato: nuovoValore } : x))
    );
    const risultato = await impostaTabXbrlAbilitataAction(nomeSchema, t.codice, nuovoValore);
    if (!risultato.success) {
      setTabXbrl((prev) =>
        prev.map((x) => (x.codice === t.codice ? { ...x, abilitato: t.abilitato } : x))
      );
      setErrore(risultato.error || 'Impossibile salvare la modifica della tab.');
    }
  };

  if (caricamento) return <p className="text-xs text-slate-400">Caricamento...</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <FileSpreadsheet className="w-4 h-4 text-blue-600" />
        <h2 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
          Tab XBRL attive nell&apos;Import XBRL di ogni azienda
        </h2>
      </div>
      <p className="text-[11px] text-slate-500">
        Il motore di analisi XBRL è unico per tutta la piattaforma — qui scegli solo quali sue viste
        mostrare quando carichi un bilancio in Aziende → Import XBRL. Non tutte servono a ogni
        studio.
      </p>

      {errore && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          {errore}
        </div>
      )}

      <div className="space-y-1">
        {tabXbrl.map((t) => (
          <label
            key={t.codice}
            className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer py-1"
          >
            <input type="checkbox" checked={t.abilitato} onChange={() => handleToggleTabXbrl(t)} />
            <span className={t.abilitato ? '' : 'text-slate-400 line-through'}>{t.etichetta}</span>
          </label>
        ))}
        {tabXbrl.length === 0 && (
          <p className="text-xs text-slate-400">Nessuna tab XBRL configurata.</p>
        )}
      </div>
    </div>
  );
}
