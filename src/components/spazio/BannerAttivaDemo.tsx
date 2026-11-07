'use client';

// Il percorso demo si attiva dal punto in cui il Superadmin sta già
// guardando lo spazio, non solo da Manutenzione Spazi. Il banner compare
// soltanto in modalità ispezione, su uno spazio ENTE che non ha ancora il
// flag: l'azione resta comunque protetta da richiediSuperadmin().

import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { attivaDemoSpazioAction } from '@/app/actions/spazi';
import { avvisoApp, confermaApp } from '@/components/FinestreApp';

interface Props {
  spazioId: number;
  codice: string;
  descrizione: string;
}

export function BannerAttivaDemo({ spazioId, codice, descrizione }: Props) {
  const [inCorso, setInCorso] = useState(false);

  const attiva = async () => {
    const conferma = await confermaApp(
      `Attivo il percorso demo di ${descrizione} (${codice}).\n\nVengono caricati quattro percorsi completi (triage, screening e scenario) e una quinta posizione ferma al triage, senza screening né scenario, più i parametri di soglie, riscontro e scenari. Le aziende del vecchio set demo e la prova CROWDOWN S.R.L., se presenti, vengono rimosse: le altre aziende non vengono toccate.`,
      {
        titolo: 'Attiva spazio demo',
        etichettaConferma: 'Attiva demo',
        distruttiva: true,
      }
    );
    if (!conferma) return;

    setInCorso(true);
    try {
      const esito = await attivaDemoSpazioAction(spazioId);
      if (!esito.success) {
        await avvisoApp(esito.error || 'Attivazione demo non riuscita.');
        return;
      }
      // Il contesto letto dal layout contiene il flag demo: senza reload il
      // banner resterebbe visibile e la dashboard mostrerebbe ancora il
      // vecchio set appena cancellato.
      window.location.reload();
    } finally {
      setInCorso(false);
    }
  };

  return (
    <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
          <div>
            <p className="text-xs font-bold uppercase tracking-wider">Spazio demo non attivo</p>
            <p className="mt-1 max-w-2xl text-[11px] leading-relaxed text-amber-800">
              Questo spazio ENTE non ha ancora il percorso demo. Attivalo per caricare quattro
              percorsi completi, una posizione ferma al triage e i parametri dell&apos;export: il
              vecchio set demo, compresa CROWDOWN S.R.L., viene rimosso.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={attiva}
          disabled={inCorso}
          className="flex items-center gap-1 rounded-md bg-amber-600 px-3 py-2 text-[10px] font-bold uppercase text-white transition-colors hover:bg-amber-500 disabled:bg-amber-300"
        >
          <Sparkles className="h-3 w-3" />
          {inCorso ? 'Caricamento…' : 'Attiva demo'}
        </button>
      </div>
    </div>
  );
}
