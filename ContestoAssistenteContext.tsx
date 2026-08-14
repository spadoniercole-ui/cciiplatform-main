'use client';

// Check List interattiva per uno scenario — ora con selettore di modello:
// la Ministeriale (sempre presente) più eventuali modelli custom attivi
// per questo spazio (es. per un ente: Vigilanza Documentale, Gestione del
// Credito, Ufficio Legale). Ogni modello ha le proprie risposte e il
// proprio quadro, calcolati dallo STESSO motore di punteggio
// (src/lib/checklist/scoring.ts) con gli stessi pesi/soglie di spazio —
// stessi criteri della Ministeriale, aree diverse.

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  XCircle,
  HelpCircle,
  FileCheck,
  AlertTriangle,
  Download,
  Upload,
  EyeOff,
} from 'lucide-react';
import { esportaChecklistExcel, importaChecklistExcel } from '@/lib/checklist/excelChecklist';
import { useDichiaraContestoAssistente } from '@/components/ContestoAssistenteContext';
import {
  ottieniRisposteChecklist,
  salvaRispostaChecklistAction,
  ottieniEsclusioniChecklist,
  impostaEsclusioneDomandaAction,
  type RispostaChecklist,
} from '@/app/actions/checklist';
import { MODELLO_MINISTERIALE } from '@/lib/checklist/costanti';
import {
  CHECKLIST_MINISTERIALE,
  CHECKLIST_IMPRESE_MINORI_NOTA,
  type SezioneChecklist,
} from '@/lib/checklist/ministeriale';
import { calcolaQuadroQualitativo } from '@/lib/checklist/scoring';
import {
  ottieniConfigurazioneChecklist,
  type ConfigurazioneChecklist,
} from '@/app/actions/checklistConfig';
import { ottieniModelliChecklist, type ModelloChecklist } from '@/app/actions/checklistModelli';

interface Props {
  nomeSchema: string;
  scenarioId: number;
  codice: string;
  /** 'checklist-ente' quando questo componente è montato dentro Posizione Ente, 'checklist-generale' altrimenti (default) — dice all'assistente flottante quale delle due si tratta. */
  contestoPagina?: 'checklist-ente' | 'checklist-generale';
}

const CLASSI_COLORE = {
  grigio: {
    sfondo: 'bg-slate-50 border-slate-200',
    testo: 'text-slate-800',
    icona: 'text-slate-500',
  },
  verde: {
    sfondo: 'bg-emerald-50 border-emerald-200',
    testo: 'text-emerald-800',
    icona: 'text-emerald-600',
  },
  giallo: {
    sfondo: 'bg-amber-50 border-amber-200',
    testo: 'text-amber-800',
    icona: 'text-amber-600',
  },
  rosso: { sfondo: 'bg-red-50 border-red-200', testo: 'text-red-800', icona: 'text-red-600' },
} as const;

function conTimeout<T>(promessa: Promise<T>, secondi: number, messaggio: string): Promise<T> {
  return Promise.race([
    promessa,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(messaggio)), secondi * 1000)),
  ]);
}

