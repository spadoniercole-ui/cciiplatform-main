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

function handleStampaAnalisi(testo: string, generataIl: string | null) {
  stampaTesto('Analisi Proposta — Ricevente', testo, generataIl);
}

interface Props {
  nomeSchema: string;
  scenarioId: number;
  codice: string;
  /** Il genitore (Proposta) mostra un confronto basato sullo stesso esito di ricevibilità — senza questo, resta con dati vecchi finché non si ricarica la pagina, anche se l'analisi qui dentro è appena riuscita. */
  onAnalisiCompletata?: () => void;
}

type SlotDocumento = 'asseverazione' | 'propostaCramDown' | 'pianoSviluppo';

const SLOT: { id: SlotDocumento; label: string; obbligatorio: boolean }[] = [
  { id: 'propostaCramDown', label: 'Proposta di cram down', obbligatorio: true },
  { id: 'asseverazione', label: 'Asseverazione del professionista', obbligatorio: false },
  { id: 'pianoSviluppo', label: 'Piano di sviluppo', obbligatorio: false },
];

export function SimulazioneRiceventeScenario({
  nomeSchema,
  scenarioId,
  codice,
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
      setErrore('Carica almeno la proposta di cram down prima di analizzare.');
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

      const risultato = await analizzaDocumentiRiceventeAction(nomeSchema, scenarioId, {
        asseverazione: documentiCaricati.asseverazione || null,
        propostaCramDown: documentiCaricati.propostaCramDown!,
        pianoSviluppo: documentiCaricati.pianoSviluppo || null,
      });
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

  if (caricamento) return <p className="text-xs text-slate-400">Caricamento...</p>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
          Analisi Proposta — Ricevente
        </h2>
        <p className="text-[11px] text-slate-500 mt-1">
          Tre documenti, ciascuno identificabile singolarmente per l&apos;analisi. Solo la proposta
          di cram down è obbligatoria — senza di lei l&apos;analisi non parte. Gli altri due sono
          opzionali, ma la loro assenza pesa sul giudizio finale. I documenti non vengono conservati
          dopo l&apos;analisi, solo il risultato testuale.
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
                )}
              </div>
            </div>
          );
        })}

        <button
          type="button"
          onClick={handleAnalizza}
          disabled={analisiInCorso || !fileScelti.propostaCramDown}
          className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white font-bold uppercase tracking-wider rounded-lg text-xs transition-colors"
        >
          {analisiInCorso ? (
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Sparkles className="w-3.5 h-3.5" />
          )}
          {analisiInCorso ? 'Caricamento e analisi...' : 'Analizza'}
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
