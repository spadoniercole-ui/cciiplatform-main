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
  caricaDocumentiRiceventeAction,
  ottieniAnalisiRiceventeAction,
  ottieniDocumentiRiceventeAction,
  type DocumentoPdf,
} from '@/app/actions/simulazioneRicevente';
import { InquadramentoProposta } from '@/components/spazio/InquadramentoProposta';
import type { PrimaLettura } from '@/lib/proposta/primaLettura';
import { voceStrumento } from '@/lib/proposta/inquadramento';
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
  tipoSpazio: 'ENTE' | 'NON_ENTE';
  /** Versione delle righe della proposta (per l'inquadramento). */
  versioneRighe: number;
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
  tipoSpazio,
  versioneRighe,
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
  // Percorso in quattro tempi: documenti caricati → prima lettura →
  // inquadramento confermato → valutazione.
  const [caricati, setCaricati] = useState<Record<SlotDocumento, string | null> | null>(null);
  const [primaLettura, setPrimaLettura] = useState<PrimaLettura | null>(null);
  const [erroreLettura, setErroreLettura] = useState<string | null>(null);
  const [letturaInCorso, setLetturaInCorso] = useState(false);
  const [inquadramentoConfermato, setInquadramentoConfermato] = useState(false);

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
    const [analisiRis, giudizioRis, docRis] = await Promise.all([
      ottieniAnalisiRiceventeAction(nomeSchema, scenarioId),
      calcolaGiudizioFinaleRicevente(nomeSchema, scenarioId),
      ottieniDocumentiRiceventeAction(nomeSchema, scenarioId),
    ]);
    if (docRis.success) {
      setCaricati(docRis.documenti ?? null);
      setPrimaLettura(docRis.primaLettura ?? null);
    }
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

  /** Passi 1 e 2: carica i documenti così come sono arrivati e ne fa la prima lettura. */
  const handleCaricaELeggi = async () => {
    if (!fileScelti.propostaCramDown) {
      setErrore('Serve almeno la proposta.');
      return;
    }
    setLetturaInCorso(true);
    setErrore(null);
    setErroreLettura(null);
    try {
      const documentiCaricati: Partial<Record<SlotDocumento, DocumentoPdf>> = {};
      for (const s of SLOT) {
        const file = fileScelti[s.id];
        if (!file) continue;
        const formData = new FormData();
        formData.append('file', file);
        formData.append('codice', codice);
        const rispostaUpload = await fetch('/api/blob-upload', { method: 'POST', body: formData });
        const corpoUpload = await rispostaUpload.json();
        if (!rispostaUpload.ok || corpoUpload.error) {
          setErrore(corpoUpload.error || `Impossibile caricare "${file.name}".`);
          return;
        }
        documentiCaricati[s.id] = { nome: file.name, url: corpoUpload.url };
      }
      const r = await caricaDocumentiRiceventeAction(nomeSchema, scenarioId, {
        asseverazione: documentiCaricati.asseverazione || null,
        propostaCramDown: documentiCaricati.propostaCramDown!,
        pianoSviluppo: documentiCaricati.pianoSviluppo || null,
      });
      if (!r.success) {
        setErrore(r.error || 'Caricamento non riuscito.');
        return;
      }
      setCaricati(r.documenti ?? null);
      setPrimaLettura(r.primaLettura ?? null);
      setErroreLettura(r.erroreLettura ?? null);
      setFileScelti({});
    } catch (error: unknown) {
      setErrore((error as Error).message || 'Errore durante il caricamento dei documenti.');
    } finally {
      setLetturaInCorso(false);
    }
  };

  /** Passo 4: la valutazione, sui documenti già caricati e con l'inquadramento confermato. */
  const handleAnalizza = async () => {
    if (!caricati?.propostaCramDown) {
      setErrore('Carica prima i documenti ricevuti.');
      return;
    }
    if (!inquadramentoConfermato) {
      setErrore('Conferma e salva prima l’inquadramento della proposta.');
      return;
    }
    if (lista && !lista.pronta) {
      setErrore(`Prima di avviare la valutazione completa: ${lista.mancanti.join('; ')}.`);
      return;
    }
    setAnalisiInCorso(true);
    setErrore(null);
    try {
      const risultato = await analizzaDocumentiRiceventeAction(
        nomeSchema,
        scenarioId,
        istruzioniAI
      );
      if (risultato.success) {
        setAnalisi(
          risultato.analisi || "L'assistente non ha prodotto un testo di analisi leggibile."
        );
        setNomiFileAnalizzati(risultato.nomiFile || []);
        setDocumentiMancanti(risultato.documentiMancanti || []);
        setGenerataIl(risultato.generataIl || null);
        setTroncata(risultato.troncata || false);
        // I documenti hanno finito il loro lavoro e sono stati eliminati.
        setCaricati(null);
        const giudizioRis = await calcolaGiudizioFinaleRicevente(nomeSchema, scenarioId);
        if (giudizioRis.success && giudizioRis.giudizio) setGiudizio(giudizioRis.giudizio);
        onAnalisiCompletata?.();
      } else {
        setErrore(risultato.error || "Impossibile completare l'analisi.");
      }
    } catch (error: unknown) {
      setErrore((error as Error).message || 'Errore durante la valutazione.');
    } finally {
      setAnalisiInCorso(false);
    }
  };

  const statoDoc = (slot: SlotDocumento, dichiarato: boolean | undefined): StatoDocumento =>
    caricati?.[slot] || fileScelti[slot]
      ? 'caricato'
      : dichiarato
        ? 'assente_dichiarato'
        : 'mancante';

  const lista = stato
    ? valutaListaControllo({
        propostaSelezionata: Boolean(caricati?.propostaCramDown),
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
          Quattro passi: carichi i documenti ricevuti; la piattaforma ne fa una prima lettura e ti
          propone strumento, data e quota degli altri aderenti; confermi o correggi le scelte; poi
          parte la valutazione. La proposta è obbligatoria; per asseverazione e piano, se non sono
          arrivati, spunta «Non pervenuto»: l’assenza pesa sul giudizio ma resta dichiarata. I
          documenti restano disponibili fino alla valutazione e poi vengono eliminati: resta solo il
          risultato.
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

      {/* 1 · DOCUMENTI RICEVUTI, così come li ha mandati l'azienda. */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <h3 className="font-bold text-slate-900 uppercase text-xs tracking-wider flex items-center gap-2">
          <span className="w-5 h-5 rounded-full bg-slate-900 text-white text-[10px] flex items-center justify-center">
            1
          </span>
          Documenti ricevuti
        </h3>
        {caricati ? (
          <div className="space-y-2">
            <ul className="text-xs text-slate-700 space-y-1">
              {SLOT.map((s) => (
                <li key={s.id} className="flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-slate-400" />
                  {s.label}:{' '}
                  {caricati[s.id] ? (
                    <span className="font-bold">{caricati[s.id]}</span>
                  ) : (
                    <span className="text-slate-400">
                      {(
                        s.id === 'asseverazione'
                          ? dichiarazioni.asseverazioneNonPervenuta
                          : s.id === 'pianoSviluppo'
                            ? dichiarazioni.pianoAziendaleNonPervenuto
                            : false
                      )
                        ? 'non pervenuto'
                        : 'non caricato'}
                    </span>
                  )}
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => {
                setCaricati(null);
                setPrimaLettura(null);
                setErroreLettura(null);
              }}
              className="text-[10px] font-bold uppercase text-sky-700 hover:underline"
            >
              Sostituisci i documenti
            </button>
          </div>
        ) : (
          <>
            <p className="text-[11px] text-slate-500">
              Carica i file così come li ha inviati l’azienda. Prima di chiederti qualunque scelta,
              la piattaforma li legge e ti propone strumento, data di deposito e quota degli altri
              creditori aderenti, indicando dove li ha trovati.
            </p>
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

            <button
              type="button"
              onClick={handleCaricaELeggi}
              disabled={letturaInCorso || !fileScelti.propostaCramDown}
              className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white font-bold uppercase tracking-wider rounded-lg text-xs transition-colors"
            >
              {letturaInCorso ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Upload className="w-3.5 h-3.5" />
              )}
              {letturaInCorso ? 'Caricamento e prima lettura…' : 'Carica e leggi i documenti'}
            </button>
          </>
        )}
      </div>

      {/* 2 · PRIMA LETTURA: cosa sembra aver scelto l'azienda. */}
      {caricati && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <h3 className="font-bold text-slate-900 uppercase text-xs tracking-wider flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-slate-900 text-white text-[10px] flex items-center justify-center">
              2
            </span>
            Prima lettura dei documenti
          </h3>
          {erroreLettura && (
            <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
              {erroreLettura}
            </p>
          )}
          {primaLettura ? (
            <>
              <p className="text-[11px] text-slate-500">
                Una lettura rapida e grossolana, non una valutazione: serve a orientare le scelte
                del passo successivo. Ogni dato riporta il passo e il documento da cui viene.
              </p>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(
                  [
                    [
                      'Strumento che sembra scelto',
                      primaLettura.strumento.valore
                        ? (() => {
                            const v = voceStrumento(primaLettura.strumento.valore);
                            return v
                              ? `${v.etichetta} (${v.riferimento})`
                              : primaLettura.strumento.valore;
                          })()
                        : null,
                      primaLettura.strumento,
                    ],
                    [
                      'Data di deposito',
                      primaLettura.dataDeposito.valore
                        ? primaLettura.dataDeposito.valore.split('-').reverse().join('/')
                        : null,
                      primaLettura.dataDeposito,
                    ],
                    [
                      'Quota degli altri creditori aderenti',
                      primaLettura.quotaAltriAderenti.valore !== null
                        ? `${primaLettura.quotaAltriAderenti.valore.toLocaleString('it-IT')}%`
                        : null,
                      primaLettura.quotaAltriAderenti,
                    ],
                    [
                      'Soddisfacimento offerto all’ente',
                      primaLettura.percentualeOffertaEnte.valore !== null
                        ? `${primaLettura.percentualeOffertaEnte.valore.toLocaleString('it-IT')}%`
                        : null,
                      primaLettura.percentualeOffertaEnte,
                    ],
                  ] as const
                ).map(([etichetta, valore, d]) => (
                  <div key={etichetta} className="border border-slate-200 rounded-lg p-3">
                    <dt className="text-[10px] font-bold uppercase text-slate-500">{etichetta}</dt>
                    <dd className="text-xs text-slate-900 font-bold mt-0.5">
                      {valore ?? (
                        <span className="font-normal text-slate-400">
                          non trovato nei documenti
                        </span>
                      )}
                    </dd>
                    {valore && d.passo && (
                      <dd className="text-[10px] text-slate-500 mt-1 italic">
                        «{d.passo}»{d.documento ? ` — ${d.documento}` : ''}
                      </dd>
                    )}
                  </div>
                ))}
              </dl>
              {primaLettura.note.length > 0 && (
                <ul className="text-[11px] text-amber-800 space-y-0.5">
                  {primaLettura.note.map((n, i) => (
                    <li key={i}>— {n}</li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            !erroreLettura && (
              <p className="text-[11px] text-slate-500">
                Nessuna prima lettura disponibile per questi documenti: compila le scelte a mano.
              </p>
            )
          )}
        </div>
      )}

      {/* 3 · LE TUE SCELTE: l'inquadramento, precompilato dalla prima lettura. */}
      {(caricati || analisi) && (
        <div className="space-y-2">
          <h3 className="font-bold text-slate-900 uppercase text-xs tracking-wider flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-slate-900 text-white text-[10px] flex items-center justify-center">
              3
            </span>
            Le tue scelte
          </h3>
          <InquadramentoProposta
            nomeSchema={nomeSchema}
            scenarioId={scenarioId}
            tipoSpazio={tipoSpazio}
            tipoProposta="RICEVUTA"
            versioneRighe={versioneRighe}
            suggerimento={
              primaLettura
                ? {
                    strumento: primaLettura.strumento.valore,
                    dataDeposito: primaLettura.dataDeposito.valore,
                    quotaPercento: primaLettura.quotaAltriAderenti.valore,
                  }
                : null
            }
            onStato={setInquadramentoConfermato}
          />
        </div>
      )}

      {/* 4 · VALUTAZIONE: parte solo con documenti caricati e scelte salvate. */}
      {caricati && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <h3 className="font-bold text-slate-900 uppercase text-xs tracking-wider flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-slate-900 text-white text-[10px] flex items-center justify-center">
              4
            </span>
            Valutazione della proposta
          </h3>
          {!inquadramentoConfermato && (
            <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
              La valutazione si avvia dopo aver confermato e salvato le scelte del passo 3.
            </p>
          )}
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
              Indicazioni specifiche per questa generazione. Non sostituiscono le regole del sistema
              e non vengono salvate.
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
                      <a
                        href={`/spazio/${codice}/scenari/${scenarioId}/posizione-aggiornata`}
                        className="mt-1 inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold text-[10px] uppercase rounded-lg"
                      >
                        <Upload className="w-3 h-3" /> Carica la situazione contabile (anche PDF)
                      </a>
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
            disabled={analisiInCorso || !inquadramentoConfermato || !pronta}
            className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white font-bold uppercase tracking-wider rounded-lg text-xs transition-colors"
          >
            {analisiInCorso ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            {analisiInCorso ? 'Valutazione in corso…' : 'Avvia la valutazione'}
          </button>
        </div>
      )}

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
