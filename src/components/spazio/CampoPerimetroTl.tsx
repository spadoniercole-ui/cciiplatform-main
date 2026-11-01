'use client';

import React from 'react';

const CLASSE =
  'w-full border border-slate-300 rounded-lg px-2 py-1.5 text-xs text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-sky-500';

/**
 * IL CONTRASSEGNO DI PERIMETRO (0.153.0).
 *
 * Non tutte le TL dicono qualcosa della condotta dell'azienda: alcune sono il
 * presidio che l'ente attiva quando la condotta è elusiva, altre accompagnano
 * un adempimento. Solo le prime generano una voce obbligatoria nel triage.
 * Il verso è obbligatorio col contrassegno: senza, la sintesi del triage non
 * sa dire se i codici stanno sotto una condotta o sotto una collaborazione.
 *
 * Vive in un componente suo perché la TL si scrive nel prodotto (0.157.0) e
 * prima stava nella materia: ora la stessa casella serve un posto solo, ma non
 * deve divergere se un domani ne servisse un altro.
 */
export function CampoPerimetroTl({
  rilevante,
  verso,
  onChange,
}: {
  rilevante: boolean;
  verso: 'COLLABORATIVA' | 'RESISTENZA' | null;
  onChange: (patch: {
    rilevantePerimetro?: boolean;
    versoPerimetro?: 'COLLABORATIVA' | 'RESISTENZA' | null;
  }) => void;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
        Check di perimetro del triage
      </p>
      <label className="mt-2 flex items-start gap-2 text-[11px] text-slate-700">
        <input
          type="checkbox"
          checked={rilevante}
          onChange={(e) =>
            onChange({
              rilevantePerimetro: e.target.checked,
              ...(e.target.checked ? {} : { versoPerimetro: null }),
            })
          }
          className="mt-0.5"
        />
        <span>
          Questa TL entra nella check obbligatoria del triage: senza risposta il triage non si
          chiude.
        </span>
      </label>
      {rilevante && (
        <label className="mt-2 block text-[10px] font-bold uppercase tracking-wider text-slate-600">
          Verso
          <select
            value={verso ?? ''}
            onChange={(e) =>
              onChange({
                versoPerimetro: (e.target.value || null) as 'COLLABORATIVA' | 'RESISTENZA' | null,
              })
            }
            className={`${CLASSE} mt-1`}
          >
            <option value="">Scegli...</option>
            <option value="COLLABORATIVA">
              Collaborativa — l’azienda si muove per restare nel perimetro
            </option>
            <option value="RESISTENZA">Di resistenza — presidio contro una condotta elusiva</option>
          </select>
        </label>
      )}
    </div>
  );
}
