'use client';

// Configurazione XBRL per una specifica azienda: quali tab (tra quelle
// già attive per l'intero spazio) alimentare quando, nello Scenario di
// questa azienda, verrà caricato un bilancio XBRL. Nessun caricamento di
// file qui — quello avviene solo nello Scenario, per evitare di doverlo
// ripetere due volte.

import React, { useEffect, useState } from 'react';
import { FileSpreadsheet } from 'lucide-react';
import {
  ottieniTabXbrlAzienda,
  impostaTabXbrlAziendaAction,
  type TabXbrlAzienda,
} from '@/app/actions/aziendaConfig';

interface Props {
  nomeSchema: string;
  aziendaId: number;
}

export function AziendaConfigXbrl({ nomeSchema, aziendaId }: Props) {
  const [tab, setTab] = useState<TabXbrlAzienda[]>([]);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);
  const [erroreSalvataggio, setErroreSalvataggio] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setCaricamento(true);
      const risultato = await ottieniTabXbrlAzienda(nomeSchema, aziendaId);
      if (risultato.success) setTab(risultato.tab);
      else setErrore(risultato.error || 'Impossibile caricare la configurazione.');
      setCaricamento(false);
    })();
  }, [nomeSchema, aziendaId]);

  const handleToggle = async (t: TabXbrlAzienda) => {
    setErroreSalvataggio(null);
    const nuovoValore = !t.abilitato;
    setTab((prev) =>
      prev.map((x) => (x.codice === t.codice ? { ...x, abilitato: nuovoValore } : x))
    );

    const risultato = await impostaTabXbrlAziendaAction(
      nomeSchema,
      aziendaId,
      t.codice,
      nuovoValore
    );
    if (!risultato.success) {
      setTab((prev) =>
        prev.map((x) => (x.codice === t.codice ? { ...x, abilitato: t.abilitato } : x))
      );
      setErroreSalvataggio(risultato.error || 'Impossibile salvare la modifica della tab.');
    }
  };

  if (caricamento) return <p className="text-xs text-slate-400">Caricamento...</p>;

  return (
    <div className="max-w-2xl bg-white border border-slate-200 rounded-xl p-5 space-y-4">
      <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
        <FileSpreadsheet className="w-4 h-4 text-blue-600" />
        <h2 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
          Tab XBRL per questa azienda
        </h2>
      </div>
      <p className="text-[11px] text-slate-500">
        Quando nello Scenario di questa azienda verrà caricato un bilancio XBRL, solo le tab
        confermate qui saranno alimentate. L&apos;elenco mostra solo le tab già attive per
        l&apos;intero spazio (Parametri di Spazio) — per aggiungerne una nuova, va prima abilitata
        lì.
      </p>

      {errore && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          {errore}
        </div>
      )}
      {erroreSalvataggio && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          {erroreSalvataggio}
        </div>
      )}

      <div className="space-y-1">
        {tab.map((t) => (
          <label
            key={t.codice}
            className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer py-1"
          >
            <input type="checkbox" checked={t.abilitato} onChange={() => handleToggle(t)} />
            <span className={t.abilitato ? '' : 'text-slate-400 line-through'}>{t.etichetta}</span>
          </label>
        ))}
        {tab.length === 0 && (
          <p className="text-xs text-slate-400">
            Nessuna tab XBRL attiva per questo spazio — configurale prima in Parametri di Spazio.
          </p>
        )}
      </div>
    </div>
  );
}
