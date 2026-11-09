'use client';

// PRIMO PASSO DI OGNI SCENARIO — LE VERIFICHE DELL’ENTE.
//
// Uno scenario non riparte dai documenti: parte da ciò che l’ente ha già
// verificato su quell’azienda. Le due verifiche sono CHECK, non collegamenti:
// la spunta dichiara che quella verifica entra nello scenario e lo scenario la
// registra con la data. Non si apre il giro del triage o dell’XBRL — chi
// lavora deve sapere se il dato è caricato nello scenario, non dove lo porta
// un pulsante.
//
// L’amministrativa è obbligatoria: è il dato attuale, senza il quale lo
// scenario non ha una base su cui confrontare. La contabile storica si attiva
// a parte; da sole formano la verifica completa.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2, CircleDashed, Loader2 } from 'lucide-react';
import { impostaVerificheScenarioAction } from '@/app/actions/verificheScenario';
import { sintesiVerificheEnte, type RiepilogoVerificheEnte } from '@/lib/debitiEnte/verificheEnte';
import { type AggancioContabile } from '@/lib/debitiEnte/aggancioContabile';

const euro = (n: number) => `${Math.round(n).toLocaleString('it-IT')} €`;
const giorno = (iso: string | null) =>
  iso ? iso.slice(0, 10).split('-').reverse().join('/') : null;

export interface StatoVerificheScenario {
  amministrativa: boolean;
  contabile: boolean;
  amministrativaIl: string | null;
  contabileIl: string | null;
}

export interface DisponibilitaVerificheScenario {
  amministrativa: boolean;
  contabile: boolean;
  /** Visura, debito split e bilanci: l’aggancio che rende spuntabile la contabile. */
  aggancio: AggancioContabile;
}

