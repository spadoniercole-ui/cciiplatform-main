'use client';

// L'obbligo del file V.E.R.A. nel triage, come parametro dello spazio.
//
// Non è una preferenza: è la differenza fra un triage che parte e uno che
// resta bloccato. Per l'INPS il V.E.R.A. è l'unico documento che elenca le
// posizioni da lavorare; per gli altri enti non esiste, e chiederlo
// significa non poter cominciare. La scheda dice lo stato, da dove viene e
// cosa cambia spegnendolo.

import React, { useEffect, useState } from 'react';
import { Stethoscope } from 'lucide-react';
import { useDichiaraContestoAssistente } from '@/components/ContestoAssistenteContext';
import { impostaObbligoVeraAction, ottieniObbligoVeraAction } from '@/app/actions/parametriTriage';
import {
  descriviObbligoVera,
  etichettaEnte,
  type ObbligoVera,
} from '@/lib/triage/veraObbligatorio';

interface Props {
  nomeSchema: string;
}

type Scelta = 'AUTOMATICO' | 'OBBLIGATORIO' | 'FACOLTATIVO';

const OPZIONI: { valore: Scelta; titolo: string; testo: string }[] = [
  {
    valore: 'AUTOMATICO',
    titolo: 'Automatico — secondo l’ente',
    testo:
      'Obbligatorio se lo spazio è dell’INPS, dove il V.E.R.A. è la fonte delle posizioni; facoltativo per gli altri enti.',
  },
  {
    valore: 'OBBLIGATORIO',
    titolo: 'Sempre obbligatorio',
    testo:
      'Il triage non parte senza il file. Da scegliere quando il V.E.R.A. si ottiene comunque, anche se l’ente non è l’INPS.',
  },
  {
    valore: 'FACOLTATIVO',
    titolo: 'Sempre facoltativo',
    testo:
      'Il triage parte anche senza il file. Restano fuori le posizioni dell’ente: nessun elenco da instradare alle unità operative.',
  },
];

export function ParametriTriageVera({ nomeSchema }: Props) {
  useDichiaraContestoAssistente({
    pagina: 'parametri',
    nomeSchema,
    sezioneParametri: 'Triage: obbligo del file V.E.R.A.',
  });

  const [obbligo, setObbligo] = useState<ObbligoVera | null>(null);
  const [scelta, setScelta] = useState<Scelta>('AUTOMATICO');
  const [caricamento, setCaricamento] = useState(true);
  const [salvataggio, setSalvataggio] = useState(false);
  const [salvato, setSalvato] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setCaricamento(true);
      const r = await ottieniObbligoVeraAction(nomeSchema);
      if (r.success && r.obbligo) {
        setObbligo(r.obbligo);
        setScelta(
          r.obbligo.impostazione === null
            ? 'AUTOMATICO'
            : r.obbligo.impostazione
              ? 'OBBLIGATORIO'
              : 'FACOLTATIVO'
        );
      } else {
        setErrore(r.error ?? 'Impossibile leggere il parametro.');
      }
      setCaricamento(false);
    })();
  }, [nomeSchema]);

  const salva = async () => {
    setSalvataggio(true);
    setSalvato(false);
    setErrore(null);
    const valore = scelta === 'AUTOMATICO' ? null : scelta === 'OBBLIGATORIO' ? true : false;
    const r = await impostaObbligoVeraAction(nomeSchema, valore);
    if (r.success && r.obbligo) {
      setObbligo(r.obbligo);
      setSalvato(true);
    } else {
      setErrore(r.error ?? 'Impossibile salvare.');
    }
    setSalvataggio(false);
  };

  if (caricamento) return <p className="text-xs text-slate-400">Caricamento...</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Stethoscope className="w-4 h-4 text-blue-600" />
        <h2 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
          Triage: obbligo del file V.E.R.A.
        </h2>
      </div>

      <p className="text-[11px] text-slate-500 leading-relaxed">
        Il V.E.R.A. è la posizione debitoria che l’ente comunica all’azienda: da lì il triage ricava
        le posizioni da instradare alle unità operative. Non tutte le amministrazioni lo emettono —
        l’INPS sì, e per lui è l’unico documento che elenca le partite; un altro ente no. Per questo
        l’obbligo non può essere lo stesso per tutti gli spazi.
      </p>

      {errore && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          {errore}
        </div>
      )}

      {obbligo && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-1">
          <p className="text-[11px] font-bold text-slate-800">
            Oggi nel triage:{' '}
            <span className={obbligo.obbligatorio ? 'text-amber-800' : 'text-emerald-800'}>
              {obbligo.obbligatorio ? 'obbligatorio' : 'facoltativo'}
            </span>
          </p>
          <p className="text-[11px] text-slate-600 leading-relaxed">
            {descriviObbligoVera(obbligo)}
          </p>
          <p className="text-[10px] text-slate-500">
            Ente riconosciuto dalle soglie dell’art. 25-novies:{' '}
            {etichettaEnte(obbligo.ente) ?? 'nessuno (configurazione assente o ambigua)'}
          </p>
        </div>
      )}

      <div className="space-y-2">
        {OPZIONI.map((o) => (
          <label
            key={o.valore}
            className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer ${
              scelta === o.valore ? 'border-slate-900 bg-white' : 'border-slate-200 bg-white'
            }`}
          >
            <input
              type="radio"
              name="obbligo-vera"
              checked={scelta === o.valore}
              onChange={() => {
                setScelta(o.valore);
                setSalvato(false);
              }}
              className="mt-0.5"
            />
            <span>
              <span className="block text-xs font-bold text-slate-900">{o.titolo}</span>
              <span className="block text-[11px] text-slate-500 leading-relaxed">{o.testo}</span>
            </span>
          </label>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void salva()}
          disabled={salvataggio}
          className="px-3 py-2 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white font-bold text-[10px] uppercase rounded-lg transition-colors"
        >
          {salvataggio ? 'Salvataggio...' : 'Salva'}
        </button>
        {salvato && (
          <span className="text-[11px] text-emerald-700">
            Salvato: vale dal prossimo triage di questo spazio.
          </span>
        )}
      </div>
    </div>
  );
}
