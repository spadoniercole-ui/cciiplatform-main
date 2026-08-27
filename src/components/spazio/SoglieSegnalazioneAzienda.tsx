'use client';

// Scheda "Soglie di segnalazione" — art. 25-novies CCII.
//
// Vive a livello AZIENDA, accanto alla Posizione V.E.R.A., perche' il debito
// e' il punto di partenza di ogni analisi e non cambia da uno scenario
// all'altro: si compila una volta e viene riportato in ogni scenario.
//
// DUE RESE DELLO STESSO CALCOLO:
//  - ENTE      -> griglia della sola soglia dell'ente di riferimento;
//  - NON_ENTE  -> paragrafo su tutte le soglie insieme, perche' e' l'insieme
//                 a definire quanto tempo ha l'impresa prima che qualcuno
//                 segnali. Sette righe in griglia sarebbero illeggibili.
//
// Accanto a ogni campo e' indicata la FONTE DOCUMENTALE da cui si ricava il
// valore: e' quello che rende compilabile un modulo di numeri altrimenti
// astratti.

import React, { useCallback, useEffect, useState } from 'react';
import { Save, AlertTriangle, Info, Gauge } from 'lucide-react';
import {
  ottieniValoriSoglieAction,
  salvaValoriSoglieAction,
  valutaSoglieAction,
  type ValoriSoglie,
} from '@/app/actions/soglie25novies';
import { ETICHETTA_ENTE, type EsitoSoglie, type Ente25Novies } from '@/lib/soglie25novies/calcolo';

interface Props {
  nomeSchema: string;
  aziendaId: number;
  tipoSpazio: 'ENTE' | 'NON_ENTE';
}

const VUOTI: ValoriSoglie = {
  conLavoratoriSubordinati: null,
  contributiScaduti: null,
  contributiDovutiAnnoPrecedente: null,
  annoContributiDovuti: null,
  sanzioniPresunteVera: null,
  premiInail: null,
  ivaScaduta: null,
  volumeAffari: null,
  creditiAffidatiAer: null,
  soglieAggiornateAl: null,
};

const euro = (n: number) => `${Math.round(n).toLocaleString('it-IT')} €`;
const testo = (n: number | null) => (n === null || n === undefined ? '' : String(n));
const numero = (v: string): number | null => (v.trim() === '' ? null : Number(v));

function CampoEuro({
  etichetta,
  fonte,
  valore,
  onCambia,
}: {
  etichetta: string;
  fonte: string;
  valore: number | null;
  onCambia: (v: number | null) => void;
}) {
  return (
    <div>
      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-600 mb-1">
        {etichetta}
      </label>
      <input
        type="number"
        min={0}
        step="0.01"
        value={testo(valore)}
        onChange={(e) => onCambia(numero(e.target.value))}
        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-sky-500"
      />
      <p className="text-[10px] text-slate-400 mt-1 leading-snug">{fonte}</p>
    </div>
  );
}

