// L'ESITO DELLA VERIFICA CONTABILE IN PAGINA — uno, con la sua spiegazione.
//
// Sopra: il semaforo, che è il giudizio (fatti accertati, dati mancanti,
// copertura). Sotto: le cinque dimensioni che dicono da dove viene
// l'attenzione. Le due cose stanno nella stessa scheda perché sono la stessa
// lettura: il numero che c'era prima (IAI 0-100, con la sua fascia) è stato
// tolto — diceva un'altra cosa sulla stessa posizione.
//
// Le barre non hanno soglie né colori di allarme: la loro lunghezza ordina i
// determinanti, non gradua un giudizio. Il giudizio è quello sopra.

import { Activity, AlertTriangle, AlertOctagon, CheckCircle2, HelpCircle } from 'lucide-react';
import { SemaforoAttenzione } from './SemaforoAttenzione';
import { BarraDato } from './BarraDatoGrafico';
import { NOME_DIMENSIONE } from '@/lib/iai/dimensioni';
import type { IconografiaDimensioni } from '@/lib/ritratto/iconografia';
import { formattaEuro } from '@/lib/formato/numeri';
import type { EsitoVerifica as Esito } from '@/lib/verifica/esito';
import { ETICHETTA_VOCE, type DebitoInBilancio } from '@/lib/verifica/debitoInBilancio';

// IL DEBITO VERSO L'ENTE, DENTRO LA SPIEGAZIONE (0.256.5).
//
// Le cinque dimensioni dicono da dove viene l'attenzione, ma non rispondono
// alla domanda che l'operatore si fa per prima: «questo debito, l'azienda l'ha
// scritto in bilancio?». Quando non c'è, la cifra accertata si mostra in un
// altro colore: il rosso non è un giudizio sull'azienda, è il segno che quella
// posta manca dal perimetro su cui sono calcolati patrimonio e indici.
function RigaDebitoInBilancio({ d }: { d: DebitoInBilancio }) {
  const tono =
    d.stato === 'NON_CONTABILIZZATO'
      ? {
          bordo: 'border-red-200',
          sfondo: 'bg-red-50',
          testo: 'text-red-900',
          importo: 'text-red-700',
        }
      : d.stato === 'CONTABILIZZATO' && !d.segnala
        ? {
            bordo: 'border-slate-200',
            sfondo: 'bg-slate-50',
            testo: 'text-slate-700',
            importo: 'text-slate-900',
          }
        : {
            bordo: 'border-amber-200',
            sfondo: 'bg-amber-50',
            testo: 'text-amber-900',
            importo: 'text-amber-800',
          };
  const titolo =
    d.stato === 'NON_CONTABILIZZATO'
      ? 'Debito verso l’ente non contabilizzato in bilancio'
      : d.stato === 'CONTABILIZZATO' && !d.segnala
        ? 'Debito verso l’ente contabilizzato in bilancio'
        : 'Debito verso l’ente: la verifica in bilancio non è possibile';
  const Icona =
    d.stato === 'NON_CONTABILIZZATO'
      ? AlertTriangle
      : d.stato === 'CONTABILIZZATO' && !d.segnala
        ? CheckCircle2
        : HelpCircle;

  return (
    <div className={`rounded-lg border p-3 ${tono.bordo} ${tono.sfondo}`}>
      <p className={`flex items-center gap-1.5 text-[11px] font-bold ${tono.testo}`}>
        <Icona className="h-3.5 w-3.5 shrink-0" /> {titolo}
      </p>
      <p className={`mt-1 text-[11px] leading-relaxed ${tono.testo}`}>{d.testo}</p>
      {d.esposizione !== null && (
        <p className="mt-1 text-[11px] leading-relaxed text-slate-700">
          Debito accertato in amministrativa:{' '}
          <strong className={`tabular-nums ${tono.importo}`}>{formattaEuro(d.esposizione)}</strong>
          {d.inBilancio !== null && (
            <>
              {' '}
              · in bilancio{d.voce ? ` (${ETICHETTA_VOCE[d.voce]})` : ''}:{' '}
              <span className="tabular-nums">{formattaEuro(d.inBilancio)}</span>
            </>
          )}
        </p>
      )}
    </div>
  );
}

