'use client';

// COPERTINA DELLO SCREENING — l'Indice di Attenzione Istruttoria in una
// pagina: quadrante, cinque barre, vincoli scattati, tre righe di sintesi
// generate dai numeri. Chi vuole il resto scorre alla relazione.

import React, { useEffect, useState } from 'react';
import { Gauge, AlertTriangle } from 'lucide-react';
import { calcolaIaiAction } from '@/app/actions/iai';
import {
  BASI_METODOLOGICHE_IAI,
  DICHIARAZIONE_IAI,
  NOME_DIMENSIONE,
  RIFERIMENTI_NORMATIVI_IAI,
  type EsitoIai,
} from '@/lib/iai/indice';

interface Props {
  nomeSchema: string;
  aziendaId: number;
  tipoSpazio: 'ENTE' | 'NON_ENTE';
  /** Cambia quando cambiano i dati (nuovo Screening): l'indice si ricalcola. */
  versione: number;
  /** Intestazione della copertina stampata. */
  intestazione: { azienda: string; codiceFiscale: string | null; ente: string };
  onCalcolato?: (esito: EsitoIai) => void;
  /** Il pulsante di stampa unico dello Screening, reso dal padre. */
  azioneStampa?: React.ReactNode;
}

const COLORE_FASCIA = ['#059669', '#d97706', '#ea580c', '#dc2626'];

function Quadrante({ valore, colore }: { valore: number; colore: string }) {
  // semicerchio 0-100, da sinistra a destra
  const angolo = Math.PI - (valore / 100) * Math.PI;
  const x = 100 + 80 * Math.cos(angolo);
  const y = 100 - 80 * Math.sin(angolo);
  const grande = valore > 50 ? 1 : 0;
  return (
    <svg
      viewBox="0 0 200 115"
      className="w-56 h-32"
      role="img"
      aria-label={`Indice ${valore} su 100`}
    >
      <path
        d="M 20 100 A 80 80 0 0 1 180 100"
        fill="none"
        stroke="#e2e8f0"
        strokeWidth="14"
        strokeLinecap="round"
      />
      {valore > 0 && (
        <path
          d={`M 20 100 A 80 80 0 ${grande} 1 ${x.toFixed(1)} ${y.toFixed(1)}`}
          fill="none"
          stroke={colore}
          strokeWidth="14"
          strokeLinecap="round"
        />
      )}
      <text x="100" y="92" textAnchor="middle" fontSize="34" fontWeight="700" fill="#0f172a">
        {valore}
      </text>
      <text x="100" y="110" textAnchor="middle" fontSize="10" fill="#64748b">
        IAI su 100
      </text>
    </svg>
  );
}

