'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, RefreshCw, Upload, FileText, AlertTriangle, Printer } from 'lucide-react';
import {
  ottieniScreeningAzienda,
  generaScreeningAziendaAction,
  type StatoScreeningAzienda,
} from '@/app/actions/screeningAzienda';
import { generaPreCompilazioneMinisterialeAction } from '@/app/actions/checklistMinisterialeAzienda';
import {
  ottieniStoricoXbrlAzienda,
  salvaAnalisiXbrlAziendaAction,
} from '@/app/actions/xbrlAzienda';
import type { AnalisiXbrlResult } from '@/lib/xbrl/types';
import { stampaTesto } from '@/lib/stampaTesto';

interface Props {
  nomeSchema: string;
  aziendaId: number;
  codice: string;
  tipoSpazio: 'ENTE' | 'NON_ENTE';
}

export function ScreeningAziendaScenario({ nomeSchema, aziendaId, codice, tipoSpazio }: Props) {
  const router = useRouter();
  const [stato, setStato] = useState<StatoScreeningAzienda | null>(null);
  const [numeroXbrl, setNumeroXbrl] = useState(0);
  const [caricamento, setCaricamento] = useState(true);
  const [caricamentoXbrl, setCaricamentoXbrl] = useState(false);
  const [visuraFile, setVisuraFile] = useState<File | null>(null);
  const [generazioneInCorso, setGenerazioneInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [esitoPreCompilazione, setEsitoPreCompilazione] = useState<string | null>(null);
  // Consente di lanciare l'analisi anche senza bilancio XBRL: il sistema
  // acquisisce la carenza, sviluppa sull'esistente e la evidenzia in relazione.
  const [procediSenzaXbrl, setProcediSenzaXbrl] = useState(false);

  const carica = async () => {
    setCaricamento(true);
    const [screeningRis, xbrlRis] = await Promise.all([
      ottieniScreeningAzienda(nomeSchema, aziendaId),
      ottieniStoricoXbrlAzienda(nomeSchema, aziendaId),
    ]);
    if (screeningRis.success) setStato(screeningRis.stato);
    else setErrore(screeningRis.error || 'Impossibile caricare lo screening.');
    if (xbrlRis.success) setNumeroXbrl(xbrlRis.storico.length);
    setCaricamento(false);
  };

  useEffect(() => {
    carica();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nomeSchema, aziendaId]);

  const handleCaricaXbrl = async (file: File) => {
    setCaricamentoXbrl(true);
    setErrore(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const risposta = await fetch('/api/xbrl/parse', { method: 'POST', body: formData });
      const corpo = await risposta.json();
      if (!risposta.ok || corpo.error) {
        setErrore(corpo.error || "Errore durante l'elaborazione del bilancio XBRL.");
        return;
      }
      const analisi: AnalisiXbrlResult = corpo;
      const risultato = await salvaAnalisiXbrlAziendaAction(nomeSchema, aziendaId, analisi);
      if (!risultato.success) {
        setErrore(risultato.error || 'Impossibile salvare il bilancio.');
        return;
      }
      // Riallinea il contatore alle annualità DISTINTE effettivamente
      // archiviate (storico.length), non a un incremento cieco per upload:
      // ricaricare lo stesso anno fa DO UPDATE (nessuna riga nuova) e un
      // file nuovo può inserirne due (corrente + comparativo) — il vecchio
      // `prev + 1` sbagliava in entrambi i casi.
      const storicoRis = await ottieniStoricoXbrlAzienda(nomeSchema, aziendaId);
      if (storicoRis.success) setNumeroXbrl(storicoRis.storico.length);
    } catch (err: any) {
      setErrore(`Impossibile leggere il file: ${err.message || err}`);
    } finally {
      setCaricamentoXbrl(false);
    }
  };

  const handleGenera = async () => {
    if (!visuraFile) {
      setErrore('Carica il fascicolo storico (PDF) prima di generare lo screening.');
      return;
    }
    if (numeroXbrl === 0 && !procediSenzaXbrl) {
      setErrore(
        'Nessun bilancio XBRL caricato. Carica un XBRL, oppure spunta «Procedi senza bilancio XBRL» qui sotto per lanciare l’analisi sui soli dati disponibili — l’assenza del bilancio verrà evidenziata nella relazione.'
      );
      return;
    }
    setGenerazioneInCorso(true);
    setErrore(null);
    try {
      // Upload proxato attraverso questa app, non più diretto dal
      // browser a Vercel Blob — bug confermato lato Vercel su quel
      // percorso (vedi il commento in api/blob-upload/route.ts). Torna
      // a valere il limite di 4,5MB sul corpo della richiesta, prudente
      // per una visura camerale.
      const formData = new FormData();
      formData.append('file', visuraFile);
      formData.append('codice', codice);
      const rispostaUpload = await fetch('/api/blob-upload', {
        method: 'POST',
        body: formData,
      });
      const corpoUpload = await rispostaUpload.json();
      if (!rispostaUpload.ok || corpoUpload.error) {
        setErrore(corpoUpload.error || 'Impossibile caricare il fascicolo storico.');
        return;
      }
      if (tipoSpazio === 'NON_ENTE') {
        const risultato = await generaPreCompilazioneMinisterialeAction(
          nomeSchema,
          aziendaId,
          corpoUpload.url,
          visuraFile.name
        );
        if (risultato.success) {
          setEsitoPreCompilazione(
            risultato.domandeCompilate === 0
              ? 'Nessuna domanda della Check List Ministeriale poteva essere compilata con certezza da questi dati — completala a mano in Check List.'
              : `${risultato.domandeCompilate} domanda/e della Check List Ministeriale compilata/e — completa il resto in Check List, la scheda accanto.`
          );
          setVisuraFile(null);
          // Il semaforo dei passi vive nel layout (Server Component): senza
          // questo refresh la Check List non si sbloccherebbe finché non si
          // ricarica la pagina o si compie un'altra azione che aggiorna il
          // layout.
          router.refresh();
        } else {
          setErrore(risultato.error || 'Impossibile pre-compilare la Check List Ministeriale.');
        }
        return;
      }
      const risultato = await generaScreeningAziendaAction(
        nomeSchema,
        aziendaId,
        corpoUpload.url,
        visuraFile.name
      );
      if (risultato.success) {
        await carica();
        setVisuraFile(null);
        // Screening appena generato → la Check List deve sbloccarsi (e
        // mostrare il badge delle domande) subito, non solo dopo un'altra
        // azione. Il semaforo è renderizzato dal layout (Server Component),
        // quindi va forzata la rilettura.
        router.refresh();
      } else {
        setErrore(risultato.error || 'Impossibile generare lo screening.');
      }
    } catch (err: any) {
      setErrore(`Impossibile leggere il file: ${err.message || err}`);
    } finally {
      setGenerazioneInCorso(false);
    }
  };

  if (caricamento) return <p className="text-xs text-slate-400">Caricamento...</p>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-bold text-slate-900 uppercase text-xs tracking-wider">Screening</h2>
        <p className="text-[11px] text-slate-500 mt-1">
          {tipoSpazio === 'NON_ENTE' ? (
            <>
              Prima ancora di scrivere la proposta: da bilancio XBRL e fascicolo storico, un
              tentativo di rispondere alle domande fisse della Check List Ministeriale (56, Sezione
              II del decreto) — solo dove i dati lo dimostrano con certezza, mai per invenzione. Il
              resto si completa a mano in <span className="font-bold">Check List</span>, la scheda
              accanto.
            </>
          ) : (
            <>
              Prima ancora che arrivi una proposta: da bilancio XBRL e fascicolo storico, un
              questionario mirato alle direttrici di questo ente e una relazione di inquadramento —
              basati solo su quello che è già pubblico o nei tuoi sistemi, non su
              un&apos;interazione con l&apos;azienda. Le domande generate si rispondono in{' '}
              <span className="font-bold">Check List</span>, la scheda accanto.
            </>
          )}
        </p>
      </div>

      {errore && (
        <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <p>{errore}</p>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <h3 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
          Documenti di partenza
        </h3>

        <div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-700">
              Bilancio XBRL — {numeroXbrl > 0 ? `${numeroXbrl} caricato/i` : 'nessuno ancora'}
            </span>
            <label className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-[10px] uppercase rounded-lg transition-colors cursor-pointer">
              <Upload className="w-3.5 h-3.5" />
              {caricamentoXbrl ? 'Caricamento...' : 'Carica XBRL'}
              <input
                type="file"
                accept=".xbrl,.xml"
                className="hidden"
                disabled={caricamentoXbrl}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleCaricaXbrl(file);
                  e.target.value = '';
                }}
              />
            </label>
          </div>
          {numeroXbrl === 0 && (
            <label className="mt-2 flex items-start gap-2 text-[11px] text-slate-600 bg-amber-50 border border-amber-200 rounded-lg p-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={procediSenzaXbrl}
                onChange={(e) => setProcediSenzaXbrl(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                <span className="font-bold text-amber-800">Procedi senza bilancio XBRL.</span>{' '}
                Lancia l&apos;analisi sui soli dati disponibili (fascicolo storico, situazione
                debitoria, Posizione VERA). L&apos;assenza del bilancio verrà acquisita ed
                evidenziata, contestualizzandola, nella relazione — che resta preliminare finché il
                bilancio non viene caricato.
              </span>
            </label>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-700 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-slate-400" />
              Fascicolo storico (PDF) —{' '}
              {visuraFile
                ? `selezionato: ${visuraFile.name}`
                : stato?.nomeFileVisura
                  ? `1 caricato — ${stato.nomeFileVisura}`
                  : 'nessuno ancora'}
            </span>
            <label className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[10px] uppercase rounded-lg transition-colors cursor-pointer">
              <Upload className="w-3.5 h-3.5" />
              Scegli file
              <input
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                onChange={(e) => setVisuraFile(e.target.files?.[0] || null)}
              />
            </label>
          </div>
        </div>

        <button
          type="button"
          onClick={handleGenera}
          disabled={generazioneInCorso}
          className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white font-bold uppercase tracking-wider rounded-lg text-xs transition-colors"
        >
          {generazioneInCorso ? (
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Sparkles className="w-3.5 h-3.5" />
          )}
          {generazioneInCorso
            ? 'Caricamento e analisi...'
            : tipoSpazio === 'NON_ENTE'
              ? 'Pre-compila Check List Ministeriale'
              : stato?.esiste
                ? 'Rigenera screening'
                : 'Genera screening'}
        </button>
        {tipoSpazio === 'NON_ENTE' ? (
          <p className="text-[10px] text-slate-400">
            Ripetere l&apos;operazione sovrascrive solo le domande già compilate dallo Screening —
            quelle che hai risposto a mano restano intatte.
          </p>
        ) : (
          stato?.esiste && (
            <p className="text-[10px] text-slate-400">
              Rigenerare sovrascrive il questionario e la relazione attuali, e azzera le risposte
              già date in Check List.
            </p>
          )
        )}
        {esitoPreCompilazione && (
          <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
            {esitoPreCompilazione}
          </p>
        )}
      </div>

      {stato?.esiste && stato.relazioneTesto && (
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-3">
            <h3 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
              Relazione di inquadramento
            </h3>
            <div className="flex items-center gap-3">
              {stato.generatoIl && (
                <span className="text-[10px] text-slate-400">
                  Generata il {new Date(stato.generatoIl).toLocaleString('it-IT')}
                </span>
              )}
              <button
                type="button"
                onClick={() => handleStampaRelazione(stato.relazioneTesto!, stato.generatoIl)}
                className="flex items-center gap-1 px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[9px] uppercase rounded transition-colors"
                title="Apre una finestra di stampa — da lì puoi salvare come PDF"
              >
                <Printer className="w-3 h-3" /> Stampa / PDF
              </button>
            </div>
          </div>
          <div className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">
            {stato.relazioneTesto}
          </div>
        </div>
      )}
    </div>
  );
}

/** Grezzo apposta — vedi src/lib/stampaTesto.ts */
function handleStampaRelazione(testo: string, generatoIl: string | null) {
  stampaTesto('Relazione di Screening', testo, generatoIl);
}
