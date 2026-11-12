'use client';

// LA SITUAZIONE DELLO SCENARIO, MODIFICABILE (0.188.0).
//
// Alla creazione si sceglie che cosa si sta valutando — accordo transattivo,
// liquidazione giudiziale, cram down. La scelta non è un'etichetta: decide il
// percorso e le domande che lo scenario pone. Restare vincolati a un errore di
// inquadramento costringerebbe a rifare tutto da capo, quindi si corregge da
// qui finché la Relazione finale non ha congelato lo scenario.
//
// Il cambio non cancella il lavoro fatto (0.189.0): lo scenario torna in
// bozza, l'origine si riallinea e la scheda dice che cosa va ricontrollato.
// Ogni cambio lascia una traccia con autore e data (0.190.0/0.192.0);
// l'Admin può annullare l'ultimo cambio, anche su scenario bloccato ma solo
// dopo uno sblocco esplicito con motivo (0.191.0/0.192.0).
//
// Avviso e cronologia finiscono anche nella stampa della scheda: sono parte
// del documento che esce dalla piattaforma.

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { History, Loader2, Printer, Undo2, Unlock } from 'lucide-react';
import {
  aggiornaSituazioneScenarioAction,
  annullaUltimoCambioSituazioneAction,
} from '@/app/actions/scenari';
import { dataItaliana } from '@/lib/scenari/situazione';
import type { VoceStoricoSituazione } from '@/lib/scenari/storicoSituazione';
import type { VoceSbloccoScenario } from '@/lib/scenari/storicoSblocchi';
import { etichettaIstruttoria, type TipoIstruttoria } from '@/lib/giudice/lettura';

const SITUAZIONI: { codice: TipoIstruttoria; etichetta: string }[] = [
  { codice: 'PROPOSTA', etichetta: 'Accordo transattivo' },
  { codice: 'DECRETO_LIQUIDAZIONE', etichetta: 'Liquidazione giudiziale' },
  { codice: 'CRAM_DOWN', etichetta: 'Cram down' },
];

