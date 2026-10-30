import Link from 'next/link';
import { AlertTriangle, TrendingUp } from 'lucide-react';
import type { RiepilogoVista, RigaVistaContributi } from '@/lib/soglie25novies/vistaSpazio';

// La vista d'insieme dei contributi per anno: una riga per azienda, una
// colonna per esercizio. Serve a decidere dove guardare — chi sale di più sta
// in alto — non a decidere l'esito: quello resta nella scheda Indici, con il
// dettaglio dei singoli anni.
//
// Le serie ricostruite sono dichiarate nella colonna «Fonte»: una quota letta
// dal triage non è la lettura dei fogli INPS, e il ritardo oltre 90 giorni che
// non è stato misurato resta «—», non zero.

interface Props {
  codice: string;
  righe: RigaVistaContributi[];
  riepilogo: RiepilogoVista;
  /** Aziende senza serie conservata: il ricalcolo non le ha ancora toccate. */
  senzaSerie: number;
  errore: string | null;
}

const euro = (v: number | null) =>
  v === null ? '—' : `${Math.round(v).toLocaleString('it-IT')} €`;

const quota = (q: number | null) =>
  q === null ? '—' : `${(q * 100).toLocaleString('it-IT', { maximumFractionDigits: 1 })}%`;

const punti = (v: number | null) =>
  v === null
    ? '—'
    : `${v > 0 ? '+' : ''}${v.toLocaleString('it-IT', { maximumFractionDigits: 1 })} pt`;

const fonte = (r: RigaVistaContributi) => {
  const base =
    r.origine === 'file'
      ? 'DM10 / inadempienze'
      : r.origine === 'posizioni'
        ? 'posizioni triage'
        : 'valori conservati';
  if (!r.ricostruitaIl || r.origine === 'file') return base;
  return `${base} · ${new Date(`${r.ricostruitaIl}T00:00:00Z`).toLocaleDateString('it-IT')}`;
};

