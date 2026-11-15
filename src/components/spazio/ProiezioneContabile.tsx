'use client';

// IL RIQUADRO DELLA PROIEZIONE CONTABILE (0.236.0).
//
// Sta nella verifica contabile perché è qui che vive il dato depositato, e
// perché la serie degli scarti si conta sulla base: il più vecchio bilancio in
// archivio. Il riquadro mostra gli anni d'archivio, gli scarti contati sulla
// base, e le annualità proiettate fino all'anno in cui la verifica è stata
// aperta. Le voci che non hanno una serie utilizzabile restano ferme, e la
// riga lo dice: non si stimano.

import { useCallback, useEffect, useState } from 'react';
import { CalendarRange, Loader2, TriangleAlert } from 'lucide-react';
import {
  proiezioneContabileAction,
  type RisultatoProiezioneContabile,
} from '@/app/actions/verificaContabile';

const euro = (n: number) => `${Math.round(n).toLocaleString('it-IT')} €`;

export function ProiezioneContabile({
  nomeSchema,
  aziendaId,
}: {
  nomeSchema: string;
  aziendaId: number;
}) {
  const [dati, setDati] = useState<RisultatoProiezioneContabile | null>(null);
  const [caricamento, setCaricamento] = useState(true);

  const carica = useCallback(async () => {
    setCaricamento(true);
    const r = await proiezioneContabileAction(nomeSchema, aziendaId);
    setDati(r);
    setCaricamento(false);
  }, [nomeSchema, aziendaId]);

  useEffect(() => {
    void carica();
  }, [carica]);

  const proiezione = dati?.success ? dati.proiezione : null;

  return (
    <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
          <CalendarRange className="w-3.5 h-3.5 text-blue-600" /> 5. Proiezione all’anno della
          verifica
        </h2>
        {dati?.apertura && (
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Verifica aperta il {dati.apertura.split('-').reverse().join('/')}
          </span>
        )}
      </div>

      {caricamento && (
        <p className="flex items-center gap-2 text-[11px] text-slate-500">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Calcolo della serie…
        </p>
      )}

      {!caricamento && dati && !dati.success && (
        <p className="text-[11px] text-red-700">{dati.error ?? 'Proiezione non calcolabile.'}</p>
      )}

      {proiezione && (
        <>
          <p className="text-[11px] text-slate-600">{proiezione.metodo}</p>

          {proiezione.anniArchivio.length === 0 ? (
            <p className="text-[11px] text-slate-500">
              Nessun bilancio XBRL in archivio: non c’è una base da cui contare gli scarti.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-[11px] border-collapse">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="py-1 pr-3 font-semibold">Voce</th>
                    {proiezione.anniArchivio.map((anno) => (
                      <th key={anno} className="py-1 px-2 text-right font-semibold">
                        {anno}
                      </th>
                    ))}
                    {proiezione.annualitaProiettate.map((anno) => (
                      <th
                        key={anno}
                        className="py-1 px-2 text-right font-semibold text-blue-700"
                        title={`Ipotesi: serie geometrica degli scarti, portata al ${anno}`}
                      >
                        {anno}*
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {proiezione.voci.map((voce) => {
                    const valoriArchivio = proiezione.anniArchivio.map((anno) => {
                      if (anno === proiezione.annoBase) return voce.valoreBase;
                      const scarto = voce.scarti.find((s) => s.anno === anno);
                      return scarto ? scarto.valore : null;
                    });
                    return (
                      <tr key={voce.chiave} className="border-t border-slate-100">
                        <td className="py-1 pr-3 text-slate-700">
                          {voce.etichetta}
                          {!voce.proiettabile && (
                            <span className="ml-1.5 text-slate-400">(ferma)</span>
                          )}
                        </td>
                        {valoriArchivio.map((valore, i) => (
                          <td
                            key={proiezione.anniArchivio[i]}
                            className="py-1 px-2 text-right text-slate-700 tabular-nums"
                          >
                            {valore === null ? '—' : euro(valore)}
                          </td>
                        ))}
                        {proiezione.annualitaProiettate.map((anno) => {
                          const p = voce.proiezioni.find((x) => x.anno === anno);
                          return (
                            <td
                              key={anno}
                              className={`py-1 px-2 text-right tabular-nums ${
                                voce.proiettabile ? 'text-blue-800' : 'text-slate-400'
                              }`}
                            >
                              {p ? euro(p.valore) : '—'}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {proiezione.annualitaProiettate.length > 0 && proiezione.proiettabile && (
            <p className="text-[10px] text-slate-500">
              * annualità ipotizzate: la stessa ragione geometrica degli scarti, applicata fino al{' '}
              {proiezione.annoVerifica}. Non sono previsioni.
            </p>
          )}

          <ul className="space-y-1">
            {proiezione.avvertenze.map((a) => (
              <li key={a} className="flex items-start gap-1.5 text-[10px] text-slate-600">
                <TriangleAlert className="w-3 h-3 mt-0.5 shrink-0 text-amber-600" />
                {a}
              </li>
            ))}
          </ul>

          {proiezione.voci
            .filter((v) => v.passo !== null && Math.abs(v.passo) !== 1)
            .slice(0, 3)
            .map((v) => (
              <p key={v.chiave} className="text-[10px] text-slate-500">
                {v.etichetta}: scarti {v.scarti.map((s) => euro(s.scarto)).join(' → ')} · passo{' '}
                {v.passo!.toLocaleString('it-IT', { maximumFractionDigits: 2 })}
              </p>
            ))}
        </>
      )}
    </section>
  );
}