export function EsitoVerifica({
  esito,
  debitoInBilancio,
  iconografia,
}: {
  esito: Esito;
  debitoInBilancio?: DebitoInBilancio | null;
  /** Grafici, avviso e visura dei box A-E (0.256.6). */
  iconografia?: IconografiaDimensioni | null;
}) {
  return (
    <section className="space-y-3" aria-label="Esito della verifica contabile">
      <SemaforoAttenzione attenzione={esito.giudizio} />

      {esito.dimensioni.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <div className="flex items-start gap-2 border-b border-slate-100 pb-3">
            <Activity className="w-4 h-4 text-blue-600 mt-0.5" />
            <div>
              <h2 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
                Dove si concentra l’attenzione
              </h2>
              <p className="text-[11px] text-slate-600 mt-0.5">
                Cinque dimensioni, con i loro determinanti e i dati che mancano. Non sono un
                punteggio complessivo e non cambiano l’esito qui sopra: lo spiegano.
              </p>
            </div>
          </div>

          {debitoInBilancio && <RigaDebitoInBilancio d={debitoInBilancio} />}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {esito.dimensioni.map((c) => (
              <div key={c.dimensione} className="border border-slate-200 rounded-lg p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-[11px] font-bold text-slate-900">
                    {c.dimensione} · {NOME_DIMENSIONE[c.dimensione]}
                  </p>
                  <span className="text-[10px] text-slate-400 tabular-nums">
                    intensità {c.punteggio}
                  </span>
                </div>
                <div className="mt-1.5 h-2 bg-slate-100 rounded overflow-hidden">
                  <div
                    className="h-2 rounded bg-blue-500/70"
                    style={{ width: `${c.punteggio}%` }}
                  />
                </div>
                {c.motivi.length > 0 && (
                  <ul className="list-disc pl-4 mt-2 space-y-0.5 text-[11px] text-slate-700">
                    {c.motivi.map((m) => (
                      <li key={m}>{m}</li>
                    ))}
                  </ul>
                )}
                {c.lacune.length > 0 && (
                  <ul className="list-disc pl-4 mt-1 space-y-0.5 text-[11px] text-amber-800">
                    {c.lacune.map((l) => (
                      <li key={l}>lacuna: {l}</li>
                    ))}
                  </ul>
                )}
                {c.motivi.length === 0 && c.lacune.length === 0 && (
                  <p className="text-[11px] text-slate-400 mt-2">Nessun determinante.</p>
                )}

                {/* I GRAFICI DELLA DIMENSIONE (0.256.6). A: debito accertato
                    contro debito iscritto, poi gli ambiti dell'art. 25-novies.
                    B e C: valore di bilancio e, quando lo scenario ha un piano
                    di sviluppo, valore attualizzato e differenziale. Il dato
                    che manca non si disegna: si dichiara. */}
                {iconografia?.grafici
                  .filter((g) => g.dimensione === c.dimensione)
                  .map((g) => (
                    <div
                      key={g.dimensione}
                      className="mt-2 rounded-lg border border-slate-200 bg-slate-50/70 p-2.5"
                    >
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        {g.titolo}
                      </p>
                      <p className="mt-0.5 text-[9px] leading-snug text-slate-500">{g.lettura}</p>
                      <div className="mt-1">
                        {g.barre.map((b, i) => (
                          <BarraDato key={`${b.etichetta}-${i}`} b={b} massimo={g.massimo ?? 1} />
                        ))}
                      </div>
                      {g.notaProspettico && (
                        <p className="mt-1 text-[9px] leading-snug text-slate-400">
                          {g.notaProspettico}
                        </p>
                      )}
                    </div>
                  ))}

                {/* D — L'AVVISO FORTE. Non è una dimensione come le altre: se i
                    dati su cui si decide non reggono, va detto con un segno che
                    si vede prima dei numeri, non con una riga in fondo. */}
                {c.dimensione === 'D' && iconografia?.avvisoAffidabilita && (
                  <div className="mt-2 rounded-lg border-l-4 border-red-500 bg-red-50 p-2.5">
                    <p className="flex items-center gap-1.5 text-[11px] font-bold text-red-800">
                      <AlertOctagon className="h-3.5 w-3.5 shrink-0" />
                      {iconografia.avvisoAffidabilita.titolo}
                    </p>
                    <p className="mt-0.5 text-[10px] leading-snug text-red-900">
                      {iconografia.avvisoAffidabilita.testo}
                    </p>
                    {iconografia.avvisoAffidabilita.motivi.length > 0 && (
                      <ul className="mt-1 list-disc pl-4">
                        {iconografia.avvisoAffidabilita.motivi.map((m, i) => (
                          <li key={i} className="text-[10px] leading-snug text-red-900">
                            {m}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {/* E — LE PARTICOLARITÀ DELLA VISURA: variazioni di capitale,
                    compagine, oggetto, rappresentante legale, sede e procedure
                    in corso. Quando la visura non le porta estratte, il box lo
                    dice: nessuna variazione dichiarata non è «nessuna
                    variazione». */}
                {c.dimensione === 'E' && iconografia && (
                  <div className="mt-2 space-y-1 rounded-lg border border-slate-200 bg-slate-50/70 p-2.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Dalla visura
                    </p>
                    {iconografia.visura.particolari.map((p, i) => (
                      <p
                        key={i}
                        className={`text-[10px] leading-snug ${
                          p.segnala ? 'text-amber-900' : 'text-slate-600'
                        }`}
                      >
                        <strong>{p.etichetta}:</strong> {p.testo}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          <p className="text-[10px] text-slate-500 leading-relaxed pt-2 border-t border-slate-100">
            Le dimensioni non si compensano fra loro né con l’esito: i presupposti di legge e il
            patrimonio netto negativo sono fatti, non pesi. Riferimenti normativi e metodo
            nell’allegato della stampa.
          </p>
        </div>
      )}
    </section>
  );
}
