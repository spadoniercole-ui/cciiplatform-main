'use client';

// CONFRONTA I PIANI — il link che sta subito dopo la parte operativa.
//
// I piani restano tutti in memoria (base, azienda, AI, varianti salvare): qui
// l'istruttore sceglie quali mettere nella tabella riassuntiva. Non è un
// secondo motore di calcolo: ogni colonna passa dallo stesso `calcolaPiano`
// che alimenta il piano di sviluppo, così il confronto non può dire numeri
// diversi da quelli delle singole schede.

import React, { useEffect, useState } from 'react';
import { ChevronDown, Scale } from 'lucide-react';
import { ottieniPianoSviluppoAction, type DatiPianoSviluppo } from '@/app/actions/pianoSviluppo';
import { ottieniConfrontoPianoAction, type DatiConfrontoPiano } from '@/app/actions/pianoAziendale';
import { calcolaPiano, euro } from '@/lib/piano/piano';
import { ipotesiDaPianoAzienda } from '@/lib/piano/pianoAziendale';
import { VARIANTE_AI } from '@/lib/piano/elaborazioneAi';

interface Props {
  nomeSchema: string;
  scenarioId: number;
  aziendaId: number;
  dati: DatiPianoSviluppo;
  orizzonte: number;
}

interface PianoConfronto {
  chiave: string;
  nome: string;
  ebitda: number;
  utile: number;
  cassaMinima: number;
  patrimonio: number;
  vincoli: number;
}

const nomeVariante = (v: string): string =>
  v === 'base' ? 'Piano base' : v === VARIANTE_AI ? 'Piano AI' : `Variante ${v}`;

