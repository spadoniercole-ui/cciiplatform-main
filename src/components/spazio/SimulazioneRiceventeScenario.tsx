'use client';

// ISTRUTTORIA DELLA PROPOSTA RICEVUTA — una sola pagina, tre fasi.
//
//   1. Ricezione: un unico caricamento di tutto ciò che l'azienda ha mandato
//      (proposta, attestazione, piano, situazione contabile, lettere). La
//      prima lettura classifica i documenti e propone strumento, data, quota
//      degli altri aderenti e offerta all'ente, citando il passo; dalla
//      situazione contabile ricava i valori della Posizione Aggiornata.
//   2. Conferme: inquadramento, posizione aggiornata, posizione dell'ente
//      (quella dello screening), documenti non pervenuti. Tutto arriva
//      precompilato: l'istruttore conferma o corregge. I dati ISTAT di
//      settore si aggiornano da soli.
//   3. Valutazione: un clic, risultati a video. Nessuna stampa qui: il
//      documento è uno, la Relazione di chiusura.
//
// Prima erano sette passi in pagine diverse, ognuno con il suo caricamento:
// lo stesso dato chiesto più volte e un giro dalla sidebar per ogni passo.

import React, { useEffect, useRef, useState } from 'react';
import {
  Upload,
  FileText,
  X,
  AlertTriangle,
  Sparkles,
  RefreshCw,
  CheckCircle2,
  Circle,
  Info,
} from 'lucide-react';
import {
  aggiornaTipoDocumentoRiceventeAction,
  analizzaDocumentiRiceventeAction,
  caricaDocumentiRiceventeAction,
  ottieniAnalisiRiceventeAction,
  ottieniDocumentiRiceventeAction,
  type DocumentoPdf,
} from '@/app/actions/simulazioneRicevente';
import { InquadramentoProposta } from '@/components/spazio/InquadramentoProposta';
import {
  ETICHETTA_TIPO_DOCUMENTO,
  type PrimaLettura,
  type TipoDocumentoRicevuto,
} from '@/lib/proposta/primaLettura';
import { voceStrumento } from '@/lib/proposta/inquadramento';
import {
  calcolaGiudizioFinaleRicevente,
  type GiudizioFinaleRicevente,
} from '@/app/actions/giudizioRicevente';
import {
  ottieniStatoValutazioneAction,
  salvaDichiarazioniValutazioneAction,
  type StatoValutazione,
  type DichiarazioniValutazione,
} from '@/app/actions/valutazioneRicevente';
import {
  aggiornaDatiSettoreAction,
  aggiornaDatiSettoreSeNecessarioAction,
} from '@/app/actions/datiSettore';
import { valutaListaControllo, type StatoDocumento } from '@/lib/valutazione/listaControllo';
import { salvaPosizioneAggiornataAction } from '@/app/actions/posizioneAggiornata';
import type { LetturaPosizionePdf } from '@/lib/posizioneAggiornata/letturaPdf';
import { CAMPI_POSIZIONE } from '@/lib/posizioneAggiornata/schemaCampi';
import { ottieniDebitiVera } from '@/app/actions/posizioneVera';
import { generaConfrontoLiquidatorioSeNecessarioAction } from '@/app/actions/confrontoLiquidatorio';

interface Props {
  nomeSchema: string;
  scenarioId: number;
  codice: string;
  aziendaId: number;
  tipoSpazio: 'ENTE' | 'NON_ENTE';
  /** Versione delle righe della proposta (per l'inquadramento). */
  versioneRighe: number;
  /** Il genitore aggiorna i pannelli che dipendono dalla valutazione. */
  onAnalisiCompletata?: () => void;
}

type Documento = { nome: string; tipo: TipoDocumentoRicevuto };

const euro = (n: number) => `€ ${Math.round(n).toLocaleString('it-IT')}`;

function TitoloFase({ numero, testo }: { numero: number; testo: string }) {
  return (
    <h3 className="font-bold text-slate-900 uppercase text-xs tracking-wider flex items-center gap-2">
      <span className="w-5 h-5 rounded-full bg-slate-900 text-white text-[10px] flex items-center justify-center">
        {numero}
      </span>
      {testo}
    </h3>
  );
}

