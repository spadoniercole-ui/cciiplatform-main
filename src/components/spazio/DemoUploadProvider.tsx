'use client';

// L'ACQUISIZIONE DEI DOCUMENTI NELLA DEMO (0.174.0).
//
// In uno spazio demo nessun file deve partire dal computer dell'operatore:
// sarebbe un documento vero letto fuori dal contesto della simulazione. Qui
// si intercettano tutti i campi «file» dell'area spazio — anche quelli
// nascosti dietro le etichette «Scegli file» — e si apre una schermata di
// acquisizione in cui i documenti risultano già selezionati dall'applicativo.
//
// Il vantaggio di un unico punto è che vale per TUTTI i caricamenti del
// percorso: screening, XBRL, posizione aggiornata, provvedimento, proposta,
// certificazione dei debiti, check list. Non c'è un componente da ricordarsi
// di proteggere quando se ne aggiunge uno nuovo.
//
// La simulazione non scrive nulla: i dati demo sono già nel database. Mostra
// il gesto che in produzione sarebbe reale, con i file demo pronti da aprire.

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileSpreadsheet, FileText, Upload, X } from 'lucide-react';
import {
  PACCHETTO_DOCUMENTI_DEMO,
  documentiDemoPerAccettazione,
  type DocumentoDemo,
} from '@/lib/demo/documenti';

const DemoContext = createContext(false);

/** true solo dentro uno spazio con il flag demo attivo. */
export function useDemo(): boolean {
  return useContext(DemoContext);
}

export function DemoUploadProvider({
  attivo,
  children,
}: {
  attivo: boolean;
  children: React.ReactNode;
}) {
  const [aperto, setAperto] = useState(false);
  const [accetta, setAccetta] = useState<string>('');
  const [fase, setFase] = useState<'documenti' | 'caricamento' | 'fatto'>('documenti');
  const [progresso, setProgresso] = useState(0);

  const documenti = useMemo(() => documentiDemoPerAccettazione(accetta), [accetta]);

  const apri = useCallback((accept: string | null | undefined) => {
    setAccetta(accept ?? '');
    setFase('documenti');
    setProgresso(0);
    setAperto(true);
  }, []);

  useEffect(() => {
    if (!attivo) return;

    // Cattura il click PRIMA che il browser apra il selettore di file.
    // L'evento sul campo nascosto è annullabile: fermarlo qui impedisce
    // anche alla label che lo contiene di aprire la finestra di sistema.
    const sulClick = (evento: MouseEvent) => {
      const target = evento.target as HTMLElement | null;
      const input = target?.closest('input[type="file"]') as HTMLInputElement | null;
      if (!input || input.disabled) return;
      evento.preventDefault();
      evento.stopPropagation();
      apri(input.accept);
    };

    // Anche il trascinamento è un caricamento reale: nella demo si ferma e
    // si apre la stessa schermata. Non basta limitarlo alle etichette: alcune
    // aree di drop (per esempio i bilanci XBRL) sono div liberi che
    // accetterebbero il file. I testi trascinati restano intatti.
    const sulDrop = (evento: DragEvent) => {
      if (!evento.dataTransfer?.files?.length) return;
      evento.preventDefault();
      evento.stopPropagation();
      apri('');
    };

    document.addEventListener('click', sulClick, true);
    document.addEventListener('drop', sulDrop, true);
    return () => {
      document.removeEventListener('click', sulClick, true);
      document.removeEventListener('drop', sulDrop, true);
    };
  }, [attivo, apri]);

  useEffect(() => {
    if (fase !== 'caricamento') return;
    const timer = setInterval(() => {
      setProgresso((valore) => {
        const prossimo = Math.min(100, valore + 10);
        if (prossimo >= 100) {
          clearInterval(timer);
          setFase('fatto');
        }
        return prossimo;
      });
    }, 180);
    return () => clearInterval(timer);
  }, [fase]);

  const chiudi = () => {
    if (fase === 'caricamento') return;
    setAperto(false);
  };

  return (
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
                  I documenti sono già stati selezionati
                </h2>
                <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                  In produzione qui si sceglierebbero file reali dal computer. Nella demo
                  l&apos;applicativo ha già associato i documenti all&apos;azienda: nessun file
                  viene letto dal tuo disco e nulla viene caricato fuori contesto.
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
                  Documenti demo associati
                </p>
                <a
                  href={PACCHETTO_DOCUMENTI_DEMO}
                  download
                  className="text-[10px] font-bold uppercase text-sky-700 hover:underline"
                >
                  Scarica tutti (ZIP)
                </a>
              </div>

              <ul className="space-y-2">
                {documenti.map((d) => (
                  <li
                    key={d.percorso}
                    className="flex items-center gap-3 border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50/60"
                  >
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
                      <span className="text-[9px] font-bold uppercase text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5">
                        già selezionato
                      </span>
                      <a
                        href={d.percorso}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10px] font-bold text-sky-700 hover:underline"
                      >
                        Apri
                      </a>
                    </span>
                  </li>
                ))}
              </ul>

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
                    Documenti acquisiti nella simulazione. I dati sono già presenti nel percorso
                    demo: puoi chiudere e continuare a leggere screening, indici e scenario.
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
                    onClick={() => {
                      setProgresso(0);
                      setFase('caricamento');
                    }}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-[10px] uppercase rounded-lg"
                  >
                    <Upload className="w-3.5 h-3.5" /> Avvia acquisizione demo
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
  );
}

/** Tipo esportato per i punti che vogliono mostrare un documento demo nella pagina. */
export type { DocumentoDemo };
