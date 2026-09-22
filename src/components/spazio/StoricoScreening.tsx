'use client';

// Storico delle generazioni dello Screening. Ogni voce porta data, versione
// della piattaforma e impronta della visura: due relazioni diverse per la
// stessa azienda si spiegano con uno di questi tre elementi, non restano
// «versioni parallele» indistinguibili.

import React, { useEffect, useState } from 'react';
import { History, ChevronDown, ChevronRight } from 'lucide-react';
import {
  ottieniStoricoScreeningAction,
  type VoceStoricoScreening,
} from '@/app/actions/screeningAzienda';
import { RevisioneTesto, stampaSeConsegnabile } from '@/components/spazio/RevisioneTesto';
import { improntaBreve } from '@/lib/fascicolo/impronta';

interface Props {
  nomeSchema: string;
  aziendaId: number;
  /** Cambia a ogni generazione: l'elenco si rilegge. */
  versione: number;
}

export function StoricoScreening({ nomeSchema, aziendaId, versione }: Props) {
  const [voci, setVoci] = useState<VoceStoricoScreening[]>([]);
  const [aperta, setAperta] = useState<number | null>(null);

  useEffect(() => {
    ottieniStoricoScreeningAction(nomeSchema, aziendaId).then((r) => {
      if (r.success) setVoci(r.voci);
    });
  }, [nomeSchema, aziendaId, versione]);

  if (voci.length <= 1) return null;

  return (
    <section
      className="bg-white border border-slate-200 rounded-xl p-5 space-y-3"
      aria-label="Storico dello Screening"
    >
      <div className="flex items-start gap-2 border-b border-slate-100 pb-3">
        <History className="w-4 h-4 text-slate-500 mt-0.5" />
        <div>
          <h3 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
            Generazioni precedenti — {voci.length - 1}
          </h3>
          <p className="text-[11px] text-slate-600 mt-0.5">
            Ogni generazione resta, con data, versione della piattaforma e impronta della visura
            usata. A parità di questi tre elementi il testo può comunque variare, perché è prodotto
            dall’assistente: fa fede quello corrente.
          </p>
        </div>
      </div>
      <ul className="divide-y divide-slate-100">
        {voci.slice(1).map((v) => (
          <li key={v.id} className="py-2">
            <button
              type="button"
              onClick={() => setAperta((a) => (a === v.id ? null : v.id))}
              className="flex items-center gap-2 text-xs text-slate-800 hover:text-blue-700 w-full text-left"
            >
              {aperta === v.id ? (
                <ChevronDown className="w-3 h-3" />
              ) : (
                <ChevronRight className="w-3 h-3" />
              )}
              <span className="font-bold">{new Date(v.generatoIl).toLocaleString('it-IT')}</span>
              <span className="text-slate-500">piattaforma {v.appVersion ?? '?'}</span>
              {v.nomeFileVisura && (
                <span
                  className="text-slate-500"
                  title={v.visuraImpronta ? `SHA-256 ${v.visuraImpronta}` : undefined}
                >
                  {v.nomeFileVisura}
                  {v.visuraImpronta ? ` (${improntaBreve(v.visuraImpronta)}…)` : ''}
                </span>
              )}
            </button>
            {aperta === v.id && v.relazioneTesto && (
              <div className="mt-2 space-y-2">
                <RevisioneTesto testo={v.relazioneTesto} tipo="RELAZIONE_SCREENING" />
                <pre className="whitespace-pre-wrap text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-3 max-h-96 overflow-auto">
                  {v.relazioneTesto}
                </pre>
                <button
                  type="button"
                  onClick={() =>
                    stampaSeConsegnabile(
                      'RELAZIONE_SCREENING',
                      `Relazione di Screening — generazione del ${new Date(v.generatoIl).toLocaleString('it-IT')} (piattaforma ${v.appVersion ?? '?'})`,
                      v.relazioneTesto!,
                      v.generatoIl
                    )
                  }
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[10px] uppercase rounded"
                >
                  Stampa / PDF di questa generazione
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