export function SimulazioneRiceventeScenario({
  nomeSchema,
  scenarioId,
  codice,
  aziendaId,
  tipoSpazio,
  versioneRighe,
  onAnalisiCompletata,
}: Props) {
  const [fileScelti, setFileScelti] = useState<File[]>([]);
  const [documenti, setDocumenti] = useState<Documento[] | null>(null);
  const [primaLettura, setPrimaLettura] = useState<PrimaLettura | null>(null);
  const [posizioneLetta, setPosizioneLetta] = useState<LetturaPosizionePdf | null>(null);
  const [dataPosizione, setDataPosizione] = useState('');
  const [salvataggioPosizione, setSalvataggioPosizione] = useState(false);
  const [erroreLettura, setErroreLettura] = useState<string | null>(null);
  const [letturaInCorso, setLetturaInCorso] = useState(false);
  const [inquadramentoConfermato, setInquadramentoConfermato] = useState(false);
  const [debitoEnte, setDebitoEnte] = useState<{ totale: number; righe: number } | null>(null);

  const [analisi, setAnalisi] = useState<string | null>(null);
  const [nomiFileAnalizzati, setNomiFileAnalizzati] = useState<string[]>([]);
  const [documentiMancanti, setDocumentiMancanti] = useState<string[]>([]);
  const [generataIl, setGenerataIl] = useState<string | null>(null);
  const [troncata, setTroncata] = useState(false);
  const [giudizio, setGiudizio] = useState<GiudizioFinaleRicevente | null>(null);
  const [caricamento, setCaricamento] = useState(true);
  const [analisiInCorso, setAnalisiInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [istruzioniAI, setIstruzioniAI] = useState('');
  const [stato, setStato] = useState<StatoValutazione | null>(null);
  const [dichiarazioni, setDichiarazioni] = useState<DichiarazioniValutazione>({});
  const [settoreInCorso, setSettoreInCorso] = useState(false);
  const settoreAvviato = useRef(false);

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
    const [analisiRis, giudizioRis, docRis, veraRis] = await Promise.all([
      ottieniAnalisiRiceventeAction(nomeSchema, scenarioId),
      calcolaGiudizioFinaleRicevente(nomeSchema, scenarioId),
      ottieniDocumentiRiceventeAction(nomeSchema, scenarioId),
      ottieniDebitiVera(nomeSchema, aziendaId),
    ]);
    if (docRis.success) {
      setDocumenti(docRis.documenti ?? null);
      setPrimaLettura(docRis.primaLettura ?? null);
      setPosizioneLetta(docRis.posizioneLetta ?? null);
      setDataPosizione(docRis.posizioneLetta?.dataRiferimento ?? '');
    }
    if (veraRis.success && veraRis.righe.length > 0) {
      const valide = veraRis.righe.filter(
        (r) => r.trattamento === 'contabilizzato' || r.trattamento === 'da_contabilizzare'
      );
      setDebitoEnte({ totale: valide.reduce((a, r) => a + r.importo, 0), righe: valide.length });
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

  // Dati ISTAT di settore: si aggiornano da soli quando servono (cache di
  // 24 ore), non sono un compito dell'istruttore.
  useEffect(() => {
    if (!documenti || settoreAvviato.current) return;
    settoreAvviato.current = true;
    void aggiornaDatiSettoreSeNecessarioAction(nomeSchema, aziendaId).then(() => caricaStato());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documenti]);

  const handleScegli = (lista: FileList | null) => {
    setErrore(null);
    if (!lista) return;
    const nuovi: File[] = [];
    for (const f of Array.from(lista)) {
      if (f.type !== 'application/pdf' && !f.name.toLowerCase().endsWith('.pdf')) {
        setErrore(
          `«${f.name}» non è un PDF: per ora si caricano documenti PDF (il piano in Excel si importa nel Piano di sviluppo).`
        );
        continue;
      }
      if (f.size > 20 * 1024 * 1024) {
        setErrore(`«${f.name}» supera i 20 MB consentiti.`);
        continue;
      }
      nuovi.push(f);
    }
    setFileScelti((prev) => {
      const nomi = new Set(prev.map((f) => f.name));
      return [...prev, ...nuovi.filter((f) => !nomi.has(f.name))];
    });
  };

  /** Fase 1: carica tutto ciò che è arrivato e ne fa la prima lettura. */
  const handleCaricaELeggi = async () => {
    if (fileScelti.length === 0) return;
    setLetturaInCorso(true);
    setErrore(null);
    setErroreLettura(null);
    try {
      const caricati: DocumentoPdf[] = [];
      for (const file of fileScelti) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('codice', codice);
        const rispostaUpload = await fetch('/api/blob-upload', { method: 'POST', body: formData });
        const corpoUpload = await rispostaUpload.json();
        if (!rispostaUpload.ok || corpoUpload.error) {
          setErrore(corpoUpload.error || `Impossibile caricare «${file.name}».`);
          return;
        }
        caricati.push({ nome: file.name, url: corpoUpload.url });
      }
      const r = await caricaDocumentiRiceventeAction(nomeSchema, scenarioId, caricati);
      if (!r.success) {
        setErrore(r.error || 'Caricamento non riuscito.');
        return;
      }
      setDocumenti(r.documenti ?? null);
      setPrimaLettura(r.primaLettura ?? null);
      setPosizioneLetta(r.posizioneLetta ?? null);
      setDataPosizione(r.posizioneLetta?.dataRiferimento ?? '');
      setErroreLettura(r.erroreLettura ?? null);
      setFileScelti([]);
    } catch (error: unknown) {
      setErrore((error as Error).message || 'Errore durante il caricamento dei documenti.');
    } finally {
      setLetturaInCorso(false);
    }
  };

  const cambiaTipo = async (nome: string, tipo: TipoDocumentoRicevuto) => {
    const r = await aggiornaTipoDocumentoRiceventeAction(nomeSchema, scenarioId, nome, tipo);
    if (r.success && r.documenti) setDocumenti(r.documenti);
    else setErrore(r.error || 'Impossibile aggiornare il tipo del documento.');
  };

  const confermaPosizione = async () => {
    if (!posizioneLetta) return;
    setSalvataggioPosizione(true);
    const r = await salvaPosizioneAggiornataAction(
      nomeSchema,
      scenarioId,
      dataPosizione || null,
      false,
      posizioneLetta.dati,
      null,
      { origine: 'documento', documentoId: null }
    );
    setSalvataggioPosizione(false);
    if (!r.success) {
      setErrore(r.error || 'Impossibile salvare la posizione aggiornata.');
      return;
    }
    await caricaStato();
  };

  /** Fase 3: la valutazione, sui documenti già caricati e con le conferme fatte. */
  const handleAnalizza = async () => {
    if (!documenti) {
      setErrore('Carica prima i documenti ricevuti.');
      return;
    }
    if (!inquadramentoConfermato) {
      setErrore('Conferma e salva prima l’inquadramento della proposta.');
      return;
    }
    if (lista && !lista.pronta) {
      setErrore(`Prima di avviare la valutazione: ${lista.mancanti.join('; ')}.`);
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
        setDocumenti(null);
        const giudizioRis = await calcolaGiudizioFinaleRicevente(nomeSchema, scenarioId);
        if (giudizioRis.success && giudizioRis.giudizio) setGiudizio(giudizioRis.giudizio);
        // Il confronto con la liquidazione serve alla Relazione: si prepara
        // ora, in sottofondo (prima lo faceva il Brogliaccio).
        void generaConfrontoLiquidatorioSeNecessarioAction(nomeSchema, scenarioId, aziendaId);
        onAnalisiCompletata?.();
        setTimeout(
          () =>
            document
              .getElementById('esito-valutazione')
              ?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
          200
        );
      } else {
        setErrore(risultato.error || "Impossibile completare l'analisi.");
      }
    } catch (error: unknown) {
      setErrore((error as Error).message || 'Errore durante la valutazione.');
    } finally {
      setAnalisiInCorso(false);
    }
  };

  const presente = (tipo: TipoDocumentoRicevuto) =>
    Boolean(documenti?.some((d) => d.tipo === tipo));
  const statoDoc = (
    tipo: TipoDocumentoRicevuto,
    dichiarato: boolean | undefined
  ): StatoDocumento =>
    presente(tipo) ? 'caricato' : dichiarato ? 'assente_dichiarato' : 'mancante';

  const lista = stato
    ? valutaListaControllo({
        propostaSelezionata: presente('PROPOSTA'),
        asseverazione: statoDoc('ATTESTAZIONE', dichiarazioni.asseverazioneNonPervenuta),
        pianoAziendale: statoDoc('PIANO', dichiarazioni.pianoAziendaleNonPervenuto),
        posizioniAggiornate: stato.posizioniAggiornate,
        posizioneNonPervenutaDichiarata: Boolean(dichiarazioni.posizioneNonPervenuta),
        settore: stato.settore,
        pianoSviluppoAttivo: stato.pianoSviluppoAttivo,
        oggi: new Date().toISOString(),
      })
    : null;
  const pronta = Boolean(lista?.pronta);

  // Rientro da un passo aperto da qui (es. Posizione Aggiornata): si torna
  // alla valutazione, non in cima alla scheda.
  useEffect(() => {
    if (caricamento || typeof window === 'undefined') return;
    if (window.location.hash !== '#valutazione') return;
    const t = setTimeout(
      () =>
        document
          .getElementById('valutazione')
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      150
    );
    return () => clearTimeout(t);
  }, [caricamento]);

  if (caricamento) return <p className="text-xs text-slate-400">Caricamento...</p>;

  const fase2Visibile = Boolean(documenti) || Boolean(analisi);
  const urlPosizione = `/spazio/${codice}/scenari/${scenarioId}/posizione-aggiornata?ritorno=valutazione`;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
          Istruttoria della proposta
        </h2>
        <p className="text-[11px] text-slate-500 mt-1">
          Tre fasi su questa pagina: carichi tutto ciò che l’azienda ha mandato; confermi ciò che la
          piattaforma ha letto; avvii la valutazione. I documenti restano disponibili fino alla
          valutazione, poi vengono eliminati: resta il risultato. Il documento da consegnare è uno,
          la Relazione di chiusura in fondo alla pagina.
        </p>
      </div>

      {errore && (
        <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <p>{errore}</p>
        </div>
      )}

      {/* ---------------- 1 · RICEZIONE ---------------- */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <TitoloFase numero={1} testo="Documenti ricevuti" />
        {documenti ? (
          <div className="space-y-3">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-[10px] uppercase text-slate-500 font-bold border-b border-slate-100">
                  <th className="py-1.5">Documento</th>
                  <th className="py-1.5">Riconosciuto come</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {documenti.map((d) => (
                  <tr key={d.nome}>
                    <td className="py-1.5 text-slate-800">
                      <FileText className="w-3.5 h-3.5 text-slate-400 inline mr-1" />
                      {d.nome}
                    </td>
                    <td className="py-1.5">
                      <select
                        value={d.tipo}
                        onChange={(e) =>
                          cambiaTipo(d.nome, e.target.value as TipoDocumentoRicevuto)
                        }
                        className="p-1 text-xs border border-slate-200 rounded bg-white text-slate-900"
                      >
                        {(Object.keys(ETICHETTA_TIPO_DOCUMENTO) as TipoDocumentoRicevuto[]).map(
                          (t) => (
                            <option key={t} value={t}>
                              {ETICHETTA_TIPO_DOCUMENTO[t]}
                            </option>
                          )
                        )}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button
              type="button"
              onClick={() => {
                setDocumenti(null);
                setPrimaLettura(null);
                setPosizioneLetta(null);
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
              Carica insieme tutti i file ricevuti, così come li ha inviati l’azienda: proposta,
              attestazione, piano, situazione contabile, lettere. La piattaforma riconosce che cos’è
              ciascuno, propone strumento, data e quota degli altri aderenti e legge i valori della
              situazione contabile.
            </p>
            <label className="flex flex-col items-center justify-center gap-1 border-2 border-dashed border-slate-300 hover:border-sky-400 rounded-xl p-6 cursor-pointer text-xs text-slate-600">
              <Upload className="w-5 h-5 text-slate-400" />
              Scegli i documenti (PDF, anche più di uno)
              <input
                type="file"
                multiple
                accept="application/pdf,.pdf"
                className="hidden"
                onChange={(e) => {
                  handleScegli(e.target.files);
                  e.target.value = '';
                }}
              />
            </label>
            {fileScelti.length > 0 && (
              <ul className="text-xs text-slate-700 space-y-1">
                {fileScelti.map((f) => (
                  <li key={f.name} className="flex items-center justify-between">
                    <span>
                      <FileText className="w-3.5 h-3.5 text-slate-400 inline mr-1" />
                      {f.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => setFileScelti((p) => p.filter((x) => x.name !== f.name))}
                      className="text-slate-400 hover:text-red-600"
                      title="Togli"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              onClick={handleCaricaELeggi}
              disabled={letturaInCorso || fileScelti.length === 0}
              className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white font-bold uppercase tracking-wider rounded-lg text-xs transition-colors"
            >
              {letturaInCorso ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Upload className="w-3.5 h-3.5" />
              )}
              {letturaInCorso
                ? 'Caricamento e prima lettura… (fino a due minuti)'
                : 'Carica e leggi i documenti'}
            </button>
          </>
        )}

        {documenti && erroreLettura && (
          <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
            {erroreLettura}
          </p>
        )}
        {documenti && primaLettura && (
          <div className="space-y-2 border-t border-slate-100 pt-3">
            <p className="text-[10px] font-bold uppercase text-slate-500">
              Prima lettura — una lettura rapida, non una valutazione
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
                      <span className="font-normal text-slate-400">non trovato nei documenti</span>
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
          </div>
        )}
      </div>

      {/* ---------------- 2 · CONFERME ---------------- */}
      {fase2Visibile && (
        <div className="space-y-4">
          <TitoloFase numero={2} testo="Conferma ciò che è stato letto" />
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

          {documenti && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Posizione aggiornata dalla situazione contabile ricevuta */}
              <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
                <h4 className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">
                  Posizione contabile aggiornata
                </h4>
                {stato && stato.posizioniAggiornate > 0 ? (
                  <p className="text-xs text-emerald-800 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" /> Posizione aggiornata salvata.{' '}
                    <a href={urlPosizione} className="text-sky-700 font-bold hover:underline">
                      Rivedi
                    </a>
                  </p>
                ) : posizioneLetta ? (
                  <>
                    <p className="text-[11px] text-slate-500">
                      Letta dalla situazione contabile ricevuta: {posizioneLetta.trovati.length}{' '}
                      valori. Controlla e conferma.
                    </p>
                    <label className="block text-[10px] text-slate-500">
                      Data di riferimento{' '}
                      <input
                        type="date"
                        value={dataPosizione}
                        onChange={(e) => setDataPosizione(e.target.value)}
                        className="ml-1 p-1 text-xs border border-slate-200 rounded text-slate-900"
                      />
                    </label>
                    <table className="w-full text-xs">
                      <tbody className="divide-y divide-slate-100">
                        {CAMPI_POSIZIONE.filter((c) =>
                          posizioneLetta.trovati.includes(c.chiave)
                        ).map((c) => (
                          <tr key={c.chiave}>
                            <td className="py-1 text-slate-600">{c.etichetta}</td>
                            <td className="py-1 text-right tabular-nums text-slate-900">
                              {euro(posizioneLetta.dati[c.chiave])}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {posizioneLetta.note.length > 0 && (
                      <p className="text-[10px] text-amber-800">
                        {posizioneLetta.note.join(' — ')}
                      </p>
                    )}
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={confermaPosizione}
                        disabled={salvataggioPosizione}
                        className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white font-bold text-[10px] uppercase rounded-lg"
                      >
                        {salvataggioPosizione ? 'Salvataggio…' : 'Conferma'}
                      </button>
                      <a
                        href={urlPosizione}
                        className="text-[10px] text-sky-700 font-bold hover:underline"
                      >
                        Correggi nel prospetto completo
                      </a>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-[11px] text-slate-500">
                      {presente('SITUAZIONE_CONTABILE')
                        ? `La situazione contabile «${documenti.find((d) => d.tipo === 'SITUAZIONE_CONTABILE')?.nome}» non è stata letta in automatico: portala nel prospetto con «Leggi situazione contabile (PDF)».`
                        : 'Nessuna situazione contabile fra i documenti ricevuti.'}
                    </p>
                    <label className="flex items-center gap-1.5 text-[11px] text-slate-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(dichiarazioni.posizioneNonPervenuta)}
                        onChange={(e) =>
                          cambiaDichiarazione('posizioneNonPervenuta', e.target.checked)
                        }
                      />
                      Non pervenuta: si valuta sui dati del bilancio
                    </label>
                    <a
                      href={urlPosizione}
                      className="text-[10px] text-sky-700 font-bold hover:underline"
                    >
                      Oppure caricala a parte (Excel o PDF)
                    </a>
                  </>
                )}
              </div>

              {/* Posizione dell'ente: quella dello screening, non si ricarica */}
              <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
                <h4 className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">
                  Posizione debitoria verso l’ente
                </h4>
                {debitoEnte ? (
                  <p className="text-xs text-slate-800">
                    Dal V.E.R.A. dello screening:{' '}
                    <span className="font-bold">{euro(debitoEnte.totale)}</span> ({debitoEnte.righe}{' '}
                    partite contabilizzate o da contabilizzare). Non serve ricaricarla.
                  </p>
                ) : (
                  <p className="text-xs text-slate-500">
                    Nessun V.E.R.A. caricato per questa azienda.
                  </p>
                )}
                <a
                  href={`/spazio/${codice}/aziende/${aziendaId}/posizione-ente`}
                  className="text-[10px] text-sky-700 font-bold hover:underline"
                >
                  Aggiorna solo se hai un file più recente
                </a>

                <h4 className="text-[10px] font-bold uppercase text-slate-500 tracking-wider pt-2">
                  Documenti non pervenuti
                </h4>
                {(
                  [
                    ['ATTESTAZIONE', 'asseverazioneNonPervenuta', 'Attestazione / asseverazione'],
                    ['PIANO', 'pianoAziendaleNonPervenuto', 'Piano'],
                  ] as const
                ).map(([tipo, chiave, etichetta]) =>
                  presente(tipo) ? (
                    <p
                      key={tipo}
                      className="text-[11px] text-emerald-800 flex items-center gap-1.5"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" /> {etichetta}: ricevuto
                    </p>
                  ) : (
                    <label
                      key={tipo}
                      className="flex items-center gap-1.5 text-[11px] text-slate-600 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={Boolean(dichiarazioni[chiave])}
                        onChange={(e) => cambiaDichiarazione(chiave, e.target.checked)}
                      />
                      {etichetta}: non pervenuto (pesa sul giudizio)
                    </label>
                  )
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ---------------- 3 · VALUTAZIONE ---------------- */}
      {documenti && (
        <div
          id="valutazione"
          className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 scroll-mt-4"
        >
          <TitoloFase numero={3} testo="Valutazione della proposta" />
          {lista && (
            <ul className="space-y-1.5">
              {lista.voci.map((v) => (
                <li key={v.id} className="flex items-start gap-2 text-xs">
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
                    {v.id === 'settore' && !v.ok && stato?.settore.applicabile && (
                      <button
                        type="button"
                        onClick={handleAggiornaSettore}
                        disabled={settoreInCorso}
                        className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold text-[10px] uppercase rounded"
                      >
                        <RefreshCw className={`w-3 h-3 ${settoreInCorso ? 'animate-spin' : ''}`} />
                        {settoreInCorso ? 'Aggiornamento ISTAT…' : 'Riprova'}
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {!inquadramentoConfermato && (
            <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
              La valutazione si avvia dopo aver confermato e salvato l’inquadramento (fase 2).
            </p>
          )}
          <details>
            <summary className="text-[10px] font-bold uppercase text-slate-500 cursor-pointer">
              Istruzioni per l’AI (facoltative)
            </summary>
            <textarea
              value={istruzioniAI}
              onChange={(e) => setIstruzioniAI(e.target.value)}
              rows={2}
              placeholder="Es. verifica in particolare la sostenibilità del piano rispetto ai dati di settore…"
              className="mt-1 w-full p-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 outline-none focus:border-blue-500"
            />
          </details>
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
            {analisiInCorso
              ? 'Valutazione in corso… (fino a quattro minuti)'
              : 'Avvia la valutazione'}
          </button>
        </div>
      )}

      {/* Esito, a video */}
      {(giudizio || analisi) && (
        <div id="esito-valutazione" className="space-y-4 scroll-mt-4">
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
                Esito della valutazione
              </span>
              <span className="text-sm font-bold text-slate-900 block">{giudizio.etichetta}</span>
              <p className="text-[11px] text-slate-600 mt-1">{giudizio.motivazione}</p>
            </div>
          )}
          {analisi && (
            <details className="bg-white border border-slate-200 rounded-xl p-5" open={!giudizio}>
              <summary className="font-bold text-slate-900 uppercase text-xs tracking-wider cursor-pointer">
                Lettura critica dei documenti
                {generataIl && (
                  <span className="ml-2 text-[10px] font-normal normal-case text-slate-400">
                    del {new Date(generataIl).toLocaleString('it-IT')}
                  </span>
                )}
              </summary>
              {nomiFileAnalizzati.length > 0 && (
                <p className="text-[10px] text-slate-400 mt-2">
                  Basata su: {nomiFileAnalizzati.join(', ')}
                </p>
              )}
              {troncata && (
                <p className="text-[11px] text-amber-700 mt-2">
                  Il testo si interrompe prima della fine (limite di lunghezza); l’esito resta
                  affidabile, calcolato sui dati estratti.
                </p>
              )}
              {documentiMancanti.length > 0 && (
                <p className="flex items-center gap-1.5 text-[11px] text-amber-700 mt-2">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  Mancano: {documentiMancanti.join(', ')} — l’esito ne tiene conto.
                </p>
              )}
              <div className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed mt-3">
                {analisi}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
