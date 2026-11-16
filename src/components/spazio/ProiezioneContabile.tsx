'use client';

// IL RIQUADRO DELLA PROIEZIONE CONTABILE (0.236.0, due schede dal 0.237.0,
// voci motrici e derivate dal 0.238.0).
//
// Sta nella verifica contabile perché è qui che vive il dato depositato, e
// perché la serie dei differenziali si conta sulla base: il più vecchio
// bilancio in archivio. Due schede, perché sono due letture diverse:
//
//   DIFFERENZIALI  lo scarto di ogni anno dalla base, in euro e in punti della
//                  base, con il passo geometrico che se ne ricava. Solo per le
//                  voci che hanno una serie propria.
//   SIMULAZIONE    i valori: gli anni depositati e quelli costruiti applicando
//                  i differenziali all'ultimo bilancio utile, fino all'anno in
//                  cui la verifica è stata aperta. EBIT, EBITDA, utile,
//                  patrimonio netto, ricavi e liquidità si ricavano dalle
//                  motrici: la formula sta scritta accanto.
//
// Ogni colonna porta il suo nome — «storico» o «calcolato» — e le motrici che
// non hanno una serie utilizzabile restano ferme, dichiarate: non si stimano.

import { useCallback, useEffect, useState } from 'react';
import { CalendarRange, Loader2, TriangleAlert } from 'lucide-react';
import {
  proiezioneContabileAction,
  type RisultatoProiezioneContabile,
} from '@/app/actions/verificaContabile';

const euro = (n: number) => `${Math.round(n).toLocaleString('it-IT')} €`;
const punti = (n: number) =>
  `${n > 0 ? '+' : ''}${(n * 100).toLocaleString('it-IT', { maximumFractionDigits: 1 })}%`;

type Scheda = 'DIFFERENZIALI' | 'SIMULAZIONE';