export function SituazioneScenario({
  nomeSchema,
  scenarioId,
  situazione,
  origine,
  bloccato,
  demo = false,
  puoAnnullare = false,
  cambiataIl,
  rivedere,
  storico,
  sblocchi,
  codice,
}: {
  nomeSchema: string;
  scenarioId: number;
  situazione: TipoIstruttoria;
  origine: string;
  bloccato: boolean;
  demo?: boolean;
  /** Solo l'Admin di Spazio vede il comando di annullamento. */
  puoAnnullare?: boolean;
  /** Data dell'ultimo cambio di situazione, se c'è stato. */
  cambiataIl?: string | null;
  /** Che cosa va ricontrollato dopo quel cambio. */
  rivedere?: string[];
  /** Le ultime voci della cronologia, dalla più recente. */
  storico?: VoceStoricoSituazione[];
  /** Gli ultimi sblocchi dello scenario, con motivo e autore. */
  sblocchi?: VoceSbloccoScenario[];
  /** Codice dello spazio: serve al collegamento alla cronologia completa. */
  codice?: string;
}) {
  const router = useRouter();
  const [scelta, setScelta] = useState<TipoIstruttoria>(situazione);
  const [bloccatoOra, setBloccatoOra] = useState(bloccato);
  const [dataCambio, setDataCambio] = useState<string | null>(cambiataIl ?? null);
  const [daRivedere, setDaRivedere] = useState<string[]>(rivedere ?? []);
  const [cronologia, setCronologia] = useState<VoceStoricoSituazione[]>(storico ?? []);
  const [inCorso, setInCorso] = useState(false);
  const [inAnnullamento, setInAnnullamento] = useState(false);
  const [motivoSblocco, setMotivoSblocco] = useState('');
  const [mostraSblocco, setMostraSblocco] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [messaggio, setMessaggio] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  const [daCambiare, setDaCambiare] = useState<TipoIstruttoria | null>(null);
  const [chiediPin, setChiediPin] = useState(false);

  // IL TIPO SI SCEGLIE ALLA CREAZIONE. Qui non si cambia al clic: si apre la
  // richiesta del PIN del secondo fattore, e solo la conferma chiama il
  // server, che verifica il PIN e lascia la traccia in cronologia. Il cambio
  // non lancia e non ricalcola simulazioni: quelle si lanciano dalla verifica
  // azienda e dal ramo contabile, dove nascono.
  const cambia = (codice: TipoIstruttoria) => {
    if (codice === scelta || inCorso || inAnnullamento) return;
    setErrore(null);
    setMessaggio(null);
    setDaCambiare(codice);
    setPin('');
    setChiediPin(true);
  };

  const confermaCambio = async () => {
    if (!daCambiare || inCorso || inAnnullamento) return;
    const codice = daCambiare;
    setInCorso(true);
    setErrore(null);
    setMessaggio(null);
    const r = await aggiornaSituazioneScenarioAction(nomeSchema, scenarioId, codice, pin);
    setInCorso(false);
    if (!r.success) {
      setErrore(r.error ?? 'Situazione non aggiornata.');
      return;
    }
    setChiediPin(false);
    setDaCambiare(null);
    setPin('');
    setCronologia((precedenti) => [
      {
        da: scelta,
        a: codice,
        cambiataIl: new Date().toISOString(),
        autore: null,
        annullatoIl: null,
        annullatoDa: null,
      },
      ...precedenti,
    ]);
    setScelta(codice);
    setDataCambio(new Date().toISOString().slice(0, 10));
    setDaRivedere(r.rivedere ?? []);
    setMessaggio('Situazione aggiornata: lo scenario è tornato in bozza.');
    router.refresh();
  };

  const annulla = async (motivo?: string) => {
    if (inCorso || inAnnullamento) return;
    setInAnnullamento(true);
    setErrore(null);
    setMessaggio(null);
    const r =
      motivo === undefined
        ? await annullaUltimoCambioSituazioneAction(nomeSchema, scenarioId)
        : await annullaUltimoCambioSituazioneAction(nomeSchema, scenarioId, motivo);
    setInAnnullamento(false);
    if (!r.success) {
      setErrore(r.error ?? 'Cambio non annullato.');
      return;
    }
    const aggiornata = r.storico ?? [];
    setCronologia(aggiornata);
    if (r.situazione) setScelta(r.situazione);
    setDaRivedere(r.rivedere ?? []);
    setDataCambio(aggiornata.find((v) => !v.annullatoIl)?.cambiataIl ?? null);
    setBloccatoOra(false);
    setMostraSblocco(false);
    setMotivoSblocco('');
    setMessaggio('Ultimo cambio annullato: lo scenario è tornato all’atto precedente, in bozza.');
    router.refresh();
  };

  const modificabile = !bloccatoOra && !demo;
  const haCambiDaAnnullare = cronologia.some((v) => !v.annullatoIl);

  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/70 p-2.5 space-y-1.5 print:border-slate-300">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
          Situazione dello scenario
        </p>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-blue-700 hover:text-blue-800 print:hidden"
        >
          <Printer className="w-3 h-3" /> Stampa scheda
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {SITUAZIONI.map((s) => {
          const attiva = scelta === s.codice;
          return (
            <button
              key={s.codice}
              type="button"
              onClick={() => void cambia(s.codice)}
              disabled={!modificabile || inCorso || inAnnullamento}
              className={`px-2.5 py-1 rounded-md border text-[10px] font-bold transition-colors disabled:opacity-60 ${
                attiva
                  ? 'border-blue-400 bg-blue-50 text-blue-800'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
              }`}
            >
              {s.etichetta}
            </button>
          );
        })}
        {inCorso && <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />}
      </div>
      {chiediPin && daCambiare && (
        <div className="rounded-md border border-amber-200 bg-white p-2 space-y-1.5 print:hidden">
          <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
            PIN del secondo fattore — cambio in «
            {SITUAZIONI.find((s) => s.codice === daCambiare)?.etichetta ?? daCambiare}»
          </p>
          <p className="text-[10px] text-slate-500 leading-relaxed">
            Il tipo si sceglie alla creazione: correggerlo è un atto firmato. Il PIN è lo stesso del
            tuo accesso; il cambio resta in cronologia, riporta lo scenario in bozza e non lancia
            nuove simulazioni.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void confermaCambio();
              }}
              placeholder="PIN (4-6 cifre)"
              aria-label="PIN del secondo fattore"
              className="w-36 rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] tracking-[0.25em] text-slate-900 outline-none focus:border-blue-500"
            />
            <button
              type="button"
              onClick={() => void confermaCambio()}
              disabled={inCorso || inAnnullamento || pin.trim().length < 4}
              className="inline-flex items-center gap-1 px-2 py-1 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white font-bold text-[9px] uppercase rounded-md"
            >
              {inCorso && <Loader2 className="w-3 h-3 animate-spin" />}
              Conferma il cambio
            </button>
            <button
              type="button"
              onClick={() => {
                setChiediPin(false);
                setDaCambiare(null);
                setPin('');
              }}
              className="px-2 py-1 text-[9px] font-bold uppercase text-slate-500 hover:text-slate-700"
            >
              Rinuncia
            </button>
          </div>
        </div>
      )}
      <p className="text-[10px] text-slate-500 leading-relaxed">
        Origine: {origine}
        {bloccatoOra
          ? ' · scenario in sola lettura: la Relazione finale è già stata generata.'
          : demo
            ? ' · nell’ambiente demo i percorsi sono già predisposti.'
            : ' · si sceglie alla creazione; dopo si cambia con il PIN, finché la Relazione finale non viene generata.'}
      </p>
      {dataCambio && (
        <div className="text-[10px] text-amber-900 bg-amber-50 border border-amber-200 rounded-md p-2 leading-relaxed print:block">
          <span className="font-bold">Situazione cambiata il {dataItaliana(dataCambio)}.</span>{' '}
          {daRivedere.length > 0
            ? `Il lavoro fatto resta: rivedi ${daRivedere.join('; ')}.`
            : 'Nessun passo compilato da rivedere.'}
        </div>
      )}
      {cronologia.length > 0 && (
        <div className="text-[10px] text-slate-500 print:block">
          <p className="font-bold uppercase tracking-wider text-slate-400">
            Cronologia della situazione ({cronologia.length})
          </p>
          <ul className="mt-1 space-y-0.5">
            {cronologia.map((voce, i) => (
              <li key={`${voce.cambiataIl}-${i}`}>
                {dataItaliana(voce.cambiataIl)} — da{' '}
                {etichettaIstruttoria(voce.da as TipoIstruttoria | null)} a{' '}
                {etichettaIstruttoria(voce.a as TipoIstruttoria)}
                {voce.autore ? ` · ${voce.autore}` : ''}
                {voce.annullatoIl
                  ? ` (annullato${voce.annullatoDa ? ` da ${voce.annullatoDa}` : ''})`
                  : ''}
              </li>
            ))}
          </ul>
          {puoAnnullare && !demo && haCambiDaAnnullare && (
            <div className="mt-1 print:hidden">
              {!bloccatoOra ? (
                <button
                  type="button"
                  onClick={() => void annulla()}
                  disabled={inCorso || inAnnullamento}
                  className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-amber-800 hover:text-amber-900 disabled:opacity-50"
                >
                  {inAnnullamento ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Undo2 className="w-3 h-3" />
                  )}
                  Annulla ultimo cambio
                </button>
              ) : !mostraSblocco ? (
                <button
                  type="button"
                  onClick={() => setMostraSblocco(true)}
                  className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-amber-800 hover:text-amber-900"
                >
                  <Unlock className="w-3 h-3" /> Sblocca e annulla
                </button>
              ) : (
                <div className="space-y-1 rounded-md border border-amber-200 bg-white p-2">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
                    Motivo dello sblocco (obbligatorio, resta in cronologia)
                  </p>
                  <textarea
                    value={motivoSblocco}
                    onChange={(e) => setMotivoSblocco(e.target.value)}
                    rows={2}
                    placeholder="Es. situazione scelta per errore, da riportare all’atto precedente…"
                    className="w-full p-1.5 text-[11px] bg-white border border-slate-300 rounded-md outline-none focus:border-blue-500 text-slate-900"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void annulla(motivoSblocco)}
                      disabled={!motivoSblocco.trim() || inAnnullamento}
                      className="inline-flex items-center gap-1 px-2 py-1 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white font-bold text-[9px] uppercase rounded-md"
                    >
                      {inAnnullamento && <Loader2 className="w-3 h-3 animate-spin" />}
                      Conferma sblocco e annulla
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMostraSblocco(false);
                        setMotivoSblocco('');
                      }}
                      className="px-2 py-1 text-[9px] font-bold uppercase text-slate-500 hover:text-slate-700"
                    >
                      Rinuncia
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {(sblocchi ?? []).length > 0 && (
        <div className="text-[10px] text-slate-500 print:block">
          <p className="font-bold uppercase tracking-wider text-slate-400">
            Sblocchi dello scenario ({sblocchi!.length})
          </p>
          <ul className="mt-1 space-y-0.5">
            {sblocchi!.map((voce, i) => (
              <li key={`${voce.sbloccatoIl}-${i}`}>
                {dataItaliana(voce.sbloccatoIl)} — {voce.motivo}
                {voce.sbloccatoDa ? ` · ${voce.sbloccatoDa}` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
      {codice && (cronologia.length > 0 || (sblocchi ?? []).length > 0) && (
        <Link
          href={`/spazio/${codice}/scenari/${scenarioId}/situazione`}
          className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-blue-700 hover:text-blue-800 print:hidden"
        >
          <History className="w-3 h-3" /> Natura e cronologia
        </Link>
      )}
      {errore && <p className="text-[10px] font-bold text-red-700">{errore}</p>}
      {messaggio && <p className="text-[10px] font-bold text-emerald-700">{messaggio}</p>}
    </div>
  );
}