export function ChecklistScenario({
  nomeSchema,
  scenarioId,
  codice,
  contestoPagina = 'checklist-generale',
}: Props) {
  const [modelli, setModelli] = useState<ModelloChecklist[]>([]);
  const [modelloSelezionato, setModelloSelezionato] = useState<string | null>(null);
  const [risposte, setRisposte] = useState<Record<string, RispostaChecklist>>({});
  const [domandeEscluse, setDomandeEscluse] = useState<Set<string>>(new Set());
  const [configurazione, setConfigurazione] = useState<ConfigurazioneChecklist | null>(null);
  const [sezioneAttiva, setSezioneAttiva] = useState(CHECKLIST_MINISTERIALE[0].numero);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);
  const [importazioneInCorso, setImportazioneInCorso] = useState(false);
  const [esitoImportazione, setEsitoImportazione] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [configRis, modelliRis] = await Promise.all([
          conTimeout(
            ottieniConfigurazioneChecklist(nomeSchema),
            15,
            'Richiesta della configurazione scaduta.'
          ),
          conTimeout(ottieniModelliChecklist(nomeSchema), 15, 'Richiesta dei modelli scaduta.'),
        ]);
        if (configRis.success && configRis.configurazione)
          setConfigurazione(configRis.configurazione);
        if (modelliRis.success) setModelli(modelliRis.modelli);
      } catch (err) {
        console.error('[ChecklistScenario] Errore nel caricamento della configurazione:', err);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nomeSchema]);

  const caricaRisposte = async () => {
    if (!modelloSelezionato) {
      setCaricamento(false);
      return;
    }
    setCaricamento(true);
    try {
      const [risultato, risultatoEsclusioni] = await Promise.all([
        conTimeout(
          ottieniRisposteChecklist(nomeSchema, scenarioId, modelloSelezionato),
          15,
          'Richiesta delle risposte scaduta: verifica la connessione e riprova.'
        ),
        conTimeout(
          ottieniEsclusioniChecklist(nomeSchema, scenarioId, modelloSelezionato),
          15,
          'Richiesta delle esclusioni scaduta.'
        ),
      ]);
      if (risultato.success) {
        const mappa: Record<string, RispostaChecklist> = {};
        for (const r of risultato.risposte) mappa[r.domandaId] = r;
        setRisposte(mappa);
        setErrore(null);
      } else {
        setErrore(risultato.error || 'Impossibile caricare le risposte.');
      }
      if (risultatoEsclusioni.success) {
        setDomandeEscluse(new Set(risultatoEsclusioni.domandeEscluse));
      }
    } catch (err: any) {
      console.error('[ChecklistScenario] Errore imprevisto nel caricamento risposte:', err);
      setErrore(`Errore imprevisto durante il caricamento: ${err.message || err}`);
    } finally {
      setCaricamento(false);
    }
  };

  useEffect(() => {
    caricaRisposte();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nomeSchema, scenarioId, modelloSelezionato]);

  useDichiaraContestoAssistente(
    modelloSelezionato
      ? { pagina: contestoPagina, nomeSchema, scenarioId, modelloChecklist: modelloSelezionato }
      : null
  );

  useEffect(() => {
    const handler = () => caricaRisposte();
    window.addEventListener('assistente:dati-aggiornati', handler);
    return () => window.removeEventListener('assistente:dati-aggiornati', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nomeSchema, scenarioId, modelloSelezionato]);

  const handleRisposta = async (domandaId: string, risposta: boolean) => {
    const notaAttuale = risposte[domandaId]?.note || null;
    setRisposte((prev) => ({ ...prev, [domandaId]: { domandaId, risposta, note: notaAttuale } }));
    await salvaRispostaChecklistAction(
      nomeSchema,
      scenarioId,
      modelloSelezionato!,
      domandaId,
      risposta,
      notaAttuale
    );
  };

  const handleNota = async (domandaId: string, nota: string) => {
    const rispostaAttuale = risposte[domandaId]?.risposta ?? null;
    setRisposte((prev) => ({
      ...prev,
      [domandaId]: { domandaId, risposta: rispostaAttuale, note: nota },
    }));
    await salvaRispostaChecklistAction(
      nomeSchema,
      scenarioId,
      modelloSelezionato!,
      domandaId,
      rispostaAttuale,
      nota
    );
  };

  const handleCambiaModello = (chiave: string) => {
    setModelloSelezionato(chiave);
    const nuoveSezioni: SezioneChecklist[] =
      chiave === MODELLO_MINISTERIALE
        ? configurazione?.sezioni || CHECKLIST_MINISTERIALE
        : modelli.find((m) => String(m.id) === chiave)?.sezioni || [];
    if (nuoveSezioni.length > 0) setSezioneAttiva(nuoveSezioni[0].numero);
  };

  const sezioniEffettive: SezioneChecklist[] =
    modelloSelezionato === MODELLO_MINISTERIALE
      ? configurazione?.sezioni || CHECKLIST_MINISTERIALE
      : modelli.find((m) => String(m.id) === modelloSelezionato)?.sezioni || [];

  const nomeModelloAttivo =
    modelloSelezionato === MODELLO_MINISTERIALE
      ? 'Ministeriale'
      : modelli.find((m) => String(m.id) === modelloSelezionato)?.nome || 'checklist';

  const handleEsporta = () => {
    esportaChecklistExcel(nomeModelloAttivo, sezioniEffettive, risposte, domandeEscluse);
  };

  const handleImporta = async (file: File) => {
    setImportazioneInCorso(true);
    setEsitoImportazione(null);
    try {
      const { righe, idNonRiconosciuti } = await importaChecklistExcel(file, sezioniEffettive);

      let salvate = 0;
      let esclusioniAggiornate = 0;
      const erroriSalvataggio: string[] = [];
      for (const riga of righe) {
        const risultato = await salvaRispostaChecklistAction(
          nomeSchema,
          scenarioId,
          modelloSelezionato!,
          riga.domandaId,
          riga.risposta,
          riga.note
        );
        if (risultato.success) {
          salvate += 1;
        } else {
          erroriSalvataggio.push(`${riga.domandaId}: ${risultato.error || 'errore sconosciuto'}`);
        }
        // L'esclusione è un dato a sé (non fa parte della "risposta"):
        // aggiornata sempre, indipendentemente dall'esito del salvataggio
        // della risposta, così il file Excel resta l'unica fonte di
        // verità per entrambe le cose in un solo giro di import.
        const risultatoEsclusione = await impostaEsclusioneDomandaAction(
          nomeSchema,
          scenarioId,
          modelloSelezionato!,
          riga.domandaId,
          riga.esclusa
        );
        if (risultatoEsclusione.success) esclusioniAggiornate += 1;
      }
      // Ricarica le risposte E le esclusioni salvate, non fidarsi solo
      // dello stato locale.
      const [risultato, risultatoEsclusioni] = await Promise.all([
        ottieniRisposteChecklist(nomeSchema, scenarioId, modelloSelezionato!),
        ottieniEsclusioniChecklist(nomeSchema, scenarioId, modelloSelezionato!),
      ]);
      if (risultato.success) {
        const mappa: Record<string, RispostaChecklist> = {};
        for (const r of risultato.risposte) mappa[r.domandaId] = r;
        setRisposte(mappa);
      }
      if (risultatoEsclusioni.success) {
        setDomandeEscluse(new Set(risultatoEsclusioni.domandeEscluse));
      }

      const parti = [
        `${salvate} di ${righe.length} risposte lette sono state salvate.`,
        `${esclusioniAggiornate} esclusioni aggiornate.`,
      ];
      if (erroriSalvataggio.length > 0) {
        parti.push(
          `Non salvate: ${erroriSalvataggio.slice(0, 3).join('; ')}${erroriSalvataggio.length > 3 ? '…' : ''}`
        );
      }
      if (idNonRiconosciuti.length > 0) {
        parti.push(
          `${idNonRiconosciuti.length} righe con ID non riconosciuto ignorate (${idNonRiconosciuti.slice(0, 5).join(', ')}${idNonRiconosciuti.length > 5 ? '…' : ''}).`
        );
      }
      setEsitoImportazione(parti.join(' '));
    } catch (err: any) {
      setEsitoImportazione(`Impossibile leggere il file: ${err.message || err}`);
    } finally {
      setImportazioneInCorso(false);
    }
  };

  const handleToggleEsclusione = async (domandaId: string) => {
    const esclusa = !domandeEscluse.has(domandaId);
    setDomandeEscluse((prev) => {
      const nuovo = new Set(prev);
      if (esclusa) nuovo.add(domandaId);
      else nuovo.delete(domandaId);
      return nuovo;
    });
    await impostaEsclusioneDomandaAction(
      nomeSchema,
      scenarioId,
      modelloSelezionato!,
      domandaId,
      esclusa
    );
  };

  // Le domande escluse restano visibili (in chiaro, non nascoste — si
  // deve sempre vedere COSA è stato escluso e perché), ma non entrano nel
  // calcolo del punteggio: un modello resta identico per tutti gli
  // scenari, sono le domande non pertinenti A QUESTO CASO a uscire dal
  // conteggio, non la struttura del modello.
  const sezioniPerPunteggio: SezioneChecklist[] = sezioniEffettive.map((sezione) => ({
    ...sezione,
    domande: sezione.domande.filter((d) => !domandeEscluse.has(d.id)),
  }));

  const quadro = calcolaQuadroQualitativo(
    sezioniPerPunteggio,
    risposte,
    configurazione?.pesiNumerici,
    configurazione
      ? { solido: configurazione.soglie.solido, daRafforzare: configurazione.soglie.daRafforzare }
      : undefined
  );
  const classiGenerali = CLASSI_COLORE[quadro.coloreEtichetta];
  const totaleDomande = sezioniPerPunteggio.reduce((acc, s) => acc + s.domande.length, 0);
  const risposteDate = Object.values(risposte).filter((r) => r.risposta !== null).length;
  const quadroSezioneAttiva = quadro.sezioni.find((s) => s.numero === sezioneAttiva);

  if (caricamento) return <p className="text-xs text-slate-400">Caricamento...</p>;

  if (errore) {
    return (
      <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
        {errore}
      </div>
    );
  }

  // Schermata di ingresso: schede per modello, nessuna domanda mostrata
  // finché non se ne sceglie uno — la Ministeriale (56 domande) da sola
  // rendeva la pagina lunghissima anche solo per vedere quali modelli
  // sono disponibili. Stesso principio già usato per Posizione Ente.
  if (!modelloSelezionato) {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="font-bold text-slate-900 uppercase text-xs tracking-wider">Check List</h2>
          <p className="text-[11px] text-slate-500 mt-1">Scegli il modello da compilare.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => handleCambiaModello(MODELLO_MINISTERIALE)}
            className="text-left bg-white border border-slate-200 hover:border-blue-300 rounded-xl p-4 transition-colors"
          >
            <div className="flex items-center gap-2 mb-1">
              <FileCheck className="w-4 h-4 text-blue-600" />
              <span className="font-bold text-slate-900 text-xs">Check List Ministeriale</span>
            </div>
            <p className="text-[11px] text-slate-500">
              {CHECKLIST_MINISTERIALE.reduce((acc, s) => acc + s.domande.length, 0)} domande,
              Sezione II del decreto ministeriale.
            </p>
          </button>
          {modelli.map((m) => {
            const numeroDomande = m.sezioni.reduce((acc, s) => acc + s.domande.length, 0);
            if (numeroDomande === 0) {
              // Modello ancora vuoto (appena creato, nessun Excel
              // importato): non ha senso aprire un dettaglio senza
              // domande — si va dritti dove si popola davvero.
              return (
                <Link
                  key={m.id}
                  href={`/spazio/${codice}/parametri/checklist?modello=${m.id}`}
                  className="text-left bg-white border border-dashed border-amber-300 hover:border-amber-400 rounded-xl p-4 transition-colors block"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <FileCheck className="w-4 h-4 text-amber-600" />
                    <span className="font-bold text-slate-900 text-xs">{m.nome}</span>
                  </div>
                  <p className="text-[11px] text-amber-700">
                    Ancora nessuna domanda — vai a Parametri di Spazio per esportare/importare lo
                    scheletro →
                  </p>
                </Link>
              );
            }
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => handleCambiaModello(String(m.id))}
                className="text-left bg-white border border-slate-200 hover:border-blue-300 rounded-xl p-4 transition-colors"
              >
                <div className="flex items-center gap-2 mb-1">
                  <FileCheck className="w-4 h-4 text-blue-600" />
                  <span className="font-bold text-slate-900 text-xs">{m.nome}</span>
                </div>
                <p className="text-[11px] text-slate-500">
                  {m.descrizione ? `${m.descrizione} — ` : ''}
                  {numeroDomande} domande
                </p>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={() => setModelloSelezionato(null)}
        className="text-[10px] font-bold text-slate-500 hover:text-blue-600 uppercase tracking-wider"
      >
        ← Elenco Check List
      </button>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleEsporta}
          className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[10px] uppercase rounded-lg transition-colors"
        >
          <Download className="w-3.5 h-3.5" /> Esporta per compilazione
        </button>
        <label className="flex items-center gap-1.5 px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-[10px] uppercase rounded-lg transition-colors cursor-pointer">
          <Upload className="w-3.5 h-3.5" />
          {importazioneInCorso ? 'Importazione...' : 'Importa compilato'}
          <input
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            disabled={importazioneInCorso}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleImporta(file);
              e.target.value = '';
            }}
          />
        </label>
      </div>
      {esitoImportazione && (
        <div className="text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-3">
          {esitoImportazione}
        </div>
      )}

      <div className={`border rounded-xl p-4 flex items-center gap-3 ${classiGenerali.sfondo}`}>
        <FileCheck className={`w-5 h-5 shrink-0 ${classiGenerali.icona}`} />
        <div className={`text-xs ${classiGenerali.testo}`}>
          <span className="font-bold">{quadro.etichetta}</span>
          {quadro.percentualeCriticitaComplessiva !== null && (
            <span> — criticità pesata {quadro.percentualeCriticitaComplessiva}%</span>
          )}
          <span className="ml-2 text-slate-500">
            ({risposteDate}/{totaleDomande} domande compilate)
          </span>
        </div>
      </div>

      {quadro.criticitaStrutturaliAperte.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-red-600" />
            <span className="text-xs font-bold text-red-800 uppercase tracking-wider">
              Criticità strutturali ancora aperte ({quadro.criticitaStrutturaliAperte.length})
            </span>
          </div>
          <ul className="space-y-1">
            {quadro.criticitaStrutturaliAperte.map((c) => (
              <li key={c.id} className="text-[11px] text-red-700">
                <span className="font-mono font-bold">{c.id}</span> ({c.sezione}) — {c.domanda}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex gap-2 overflow-x-auto pb-1">
        {quadro.sezioni.map((s) => (
          <button
            key={s.numero}
            type="button"
            onClick={() => setSezioneAttiva(s.numero)}
            className={`px-3 py-2 rounded-lg text-[11px] font-bold whitespace-nowrap transition-colors shrink-0 ${
              sezioneAttiva === s.numero
                ? 'bg-blue-600 text-white'
                : 'bg-white border border-slate-200 text-slate-600 hover:border-blue-300'
            }`}
          >
            {s.numero}. {s.titolo}
            <span
              className={`ml-1.5 ${sezioneAttiva === s.numero ? 'text-blue-100' : 'text-slate-400'}`}
            >
              ({s.domandeRisposte}/{s.domandeTotali})
            </span>
          </button>
        ))}
      </div>

      {sezioniEffettive
        .filter((sezione) => sezione.numero === sezioneAttiva)
        .map((sezione) => {
          const coloreSezione: keyof typeof CLASSI_COLORE =
            quadroSezioneAttiva?.percentualeCriticita === null ||
            quadroSezioneAttiva?.percentualeCriticita === undefined
              ? 'grigio'
              : quadroSezioneAttiva.percentualeCriticita === 0
                ? 'verde'
                : quadroSezioneAttiva.percentualeCriticita <= 20
                  ? 'verde'
                  : quadroSezioneAttiva.percentualeCriticita <= 50
                    ? 'giallo'
                    : 'rosso';
          const classiSezione = CLASSI_COLORE[coloreSezione];
          return (
            <div key={sezione.numero} className="bg-white border border-slate-200 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-slate-900 text-sm">
                  {sezione.numero}. {sezione.titolo}
                </h3>
                {quadroSezioneAttiva && quadroSezioneAttiva.percentualeCriticita !== null && (
                  <span
                    className={`text-[10px] font-bold px-2 py-1 rounded ${classiSezione.sfondo} ${classiSezione.testo}`}
                  >
                    criticità {quadroSezioneAttiva.percentualeCriticita}%
                  </span>
                )}
              </div>
              <div className="space-y-4">
                {sezione.domande.map((domanda) => {
                  const risposta = risposte[domanda.id];
                  const esclusa = domandeEscluse.has(domanda.id);
                  return (
                    <div
                      key={domanda.id}
                      className={`border-b border-slate-100 pb-4 last:border-0 ${esclusa ? 'opacity-40' : ''}`}
                    >
                      <div className="flex items-start gap-2">
                        <span className="text-[10px] font-mono text-slate-400 mt-0.5 shrink-0">
                          {domanda.id}
                        </span>
                        <div className="flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-xs text-slate-800">
                              {domanda.domanda}{' '}
                              <span
                                className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${
                                  domanda.peso === 'STRUTTURALE'
                                    ? 'bg-red-100 text-red-700'
                                    : domanda.peso === 'RILEVANTE'
                                      ? 'bg-amber-100 text-amber-700'
                                      : 'bg-slate-100 text-slate-500'
                                }`}
                              >
                                {domanda.peso}
                              </span>{' '}
                              <span className="text-[9px] text-slate-400 uppercase">
                                (a cura{' '}
                                {domanda.aCuraDi === 'imprenditore'
                                  ? "dell'imprenditore"
                                  : "dell'esperto"}
                                )
                              </span>
                            </p>
                            <button
                              type="button"
                              onClick={() => handleToggleEsclusione(domanda.id)}
                              title={
                                esclusa
                                  ? 'Non applicabile a questo scenario — clicca per reincludere'
                                  : 'Segna come non applicabile a questo scenario'
                              }
                              className={`shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase transition-colors ${
                                esclusa
                                  ? 'bg-slate-700 text-white'
                                  : 'text-slate-300 hover:text-slate-500'
                              }`}
                            >
                              <EyeOff className="w-3 h-3" />
                              {esclusa ? 'Esclusa' : ''}
                            </button>
                          </div>
                          <div className="flex items-center gap-2 mt-2">
                            <button
                              type="button"
                              onClick={() => handleRisposta(domanda.id, true)}
                              className={`flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-bold uppercase transition-colors ${
                                risposta?.risposta === true
                                  ? 'bg-emerald-600 text-white'
                                  : 'bg-slate-100 text-slate-500 hover:bg-emerald-50'
                              }`}
                            >
                              <CheckCircle2 className="w-3 h-3" /> Sì
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRisposta(domanda.id, false)}
                              className={`flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-bold uppercase transition-colors ${
                                risposta?.risposta === false
                                  ? 'bg-red-600 text-white'
                                  : 'bg-slate-100 text-slate-500 hover:bg-red-50'
                              }`}
                            >
                              <XCircle className="w-3 h-3" /> No
                            </button>
                          </div>

                          {risposta?.risposta === false && domanda.indicazioneSeNo && (
                            <div className="mt-2 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                              <HelpCircle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                              <p className="text-[11px] text-amber-800">
                                {domanda.indicazioneSeNo}
                              </p>
                            </div>
                          )}

                          <input
                            type="text"
                            value={risposta?.note || ''}
                            onChange={(e) => handleNota(domanda.id, e.target.value)}
                            placeholder="Note (facoltativo)..."
                            className="w-full mt-2 p-1.5 text-[11px] bg-slate-50 border border-slate-200 rounded outline-none focus:border-blue-500 text-slate-700"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

      {modelloSelezionato === MODELLO_MINISTERIALE && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
          <p className="text-[11px] text-slate-500">{CHECKLIST_IMPRESE_MINORI_NOTA}</p>
        </div>
      )}
    </div>
  );
}
