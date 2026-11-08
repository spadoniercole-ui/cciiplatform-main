'use client';

// L'ACQUISIZIONE DEI DOCUMENTI NELLA DEMO (0.174.3).
//
// In uno spazio demo nessun file deve partire dal computer dell'operatore:
// sarebbe un documento vero letto fuori dal contesto della simulazione. Qui
// si intercettano i campi «file» dell'area spazio — anche quelli nascosti
// dietro le etichette «Scegli file» — e si apre una schermata di acquisizione
// in cui i documenti risultano già associati.
//
// DUE CORREZIONI RISPETTO ALLA PRIMA VERSIONE:
//   1. il modale filtra per AZIENDA: mentre si carica la proposta di
//      Meccanica non compaiono il decreto di Tessitura o il dispositivo di
//      Logistica. La provenienza è il contesto della pagina (Azienda o
//      Scenario), non un elenco globale;
//   2. i documenti sono SELEZIONABILI. Il campo può dichiarare i ruoli
//      pertinenti (`data-demo-ruoli`), che partono già spuntati; gli altri
//      documenti della stessa azienda restano visibili e si possono
//      aggiungere o togliere. Il sistema non finge di sapere tutto: mostra
//      il criterio e lascia confermare.
//
// LA CONFERMA ARRIVA ALLA PAGINA. Nei campi che hanno un pulsante esplicito
// «Carica e leggi» (`data-demo-applica="file"`) i documenti scelti vengono
// preparati come File demo e applicati al campo: la pagina mostra esattamente
// quelli e si predispone alla lettura. Nei campi della Posizione Debitoria
// (`data-demo-applica="posizione"`) la conferma copia nel prospetto dello
// scenario le righe della certificazione: il caricamento finisce nella
// tabella, non solo nel modale. Negli altri campi i dati demo sono già nel
// database e la conferma resta una simulazione del gesto.
//
// La simulazione non legge file dal disco e non inventa documenti reali.

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AlertTriangle, CheckCircle2, FileSpreadsheet, FileText, Upload, X } from 'lucide-react';
import {
  PACCHETTO_DOCUMENTI_DEMO,
  documentiDemoPerAzienda,
  documentiDemoSelezionati,
  type DocumentoDemo,
} from '@/lib/demo/documenti';
import { APP_VERSION } from '@/lib/appVersion';
import { caricaPosizioneDebitoriaDemoAction } from '@/app/actions/debitiEnte';

const DemoContext = createContext(false);
const DemoAziendaContext = createContext<(azienda: string | null) => void>(() => undefined);

/** true solo dentro uno spazio con il flag demo attivo. */
export function useDemo(): boolean {
  return useContext(DemoContext);
}

/**
 * Dichiara l'azienda della pagina corrente al provider di acquisizione.
 * Va montato nei layout che conoscono l'azienda (scheda Azienda e Scenario):
 * da lì il modale sa quali documenti proporre.
 */
export function DemoAziendaScope({
  azienda,
  children,
}: {
  azienda: string;
  children: React.ReactNode;
}) {
  const impostaAzienda = useContext(DemoAziendaContext);
  useEffect(() => {
    impostaAzienda(azienda);
    return () => impostaAzienda(null);
  }, [azienda, impostaAzienda]);
  return <>{children}</>;
}

const ruoliRichiesti = (ruoli: string | null | undefined) =>
  new Set(
    (ruoli ?? '')
      .split(',')
      .map((r) => r.trim().toUpperCase())
      .filter(Boolean)
  );