export function VistaContributiSpazio({ codice, righe, riepilogo, senzaSerie, errore }: Props) {
  // Gli anni di tutte le serie: una colonna per esercizio, anche se qualche
  // azienda non lo copre. La cella vuota dice che quel rapporto non si
  // calcola, ed è un'informazione.
  const anni = [...new Set(righe.flatMap((r) => r.anni.map((a) => a.anno)))].sort((a, b) => a - b);

  const riquadri = [
    {
      etichetta: 'Aziende con una serie',
      valore: String(riepilogo.aziende),
      nota: 'serie conservate in database',
    },
    {
      etichetta: 'Con il rapporto in crescita',
      valore: String(riepilogo.inCrescita),
      nota: 'ultima quota sopra la prima',
    },
    {
      etichetta: 'Con ritardo oltre 90 giorni',
      valore: String(riepilogo.conRitardo),
      nota: 'almeno un esercizio misurato',
    },
    {
      etichetta: 'Scaduto da oltre 90 giorni',
      valore: euro(riepilogo.oltre90Totale),
      nota: 'somma degli esercizi misurati',
    },
  ];

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-blue-600" />
          Contributi per anno — vista d&apos;insieme
        </h1>
        <p className="text-slate-500 text-xs mt-1">
          Il rapporto scaduti / dovuti dell&apos;art. 25-novies, lett. a), per tutte le aziende
          dello spazio: prima quelle che salgono, accanto il debito scaduto da oltre 90 giorni.
        </p>
      </div>

      {errore && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          {errore}
        </div>
      )}

      {!errore && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {riquadri.map((r) => (
            <div key={r.etichetta} className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                {r.etichetta}
              </div>
              <div className="text-lg font-bold text-slate-900 tabular-nums mt-1">{r.valore}</div>
              <div className="text-[10px] text-slate-400 mt-0.5">{r.nota}</div>
            </div>
          ))}
        </div>
      )}

      {senzaSerie > 0 && (
        <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3 leading-relaxed">
          {senzaSerie} {senzaSerie === 1 ? 'azienda non ha' : 'aziende non hanno'} una serie
          conservata — non è «nessun debito», è assenza di dati: qui non compaiono. Il ricalcolo
          d&apos;ufficio in{' '}
          <Link
            href={`/spazio/${codice}/parametri/soglie`}
            className="underline font-semibold hover:text-amber-900"
          >
            Parametri di Spazio › Soglie
          </Link>{' '}
          la ricostruisce per tutte le aziende verificate.
        </div>
      )}

      {righe.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-6 text-xs text-slate-500 leading-relaxed">
          {errore
            ? 'La tabella non si può costruire finché la lettura non riesce.'
            : 'Nessuna azienda dello spazio ha ancora una serie dei contributi. Si popola caricando DM10 e Lista Inadempienze nel triage, oppure con il ricalcolo d’ufficio dalle posizioni e dai valori conservati (Parametri di Spazio › Soglie).'}
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-[10px] uppercase text-slate-500 font-bold border-b border-slate-100">
                  <th className="p-2">Azienda</th>
                  {anni.map((anno) => (
                    <th key={anno} className="p-2 text-right">
                      {anno}
                    </th>
                  ))}
                  <th className="p-2 text-right">Variazione</th>
                  <th className="p-2 text-right">Oltre 90 giorni</th>
                  <th className="p-2">Fonte</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {righe.map((r) => (
                  <tr key={r.aziendaId}>
                    <td className="p-2">
                      <Link
                        href={`/spazio/${codice}/aziende/${r.aziendaId}/indici`}
                        className="text-slate-800 hover:text-blue-700 hover:underline font-semibold"
                      >
                        {r.ragioneSociale}
                      </Link>
                      {r.inCrescita && (
                        <span className="ml-2 inline-block px-1.5 py-0.5 rounded bg-red-50 text-red-700 text-[9px] font-bold uppercase tracking-wider">
                          in crescita
                        </span>
                      )}
                    </td>
                    {anni.map((anno) => {
                      const a = r.anni.find((x) => x.anno === anno);
                      const cls =
                        a?.oltreQuota === true
                          ? 'text-red-700 font-bold'
                          : a?.quota != null
                            ? 'text-emerald-700'
                            : 'text-slate-300';
                      return (
                        <td
                          key={anno}
                          className={`p-2 text-right tabular-nums whitespace-nowrap ${cls}`}
                          title={
                            a === undefined
                              ? 'Nessun dato per questo esercizio'
                              : a.quota === null
                                ? 'Rapporto non calcolabile: manca il dovuto o lo scaduto di questo anno'
                                : `${euro(a.dovuti)} dovuti · ${euro(a.scaduti)} scaduti${
                                    a.oltre90 === null ? ' · ritardo non misurato' : ''
                                  }`
                          }
                        >
                          {quota(a?.quota ?? null)}
                        </td>
                      );
                    })}
                    <td
                      className={`p-2 text-right tabular-nums whitespace-nowrap ${
                        r.inCrescita ? 'text-red-700 font-bold' : 'text-slate-500'
                      }`}
                      title={
                        r.variazionePunti === null
                          ? 'Meno di due esercizi con il rapporto calcolabile: non c’è una variazione da misurare'
                          : 'Differenza in punti percentuali tra la prima e l’ultima quota calcolabile'
                      }
                    >
                      {punti(r.variazionePunti)}
                    </td>
                    <td
                      className="p-2 text-right tabular-nums whitespace-nowrap text-slate-600"
                      title={
                        r.oltre90 === null
                          ? 'Ritardo non misurato: la serie viene dalle posizioni del triage o dai valori conservati, che non portano il ritardo'
                          : 'Parte degli scaduti già scaduta da oltre 90 giorni alla data della verifica, sommata sugli esercizi misurati'
                      }
                    >
                      {r.oltre90 === null ? (
                        <span className="text-slate-300">—</span>
                      ) : (
                        <>
                          {euro(r.oltre90)}
                          {r.anniConRitardo.length > 0 && (
                            <span className="text-[10px] text-slate-400 ml-1">
                              ({r.anniConRitardo.join(', ')})
                            </span>
                          )}
                        </>
                      )}
                    </td>
                    <td className="p-2 text-[10px] text-slate-400 whitespace-nowrap">{fonte(r)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-slate-400 mt-3 leading-relaxed">
            La quota è scaduti / dovuti, in rosso oltre il 30%. La crescita è la differenza tra
            l&apos;ultima e la prima quota calcolabile, non una soglia: la fattispecie della lett.
            a) richiede anche il ritardo oltre 90 giorni (e, con lavoratori, i 15.000 €). «—» nella
            colonna del ritardo vuol dire non misurato — la serie ricostruita dal triage o dai
            valori conservati non porta quel dato — mai zero.
          </p>
          <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">
            Si contano solo gli esercizi in cui il rapporto è calcolabile: un anno con il dovuto e
            senza lo scaduto (o viceversa) resta fuori dal confronto invece di valere zero. Le serie
            ricostruite sono dichiarate nella colonna «Fonte»; i file INPS, quando ci sono, restano
            la fonte.
          </p>
        </div>
      )}
    </div>
  );
}
