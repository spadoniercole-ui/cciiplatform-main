'use client';

// IL RICALCOLO D'UFFICIO DELLA SERIE DEI CONTRIBUTI.
//
// La serie per anno si ricostruisce da sola quando si apre la scheda Indici
// di un'azienda. Ma un ente che vuole guardare il quadro d'insieme — quali
// posizioni hanno un rapporto che sale, e da quando — non può aprire cento
// schede una per una: qui il lavoro si fa una volta, per tutte le aziende
// dello spazio, e resta scritto in database.
//
// Che cosa cambia davvero: la serie resta quella che si vedrebbe aprendo la
// scheda. Il comando non aggiunge dati, li rende disponibili senza aprire
// ogni fascicolo — ed è per questo che dice quante serie ha ricostruito e
// quante ha lasciato stare, invece di dichiarare «fatto».

import { useState } from 'react';
import { RefreshCw, AlertTriangle } from 'lucide-react';
import {
  ricostruisciContributiPerAnnoSpazioAction,
  type EsitoRicalcoloSerie,
} from '@/app/actions/soglie25novies';

interface Props {
  nomeSchema: string;
}

function riepilogo(e: EsitoRicalcoloSerie): string {
  const esaminate = e.esaminate ?? 0;
  const ricostruite = e.ricostruite ?? 0;
  const daFile = e.daFile ?? 0;
  const senzaDati = e.senzaDati ?? 0;
  if (esaminate === 0)
    return 'Nessuna azienda verificata in questo spazio: non c’è una serie da ricostruire.';
  const parti = [
    `${esaminate} ${esaminate === 1 ? 'azienda esaminata' : 'aziende esaminate'}`,
    ricostruite === 0
      ? 'nessuna serie da ricostruire'
      : `${ricostruite} ${ricostruite === 1 ? 'serie ricostruita' : 'serie ricostruite'} (${e.daPosizioni ?? 0} dalle posizioni, ${e.daValori ?? 0} dai valori conservati)`,
    `${daFile} ${daFile === 1 ? 'già letta' : 'già lette'} dai file`,
    senzaDati === 0 ? null : `${senzaDati} senza dati sufficienti`,
  ].filter(Boolean);
  return `${parti.join(' · ')}.`;
}

export function RicalcolaContributiAnni({ nomeSchema }: Props) {
  const [inCorso, setInCorso] = useState(false);
  const [esito, setEsito] = useState<EsitoRicalcoloSerie | null>(null);
  const [errore, setErrore] = useState<string | null>(null);

  const esegui = async () => {
    setInCorso(true);
    setErrore(null);
    setEsito(null);
    const r = await ricostruisciContributiPerAnnoSpazioAction(nomeSchema);
    if (r.success) setEsito(r);
    else setErrore(r.error ?? 'Ricalcolo non riuscito.');
    setInCorso(false);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
      <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
        <RefreshCw className="w-4 h-4 text-slate-500" />
        <h2 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
          Serie dei contributi per anno — ricalcolo d’ufficio
        </h2>
      </div>
      <p className="text-xs text-slate-500 leading-relaxed">
        La serie scaduti / dovuti si ricostruisce aprendo la scheda Indici di un’azienda. Qui si fa
        una volta per tutto lo spazio, dalle posizioni del triage e dai valori conservati nelle
        soglie, per le aziende verificate prima che la serie esistesse. Le serie già lette da DM10 e
        Lista Inadempienze non si toccano: i file restano la fonte. La ricostruzione non porta il
        ritardo oltre 90 giorni, che resta non misurato.
      </p>
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={() => void esegui()}
          disabled={inCorso}
          className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-slate-800 disabled:bg-slate-300"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${inCorso ? 'animate-spin' : ''}`} />
          {inCorso ? 'Ricalcolo...' : 'Ricalcola per tutte le aziende'}
        </button>
        {esito && (
          <span className="text-[11px] text-emerald-700 font-bold">{riepilogo(esito)}</span>
        )}
        {errore && (
          <span className="flex items-center gap-1 text-[11px] text-red-700 font-bold">
            <AlertTriangle className="w-3.5 h-3.5" />
            {errore}
          </span>
        )}
      </div>
    </div>
  );
}