export function VerificheEnteScenario({
  riepilogo,
  codice,
  aziendaId,
  nomeSchema,
  scenarioId,
  ragioneSociale,
  verifiche,
  disponibilita,
}: {
  riepilogo: RiepilogoVerificheEnte;
  codice: string;
  aziendaId: number;
  nomeSchema: string;
  scenarioId: number;
  ragioneSociale: string;
  verifiche: StatoVerificheScenario;
  disponibilita: DisponibilitaVerificheScenario;
}) {
  const router = useRouter();
  const [errore, setErrore] = useState<string | null>(null);
  const [inCorso, avvia] = useTransition();

  const contabileAttiva = verifiche.contabile;
  const aggancio = disponibilita.aggancio;

  const cambiaContabile = (valore: boolean) => {
    setErrore(null);
    avvia(async () => {
      const esito = await impostaVerificheScenarioAction(nomeSchema, scenarioId, {
        amministrativa: verifiche.amministrativa,
        contabile: valore,
      }).catch(() => null);
      if (!esito || !esito.success) {
        setErrore(esito?.error || 'Salvataggio delle verifiche non riuscito.');
        return;
      }
      router.refresh();
    });
  };

  const statoAmministrativa = verifiche.amministrativa
    ? giorno(verifiche.amministrativaIl)
      ? `caricata nello scenario il ${giorno(verifiche.amministrativaIl)}`
      : 'caricata nello scenario'
    : 'non caricata nello scenario';

  const statoContabile = verifiche.contabile
    ? giorno(verifiche.contabileIl)
      ? `caricata nello scenario il ${giorno(verifiche.contabileIl)}`
      : 'caricata nello scenario'
    : 'non caricata nello scenario';

  return (
    <section className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
            0 · Primo passo
          </p>
          <h2 className="mt-0.5 text-sm font-bold text-slate-900 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
            Verifiche dell’ente — {ragioneSociale}
          </h2>
          <p className="mt-1 text-[11px] text-slate-700 max-w-3xl leading-relaxed">
            {sintesiVerificheEnte(riepilogo)} Le due verifiche si spuntano qui: quello che è
            spuntato è dentro lo scenario, con la data in cui è stato caricato.
          </p>
        </div>
        {inCorso && (
          <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            <Loader2 className="w-3 h-3 animate-spin" /> Salvo…
          </span>
        )}
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-2">
        {/* VERIFICA AMMINISTRATIVA — obbligatoria, non deselezionabile. */}
        <div className="rounded-lg border border-emerald-200 bg-white p-3">
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={verifiche.amministrativa && disponibilita.amministrativa}
              disabled
              className="mt-0.5"
              title="La verifica amministrativa è obbligatoria: è il dato attuale su cui lo scenario lavora."
            />
            <span className="min-w-0">
              <span className="block text-xs font-bold text-slate-900">
                Verifica amministrativa
                <span className="ml-1.5 text-[9px] font-bold uppercase tracking-wider text-emerald-700">
                  obbligatoria
                </span>
              </span>
              <span className="block text-[10px] text-slate-500 mt-0.5">
                Visura e prospetti dell’ente · dato attuale (triage)
              </span>
            </span>
          </label>
          <ul className="mt-2 space-y-1 border-t border-slate-100 pt-2">
            {riepilogo.voci.length === 0 && (
              <li className="text-[10px] text-amber-700">
                Nessun dato su questa azienda: visura o prospetti dell’ente non sono ancora stati
                caricati.
              </li>
            )}
            {riepilogo.voci.map((v) => (
              <li
                key={v.codice}
                className="flex items-center justify-between gap-2 text-[10px] text-slate-600"
              >
                <span className="min-w-0 truncate">
                  {v.etichetta} · {v.righe} posizioni · {v.dettaglio}
                </span>
                <span className="tabular-nums font-bold text-slate-900 shrink-0">
                  {euro(v.totale)}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 flex items-center gap-1 text-[10px] font-bold text-emerald-800">
            {verifiche.amministrativa ? (
              <CheckCircle2 className="w-3 h-3" />
            ) : (
              <CircleDashed className="w-3 h-3 text-amber-600" />
            )}
            {statoAmministrativa}
          </p>
          {!disponibilita.amministrativa && (
            <Link
              href={`/spazio/${codice}/verifica-salute?azienda=${aziendaId}`}
              className="mt-1 inline-block text-[10px] font-bold uppercase tracking-wider text-blue-700 hover:text-blue-800"
            >
              Carica visura e prospetti
            </Link>
          )}
        </div>

        {/* VERIFICA CONTABILE — facoltativa, ma agganciata all’amministrativa:
            visura e debito split sono il ponte tra le due verifiche, e senza
            quelli la contabile si spunterebbe su un’azienda che non si conosce. */}
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <label className={`flex items-start gap-2 ${aggancio.pronto ? 'cursor-pointer' : ''}`}>
            <input
              type="checkbox"
              checked={contabileAttiva}
              disabled={!aggancio.pronto || inCorso}
              onChange={(e) => cambiaContabile(e.target.checked)}
              className="mt-0.5"
              title={
                aggancio.pronto
                  ? undefined
                  : `Manca ${aggancio.mancanti.join(', ')}: la contabile si appoggia ai dati della verifica amministrativa.`
              }
            />
            <span className="min-w-0">
              <span className="block text-xs font-bold text-slate-900">Verifica contabile</span>
              <span className="block text-[10px] text-slate-500 mt-0.5">
                Bilancio XBRL (bilancio e nota integrativa) · dato storico
              </span>
            </span>
          </label>

          {/* L’aggancio, in chiaro: che cosa la contabile prende dall’amministrativa. */}
          <ul className="mt-2 space-y-1 border-t border-slate-100 pt-2 text-[10px]">
            <li className="flex items-start justify-between gap-2">
              <span className="text-slate-500">Visura dell’ente</span>
              <span
                className={`text-right font-bold ${
                  aggancio.visura.presente ? 'text-slate-900' : 'text-amber-700'
                }`}
              >
                {aggancio.visura.presente
                  ? `acquisita${
                      giorno(aggancio.visura.caricataIl)
                        ? ` il ${giorno(aggancio.visura.caricataIl)}`
                        : ''
                    }`
                  : 'da acquisire'}
              </span>
            </li>
            <li className="flex items-start justify-between gap-2">
              <span className="text-slate-500">Debito dell’ente</span>
              <span
                className={`text-right font-bold ${
                  aggancio.debito ? 'text-slate-900' : 'text-amber-700'
                }`}
              >
                {aggancio.debito
                  ? aggancio.debito.ripartito
                    ? `${euro(aggancio.debito.contabilizzato)} contabilizzati · ${euro(
                        aggancio.debito.daContabilizzare
                      )} da contabilizzare`
                    : `${euro(
                        aggancio.debito.totale
                      )} dalle posizioni del triage — ripartizione non registrata`
                  : 'da acquisire'}
              </span>
            </li>
            <li className="flex items-start justify-between gap-2">
              <span className="text-slate-500">Bilanci XBRL</span>
              <span
                className={`text-right font-bold ${
                  aggancio.anniBilancio.length > 0 ? 'text-slate-900' : 'text-amber-700'
                }`}
              >
                {aggancio.anniBilancio.length > 0
                  ? aggancio.anniBilancio.join(', ')
                  : 'da acquisire'}
              </span>
            </li>
          </ul>

          {aggancio.debito && (
            <p className="mt-1 text-[10px] text-slate-500 leading-relaxed">
              Fonte del debito: {aggancio.debito.fonte}.
              {aggancio.debito.ripartito
                ? ' La quota contabilizzata e quella da contabilizzare entrano nella definizione del dato contabile.'
                : ' La ripartizione tra contabilizzato e da contabilizzare non è in questo dato.'}
            </p>
          )}

          <p className="mt-2 text-[10px] text-slate-500">
            {aggancio.pronto
              ? 'Con l’amministrativa forma la verifica completa: la contabile parte dagli stessi dati, portati al bilancio.'
              : `Per aprire la contabile manca ${aggancio.mancanti.join(', ')}. I primi due dati vengono dalla verifica amministrativa.`}
          </p>
          <p
            className={`mt-2 flex items-center gap-1 text-[10px] font-bold ${
              contabileAttiva ? 'text-emerald-800' : 'text-slate-500'
            }`}
          >
            {contabileAttiva ? (
              <CheckCircle2 className="w-3 h-3" />
            ) : (
              <CircleDashed className="w-3 h-3" />
            )}
            {statoContabile}
          </p>
          {!aggancio.pronto && (
            <div className="mt-1 flex flex-wrap gap-3">
              {!aggancio.visura.presente && (
                <Link
                  href={`/spazio/${codice}/verifica-salute?azienda=${aziendaId}`}
                  className="text-[10px] font-bold uppercase tracking-wider text-blue-700 hover:text-blue-800"
                >
                  Acquisisci la visura
                </Link>
              )}
              {aggancio.anniBilancio.length === 0 && (
                <Link
                  href={`/spazio/${codice}/aziende/${aziendaId}/xbrl`}
                  className="text-[10px] font-bold uppercase tracking-wider text-blue-700 hover:text-blue-800"
                >
                  Carica il bilancio
                </Link>
              )}
            </div>
          )}
        </div>
      </div>

      {errore && (
        <p className="mt-2 text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">
          {errore}
        </p>
      )}

      <p className="mt-3 text-[10px] text-slate-500 leading-relaxed">
        Le verifiche non si ricaricano dentro lo scenario: la spunta dice che il dato è nello
        scenario, mentre il dato resta letto dalla posizione dell’azienda, così un aggiornamento
        vale subito e non resta fermo in una copia.
      </p>
    </section>
  );
}