export function CopertinaIai({
  nomeSchema,
  aziendaId,
  tipoSpazio,
  versione,
  intestazione,
  onCalcolato,
  azioneStampa,
}: Props) {
  const [riferimenti, setRiferimenti] = useState(false);
  const [esito, setEsito] = useState<EsitoIai | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [dettaglio, setDettaglio] = useState(false);

  useEffect(() => {
    calcolaIaiAction(nomeSchema, aziendaId, tipoSpazio).then((r) => {
      if (r.success && r.esito) {
        setEsito(r.esito);
        onCalcolato?.(r.esito);
      } else setErrore(r.error ?? 'Indice non calcolabile.');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nomeSchema, aziendaId, tipoSpazio, versione]);

  if (errore) return <p className="text-xs text-red-700">{errore}</p>;
  if (!esito) return null;
  const colore = COLORE_FASCIA[esito.fascia.indiceFascia] ?? COLORE_FASCIA[3];

  return (
    <section
      className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
      aria-label="Indice di Attenzione Istruttoria"
    >
      <div className="flex items-start gap-2 border-b border-slate-100 pb-3">
        <Gauge className="w-4 h-4 text-blue-600 mt-0.5" />
        <div>
          <h2 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
            Indice di Attenzione Istruttoria
          </h2>
          <p className="text-[11px] text-slate-600 mt-0.5">
            In una pagina: quanta attenzione merita la posizione dal livello decisionale successivo,
            e perché.
          </p>
        </div>
        {azioneStampa}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-start">
        <div className="flex flex-col items-center">
          <Quadrante valore={esito.indice} colore={colore} />
          <span
            className="text-xs font-bold uppercase tracking-wider px-2 py-1 rounded"
            style={{ background: `${colore}22`, color: colore }}
          >
            {esito.fascia.nome}
          </span>
          <p className="text-[11px] text-slate-600 text-center mt-2">{esito.fascia.lettura}</p>
        </div>

        <div className="md:col-span-2 space-y-2">
          {esito.componenti.map((c) => (
            <div key={c.dimensione} className="flex items-center gap-3">
              <span className="w-56 shrink-0 text-[11px] text-slate-700">
                <strong>{c.dimensione}</strong> · {NOME_DIMENSIONE[c.dimensione]}
              </span>
              <div
                className="flex-1 h-3 bg-slate-100 rounded overflow-hidden"
                title={c.motivi.join('; ') || 'nessun determinante'}
              >
                <div
                  className="h-3 rounded"
                  style={{
                    width: `${c.punteggio}%`,
                    background:
                      c.punteggio > 75
                        ? COLORE_FASCIA[3]
                        : c.punteggio > 55
                          ? COLORE_FASCIA[2]
                          : c.punteggio > 30
                            ? COLORE_FASCIA[1]
                            : COLORE_FASCIA[0],
                  }}
                />
              </div>
              <span className="w-8 text-right text-xs font-bold text-slate-900">{c.punteggio}</span>
            </div>
          ))}
          {esito.vincoliScattati.length > 0 && (
            <ul className="mt-2 space-y-1">
              {esito.vincoliScattati.map((v) => (
                <li key={v.nome} className="text-[11px] text-red-800 flex gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span>
                    Vincolo: {v.nome} — l’indice non scende sotto {v.minimo}, qualunque sia il
                    resto.
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <pre className="whitespace-pre-wrap text-xs text-slate-800 bg-slate-50 border border-slate-200 rounded-lg p-3 font-sans leading-relaxed">
        {esito.sintesi}
      </pre>

      <button
        type="button"
        onClick={() => setDettaglio((v) => !v)}
        className="text-[10px] font-bold uppercase text-slate-500 hover:text-blue-700"
      >
        {dettaglio ? 'Nascondi' : 'Mostra'} determinanti e lacune per dimensione
      </button>
      {dettaglio && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {esito.componenti.map((c) => (
            <div key={c.dimensione} className="border border-slate-200 rounded-lg p-3 text-[11px]">
              <p className="font-bold text-slate-900">
                {c.dimensione} · {NOME_DIMENSIONE[c.dimensione]} — {c.punteggio}
              </p>
              {c.motivi.length > 0 && (
                <ul className="list-disc pl-4 text-slate-700 mt-1">
                  {c.motivi.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              )}
              {c.lacune.length > 0 && (
                <ul className="list-disc pl-4 text-amber-800 mt-1">
                  {c.lacune.map((l) => (
                    <li key={l}>lacuna: {l}</li>
                  ))}
                </ul>
              )}
              {c.motivi.length === 0 && c.lacune.length === 0 && (
                <p className="text-slate-500 mt-1">Nessun determinante.</p>
              )}
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => setRiferimenti((v) => !v)}
        className="text-[10px] font-bold uppercase text-slate-500 hover:text-blue-700"
      >
        {riferimenti ? 'Nascondi' : 'Mostra'} riferimenti normativi e basi metodologiche
      </button>
      {riferimenti && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[10px] text-slate-700">
          <div>
            <p className="font-bold text-slate-900 mb-1">Riferimenti normativi per dimensione</p>
            <ul className="space-y-1">
              {RIFERIMENTI_NORMATIVI_IAI.map((r) => (
                <li key={r.rif}>
                  <b>{r.dimensione}</b> · {r.rif}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="font-bold text-slate-900 mb-1">Basi metodologiche</p>
            <ul className="space-y-1">
              {BASI_METODOLOGICHE_IAI.map((b) => (
                <li key={b.rif}>
                  {b.rif} <span className="text-slate-500">— {b.uso}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      <p className="text-[10px] text-slate-400 italic">{DICHIARAZIONE_IAI}</p>
    </section>
  );
}
