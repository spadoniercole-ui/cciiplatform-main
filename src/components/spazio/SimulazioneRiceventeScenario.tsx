'use client';

import React, { useEffect, useState } from 'react';
import {
  Upload,
  FileText,
  X,
  AlertTriangle,
  Sparkles,
  RefreshCw,
  CheckCircle2,
  Printer,
  Circle,
  Info,
} from 'lucide-react';
import {
  analizzaDocumentiRiceventeAction,
  ottieniAnalisiRiceventeAction,
  type DocumentoPdf,
} from '@/app/actions/simulazioneRicevente';
import {
  calcolaGiudizioFinaleRicevente,
  type GiudizioFinaleRicevente,
} from '@/app/actions/giudizioRicevente';
import { stampaTesto } from '@/lib/stampaTesto';
import {
  ottieniStatoValutazioneAction,
  salvaDichiarazioniValutazioneAction,
  type StatoValutazione,
  type DichiarazioniValutazione,
} from '@/app/actions/valutazioneRicevente';
import { aggiornaDatiSettoreAction } from '@/app/actions/datiSettore';
import { valutaListaControllo, type StatoDocumento } from '@/lib/valutazione/listaControllo';

function handleStampaAnalisi(testo: string, generataIl: string | null) {
  stampaTesto('Analisi Proposta — Ricevente', testo, generataIl);
}

interface Props {
  nomeSchema: string;
  scenarioId: number;
  codice: string;
  aziendaId: number;
  /** Il genitore (Proposta) mostra un confronto basato sullo stesso esito di ricevibilità — senza questo, resta con dati vecchi finché non si ricarica la pagina, anche se l'analisi qui dentro è appena riuscita. */
  onAnalisiCompletata?: () => void;
}

type SlotDocumento = 'asseverazione' | 'propostaCramDown' | 'pianoSviluppo';

const SLOT: { id: SlotDocumento; label: string; obbligatorio: boolean }[] = [
  { id: 'propostaCramDown', label: 'Proposta di cram down', obbligatorio: true },
  { id: 'asseverazione', label: 'Asseverazione del professionista', obbligatorio: false },
  { id: 'pianoSviluppo', label: 'Piano di sviluppo dell’azienda', obbligatorio: false },
];

