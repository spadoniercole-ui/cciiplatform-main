'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Save } from 'lucide-react';
import { ottieniEtichetteAnagraficaEnte } from '@/app/actions/anagraficaEnteConfig';
import {
  ottieniAnagraficaEnte,
  salvaAnagraficaEnteAction,
  type AnagraficaEnte,
} from '@/app/actions/anagraficaEnte';
import { CHIAVI_CAMPO_ANAGRAFICA_ENTE } from '@/lib/costantiRicevibilita';
import { useDichiaraContestoAssistente } from '@/components/ContestoAssistenteContext';

const CHIAVI_CAMPO_TIPIZZATE = CHIAVI_CAMPO_ANAGRAFICA_ENTE as (keyof AnagraficaEnte)[];

interface Props {
  nomeSchema: string;
  aziendaId: number;
  /** Chiamata dopo un salvataggio riuscito — il contenitore (Posizione Ente) la usa per sbloccare le altre schede e aggiornare il riepilogo, senza dover ricaricare la pagina. */
  onSalvato?: (dati: AnagraficaEnte) => void;
}

const VUOTA: AnagraficaEnte = {
  idEnte: null,
  ...Object.fromEntries(CHIAVI_CAMPO_TIPIZZATE.map((k) => [k, null])),
} as AnagraficaEnte;

export function AnagraficaEnteScenario({ nomeSchema, aziendaId, onSalvato }: Props) {
  const router = useRouter();
  const [etichette, setEtichette] = useState<
    { campo: number; etichetta: string; attivo: boolean }[]
  >([]);
  const [dati, setDati] = useState<AnagraficaEnte>(VUOTA);
  const [caricamento, setCaricamento] = useState(true);
  const [salvataggio, setSalvataggio] = useState(false);
  const [salvato, setSalvato] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  useDichiaraContestoAssistente({ pagina: 'anagrafica-ente', nomeSchema, scenarioId: aziendaId });

  const carica = async () => {
    const [etichetteRis, datiRis] = await Promise.all([
      ottieniEtichetteAnagraficaEnte(nomeSchema),
      ottieniAnagraficaEnte(nomeSchema, aziendaId),
    ]);
    if (etichetteRis.success) setEtichette(etichetteRis.etichette);
    if (datiRis.success) {
      setDati(datiRis.dati);
      onSalvato?.(datiRis.dati);
    }
  };

  useEffect(() => {
    (async () => {
      setCaricamento(true);
      await carica();
      setCaricamento(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nomeSchema, aziendaId]);

  useEffect(() => {
    const handler = () => carica();
    window.addEventListener('assistente:dati-aggiornati', handler);
    return () => window.removeEventListener('assistente:dati-aggiornati', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nomeSchema, aziendaId]);

  const handleCambia = (campo: keyof AnagraficaEnte, valore: string) => {
    setDati((prev) => ({ ...prev, [campo]: valore || null }));
    setSalvato(false);
    setErrore(null);
  };

  const handleSalva = async () => {
    const campiCompilati = [dati.idEnte, ...CHIAVI_CAMPO_TIPIZZATE.map((k) => dati[k])];
    if (!campiCompilati.some((c) => c && c.trim())) {
      setErrore('Compila almeno un campo prima di salvare.');
      return;
    }
    setSalvataggio(true);
    setErrore(null);
    const risultato = await salvaAnagraficaEnteAction(nomeSchema, aziendaId, dati);
    if (risultato.success) {
      setSalvato(true);
      onSalvato?.(dati);
      // Il semaforo dei passi (barra in alto) è renderizzato dal layout —
      // un Server Component che l'App Router conserva tra una tab e l'altra
      // e NON rilegge da solo dopo un salvataggio lato client. Senza questo
      // refresh "Posizione Ente" resterebbe arancione finché non si ricarica
      // a mano la pagina, pur avendo salvato l'anagrafica.
      router.refresh();
    } else {
      setErrore(risultato.error || 'Impossibile salvare.');
    }
    setSalvataggio(false);
  };

  if (caricamento) return <p className="text-xs text-slate-400">Caricamento...</p>;

  return (
    <div className="space-y-4">
      <p className="text-[11px] text-slate-500">
        Come l&apos;ente identifica questa azienda nella propria contabilità — le etichette dei
        campi si configurano in Parametri di Spazio → Anagrafica Ente. In difficoltà? L&apos;
        assistente in basso a destra può compilarla parlandone.
      </p>

      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
        {etichette
          .filter((e) => e.attivo)
          .map((e) => (
            <div key={e.campo}>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                {e.etichetta}
              </label>
              <input
                type="text"
                value={dati[CHIAVI_CAMPO_TIPIZZATE[e.campo - 1]] || ''}
                onChange={(ev) =>
                  handleCambia(CHIAVI_CAMPO_TIPIZZATE[e.campo - 1], ev.target.value)
                }
                className="w-full p-2 text-sm border border-slate-200 rounded-lg text-slate-900 bg-white"
              />
            </div>
          ))}

        {/* ID Ente in fondo, discreto — un riferimento tecnico, non il dato che l'operatore cerca per primo. */}
        <div className="pt-2 border-t border-slate-100">
          <label className="block text-[9px] font-medium text-slate-400 uppercase mb-1">
            ID Ente (riferimento interno, facoltativo)
          </label>
          <input
            type="text"
            value={dati.idEnte || ''}
            onChange={(e) => handleCambia('idEnte', e.target.value)}
            className="w-full p-1.5 text-xs border border-slate-100 rounded-lg text-slate-600 bg-slate-50"
          />
        </div>

        <button
          type="button"
          onClick={handleSalva}
          disabled={salvataggio}
          className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white font-bold uppercase tracking-wider rounded-lg text-xs transition-colors"
        >
          <Save className="w-3.5 h-3.5" /> {salvataggio ? 'Salvataggio...' : 'Salva'}
        </button>
        {errore && (
          <p className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-lg p-2.5">
            {errore}
          </p>
        )}
        {salvato && (
          <p className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-2.5">
            Anagrafica salvata.
          </p>
        )}
      </div>
    </div>
  );
}