export function DemoUploadProvider({
  attivo,
  children,
}: {
  attivo: boolean;
  children: React.ReactNode;
}) {
  const [azienda, setAzienda] = useState<string | null>(null);
  const [aperto, setAperto] = useState(false);
  const [accetta, setAccetta] = useState<string>('');
  const [ruoli, setRuoli] = useState<string>('');
  const [selezionati, setSelezionati] = useState<Set<string>>(new Set());
  const [fase, setFase] = useState<'documenti' | 'caricamento' | 'fatto'>('documenti');
  const [progresso, setProgresso] = useState(0);
  const [erroreAcquisizione, setErroreAcquisizione] = useState<string | null>(null);
  const [applicatiAllaPagina, setApplicatiAllaPagina] = useState(false);
  const [esitoPosizione, setEsitoPosizione] = useState<{
    righe: number;
    totale: number;
    giaPresenti: boolean;
  } | null>(null);
  const inputRif = useRef<HTMLInputElement | null>(null);

  const impostaAzienda = useCallback((valore: string | null) => setAzienda(valore), []);
  const candidati = useMemo(() => documentiDemoPerAzienda(azienda, accetta), [azienda, accetta]);
  const richiesti = useMemo(() => ruoliRichiesti(ruoli), [ruoli]);

  const apri = useCallback(
    (accept: string | null | undefined, ruoliCampo: string | null | undefined) => {
      setAccetta(accept ?? '');
      setRuoli(ruoliCampo ?? '');
      const scelti = documentiDemoSelezionati(azienda, accept, ruoliCampo);
      setSelezionati(new Set(scelti.map((d) => d.percorso)));
      setFase('documenti');
      setProgresso(0);
      setErroreAcquisizione(null);
      setApplicatiAllaPagina(false);
      setEsitoPosizione(null);
      setAperto(true);
    },
    [azienda]
  );

  useEffect(() => {
    if (!attivo) return;

    // Cattura il click PRIMA che il browser apra il selettore di file.
    // L'evento sul campo nascosto è annullabile: fermarlo qui impedisce
    // anche alla label che lo contiene di aprire la finestra di sistema.
    const sulClick = (evento: MouseEvent) => {
      const target = evento.target as HTMLElement | null;
      const input = target?.closest('input[type="file"]') as HTMLInputElement | null;
      if (!input || input.disabled) return;
      const accept = (input.accept ?? '').toLowerCase();
      // Non tutti i file sono documenti: logo, configurazioni JSON e simili
      // devono restare caricamenti reali. Si simula solo ciò che è un
      // documento dell'azienda.
      const eDocumento =
        input.dataset.demoDocumenti !== undefined || /(pdf|xbrl|xml|xls|csv|ods)/.test(accept);
      if (!eDocumento) return;
      evento.preventDefault();
      evento.stopPropagation();
      inputRif.current = input;
      apri(input.accept, input.dataset.demoRuoli);
    };

    // Anche il trascinamento è un caricamento reale: nella demo si ferma e
    // si apre la stessa schermata. Non basta limitarlo alle etichette: alcune
    // aree di drop (per esempio i bilanci XBRL) sono div liberi che
    // accetterebbero il file. I testi trascinati restano intatti.
    const sulDrop = (evento: DragEvent) => {
      if (!evento.dataTransfer?.files?.length) return;
      const target = evento.target as HTMLElement | null;
      const area = target?.closest('[data-demo-ruoli]') as HTMLElement | null;
      if (!area) return;
      const input =
        area instanceof HTMLInputElement
          ? area
          : (area.querySelector('input[type="file"]') as HTMLInputElement | null);
      evento.preventDefault();
      evento.stopPropagation();
      inputRif.current = input;
      apri(input?.accept ?? '', area.dataset.demoRuoli ?? '');
    };

    document.addEventListener('click', sulClick, true);
    document.addEventListener('drop', sulDrop, true);
    return () => {
      document.removeEventListener('click', sulClick, true);
      document.removeEventListener('drop', sulDrop, true);
    };
  }, [attivo, apri]);

  const chiudi = () => {
    if (fase === 'caricamento') return;
    setAperto(false);
  };

  /**
   * Consegna la scelta alla pagina che ha aperto il modale.
   *
   * - `file`: prepara i File demo e li applica al campo, lasciando al
   *   componente la sua normale validazione (`change` nativo);
   * - `posizione`: chiama l'azione demo che copia la certificazione nel
   *   prospetto dello scenario e sveglia la tabella con l'evento di
   *   aggiornamento;
   * - senza modalità: la conferma resta la sola simulazione del gesto.
   */
  const avviaAcquisizione = async () => {
    const scelti = candidati.filter((d) => selezionati.has(d.percorso));
    if (scelti.length === 0) return;
    const input = inputRif.current;
    const modalita = input?.dataset.demoApplica;
    const applicaAllaPagina = modalita === 'file';
    const caricaPosizione = modalita === 'posizione';
    setErroreAcquisizione(null);
    setEsitoPosizione(null);
    setProgresso(0);
    setFase('caricamento');
    const timer = setInterval(() => {
      setProgresso((valore) => Math.min(90, valore + 10));
    }, 120);
    try {
      if (caricaPosizione && input) {
        const schema = input.dataset.demoSchema;
        const aziendaId = Number(input.dataset.demoAzienda);
        const scenarioId = Number(input.dataset.demoScenario);
        if (!schema || !Number.isFinite(aziendaId) || !Number.isFinite(scenarioId)) {
          throw new Error('La pagina non ha indicato quale posizione debitoria acquisire.');
        }
        const esito = await caricaPosizioneDebitoriaDemoAction(schema, aziendaId, scenarioId);
        if (!esito.success) {
          throw new Error(esito.error || 'Non è stato possibile caricare la posizione demo.');
        }
        const righe = esito.righe ?? 0;
        const totale = esito.totale ?? 0;
        const giaPresenti = Boolean(esito.giaPresenti);
        setEsitoPosizione({ righe, totale, giaPresenti });
        window.dispatchEvent(
          new CustomEvent('assistente:dati-aggiornati', {
            detail: { righe, totale, giaPresenti },
          })
        );
      } else if (applicaAllaPagina && input) {
        const files = await Promise.all(
          scelti.map(async (d) => {
            const risposta = await fetch(d.percorso);
            if (!risposta.ok) throw new Error(`Impossibile preparare «${d.nome}».`);
            const contenuto = await risposta.blob();
            return new File([contenuto], d.nome, {
              type:
                d.formato === 'PDF'
                  ? 'application/pdf'
                  : d.formato === 'XBRL'
                    ? 'application/xml'
                    : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            });
          })
        );
        const trasferimento = new DataTransfer();
        for (const file of files) trasferimento.items.add(file);
        input.files = trasferimento.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
      await new Promise((resolve) =>
        setTimeout(resolve, caricaPosizione ? 700 : applicaAllaPagina ? 500 : 900)
      );
      setProgresso(100);
      setApplicatiAllaPagina(applicaAllaPagina);
      setFase('fatto');
    } catch (errore) {
      setErroreAcquisizione(
        (errore as Error).message ||
          'Non è stato possibile preparare i documenti demo. Riprova o apri il singolo file.'
      );
      setFase('documenti');
    } finally {
      clearInterval(timer);
    }
  };

  const alterna = (percorso: string) => {
    setSelezionati((precedenti) => {
      const prossimi = new Set(precedenti);
      if (prossimi.has(percorso)) prossimi.delete(percorso);
      else prossimi.add(percorso);
      return prossimi;
    });
  };

  const tuttiSelezionati = candidati.length > 0 && selezionati.size === candidati.length;
  const etichettaAzienda = azienda ?? 'questa azienda';

  return (
    <DemoAziendaContext.Provider value={impostaAzienda}>
      <DemoContext.Provider value={attivo}>
        {children}
        {attivo && aperto && (
          <div
            className="fixed inset-0 z-[100] bg-slate-950/45 flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-label="Acquisizione documenti demo"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) chiudi();
            }}
          >
            <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
              <div className="flex items-start gap-3 px-5 py-4 border-b border-slate-100">
                <div className="w-9 h-9 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center shrink-0">
                  <Upload className="w-4 h-4" />
                </div>
                <div className="flex-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-sky-700">
                    Ambiente demo · simulazione di acquisizione
                  </p>
                  <h2 className="text-sm font-bold text-slate-900 mt-0.5">
                    Scegli i documenti per {etichettaAzienda}
                  </h2>
                  <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                    In produzione qui si sceglierebbero file reali dal computer. Nella demo
                    l&apos;applicativo ha già associato i documenti a questa azienda: nessun file
                    viene letto dal disco. Seleziona quelli pertinenti e conferma: la scelta arriva
                    al campo della pagina o, per la posizione debitoria, direttamente alla tabella
                    del prospetto.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={chiudi}
                  disabled={fase === 'caricamento'}
                  className="p-1.5 text-slate-400 hover:text-slate-700 disabled:opacity-40"
                  aria-label="Chiudi"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="px-5 py-4 space-y-3 max-h-[55vh] overflow-y-auto">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Documenti proposti · {selezionati.size} di {candidati.length} selezionati
                  </p>
                  <div className="flex items-center gap-3">
                    {candidati.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          setSelezionati(
                            new Set(tuttiSelezionati ? [] : candidati.map((d) => d.percorso))
                          )
                        }
                        className="text-[10px] font-bold text-slate-500 hover:text-slate-800 uppercase"
                      >
                        {tuttiSelezionati ? 'Deseleziona' : 'Seleziona tutti'}
                      </button>
                    )}
                    <a
                      href={PACCHETTO_DOCUMENTI_DEMO}
                      download
                      className="text-[10px] font-bold uppercase text-sky-700 hover:underline"
                    >
                      Pacchetto completo
                    </a>
                  </div>
                </div>

                {erroreAcquisizione && (
                  <p className="flex items-start gap-2 text-[11px] text-red-800 bg-red-50 border border-red-200 rounded-lg p-2.5">
                    <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <span>{erroreAcquisizione}</span>
                  </p>
                )}

                {candidati.length === 0 ? (
                  <div className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-3 leading-relaxed">
                    <p className="font-bold">Nessun documento demo associato a questa azienda.</p>
                    <p className="mt-1">
                      Apri il caricamento dalla scheda dell&apos;azienda o dello scenario, così la
                      simulazione sa quale documentazione proporre.
                    </p>
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {candidati.map((d) => {
                      const scelto = selezionati.has(d.percorso);
                      const consigliato = richiesti.has(d.ruolo) || richiesti.size === 0;
                      return (
                        <li key={d.percorso}>
                          <label
                            className={`flex items-center gap-3 border rounded-xl px-3 py-2.5 cursor-pointer transition-colors ${
                              scelto
                                ? 'border-sky-300 bg-sky-50/60'
                                : 'border-slate-200 bg-slate-50/40 hover:border-slate-300'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={scelto}
                              onChange={() => alterna(d.percorso)}
                              disabled={fase === 'caricamento'}
                              className="w-4 h-4 accent-sky-700 shrink-0"
                            />
                            <span className="w-8 h-8 rounded-lg bg-white border border-slate-200 text-sky-700 flex items-center justify-center shrink-0">
                              {d.formato === 'EXCEL' ? (
                                <FileSpreadsheet className="w-4 h-4" />
                              ) : (
                                <FileText className="w-4 h-4" />
                              )}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-xs font-bold text-slate-800 truncate">
                                {d.nome}
                              </span>
                              <span className="block text-[10px] text-slate-500 truncate">
                                {d.azienda} · {d.descrizione}
                              </span>
                            </span>
                            <span className="flex flex-col items-end gap-1 shrink-0">
                              <span
                                className={`text-[9px] font-bold uppercase border rounded px-1.5 py-0.5 ${
                                  consigliato
                                    ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                                    : 'text-slate-500 bg-white border-slate-200'
                                }`}
                              >
                                {consigliato ? 'consigliato' : d.ruolo.toLowerCase()}
                              </span>
                              <a
                                href={d.percorso}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[10px] font-bold text-sky-700 hover:underline"
                                onClick={(e) => e.stopPropagation()}
                              >
                                Apri
                              </a>
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}

                {fase === 'caricamento' && (
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center justify-between text-[10px] font-bold text-slate-600">
                      <span>Acquisizione e lettura dei documenti demo…</span>
                      <span>{progresso}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
                      <div
                        className="h-full bg-sky-600 transition-all duration-150"
                        style={{ width: `${progresso}%` }}
                      />
                    </div>
                  </div>
                )}

                {fase === 'fatto' && (
                  <p className="flex items-start gap-2 text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg p-2.5">
                    <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <span>
                      {esitoPosizione
                        ? esitoPosizione.giaPresenti
                          ? `La posizione dello scenario conteneva già ${esitoPosizione.righe} ${esitoPosizione.righe === 1 ? 'riga' : 'righe'}: non è stato aggiunto nessun duplicato. Chiudi e controlla la tabella.`
                          : `Certificazione demo acquisita: ${esitoPosizione.righe} ${esitoPosizione.righe === 1 ? 'riga' : 'righe'} e € ${esitoPosizione.totale.toLocaleString('it-IT')} sono ora nella Posizione debitoria dello scenario. Chiudi: la tabella è già aggiornata.`
                        : applicatiAllaPagina
                          ? `${selezionati.size} ${selezionati.size === 1 ? 'documento applicato' : 'documenti applicati'} al campo della pagina. Chiudi e prosegui con «Carica e leggi»: i file sono quelli che hai scelto.`
                          : `${selezionati.size} ${selezionati.size === 1 ? 'documento acquisito' : 'documenti acquisiti'} nella simulazione. I dati sono già presenti nel percorso demo: puoi chiudere e continuare a leggere screening, indici e scenario.`}
                    </span>
                  </p>
                )}

                <p className="flex items-start gap-2 text-[10px] text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-600" />
                  <span>
                    I file sono fittizi, riportano la filigrana DEMO e non hanno valore legale. La
                    schermata serve a mostrare il gesto di acquisizione, non a importare documenti
                    veri.
                  </span>
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-100 bg-slate-50">
                <span className="mr-auto text-[9px] font-bold uppercase tracking-wider text-slate-400">
                  Demo {APP_VERSION} · solo documenti dell&apos;azienda corrente
                </span>
                {fase === 'documenti' && (
                  <>
                    <button
                      type="button"
                      onClick={chiudi}
                      className="px-3 py-2 text-[10px] font-bold uppercase text-slate-500 hover:text-slate-700"
                    >
                      Annulla
                    </button>
                    <button
                      type="button"
                      disabled={selezionati.size === 0}
                      onClick={() => void avviaAcquisizione()}
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white font-bold text-[10px] uppercase rounded-lg"
                    >
                      <Upload className="w-3.5 h-3.5" /> Avvia acquisizione demo ({selezionati.size}
                      )
                    </button>
                  </>
                )}
                {fase === 'caricamento' && (
                  <span className="text-[10px] font-bold uppercase text-slate-500">
                    Acquisizione in corso…
                  </span>
                )}
                {fase === 'fatto' && (
                  <button
                    type="button"
                    onClick={chiudi}
                    className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-[10px] uppercase rounded-lg"
                  >
                    Chiudi e continua
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </DemoContext.Provider>
    </DemoAziendaContext.Provider>
  );
}

/** Tipo esportato per i punti che vogliono mostrare un documento demo nella pagina. */
export type { DocumentoDemo };
