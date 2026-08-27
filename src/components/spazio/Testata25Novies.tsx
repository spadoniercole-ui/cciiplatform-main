'use client';

// Testata art. 25-novies: il verdetto sulle soglie di segnalazione, in EVIDENZA
// e in TESTA (allo Screening, alla scheda Soglie, alla Posizione Ente).
//
// Per il ricevente (ENTE) è l'elemento decisivo: se la soglia risulta già
// superata, l'art. 25-novies è (salvo il requisito dei 90 giorni) integrato e
// la relazione istruttoria diventa CORROBORANTE della segnalazione all'azienda
// e/o all'organo di controllo. Per questo va letto per primo, non in fondo.
//
// Non memorizza nulla: ricalcola al volo da valutaSoglieAction (+ i controlli
// di coerenza), così non può divergere dai dati.

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Scale,
  ShieldAlert,
  ShieldCheck,
  HelpCircle,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import {
  valutaSoglieAction,
  verificaCoerenzaSoglieAction,
  type RisultatoEsitoSoglie,
  type RisultatoCoerenzaSoglie,
} from '@/app/actions/soglie25novies';
import { ETICHETTA_ENTE, type EsitoSoglie } from '@/lib/soglie25novies/calcolo';
import { linkNormativaArticolo } from '@/lib/normativa/riferimenti';

interface Props {
  nomeSchema: string;
  aziendaId: number;
  /** Codice spazio, per il link alla Normativa. Facoltativo: se assente il link è omesso. */
  codice?: string;
  tipoSpazio: 'ENTE' | 'NON_ENTE';
  /** Link alla scheda Soglie per compilare/correggere i valori (facoltativo). */
  hrefScheda?: string;
  /** Solo verdetto + avvisi, senza la griglia di dettaglio (per la scheda Soglie,
   *  che la griglia la mostra già sotto). */
  compatta?: boolean;
  /** Cambia questo valore per forzare il ricalcolo (es. dopo un salvataggio). */
  refreshKey?: number;
}

const euro = (n: number | null) =>
  n === null || n === undefined ? '—' : `${Math.round(n).toLocaleString('it-IT')} €`;

type Verdetto = 'superata' | 'sotto' | 'da_verificare';

function verdettoDa(esito: EsitoSoglie): Verdetto {
  if (esito.superate.length > 0) return 'superata';
  const applicabili = esito.righe.filter((r) => r.applicabile);
  if (applicabili.length === 0 || esito.nonDeterminabili.length > 0) return 'da_verificare';
  return 'sotto';
}

const STILE: Record<
  Verdetto,
  { icona: typeof ShieldAlert; bordo: string; sfondo: string; testo: string; titolo: string }
> = {
  superata: {
    icona: ShieldAlert,
    bordo: 'border-red-300',
    sfondo: 'bg-red-50',
    testo: 'text-red-800',
    titolo: 'Soglia di segnalazione SUPERATA',
  },
  da_verificare: {
    icona: HelpCircle,
    bordo: 'border-amber-300',
    sfondo: 'bg-amber-50',
    testo: 'text-amber-800',
    titolo: 'Soglia di segnalazione — DA VERIFICARE',
  },
  sotto: {
    icona: ShieldCheck,
    bordo: 'border-emerald-300',
    sfondo: 'bg-emerald-50',
    testo: 'text-emerald-800',
    titolo: 'Soglia di segnalazione — sotto soglia',
  },
};

