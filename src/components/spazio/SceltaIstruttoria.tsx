'use client';

// La domanda che si pone appena creato uno scenario ricevuto: che cosa ha in
// mano l'azienda? La risposta decide il percorso e non è un dettaglio: una
// proposta si valuta nel merito, un decreto o un cram down si riscontrano con
// i dati dell'ente. Chiedere prima evita di far caricare documenti nel posto
// sbagliato e di costruire un confronto che non significa nulla.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ArrowRight, FileText, Landmark, Scale } from 'lucide-react';
import { impostaTipoIstruttoriaAction } from '@/app/actions/istruttoriaGiudice';
import {
  DESCRIZIONE_ATTO,
  ETICHETTA_ATTO,
  TIPI_ATTO,
  type TipoAttoGiudice,
} from '@/lib/giudice/lettura';

const ICONE = {
  PROPOSTA: FileText,
  DECRETO_LIQUIDAZIONE: Landmark,
  CRAM_DOWN: Scale,
} as const;

interface Props {
  nomeSchema: string;
  scenarioId: number;
  nomeScenario: string;
  ragioneSociale: string;
}

export function SceltaIstruttoria({ nomeSchema, scenarioId, nomeScenario, ragioneSociale }: Props) {
  const router = useRouter();
  const [sceltaInCorso, setSceltaInCorso] = useState<TipoAttoGiudice | null>(null);
  const [errore, setErrore] = useState<string | null>(null);

  const scegli = async (tipo: TipoAttoGiudice) => {
    setSceltaInCorso(tipo);
    setErrore(null);
    const esito = await impostaTipoIstruttoriaAction(nomeSchema, scenarioId, tipo);
    if (!esito.success) {
      setErrore(esito.error || 'Impossibile impostare il tipo di atto.');
      setSceltaInCorso(null);
      return;
    }
    router.refresh();
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-sky-700">
          {ragioneSociale} — scenario «{nomeScenario}»
        </p>
        <h2 className="text-xl font-bold text-slate-900 mt-1">Che cosa ha in mano l’azienda?</h2>
        <p className="text-sm text-slate-600 mt-2 max-w-3xl leading-relaxed">
          Da qui dipende che cosa fa la piattaforma. Una proposta si valuta nel merito; un decreto
          di liquidazione o un cram down, invece, si riscontrano con la posizione debitoria
          dell’ente: non c’è nulla da accettare, c’è un atto del giudice da controllare. La scelta
          resta modificabile finché non carichi documenti.
        </p>
      </div>

      {errore && (
        <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <p>{errore}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {TIPI_ATTO.map((tipo) => {
          const Icona = ICONE[tipo];
          const inCorso = sceltaInCorso === tipo;
          return (
            <button
              key={tipo}
              type="button"
              onClick={() => scegli(tipo)}
              disabled={sceltaInCorso !== null}
              className="text-left bg-white border border-slate-200 hover:border-sky-400 hover:shadow-sm disabled:opacity-60 rounded-xl p-5 flex flex-col gap-3 transition-colors"
            >
              <span className="flex items-center gap-2 text-sky-700">
                <Icona className="w-4 h-4" />
                <span className="text-[10px] font-bold uppercase tracking-wider">
                  {inCorso ? 'Apertura…' : 'Scegli questo percorso'}
                </span>
              </span>
              <span className="font-bold text-slate-900 text-sm">{ETICHETTA_ATTO[tipo]}</span>
              <span className="text-[11px] text-slate-600 leading-relaxed flex-1">
                {DESCRIZIONE_ATTO[tipo]}
              </span>
              <span className="text-[11px] font-bold text-sky-700 flex items-center gap-1">
                Apri <ArrowRight className="w-3 h-3" />
              </span>
            </button>
          );
        })}
      </div>

      <p className="text-[10px] text-slate-500 leading-relaxed">
        Se l’azienda non ha ancora depositato nulla, scegli comunque il percorso che sta
        intraprendendo: potrai caricare i documenti quando arrivano.
      </p>
    </div>
  );
}
