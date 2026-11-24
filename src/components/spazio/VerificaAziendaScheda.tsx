'use client';

import Link from 'next/link';

// VERIFICA AZIENDA — la fotografia, non una seconda simulazione (0.240.0).
//
// La pagina non proietta niente: legge il prospetto contabile già costruito
// (depositati + annualità calcolate fino all'anno della verifica) e lo mostra
// con i suoi indici. Sopra la fotografia stanno i tre scenari sul credito
// dell'ente: l'accordo, che si misura come capacità di risposta dell'azienda,
// la liquidazione e il cram down, che si misurano sul credito vantato con le
// percentuali per rango fissate dall'ente.
//
// I profili e l'orizzonte sono spariti con il motore che li usava: la scelta
// della traiettoria appartiene alla contabile, e qui si legge il risultato.

import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, Camera, CheckCircle2, Loader2, Printer } from 'lucide-react';
import {
  calcolaVerificaAziendaAction,
  ottieniSimulazioneBaseAction,
  salvaSimulazioneBaseAction,
  type DebitoVerificaAzienda,
  type RisultatoVerificaAzienda,
} from '@/app/actions/verificaAzienda';
import { VOCI_PROIEZIONE } from '@/lib/contabile/proiezione';
import { RANGHI } from '@/lib/triage/scenari';
import type { ColonnaFotografia, ScenarioFotografia } from '@/lib/verificaAzienda/fotografia';
import { breakEvenAccordo } from '@/lib/posizionePratica/breakEven';
import type { PianoInEssere } from '@/lib/posizionePratica/pianoInEssere';
import { indiciVisibili, valoreIndice } from '@/lib/xbrl/indiciVisibili';
import type { FotografiaComplessiva } from '@/lib/verificaAzienda/interpolazione';
import { FotografiaComplessivaView } from './FotografiaComplessiva';
import { PassoProcedura } from './PassoProcedura';

const euro = (n: number | undefined | null) =>
  typeof n === 'number' && Number.isFinite(n) ? `${Math.round(n).toLocaleString('it-IT')} €` : '—';

const num = (n: unknown) =>
  typeof n === 'number' && Number.isFinite(n)
    ? n.toLocaleString('it-IT', { maximumFractionDigits: 2 })
    : 'n/d';

const pct = (n: number | null | undefined) =>
  typeof n === 'number' && Number.isFinite(n) ? `${num(n)}%` : '—';

export interface RiepilogoAmministrativo {
  etichetta: string;
  esito: string;
  copertura: string;
  verificataIl: string | null;
  debitoTotale: number | null;
  debitoFonte: string | null;
  debitoIl: string | null;
}

export interface RiepilogoContabile {
  anniXbrl: number;
  visuraIl: string | null;
  parametriPresenti: boolean;
  completa: boolean;
}

function EtichettaScenario({ s }: { s: ScenarioFotografia }) {
  const colore =
    s.codice === 'ACCORDO'
      ? 'border-blue-200 bg-blue-50/60'
      : s.codice === 'LIQUIDAZIONE'
        ? 'border-amber-200 bg-amber-50/50'
        : 'border-slate-200 bg-white';
  return (
    <div className={`rounded-xl border p-3 space-y-1.5 ${colore}`}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600">{s.nome}</p>
        {s.percentuale !== null && (
          <span className="text-[10px] text-slate-500 tabular-nums">{pct(s.percentuale)}</span>
        )}
      </div>
      {s.calcolabile ? (
        <>
          {s.codice === 'ACCORDO' ? (
            <p className="text-[11px] text-slate-600 leading-relaxed">{s.dettaglio}</p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-[9px] uppercase tracking-wider text-slate-400">Recupero</p>
                <p className="text-sm font-bold tabular-nums text-slate-900">{euro(s.recupero)}</p>
              </div>
              <div>
                <p className="text-[9px] uppercase tracking-wider text-slate-400">Perdita</p>
                <p
                  className={`text-sm font-bold tabular-nums ${
                    (s.perdita ?? 0) > 0 ? 'text-red-700' : 'text-emerald-700'
                  }`}
                >
                  {euro(s.perdita)}
                </p>
              </div>
            </div>
          )}
          {s.codice !== 'ACCORDO' && (
            <p className="text-[10px] text-slate-500 leading-relaxed">{s.dettaglio}</p>
          )}
        </>
      ) : (
        <p className="text-[10px] text-amber-800 leading-relaxed">
          Non calcolabile: {s.motivo ?? 'dati incompleti'}.
        </p>
      )}
    </div>
  );
}