function badge(esito: 'sotto' | 'sopra' | 'non_determinabile') {
  const m = {
    sopra: { t: 'Oltre soglia', c: 'bg-red-100 text-red-800 border-red-200' },
    sotto: { t: 'Sotto soglia', c: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
    non_determinabile: { t: 'Da verificare', c: 'bg-slate-100 text-slate-600 border-slate-200' },
  }[esito];
  return (
    <span
      className={`inline-block text-[9px] font-bold uppercase tracking-wider border rounded px-1.5 py-0.5 whitespace-nowrap ${m.c}`}
    >
      {m.t}
    </span>
  );
}

export function Testata25Novies({
  nomeSchema,
  aziendaId,
  codice,
  tipoSpazio,
  hrefScheda,
  compatta,
  refreshKey,
}: Props) {
  const [ris, setRis] = useState<RisultatoEsitoSoglie | null>(null);
  const [coe, setCoe] = useState<RisultatoCoerenzaSoglie | null>(null);
  const [caricamento, setCaricamento] = useState(true);

  useEffect(() => {
    let vivo = true;
    (async () => {
      setCaricamento(true);
      const [r, c] = await Promise.all([
        valutaSoglieAction(nomeSchema, aziendaId, tipoSpazio),
        verificaCoerenzaSoglieAction(nomeSchema, aziendaId),
      ]);
      if (!vivo) return;
      setRis(r);
      setCoe(c);
      setCaricamento(false);
    })();
    return () => {
      vivo = false;
    };
  }, [nomeSchema, aziendaId, tipoSpazio, refreshKey]);

  if (caricamento) {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-400 border border-slate-200 rounded-xl p-4">
        <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Verifica art. 25-novies…
      </div>
    );
  }
  if (!ris?.success || !ris.esito) {
    return (
      <div className="text-xs text-slate-500 border border-slate-200 rounded-xl p-4">
        Art. 25-novies non valutabile: {ris?.error || 'dati non disponibili.'}
        {hrefScheda && (
          <>
            {' '}
            <Link href={hrefScheda} className="text-blue-600 underline">
              Compila i valori
            </Link>
          </>
        )}
      </div>
    );
  }

  const esito = ris.esito;
  const applicabili = esito.righe.filter((r) => r.applicabile);
  const verdetto = verdettoDa(esito);
  const stile = STILE[verdetto];
  const Icona = stile.icona;
  const avvisi = coe?.success ? (coe.coerenza?.avvisi ?? []) : [];
  const enteTxt = ris.ente ? ETICHETTA_ENTE[ris.ente] : null;

  return (
    <div className={`border ${stile.bordo} ${stile.sfondo} rounded-xl overflow-hidden`}>
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className={`inline-flex p-2 rounded-lg bg-white/70 ${stile.testo} shrink-0`}>
            <Icona className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Scale className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Art. 25-novies · Soglie di segnalazione{enteTxt ? ` · ${enteTxt}` : ''}
              </span>
              {codice && (
                <Link
                  href={linkNormativaArticolo(codice, '25-novies')}
                  className="text-[9px] font-bold text-blue-600 border border-blue-200 rounded px-1.5 py-0.5 hover:bg-blue-50"
                >
                  Vedi articolo
                </Link>
              )}
            </div>
            <h3 className={`text-sm font-bold ${stile.testo} mt-1`}>{stile.titolo}</h3>

            {verdetto === 'superata' && tipoSpazio === 'ENTE' && (
              <p className="text-[11px] text-slate-700 leading-relaxed mt-1">
                Il presupposto della segnalazione risulta <strong>integrato</strong> (salvo verifica
                del ritardo di oltre 90 giorni). La relazione istruttoria è quindi{' '}
                <strong>corroborante</strong> della segnalazione all&apos;azienda e/o
                all&apos;organo di controllo, e a supporto di un eventuale confronto con la
                dirigenza dell&apos;Istituto.
              </p>
            )}
            {verdetto === 'superata' && tipoSpazio !== 'ENTE' && (
              <p className="text-[11px] text-slate-700 leading-relaxed mt-1">
                Almeno una soglia risulta superata: l&apos;impresa è esposta alla segnalazione del
                creditore pubblico (salvo verifica del ritardo di oltre 90 giorni).
              </p>
            )}
            {verdetto === 'da_verificare' && (
              <p className="text-[11px] text-slate-700 leading-relaxed mt-1">
                Esito non determinabile con i dati inseriti: completare la mappa dei valori.
                {hrefScheda && (
                  <>
                    {' '}
                    <Link href={hrefScheda} className="text-blue-700 underline font-semibold">
                      Vai alla scheda Soglie
                    </Link>
                  </>
                )}
              </p>
            )}
          </div>
        </div>

        {/* Griglia delle righe applicabili */}
        {!compatta && applicabili.length > 0 && (
          <div className="mt-3 bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 text-left text-[10px] uppercase tracking-wider text-slate-500">
                    <th className="px-3 py-2 font-bold">Ambito</th>
                    <th className="px-3 py-2 font-bold text-right">Esposizione</th>
                    <th className="px-3 py-2 font-bold">Soglia</th>
                    <th className="px-3 py-2 font-bold">Esito</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {applicabili.map((r, i) => (
                    <tr key={i} className="align-top">
                      <td className="px-3 py-2.5">
                        <div className="font-semibold text-slate-800">{r.ambito}</div>
                        <div className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">
                          {r.motivo}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 font-mono font-bold text-slate-900 text-right whitespace-nowrap">
                        {euro(r.esposizione)}
                      </td>
                      <td className="px-3 py-2.5 text-slate-600 leading-relaxed">{r.valore}</td>
                      <td className="px-3 py-2.5">{badge(r.esito)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {esito.inpsSopraSoloConSanzioni && (
          <p className="text-[10px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 mt-2">
            Nota: sui soli contributi la soglia INPS non è superata, ma lo sarebbe includendo le
            sanzioni presunte del VERA — che però restano fuori dal test (si determinano al
            pagamento).
          </p>
        )}

        {/* Avvisi di coerenza (non bloccanti) */}
        {avvisi.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {avvisi.map((a, i) => (
              <div
                key={i}
                className="flex items-start gap-2 text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-2.5"
              >
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-600" />
                <span className="leading-relaxed">{a}</span>
              </div>
            ))}
          </div>
        )}

        {/* Trasparenza: cosa non è stato verificato */}
        {!compatta && esito.datiMancanti.length > 0 && (
          <details className="mt-2">
            <summary className="text-[10px] font-bold uppercase tracking-wider text-slate-400 cursor-pointer">
              Cosa non è stato verificato ({esito.datiMancanti.length})
            </summary>
            <ul className="mt-1 space-y-1">
              {esito.datiMancanti.map((d, i) => (
                <li key={i} className="text-[10px] text-slate-500 leading-relaxed">
                  • {d}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </div>
  );
}