export function SimulazioneRiceventeScenario({
  nomeSchema,
  scenarioId,
  codice,
  aziendaId,
  onAnalisiCompletata,
}: Props) {
  const [fileScelti, setFileScelti] = useState<Partial<Record<SlotDocumento, File>>>({});
  const [analisi, setAnalisi] = useState<string | null>(null);
  const [nomiFileAnalizzati, setNomiFileAnalizzati] = useState<string[]>([]);
  const [documentiMancanti, setDocumentiMancanti] = useState<string[]>([]);
  const [generataIl, setGenerataIl] = useState<string | null>(null);
  const [troncata, setTroncata] = useState(false);
  const [giudizio, setGiudizio] = useState<GiudizioFinaleRicevente | null>(null);
  const [caricamento, setCaricamento] = useState(true);
  const [analisiInCorso, setAnalisiInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  // Piccolo prompt libero per questa generazione (usa-e-getta, non salvato).
  const [istruzioniAI, setIstruzioniAI] = useState('');
  // Lista di controllo (0.109.114): stato lato server e dichiarazioni.
  const [stato, setStato] = useState<StatoValutazione | null>(null);
  const [dichiarazioni, setDichiarazioni] = useState<DichiarazioniValutazione>({});
  const [settoreInCorso, setSettoreInCorso] = useState(false);

  const caricaStato = async () => {
    const ris = await ottieniStatoValutazioneAction(nomeSchema, scenarioId, aziendaId);
    if (ris.success) {
      setStato(ris);
      setDichiarazioni(ris.dichiarazioni);
    } else if (ris.error) {
      setErrore(ris.error);
    }
  };

  const cambiaDichiarazione = async (chiave: keyof DichiarazioniValutazione, valore: boolean) => {
    const nuove = { ...dichiarazioni, [chiave]: valore };
    setDichiarazioni(nuove);
    const ris = await salvaDichiarazioniValutazioneAction(nomeSchema, scenarioId, nuove);
    if (!ris.success) setErrore(ris.error || 'Impossibile salvare la dichiarazione.');
  };

  const handleAggiornaSettore = async () => {
    setSettoreInCorso(true);
    setErrore(null);
    const ris = await aggiornaDatiSettoreAction(nomeSchema, aziendaId);
    if (!ris.success) setErrore(ris.error || 'Aggiornamento dei dati di settore non riuscito.');
    await caricaStato();
    setSettoreInCorso(false);
  };

  const carica = async () => {
    setCaricamento(true);
    const [analisiRis, giudizioRis] = await Promise.all([
      ottieniAnalisiRiceventeAction(nomeSchema, scenarioId),
      calcolaGiudizioFinaleRicevente(nomeSchema, scenarioId),
    ]);
    if (analisiRis.success && analisiRis.analisi) {
      setAnalisi(analisiRis.analisi);
      setNomiFileAnalizzati(analisiRis.nomiFile || []);
      setDocumentiMancanti(analisiRis.documentiMancanti || []);
      setGenerataIl(analisiRis.generataIl || null);
    }
    if (giudizioRis.success && giudizioRis.giudizio) setGiudizio(giudizioRis.giudizio);
    await caricaStato();
    setCaricamento(false);
  };

  useEffect(() => {
    carica();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nomeSchema, scenarioId]);

  const handleScegli = (slot: SlotDocumento, file: File | null) => {
    setErrore(null);
    if (!file) return;
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setErrore(`"${file.name}" non è un PDF — solo file PDF sono ammessi.`);
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setErrore(`"${file.name}" supera i 20MB consentiti.`);
      return;
    }
    setFileScelti((prev) => ({ ...prev, [slot]: file }));
  };

  const handleRimuovi = (slot: SlotDocumento) => {
    setFileScelti((prev) => {
      const nuovi = { ...prev };
      delete nuovi[slot];
      return nuovi;
    });
  };

  const handleAnalizza = async () => {
    if (!fileScelti.propostaCramDown) {
      setErrore('Carica almeno la proposta di cram down prima di avviare la valutazione.');
      return;
    }
    if (lista && !lista.pronta) {
      setErrore(`Prima di avviare la valutazione completa: ${lista.mancanti.join('; ')}.`);
      return;
    }
    setAnalisiInCorso(true);
    setErrore(null);

    try {
      // Upload proxato attraverso questa app, non più diretto dal
      // browser a Vercel Blob — bug confermato lato Vercel su quel
      // percorso (vedi il commento in api/blob-upload/route.ts). Torna
      // a valere il limite di 4,5MB sul corpo della richiesta.
      const documentiCaricati: Partial<Record<SlotDocumento, DocumentoPdf>> = {};
      for (const s of SLOT) {
        const file = fileScelti[s.id];
        if (!file) continue;
        const formData = new FormData();
        formData.append('file', file);
        formData.append('codice', codice);
        const rispostaUpload = await fetch('/api/blob-upload', {
          method: 'POST',
          body: formData,
        });
        const corpoUpload = await rispostaUpload.json();
        if (!rispostaUpload.ok || corpoUpload.error) {
          setErrore(corpoUpload.error || `Impossibile caricare "${file.name}".`);
          return;
        }
        documentiCaricati[s.id] = { nome: file.name, url: corpoUpload.url };
      }

      const risultato = await analizzaDocumentiRiceventeAction(
        nomeSchema,
        scenarioId,
        {
          asseverazione: documentiCaricati.asseverazione || null,
          propostaCramDown: documentiCaricati.propostaCramDown!,
          pianoSviluppo: documentiCaricati.pianoSviluppo || null,
        },
        istruzioniAI
      );
      if (risultato.success) {
        // L'analisi critica (testo) e l'estrazione dell'importo sono
        // due output distinti della stessa chiamata — se uno dei due
        // manca, il server ha comunque avuto successo: non nasconderlo
        // dietro un errore generico, mostra quello che c'è.
        setAnalisi(
          risultato.analisi || "L'assistente non ha prodotto un testo di analisi leggibile."
        );
        setNomiFileAnalizzati(risultato.nomiFile || []);
        setDocumentiMancanti(risultato.documentiMancanti || []);
        setGenerataIl(risultato.generataIl || null);
        setTroncata(risultato.troncata || false);
        setFileScelti({});
        const giudizioRis = await calcolaGiudizioFinaleRicevente(nomeSchema, scenarioId);
        if (giudizioRis.success && giudizioRis.giudizio) setGiudizio(giudizioRis.giudizio);
        onAnalisiCompletata?.();
      } else {
        setErrore(risultato.error || "Impossibile completare l'analisi.");
      }
    } catch (error: any) {
      setErrore(error.message || 'Errore durante il caricamento dei documenti.');
    } finally {
      setAnalisiInCorso(false);
    }
  };

  const statoDoc = (slot: SlotDocumento, dichiarato: boolean | undefined): StatoDocumento =>
    fileScelti[slot] ? 'caricato' : dichiarato ? 'assente_dichiarato' : 'mancante';

  const lista = stato
    ? valutaListaControllo({
        propostaSelezionata: Boolean(fileScelti.propostaCramDown),
        asseverazione: statoDoc('asseverazione', dichiarazioni.asseverazioneNonPervenuta),
        pianoAziendale: statoDoc('pianoSviluppo', dichiarazioni.pianoAziendaleNonPervenuto),
        posizioniAggiornate: stato.posizioniAggiornate,
        posizioneNonPervenutaDichiarata: Boolean(dichiarazioni.posizioneNonPervenuta),
        settore: stato.settore,
        pianoSviluppoAttivo: stato.pianoSviluppoAttivo,
        oggi: new Date().toISOString(),
      })
    : null;
  const pronta = Boolean(lista?.pronta);

  if (caricamento) return <p className="text-xs text-slate-400">Caricamento...</p>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
          Analisi Proposta — Ricevente
        </h2>
        <p className="text-[11px] text-slate-500 mt-1">
          Tre documenti, ciascuno identificabile singolarmente. La proposta di cram down è
          obbligatoria; per asseverazione e piano aziendale, se non sono arrivati, spunta «Non
          pervenuto»: la loro assenza pesa sul giudizio finale ma resta dichiarata. Prima
          dell&apos;avvio controlla la lista qui sotto (posizione aggiornata, dati ISTAT di
          settore). I documenti non vengono conservati dopo la valutazione, solo il risultato
          testuale.
        </p>
      </div>

      {errore && (
        <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <p>{errore}</p>
        </div>
      )}

      {giudizio && giudizio.livello !== 'non_disponibile' && (
        <div
          className={`border rounded-xl p-4 ${
            giudizio.coloreEtichetta === 'verde'
              ? 'bg-emerald-50 border-emerald-200'
              : giudizio.coloreEtichetta === 'giallo'
                ? 'bg-amber-50 border-amber-200'
                : 'bg-red-50 border-red-200'
          }`}
        >
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
            Giudizio complessivo
          </span>
          <span className="text-sm font-bold text-slate-900 block">{giudizio.etichetta}</span>
          <p className="text-[11px] text-slate-600 mt-1">{giudizio.motivazione}</p>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <h3 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
          Documenti della proposta
        </h3>

        {SLOT.map((s) => {
          const file = fileScelti[s.id];
          return (
            <div key={s.id}>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-700 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-slate-400" />
                  {s.label}
                  {s.obbligatorio && <span className="text-red-500"> *</span>}
                  {file ? ` — selezionato: ${file.name}` : ''}
                </span>
                {file ? (
                  <button
                    type="button"
                    onClick={() => handleRimuovi(s.id)}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-slate-400 hover:text-red-600 text-[10px] font-bold uppercase"
                  >
                    <X className="w-3.5 h-3.5" /> Rimuovi
                  </button>
                ) : (
                  <div className="flex items-center gap-3">
                    {!s.obbligatorio && (
                      <label className="flex items-center gap-1.5 text-[10px] text-slate-600 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(
                            s.id === 'asseverazione'
                              ? dichiarazioni.asseverazioneNonPervenuta
                              : dichiarazioni.pianoAziendaleNonPervenuto
                          )}
                          onChange={(e) =>
                            cambiaDichiarazione(
                              s.id === 'asseverazione'
                                ? 'asseverazioneNonPervenuta'
                                : 'pianoAziendaleNonPervenuto',
                              e.target.checked
                            )
                          }
                        />
                        Non pervenuto
                      </label>
                    )}
                    <label className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[10px] uppercase rounded-lg transition-colors cursor-pointer">
                      <Upload className="w-3.5 h-3.5" />
                      Scegli file
                      <input
                        type="file"
                        accept="application/pdf,.pdf"
                        className="hidden"
                        onChange={(e) => handleScegli(s.id, e.target.files?.[0] || null)}
                      />
                    </label>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        <div>
          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
            Istruzioni per l&apos;AI (facoltative, solo per questa analisi)
          </label>
          <textarea
            value={istruzioniAI}
            onChange={(e) => setIstruzioniAI(e.target.value)}
            rows={2}
            placeholder="Es. verifica in particolare la sostenibilità del piano rispetto ai dati di settore…"
            className="w-full p-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 outline-none focus:border-blue-500"
          />
          <p className="text-[10px] text-slate-400 mt-1">
            Indicazioni specifiche per questa generazione. Non sostituiscono le regole del sistema e
            non vengono salvate.
          </p>
        </div>

        {lista && (
          <div className="border border-slate-200 rounded-lg p-4 space-y-2 bg-slate-50">
            <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              Prima di avviare la valutazione
            </h4>
            {lista.voci.map((v) => (
              <div key={v.id} className="flex items-start gap-2 text-xs">
                {v.informativa ? (
                  <Info className="w-4 h-4 shrink-0 mt-0.5 text-slate-400" />
                ) : v.ok ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
                ) : (
                  <Circle className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
                )}
                <div className="flex-1">
                  <span className="font-bold text-slate-800">{v.etichetta}</span>
                  <span className="text-slate-600"> — {v.dettaglio}</span>
                  {!v.ok && v.percorso && (
                    <span className="block text-[10px] text-slate-500">Dove: {v.percorso}</span>
                  )}
                  {v.id === 'posizione' && stato && stato.posizioniAggiornate === 0 && (
                    <label className="flex items-center gap-1.5 text-[10px] text-slate-600 mt-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(dichiarazioni.posizioneNonPervenuta)}
                        onChange={(e) =>
                          cambiaDichiarazione('posizioneNonPervenuta', e.target.checked)
                        }
                      />
                      Nessuna posizione aggiornata pervenuta: si valuta sui dati del bilancio
                    </label>
                  )}
                  {v.id === 'settore' && stato?.settore.applicabile && (
                    <button
                      type="button"
                      onClick={handleAggiornaSettore}
                      disabled={settoreInCorso}
                      className="mt-1 flex items-center gap-1 px-2.5 py-1 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold text-[10px] uppercase rounded-lg"
                    >
                      <RefreshCw className={`w-3 h-3 ${settoreInCorso ? 'animate-spin' : ''}`} />
                      {settoreInCorso ? 'Aggiornamento ISTAT…' : 'Aggiorna ora'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={handleAnalizza}
          disabled={analisiInCorso || !fileScelti.propostaCramDown || !pronta}
          className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white font-bold uppercase tracking-wider rounded-lg text-xs transition-colors"
        >
          {analisiInCorso ? (
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Sparkles className="w-3.5 h-3.5" />
          )}
          {analisiInCorso ? 'Caricamento e valutazione...' : 'Avvia la valutazione'}
        </button>
      </div>

      {analisi && (
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-3">
            <h3 className="font-bold text-slate-900 uppercase text-xs tracking-wider">Analisi</h3>
            <div className="flex items-center gap-3">
              {generataIl && (
                <span className="text-[10px] text-slate-400">
                  Generata il {new Date(generataIl).toLocaleString('it-IT')}
                </span>
              )}
              <button
                type="button"
                onClick={() => handleStampaAnalisi(analisi, generataIl)}
                className="flex items-center gap-1 px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[9px] uppercase rounded transition-colors"
                title="Apre una finestra di stampa — da lì puoi salvare come PDF"
              >
                <Printer className="w-3 h-3" /> Stampa / PDF
              </button>
            </div>
          </div>
          {nomiFileAnalizzati.length > 0 && (
            <p className="text-[10px] text-slate-400 mb-1">
              Basata su: {nomiFileAnalizzati.join(', ')}
            </p>
          )}
          {troncata && (
            <p className="flex items-center gap-1.5 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2 mb-3">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              Il testo qui sotto si interrompe prima della fine — ha raggiunto il limite di
              lunghezza consentito. Il giudizio complessivo resta comunque affidabile, basato sui
              dati estratti separatamente.
            </p>
          )}
          {documentiMancanti.length > 0 ? (
            <p className="flex items-center gap-1.5 text-[11px] text-amber-700 mb-3">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              Mancano: {documentiMancanti.join(', ')} — il giudizio complessivo ne tiene conto.
            </p>
          ) : (
            <p className="flex items-center gap-1.5 text-[11px] text-emerald-700 mb-3">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              Tutti e tre i documenti sono stati caricati.
            </p>
          )}
          <div className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">
            {analisi}
          </div>
        </div>
      )}
    </div>
  );
}