export function VerificaAziendaScheda({
  nomeSchema,
  aziendaId,
  ragioneSociale,
  codice,
  amministrativa = null,
  contabile = null,
  indiciAbilitati = [],
  pianoInEssere = null,
  complessiva = null,
}: {
  nomeSchema: string;
  aziendaId: number;
  ragioneSociale: string;
  /** Codice dello spazio: serve ai collegamenti alle due verifiche. */
  codice?: string;
  amministrativa?: RiepilogoAmministrativo | null;
  contabile?: RiepilogoContabile | null;
  /** Codici degli indici abilitati nello spazio: la fotografia mostra questi. */
  indiciAbilitati?: string[];
  /** Il piano che l'azienda sta già eseguendo, letto dai flussi dell'ente. */
  pianoInEssere?: PianoInEssere | null;
  /** Le due verifiche incrociate: la fotografia che si rilascia all'ente. */
  complessiva?: FotografiaComplessiva | null;
}) {
  const [risultato, setRisultato] = useState<RisultatoVerificaAzienda | null>(null);
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [messaggio, setMessaggio] = useState<string | null>(null);
  const [baseId, setBaseId] = useState<number | null>(null);
  const [salvataggioBase, setSalvataggioBase] = useState(false);

  const calcola = useCallback(async () => {
    setInCorso(true);
    setErrore(null);
    const r = await calcolaVerificaAziendaAction(nomeSchema, aziendaId);
    setInCorso(false);
    if (!r.success) {
      setErrore(r.error ?? 'Fotografia non riuscita.');
      return;
    }
    setRisultato(r);
  }, [nomeSchema, aziendaId]);

  // La fotografia si legge all'apertura: non c'è più un flag da accendere né un
  // profilo da scegliere, quindi non c'è nulla da decidere prima di guardarla.
  useEffect(() => {
    void calcola();
    void ottieniSimulazioneBaseAction(nomeSchema, aziendaId)
      .then((r) => {
        if (r.success && r.base) setBaseId(r.base.id);
      })
      .catch(() => undefined);
  }, [calcola, nomeSchema, aziendaId]);

  const salvaBase = async () => {
    if (!risultato?.fotografiaId) return;
    setSalvataggioBase(true);
    setErrore(null);
    const r = await salvaSimulazioneBaseAction(nomeSchema, aziendaId, risultato.fotografiaId);
    setSalvataggioBase(false);
    if (!r.success) {
      setErrore(r.error ?? 'Base non salvata.');
      return;
    }
    setBaseId(risultato.fotografiaId);
    setMessaggio('Questa fotografia è la base degli scenari della verifica aziendale.');
  };

  const fotografia = risultato?.fotografia ?? null;
  const anni: ColonnaFotografia[] = fotografia?.anni ?? [];
  const debito: DebitoVerificaAzienda | null = risultato?.debito ?? null;
  const indiciRiga = indiciVisibili(
    indiciAbilitati,
    anni[0]?.indici ?? [],
    anni[0]?.altriIndici ?? []
  );
  const ritornoQui = codice ? `/spazio/${codice}/verifica-azienda/${aziendaId}` : null;

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h1 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Camera className="w-4 h-4 text-blue-600" />
            Verifica azienda — {ragioneSociale}
          </h1>
          {/* L'anagrafica non è una verifica, ma da qui si deve poter correggere
              un dato senza tornare all'elenco (0.255.13). */}
          {codice && (
            <Link
              href={`/spazio/${codice}/aziende/${aziendaId}`}
              className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-blue-700 hover:text-blue-800"
            >
              Anagrafica azienda
            </Link>
          )}
        </div>
        <p className="text-xs text-slate-500 leading-relaxed max-w-3xl">
          Le due verifiche restano due letture distinte: il dato attuale dell’amministrativa e il
          dato storico della contabile. La verifica aziendale ne è la fotografia: le colonne del
          prospetto contabile già proiettato e, sul credito vantato, i tre scenari dell’ente.
        </p>
      </div>

      <PassoProcedura
        numero={1}
        titolo="Le due verifiche, ciascuna con il suo stato"
        obiettivo="Sapere che cosa hanno accertato l’amministrativa (il credito e la situazione dell’azienda) e la contabile (i numeri depositati), e se sono chiuse."
      />
      <div className="grid md:grid-cols-2 gap-3">
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
              Verifica amministrativa
            </h2>
            {amministrativa && (
              <span
                className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                  amministrativa.esito === 'ROSSO'
                    ? 'bg-red-50 text-red-700'
                    : amministrativa.esito === 'GIALLO'
                      ? 'bg-amber-50 text-amber-800'
                      : 'bg-emerald-50 text-emerald-700'
                }`}
              >
                {amministrativa.etichetta}
              </span>
            )}
          </div>
          {amministrativa ? (
            <>
              <p className="text-[11px] text-slate-500">
                Copertura {amministrativa.copertura}
                {amministrativa.verificataIl
                  ? ` · verificata il ${new Date(amministrativa.verificataIl).toLocaleDateString('it-IT')}`
                  : ''}
              </p>
              <p className="text-xs text-slate-700">
                Credito vantato:{' '}
                <strong className="text-base tabular-nums">
                  {euro(amministrativa.debitoTotale)}
                </strong>
                {amministrativa.debitoFonte ? (
                  <span className="block text-[10px] text-slate-500 mt-0.5">
                    {amministrativa.debitoFonte}
                    {amministrativa.debitoIl ? ` · memorizzato il ${amministrativa.debitoIl}` : ''}
                  </span>
                ) : (
                  <span className="block text-[10px] text-amber-800 mt-0.5">
                    Nessun debito memorizzato: la verifica amministrativa non è ancora chiusa.
                  </span>
                )}
              </p>
            </>
          ) : (
            <p className="text-[11px] text-slate-400">
              Nessun esito disponibile: la verifica amministrativa non è ancora stata eseguita.
            </p>
          )}
          {codice && (
            <a
              href={`/spazio/${codice}/verifica-salute/${aziendaId}${
                ritornoQui ? `?ritorno=${encodeURIComponent(ritornoQui)}` : ''
              }`}
              className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-blue-700 hover:text-blue-800"
            >
              Apri l’esito <ArrowRight className="w-3 h-3" />
            </a>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
          <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
            Verifica contabile
          </h2>
          {contabile ? (
            <>
              <p className="text-[11px] text-slate-500">
                {contabile.anniXbrl > 0
                  ? `${contabile.anniXbrl} annualità XBRL`
                  : 'Nessun bilancio XBRL caricato'}
                {contabile.visuraIl ? ` · visura ${contabile.visuraIl}` : ' · visura da acquisire'}
              </p>
              <p className="text-[11px] text-slate-600">
                Parametri ente:{' '}
                <span className="font-bold">
                  {contabile.parametriPresenti ? 'compilati' : 'da compilare'}
                </span>
              </p>
              <p
                className={`text-[10px] font-bold uppercase tracking-wider ${
                  contabile.completa ? 'text-emerald-700' : 'text-amber-800'
                }`}
              >
                {contabile.completa ? 'Dato storico completo' : 'Dato storico da completare'}
              </p>
            </>
          ) : (
            <p className="text-[11px] text-slate-400">
              Nessun dato storico disponibile: visura, parametri e bilanci si acquisiscono nella
              verifica contabile.
            </p>
          )}
          {codice && (
            <a
              href={`/spazio/${codice}/verifica-contabile/${aziendaId}${
                ritornoQui ? `?ritorno=${encodeURIComponent(ritornoQui)}` : ''
              }`}
              className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-blue-700 hover:text-blue-800"
            >
              Apri la verifica contabile <ArrowRight className="w-3 h-3" />
            </a>
          )}
        </div>
      </div>

      {complessiva && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
          <PassoProcedura
            numero={2}
            titolo="Fotografia complessiva"
            obiettivo="Incrociare le due letture in una sola: è il documento che si rilascia all’ente e da cui si parte per gli scenari."
          />
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
              Le due verifiche incrociate
            </h2>
            {codice && (
              <Link
                href={`/spazio/${codice}/verifica-azienda/${aziendaId}/fotografia`}
                className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-blue-700 hover:text-blue-800"
              >
                Documento da rilasciare <ArrowRight className="w-3 h-3" />
              </Link>
            )}
          </div>
          <FotografiaComplessivaView complessiva={complessiva} />
        </div>
      )}

      {errore && (
        <p className="text-xs font-bold text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          {errore}
        </p>
      )}
      {messaggio && (
        <p className="text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
          {messaggio}
        </p>
      )}

      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <PassoProcedura
          numero={3}
          titolo="Fotografia — colonne del prospetto contabile"
          obiettivo="Leggere anno per anno i valori depositati e quelli costruiti dai differenziali, con gli indici e la loro soglia."
          azione={
            <div className="flex items-center gap-2">
              {inCorso && <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />}
              <button
                type="button"
                onClick={() => void calcola()}
                disabled={inCorso}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-600 hover:bg-slate-50 disabled:opacity-40"
              >
                <Camera className="w-3 h-3" /> Rileggi
              </button>
              {anni.length > 0 && (
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-blue-700 hover:text-blue-800"
                >
                  <Printer className="w-3 h-3" /> Stampa
                </button>
              )}
            </div>
          }
        />

        {risultato?.asse && (
          <p className="text-[10px] text-slate-500 leading-relaxed">
            Asse della contabile: base {risultato.asse.annoBase ?? '—'}, ultimo bilancio{' '}
            {risultato.asse.annoUltimoBilancio ?? '—'}, verifica {risultato.asse.annoVerifica}
            {risultato.asse.annualitaCalcolate.length > 0
              ? ` · annualità calcolate: ${risultato.asse.annualitaCalcolate.join(', ')}`
              : ''}
            . «Storico» è il dato depositato, «calcolato» quello costruito dai differenziali sulla
            base: la verifica aziendale non aggiunge annualità sue.
          </p>
        )}

        {fotografia?.motivo && (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
            {fotografia.motivo}
          </p>
        )}

        {anni.length > 0 && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="text-[9px] uppercase text-slate-400 border-b border-slate-200">
                    <th className="text-left py-1.5 pr-2">Voce</th>
                    {anni.map((c) => (
                      <th key={c.anno} className="text-right py-1.5 px-1 whitespace-nowrap">
                        {c.anno}
                        <span
                          className={`block text-[8px] font-normal ${
                            c.tipo === 'CALCOLATO' ? 'text-blue-500' : 'text-slate-400'
                          }`}
                        >
                          {c.tipo === 'CALCOLATO' ? 'calcolato' : 'storico'}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {VOCI_PROIEZIONE.map((v) => (
                    <tr key={String(v.chiave)}>
                      <td className="py-1 pr-2 text-slate-600">{v.etichetta}</td>
                      {anni.map((c) => (
                        <td
                          key={c.anno}
                          className="py-1 px-1 text-right tabular-nums text-slate-800"
                        >
                          {euro(c.dati[v.chiave] as number | undefined)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {indiciRiga.length > 0 && (
              <div className="overflow-x-auto pt-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Indici per colonna
                </p>
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="text-[9px] uppercase text-slate-400 border-b border-slate-200">
                      <th className="text-left py-1.5 pr-2">Indice</th>
                      <th className="text-right py-1.5 px-1">Soglia</th>
                      {anni.map((c) => (
                        <th key={c.anno} className="text-right py-1.5 px-1">
                          {c.anno}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {indiciRiga.map((ind) => (
                      <tr key={ind.codice}>
                        <td className="py-1 pr-2 text-slate-700">
                          <span className="font-mono text-[9px] text-slate-400 mr-1">
                            {ind.codice}
                          </span>
                          {ind.nome.replace(new RegExp(`^${ind.codice}\\s*[—-]\\s*`), '')}
                        </td>
                        <td className="py-1 px-1 text-right text-slate-500 text-[10px]">
                          {ind.soglia}
                        </td>
                        {anni.map((c) => {
                          const v = valoreIndice(c, ind.codice);
                          return (
                            <td
                              key={c.anno}
                              title={v?.note ?? ind.motivoNonCalcolabile}
                              className={`py-1 px-1 text-right tabular-nums ${
                                v?.esito === 'VIOLATO'
                                  ? 'text-red-700 font-bold'
                                  : v?.esito === 'OK'
                                    ? 'text-emerald-700'
                                    : 'text-slate-400'
                              }`}
                            >
                              {v ? num(v.valore) : ind.motivoNonCalcolabile ? 'n/d' : '—'}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-[10px] text-slate-400 leading-relaxed">
              Gli indici sono quelli abilitati in Parametri di Spazio e si calcolano sullo stesso
              motore del resto della piattaforma. Il DSCR non si calcola dal bilancio depositato:
              serve il servizio del debito, che esiste negli scenari.
            </p>
          </>
        )}
      </div>

      {fotografia && fotografia.scenari.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Passo 4 · Tre scenari sul credito vantato
            </p>
            <p className="text-[11px] text-slate-600">
              Credito: <strong className="tabular-nums">{euro(fotografia.credito)}</strong>
              {fotografia.rango
                ? ` · rango ${RANGHI.find((r) => r.codice === fotografia.rango)?.etichetta ?? fotografia.rango}`
                : ' · rango non scelto'}
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-3">
            {fotografia.scenari.map((s) => (
              <EtichettaScenario key={s.codice} s={s} />
            ))}
          </div>

          {fotografia.confronto && (
            <p className="text-[11px] text-slate-600 leading-relaxed">
              {fotografia.confronto.testo}
            </p>
          )}

          {/* IL PUNTO DI PAREGGIO (0.242.0).
              Due conti, non due previsioni: sotto quale recupero l'accordo rende meno della
              procedura, e quanta cassa manca perché stia in piedi. */}
          {(() => {
            const be = breakEvenAccordo({
              credito: fotografia.credito,
              disponibilita: fotografia.capacita.disponibilita,
              flusso: fotografia.capacita.flusso,
              liquidazioneNetta:
                fotografia.scenari.find((s) => s.codice === 'LIQUIDAZIONE')?.recupero ?? null,
              cramDownNetto:
                fotografia.scenari.find((s) => s.codice === 'CRAM_DOWN')?.recupero ?? null,
            });
            return (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
                <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
                  Punto di pareggio
                </p>
                <div className="grid gap-2 sm:grid-cols-3">
                  <div>
                    <p className="text-[9px] uppercase tracking-wider text-slate-400">
                      Recupero minimo
                    </p>
                    <p className="text-[12px] font-bold tabular-nums text-slate-900">
                      {euro(be.recuperoMinimo)}
                    </p>
                    <p className="text-[9px] text-slate-500">
                      {be.proceduraConfronto ?? 'nessuna procedura calcolabile'}
                    </p>
                  </div>
                  <div>
                    <p className="text-[9px] uppercase tracking-wider text-slate-400">
                      Scoperto di cassa
                    </p>
                    <p className="text-[12px] font-bold tabular-nums text-slate-900">
                      {euro(be.scoperto)}
                    </p>
                    <p className="text-[9px] text-slate-500">
                      flusso necessario {euro(be.flussoNecessario)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[9px] uppercase tracking-wider text-slate-400">
                      Piano in essere
                    </p>
                    <p className="text-[12px] font-bold text-slate-900">
                      {pianoInEssere?.stato ?? 'non disponibile'}
                    </p>
                    <p className="text-[9px] text-slate-500">
                      {pianoInEssere?.dettaglio ?? 'nessun flusso dell’ente configurato'}
                    </p>
                  </div>
                </div>
                <p className="text-[10px] text-slate-600 leading-relaxed">{be.dettaglio}</p>
                {pianoInEssere?.avvertenza && (
                  <p className="text-[10px] text-amber-900 leading-relaxed">
                    {pianoInEssere.avvertenza}
                  </p>
                )}
              </div>
            );
          })()}
          <p className="text-[10px] text-slate-500 leading-relaxed">
            L’accordo non è un recupero: è la capacità dell’azienda di rispondere del credito con la
            cassa che ha e con quella che l’esercizio produce. Se non copre l’importo dovuto, la
            proposta è probabilmente destinata al rigetto — e contano i due esiti collettivi, dove
            l’interesse dell’ente è il credito vantato. Le percentuali di liquidazione e cram down
            sono quelle fissate dall’ente per il rango del credito: se mancano, lo scenario non si
            calcola e lo dice.
          </p>

          {fotografia.avvertenze.map((a, i) => (
            <p
              key={i}
              className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5"
            >
              {a}
            </p>
          ))}

          {!debito && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
              Nessun debito memorizzato: il credito vantato non è accertato e gli scenari collettivi
              restano senza base. Chiudi la verifica amministrativa, oppure rinnova il dato dalla
              sua scheda.
            </p>
          )}
        </div>
      )}

      {risultato?.nota && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Passo 5 · Nota integrativa — {risultato.nota.anno ?? 'ultimo bilancio'}
          </p>
          <p className="text-[10px] text-slate-500 leading-relaxed">
            Sezioni lette: {risultato.nota.sezioni.join(', ')}. È il contesto dichiarato dagli
            amministratori: si legge accanto alla fotografia e non ne cambia i numeri.
          </p>
          {risultato.nota.continuita && (
            <p className="text-[11px] text-slate-700 leading-relaxed">
              <strong>Continuità:</strong> {risultato.nota.continuita}
            </p>
          )}
          {risultato.nota.piani && (
            <p className="text-[11px] text-slate-700 leading-relaxed">
              <strong>Piani e intenzioni:</strong> {risultato.nota.piani}
            </p>
          )}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
          Passo 6 · Base degli scenari
        </p>
        <p className="text-[11px] text-slate-600 leading-relaxed">
          La fotografia si può fissare come base della verifica aziendale: gli scenari si aprono da
          qui invece che dalla sola amministrativa.
        </p>
        <button
          type="button"
          onClick={() => void salvaBase()}
          disabled={
            salvataggioBase || !risultato?.fotografiaId || baseId === risultato?.fotografiaId
          }
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white hover:bg-blue-800 disabled:opacity-50"
        >
          {salvataggioBase ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <CheckCircle2 className="w-3 h-3" />
          )}
          {baseId === risultato?.fotografiaId ? 'Base degli scenari' : 'Salva come base'}
        </button>
        {!risultato?.fotografiaId && (
          <p className="text-[10px] text-slate-400">
            Serve una fotografia letta: senza annualità non c’è una base da salvare.
          </p>
        )}
      </div>

      {codice && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Passo 7 · Report dell’azienda
          </p>
          <p className="text-[11px] text-slate-600 leading-relaxed max-w-2xl">
            Un documento solo con l’esito amministrativo (in sola lettura), il dato contabile e
            l’analisi. Scegli che cosa includere prima di emetterlo: l’emissione è definitiva, e
            rigenerare crea una nuova generazione.
          </p>
          <Link
            href={`/spazio/${codice}/aziende/${aziendaId}/report`}
            className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-blue-700 hover:text-blue-800"
          >
            Genera il report <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      )}

      <p className="text-[11px] text-slate-500 leading-relaxed">
        Il documento è messo a disposizione della direzione dell’ente per le valutazioni del caso.
        La fotografia è il dato della contabile, senza ipotesi aggiunte; la verifica amministrativa
        resta il dato attuale. Nessuna conclusione giuridica.
      </p>
    </div>
  );
}