export function SoglieSegnalazioneAzienda({ nomeSchema, aziendaId, tipoSpazio }: Props) {
  const [valori, setValori] = useState<ValoriSoglie>(VUOTI);
  const [formaGiuridica, setFormaGiuridica] = useState<string | null>(null);
  const [formaRiconosciuta, setFormaRiconosciuta] = useState(false);
  const [esito, setEsito] = useState<EsitoSoglie | null>(null);
  const [ente, setEnte] = useState<Ente25Novies | null>(null);
  const [caricamento, setCaricamento] = useState(true);
  const [salvataggio, setSalvataggio] = useState(false);
  const [messaggio, setMessaggio] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);

  const valuta = useCallback(async () => {
    const r = await valutaSoglieAction(nomeSchema, aziendaId, tipoSpazio);
    if (r.success && r.esito) {
      setEsito(r.esito);
      setEnte(r.ente ?? null);
    }
  }, [nomeSchema, aziendaId, tipoSpazio]);

  useEffect(() => {
    (async () => {
      setCaricamento(true);
      const r = await ottieniValoriSoglieAction(nomeSchema, aziendaId);
      if (r.success && r.valori) {
        setValori(r.valori);
        setFormaGiuridica(r.formaGiuridicaTesto ?? null);
        setFormaRiconosciuta(r.formaAER !== null && r.formaAER !== undefined);
      } else {
        setErrore(r.error ?? 'Lettura non riuscita.');
      }
      await valuta();
      setCaricamento(false);
    })();
  }, [nomeSchema, aziendaId, valuta]);

  const salva = async () => {
    setSalvataggio(true);
    setMessaggio(null);
    setErrore(null);
    const r = await salvaValoriSoglieAction(nomeSchema, aziendaId, {
      ...valori,
      soglieAggiornateAl: new Date().toISOString().slice(0, 10),
    });
    if (r.success) {
      setValori((v) => ({ ...v, soglieAggiornateAl: new Date().toISOString().slice(0, 10) }));
      setMessaggio('Valori salvati.');
      await valuta();
    } else {
      setErrore(r.error ?? 'Salvataggio non riuscito.');
    }
    setSalvataggio(false);
  };

  if (caricamento) {
    return <p className="text-xs text-slate-400">Caricamento...</p>;
  }

  return (
    <div className="space-y-5">
      {/* ---- Inserimento ------------------------------------------------ */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-5">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <Gauge className="w-4 h-4 text-slate-500" />
          <h3 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
            Valori per le soglie di segnalazione
          </h3>
        </div>

        <p className="text-[11px] text-slate-500 leading-relaxed">
          Valori a inserimento manuale, riferiti all&apos;azienda: il debito è il punto di partenza
          di ogni analisi e non cambia da uno scenario all&apos;altro. Si compilano una volta e
          vengono riportati in ogni scenario. Ogni campo lasciato vuoto non viene stimato: la
          valutazione dichiara di non poter determinare quella soglia.
        </p>

        {/* INPS */}
        <div className="space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-sky-700">INPS</p>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-600 mb-1">
              Lavoratori subordinati o parasubordinati
            </label>
            <select
              value={
                valori.conLavoratoriSubordinati === null
                  ? ''
                  : valori.conLavoratoriSubordinati
                    ? 'si'
                    : 'no'
              }
              onChange={(e) =>
                setValori({
                  ...valori,
                  conLavoratoriSubordinati: e.target.value === '' ? null : e.target.value === 'si',
                })
              }
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
            >
              <option value="">Non dichiarato</option>
              <option value="si">Sì — l&apos;impresa ha lavoratori</option>
              <option value="no">No — impresa senza lavoratori</option>
            </select>
            <p className="text-[10px] text-slate-400 mt-1 leading-snug">
              Decide quale soglia si applica: con lavoratori vale il concorso 30% + 15.000 €, senza
              vale la sola soglia di 5.000 €.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <CampoEuro
              etichetta="Contributi scaduti e non versati"
              fonte="Dai flussi UNIEMENS inviati all'istituto, o dal file V.E.R.A. richiesto all'INPS."
              valore={valori.contributiScaduti}
              onCambia={(v) => setValori({ ...valori, contributiScaduti: v })}
            />
            <CampoEuro
              etichetta="Contributi dovuti nell'anno precedente"
              fonte="Totale annuo dei contributi DOVUTI (non del debito): dai flussi UNIEMENS. È la base su cui si calcola il 30%."
              valore={valori.contributiDovutiAnnoPrecedente}
              onCambia={(v) => setValori({ ...valori, contributiDovutiAnnoPrecedente: v })}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                Anno di riferimento
              </label>
              <input
                type="number"
                min={2000}
                max={2100}
                value={testo(valori.annoContributiDovuti)}
                onChange={(e) =>
                  setValori({ ...valori, annoContributiDovuti: numero(e.target.value) })
                }
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
              <p className="text-[10px] text-slate-400 mt-1">Anno cui si riferisce il totale.</p>
            </div>
            <CampoEuro
              etichetta="Sanzioni presunte (V.E.R.A.)"
              fonte="Dal file V.E.R.A. Sono una presunzione — si determinano al pagamento — e restano FUORI dal test di soglia, che si misura sui soli contributi."
              valore={valori.sanzioniPresunteVera}
              onCambia={(v) => setValori({ ...valori, sanzioniPresunteVera: v })}
            />
          </div>
        </div>

        {/* Altri enti — solo dove servono */}
        {(tipoSpazio === 'NON_ENTE' || ente === 'INAIL') && (
          <div className="space-y-3 border-t border-slate-100 pt-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-sky-700">INAIL</p>
            <CampoEuro
              etichetta="Premi assicurativi non versati"
              fonte="Dall'estratto conto INAIL o dalla comunicazione di irregolarità."
              valore={valori.premiInail}
              onCambia={(v) => setValori({ ...valori, premiInail: v })}
            />
          </div>
        )}

        {(tipoSpazio === 'NON_ENTE' || ente === 'AGENZIA_ENTRATE') && (
          <div className="space-y-3 border-t border-slate-100 pt-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-sky-700">
              Agenzia delle Entrate (IVA)
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <CampoEuro
                etichetta="Debito IVA scaduto"
                fonte="Dalle liquidazioni periodiche IVA (LIPE) non versate."
                valore={valori.ivaScaduta}
                onCambia={(v) => setValori({ ...valori, ivaScaduta: v })}
              />
              <CampoEuro
                etichetta="Volume d'affari anno precedente"
                fonte="Dalla dichiarazione IVA annuale. Serve al requisito del 10%; oltre 20.000 € la segnalazione scatta comunque."
                valore={valori.volumeAffari}
                onCambia={(v) => setValori({ ...valori, volumeAffari: v })}
              />
            </div>
          </div>
        )}

        {(tipoSpazio === 'NON_ENTE' || ente === 'AGENZIA_RISCOSSIONE') && (
          <div className="space-y-3 border-t border-slate-100 pt-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-sky-700">
              Agenzia Entrate-Riscossione
            </p>
            <CampoEuro
              etichetta="Crediti affidati e scaduti"
              fonte="Dall'estratto di ruolo richiesto all'Agente della Riscossione."
              valore={valori.creditiAffidatiAer}
              onCambia={(v) => setValori({ ...valori, creditiAffidatiAer: v })}
            />
            <p className="text-[10px] leading-snug text-slate-500">
              Soglia scelta in base alla forma giuridica, letta dall&apos;anagrafica
              {formaGiuridica ? ` («${formaGiuridica}»)` : ''}:{' '}
              {formaRiconosciuta ? (
                <span className="text-slate-700 font-bold">riconosciuta.</span>
              ) : (
                <span className="text-amber-700 font-bold">
                  non riconosciuta fra le tre fattispecie — nessuna soglia applicata.
                </span>
              )}
            </p>
          </div>
        )}

        <div className="flex items-center gap-3 border-t border-slate-100 pt-4">
          <button
            onClick={() => void salva()}
            disabled={salvataggio}
            className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-slate-800 disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            {salvataggio ? 'Salvataggio...' : 'Salva valori'}
          </button>
          {valori.soglieAggiornateAl && (
            <span className="text-[10px] text-slate-400">
              Aggiornati al {valori.soglieAggiornateAl}
            </span>
          )}
          {messaggio && <span className="text-[10px] text-emerald-700 font-bold">{messaggio}</span>}
          {errore && <span className="text-[10px] text-red-700 font-bold">{errore}</span>}
        </div>
      </div>

      {/* ---- Esito ------------------------------------------------------ */}
      {esito && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <h3 className="font-bold text-slate-900 uppercase text-xs tracking-wider border-b border-slate-100 pb-3">
            {tipoSpazio === 'ENTE'
              ? `Soglia di segnalazione${ente ? ` — ${ETICHETTA_ENTE[ente]}` : ''}`
              : 'Soglie di segnalazione — quadro complessivo'}
          </h3>

          {tipoSpazio === 'NON_ENTE' ? (
            <ParagrafoRedigente esito={esito} />
          ) : (
            <GrigliaRicevente esito={esito} />
          )}

          {esito.inpsSopraSoloConSanzioni && (
            <div className="flex items-start gap-2 text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-3">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <p className="leading-relaxed">
                I contributi restano sotto la soglia applicabile. Il superamento comparirebbe solo
                sommando le sanzioni presunte dal file V.E.R.A.: non fondano da sole la
                segnalazione, vanno quantificate sugli atti dell&apos;ente.
              </p>
            </div>
          )}

          {esito.datiMancanti.length > 0 && (
            <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/50">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                Cosa non è stato verificato
              </p>
              <ul className="space-y-1">
                {esito.datiMancanti.map((d, i) => (
                  <li key={i} className="text-[10px] text-slate-600 leading-relaxed flex gap-2">
                    <span className="text-slate-400 shrink-0">—</span>
                    <span>{d}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Ricevente: una soglia, in griglia. */
function GrigliaRicevente({ esito }: { esito: EsitoSoglie }) {
  const applicabili = esito.righe.filter((r) => r.applicabile);
  if (applicabili.length === 0) {
    return (
      <div className="flex items-start gap-2 text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-3">
        <Info className="w-4 h-4 shrink-0 mt-0.5" />
        <p>
          Nessuna soglia applicata. Verificare che una riga dei Limiti di Ricevibilità sia collegata
          a un ente dell&apos;art. 25-novies e che i dati richiesti siano compilati.
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {applicabili.map((r, i) => (
        <div key={i} className="border border-slate-200 rounded-lg p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-bold text-xs text-slate-900">{r.ambito}</p>
              <p className="text-[10px] text-slate-500 mt-0.5">{r.descrizione}</p>
              <p className="text-[10px] font-bold text-slate-700 mt-1">{r.valore}</p>
            </div>
            <span
              className={`inline-block text-[9px] font-bold uppercase tracking-wider border rounded px-1.5 py-0.5 whitespace-nowrap ${
                r.esito === 'sopra'
                  ? 'bg-red-50 text-red-700 border-red-200'
                  : r.esito === 'sotto'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-amber-50 text-amber-700 border-amber-200'
              }`}
            >
              {r.esito === 'sopra'
                ? 'Oltre soglia'
                : r.esito === 'sotto'
                  ? 'Sotto soglia'
                  : 'Non determinabile'}
            </span>
          </div>
          <p className="text-[10px] text-slate-600 mt-2 pt-2 border-t border-slate-100 leading-relaxed">
            {r.motivo}
          </p>
        </div>
      ))}
      {esito.superate.length > 0 && (
        <div className="flex items-start gap-2 text-[11px] text-red-800 bg-red-50 border border-red-200 rounded-lg p-3">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            Esposizione oltre la soglia applicabile. Prima di procedere va accertato il requisito
            del ritardo di oltre 90 giorni, che i dati disponibili non dimostrano. Accertato quello,
            inviare la comunicazione all&apos;imprenditore e, ove esistente, all&apos;organo di
            controllo nella persona del presidente del collegio sindacale o del sindaco unico.
          </p>
        </div>
      )}
    </div>
  );
}

/** Redigente: tutte le soglie, in prosa. */
function ParagrafoRedigente({ esito }: { esito: EsitoSoglie }) {
  const superate = esito.superate;
  const nonDet = esito.nonDeterminabili;
  const sotto = esito.righe.filter((r) => r.applicabile && r.esito === 'sotto');

  return (
    <div className="space-y-3 text-[12px] text-slate-700 leading-relaxed">
      {superate.length > 0 ? (
        <p className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-900">
          <span className="font-bold">
            {superate.length === 1
              ? 'Una soglia di segnalazione risulta superata'
              : `${superate.length} soglie di segnalazione risultano superate`}
            :{' '}
          </span>
          {superate
            .map(
              (r) =>
                `${ETICHETTA_ENTE[r.ente]} (${r.esposizione !== null ? euro(r.esposizione) : 'importo non disponibile'}, soglia ${r.valore})`
            )
            .join('; ')}
          . L&apos;ente è tenuto a segnalare all&apos;imprenditore e, ove esistente, all&apos;organo
          di controllo, invitandolo a valutare l&apos;accesso alla composizione negoziata — a
          condizione che ricorra anche il ritardo di oltre 90 giorni, che questi dati non
          dimostrano. È il fattore che definisce il tempo disponibile per portare la proposta.
        </p>
      ) : (
        <p className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-emerald-900">
          <span className="font-bold">Nessuna soglia di segnalazione risulta superata</span> fra
          quelle valutabili con i dati inseriti.
        </p>
      )}

      {sotto.length > 0 && (
        <p>
          <span className="font-bold text-slate-900">Sotto soglia: </span>
          {sotto
            .map(
              (r) =>
                `${ETICHETTA_ENTE[r.ente]} (${r.esposizione !== null ? euro(r.esposizione) : 'n.d.'} contro ${r.valore})`
            )
            .join('; ')}
          .
        </p>
      )}

      {nonDet.length > 0 && (
        <p className="text-amber-800">
          <span className="font-bold">Non determinabili per dati mancanti: </span>
          {nonDet.map((r) => ETICHETTA_ENTE[r.ente]).join('; ')}. Completare i campi sopra per
          ottenere un quadro completo — un&apos;esposizione non valutata non equivale a
          un&apos;esposizione sotto soglia.
        </p>
      )}
    </div>
  );
}