export function ConfrontaPianiScenario({
  nomeSchema,
  scenarioId,
  aziendaId,
  dati,
  orizzonte,
}: Props) {
  const [aperto, setAperto] = useState(false);
  const [piani, setPiani] = useState<PianoConfronto[]>([]);
  const [selezionati, setSelezionati] = useState<string[]>([]);
  const [caricamento, setCaricamento] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  useEffect(() => {
    if (!aperto) return;
    let annullato = false;
    setCaricamento(true);
    setErrore(null);
    void (async () => {
      try {
        const base = dati.storico[0];
        if (!base) return;
        const rate = {
          ente: dati.rate.ente.slice(0, orizzonte),
          altri: dati.rate.altri.slice(0, orizzonte),
        };
        const out: PianoConfronto[] = [];

        const conf: DatiConfrontoPiano | null = await ottieniConfrontoPianoAction(
          nomeSchema,
          scenarioId,
          aziendaId
        ).then((r) => (r.success ? (r.dati ?? null) : null));
        if (conf?.piano) {
          const esito = calcolaPiano(
            base,
            orizzonte,
            ipotesiDaPianoAzienda(conf.piano.valori, base.anno + 1, orizzonte),
            rate,
            dati.capitaleSociale
          );
          const ultimo = esito.anni[esito.anni.length - 1];
          out.push({
            chiave: 'azienda',
            nome: `Piano azienda${conf.piano.nomeFile ? ` (${conf.piano.nomeFile})` : ''}`,
            ebitda: ultimo?.ebitda ?? 0,
            utile: ultimo?.utile ?? 0,
            cassaMinima: esito.cassaMinima,
            patrimonio: ultimo?.patrimonioNetto ?? 0,
            vincoli: esito.vincoli.length,
          });
        }

        for (const v of Array.from(new Set(dati.varianti))) {
          const corrente = v === dati.variante;
          const datiV = corrente
            ? dati
            : (await ottieniPianoSviluppoAction(nomeSchema, scenarioId, aziendaId, v)).dati;
          if (!datiV?.storico.length) continue;
          const esito = calcolaPiano(
            datiV.storico[0],
            orizzonte,
            datiV.ipotesi,
            rate,
            datiV.capitaleSociale
          );
          const ultimo = esito.anni[esito.anni.length - 1];
          out.push({
            chiave: v,
            nome: nomeVariante(v),
            ebitda: ultimo?.ebitda ?? 0,
            utile: ultimo?.utile ?? 0,
            cassaMinima: esito.cassaMinima,
            patrimonio: ultimo?.patrimonioNetto ?? 0,
            vincoli: esito.vincoli.length,
          });
        }

        if (annullato) return;
        setPiani(out);
        setSelezionati((precedenti) => {
          const validi = new Set(out.map((p) => p.chiave));
          const tenuti = precedenti.filter((k) => validi.has(k));
          return tenuti.length ? tenuti : out.map((p) => p.chiave);
        });
      } catch (e) {
        if (!annullato) setErrore(e instanceof Error ? e.message : String(e));
      } finally {
        if (!annullato) setCaricamento(false);
      }
    })();
    return () => {
      annullato = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aperto, nomeSchema, scenarioId, aziendaId, dati, orizzonte]);

  const scelti = piani.filter((p) => selezionati.includes(p.chiave));

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
      <button
        type="button"
        onClick={() => setAperto((v) => !v)}
        className="flex w-full items-center gap-2 text-left"
      >
        <Scale className="w-4 h-4 text-blue-600 shrink-0" />
        <span className="flex-1">
          <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-900">
            Confronta i piani
          </span>
          <span className="block text-[11px] text-slate-500">
            Tabella riassuntiva dei piani tenuti in memoria: azienda, AI, base e varianti.
          </span>
        </span>
        <ChevronDown
          className={`w-4 h-4 text-slate-400 transition-transform ${aperto ? 'rotate-180' : ''}`}
        />
      </button>

      {aperto && (
        <div className="space-y-3 border-t border-slate-100 pt-3">
          {caricamento && <p className="text-[11px] text-slate-500">Lettura dei piani…</p>}
          {errore && (
            <p className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">
              {errore}
            </p>
          )}
          {!caricamento && piani.length === 0 && (
            <p className="text-[11px] text-slate-500">Nessun piano disponibile da confrontare.</p>
          )}
          {piani.length > 0 && (
            <>
              <div className="flex flex-wrap gap-3">
                {piani.map((p) => (
                  <label
                    key={p.chiave}
                    className="flex items-center gap-1.5 text-[11px] text-slate-700"
                  >
                    <input
                      type="checkbox"
                      checked={selezionati.includes(p.chiave)}
                      onChange={(e) =>
                        setSelezionati((prev) =>
                          e.target.checked
                            ? [...prev, p.chiave]
                            : prev.filter((k) => k !== p.chiave)
                        )
                      }
                    />
                    {p.nome}
                  </label>
                ))}
              </div>
              {scelti.length === 0 ? (
                <p className="text-[11px] text-amber-800">
                  Seleziona almeno un piano per vedere il confronto.
                </p>
              ) : (
                <div className="overflow-x-auto border border-slate-200 rounded-lg">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 text-[9px] uppercase text-slate-500">
                      <tr>
                        <th className="px-2 py-2 text-left font-bold min-w-48">Voce</th>
                        {scelti.map((p) => (
                          <th key={p.chiave} className="px-2 py-2 text-right font-bold min-w-32">
                            {p.nome}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(
                        [
                          {
                            etichetta: 'EBITDA ultimo anno',
                            valore: (p: PianoConfronto) => euro(p.ebitda),
                          },
                          {
                            etichetta: 'Risultato ultimo anno',
                            valore: (p: PianoConfronto) => euro(p.utile),
                          },
                          {
                            etichetta: 'Cassa minima',
                            valore: (p: PianoConfronto) => euro(p.cassaMinima),
                          },
                          {
                            etichetta: 'Patrimonio netto finale',
                            valore: (p: PianoConfronto) => euro(p.patrimonio),
                          },
                          {
                            etichetta: 'Vincoli che scattano',
                            valore: (p: PianoConfronto) => String(p.vincoli),
                          },
                        ] as { etichetta: string; valore: (p: PianoConfronto) => string }[]
                      ).map(({ etichetta, valore }) => (
                        <tr key={etichetta}>
                          <td className="px-2 py-1.5 text-slate-800">{etichetta}</td>
                          {scelti.map((p) => (
                            <td
                              key={p.chiave}
                              className="px-2 py-1.5 text-right tabular-nums text-slate-900"
                            >
                              {valore(p)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="text-[10px] text-slate-500">
                Ogni colonna è calcolata con lo stesso motore del piano di sviluppo. Il confronto
                non è un giudizio: serve a vedere dove i piani divergono.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