export function ProiezioneContabile({
  nomeSchema,
  aziendaId,
}: {
  nomeSchema: string;
  aziendaId: number;
}) {
  const [dati, setDati] = useState<RisultatoProiezioneContabile | null>(null);
  const [caricamento, setCaricamento] = useState(true);
  const [scheda, setScheda] = useState<Scheda>('SIMULAZIONE');

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
  const anniCalcolati = proiezione?.annualitaCalcolate ?? [];
  const anniStorici = proiezione?.anniArchivio ?? [];
  const motrici = proiezione?.voci.filter((v) => v.natura === 'MOTRICE') ?? [];
  const derivate = proiezione?.voci.filter((v) => v.natura === 'DERIVATA') ?? [];

  return (
    <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
          <CalendarRange className="w-3.5 h-3.5 text-blue-600" /> 5. Differenziali e simulazione
          fino all’anno della verifica
        </h2>
        {dati?.apertura && (
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Verifica aperta il {dati.apertura.split('-').reverse().join('/')}
          </span>
        )}
      </div>

      {caricamento && (
        <p className="flex items-center gap-2 text-[11px] text-slate-500">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Calcolo dei differenziali…
        </p>
      )}

      {!caricamento && dati && !dati.success && (
        <p className="text-[11px] text-red-700">{dati.error ?? 'Proiezione non calcolabile.'}</p>
      )}

      {proiezione && (
        <>
          <p className="text-[11px] text-slate-600">{proiezione.metodo}</p>

          {anniStorici.length === 0 ? (
            <p className="text-[11px] text-slate-500">
              Nessun bilancio XBRL in archivio: non c’è una base da cui contare i differenziali.
            </p>
          ) : (
            <>
              <div className="flex items-center gap-1 border-b border-slate-200">
                {(
                  [
                    ['DIFFERENZIALI', 'Differenziali'],
                    ['SIMULAZIONE', 'Simulazione'],
                  ] as [Scheda, string][]
                ).map(([valore, etichetta]) => (
                  <button
                    key={valore}
                    type="button"
                    onClick={() => setScheda(valore)}
                    aria-pressed={scheda === valore}
                    className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider border-b-2 -mb-px transition-colors ${
                      scheda === valore
                        ? 'border-blue-600 text-blue-700'
                        : 'border-transparent text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {etichetta}
                  </button>
                ))}
              </div>

              {scheda === 'DIFFERENZIALI' && (
                <div className="space-y-2">
                  <p className="text-[10px] text-slate-500 leading-relaxed">
                    Scarto di ogni anno dalla base, in euro e in punti della base, per le voci che
                    hanno una serie propria. Il passo è la ragione geometrica fra primo e ultimo
                    differenziale: è quello che, applicato ai valori dell’ultimo bilancio,
                    costruisce gli anni nella scheda «Simulazione».
                  </p>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-[11px] border-collapse">
                      <thead>
                        <tr className="text-left text-slate-500">
                          <th className="py-1 pr-3 font-semibold">Voce motrice</th>
                          <th className="py-1 px-2 text-right font-semibold">
                            Base {proiezione.annoBase}
                          </th>
                          {(motrici[0]?.differenziali ?? []).map((d) => (
                            <th key={d.anno} className="py-1 px-2 text-right font-semibold">
                              {d.anno}
                            </th>
                          ))}
                          <th className="py-1 px-2 text-right font-semibold">Passo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {motrici.map((voce) => (
                          <tr key={voce.chiave} className="border-t border-slate-100">
                            <td className="py-1 pr-3 text-slate-700">
                              {voce.etichetta}
                              {!voce.proiettabile && (
                                <span className="ml-1.5 text-slate-400">(ferma)</span>
                              )}
                            </td>
                            <td className="py-1 px-2 text-right tabular-nums text-slate-700">
                              {voce.valoreBase === null ? '—' : euro(voce.valoreBase)}
                            </td>
                            {(motrici[0]?.differenziali ?? []).map((riga) => {
                              const d = voce.differenziali.find((x) => x.anno === riga.anno);
                              return (
                                <td
                                  key={riga.anno}
                                  className="py-1 px-2 text-right tabular-nums text-slate-600"
                                >
                                  {!d ? (
                                    '—'
                                  ) : (
                                    <>
                                      <span className="block">{euro(d.scarto)}</span>
                                      <span className="block text-[10px] text-slate-400">
                                        {d.differenziale === null
                                          ? 'base zero'
                                          : punti(d.differenziale)}
                                      </span>
                                    </>
                                  )}
                                </td>
                              );
                            })}
                            <td className="py-1 px-2 text-right tabular-nums text-slate-700">
                              {voce.passo === null
                                ? '—'
                                : voce.passo.toLocaleString('it-IT', { maximumFractionDigits: 2 })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="pt-1 space-y-1">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Voci derivate — non hanno una serie propria
                    </p>
                    {derivate.map((voce) => (
                      <p key={voce.chiave} className="text-[10px] text-slate-600">
                        <strong className="text-slate-700">{voce.etichetta}</strong> ={' '}
                        {voce.formula}
                      </p>
                    ))}
                  </div>
                </div>
              )}

              {scheda === 'SIMULAZIONE' && (
                <div className="space-y-2">
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-[11px] border-collapse">
                      <thead>
                        <tr className="text-left text-slate-500">
                          <th className="py-1 pr-3 font-semibold">Voce</th>
                          {anniStorici.map((anno) => (
                            <th key={anno} className="py-1 px-2 text-right font-semibold">
                              {anno}
                              <span className="block text-[8px] font-normal text-slate-400">
                                storico
                              </span>
                            </th>
                          ))}
                          {anniCalcolati.map((anno) => (
                            <th
                              key={anno}
                              className="py-1 px-2 text-right font-semibold text-blue-700"
                              title={`Calcolato: differenziali sulla base ${proiezione.annoBase}, applicati ai valori del ${proiezione.annoUltimoBilancio}`}
                            >
                              {anno}
                              <span className="block text-[8px] font-normal text-blue-500">
                                calcolato
                              </span>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {proiezione.voci.map((voce) => (
                          <tr key={voce.chiave} className="border-t border-slate-100">
                            <td className="py-1 pr-3 text-slate-700">
                              {voce.etichetta}
                              {voce.natura === 'DERIVATA' && (
                                <span
                                  className="ml-1.5 text-[9px] uppercase tracking-wider text-slate-400"
                                  title={voce.formula ?? undefined}
                                >
                                  derivata
                                </span>
                              )}
                              {voce.natura === 'MOTRICE' && !voce.proiettabile && (
                                <span className="ml-1.5 text-slate-400">(ferma)</span>
                              )}
                            </td>
                            {voce.storico.map((s) => (
                              <td
                                key={s.anno}
                                className="py-1 px-2 text-right text-slate-700 tabular-nums"
                              >
                                {s.valore === null ? '—' : euro(s.valore)}
                              </td>
                            ))}
                            {anniCalcolati.map((anno) => {
                              const p = voce.proiezioni.find((x) => x.anno === anno);
                              const spenta =
                                voce.natura === 'MOTRICE'
                                  ? !voce.proiettabile
                                  : voce.motivo !== null;
                              return (
                                <td
                                  key={anno}
                                  className={`py-1 px-2 text-right tabular-nums ${
                                    spenta ? 'text-slate-400' : 'text-blue-800'
                                  }`}
                                >
                                  {p ? euro(p.valore) : '—'}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {anniCalcolati.length > 0 && (
                    <p className="text-[10px] text-slate-500 leading-relaxed">
                      «Calcolato» non è «previsto»: valore della produzione, costi, oneri e debiti
                      seguono la stessa ragione geometrica dei differenziali, applicata ai valori
                      del {proiezione.annoUltimoBilancio} fino al {proiezione.annoVerifica}; le voci
                      derivate si ricavano da quelli. «Storico» è il dato depositato, così com’è.
                    </p>
                  )}
                </div>
              )}
            </>
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
            .filter((v) => v.motivo !== null && v.natura === 'MOTRICE')
            .slice(0, 4)
            .map((v) => (
              <p key={v.chiave} className="text-[10px] text-slate-500">
                {v.etichetta}: {v.motivo}
              </p>
            ))}
        </>
      )}
    </section>
  );
}
