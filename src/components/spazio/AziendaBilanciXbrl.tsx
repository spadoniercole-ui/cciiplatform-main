'use client';

// Caricamento dei bilanci XBRL di una specifica azienda — scheda a sé dello
// step "Analisi Bilancio".
//
// Il percorso è triage → Analisi Bilancio → Screening: il bilancio depositato
// serve all'indicatore di attenzione e alla relazione dello Screening, quindi
// si carica QUI, prima che lo Screening venga generato. La scheda accetta più
// file in un colpo solo perché la prassi è caricare l'ultimo bilancio
// depositato insieme ai due o tre precedenti: ogni file porta l'anno corrente
// e il comparativo, e l'archivio tiene una riga per annualità (ricaricare lo
// stesso anno lo aggiorna, non lo duplica).

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertCircle, CheckCircle2, FileSpreadsheet, FileUp, Upload } from 'lucide-react';
import {
  ottieniStoricoXbrlAzienda,
  salvaAnalisiXbrlAziendaAction,
  type BilancioStoricoAzienda,
} from '@/app/actions/xbrlAzienda';
import { segnaVistaAnalisiBilancioAction } from '@/app/actions/analisiBilancioStep';
import { improntaFile } from '@/lib/fascicolo/impronta';
import { registraDocumentoOrigineAction } from '@/app/actions/documentiOrigine';
import type { AnalisiXbrlResult } from '@/lib/xbrl/types';

interface Props {
  nomeSchema: string;
  aziendaId: number;
  /** Scheda di configurazione delle tab, per chi vuole restringerle. */
  hrefConfigurazione: string;
}

interface EsitoFile {
  nome: string;
  anno: number | null;
  ok: boolean;
  messaggio: string;
}

export function AziendaBilanciXbrl({ nomeSchema, aziendaId, hrefConfigurazione }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [storico, setStorico] = useState<BilancioStoricoAzienda[]>([]);
  const [caricamento, setCaricamento] = useState(true);
  const [caricamentoFile, setCaricamentoFile] = useState(false);
  const [avanzamento, setAvanzamento] = useState<{ fatti: number; totali: number } | null>(null);
  const [esiti, setEsiti] = useState<EsitoFile[]>([]);
  const [errore, setErrore] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setCaricamento(true);
      const storicoRis = await ottieniStoricoXbrlAzienda(nomeSchema, aziendaId);
      if (storicoRis.success) setStorico(storicoRis.storico);
      else setErrore(storicoRis.error || 'Impossibile leggere i bilanci archiviati.');
      setCaricamento(false);
    })();
  }, [nomeSchema, aziendaId]);

  // Aprire la scheda di caricamento vale come presa visione della
  // sotto-sezione XBRL: è la stessa colonna già usata da Configurazione XBRL,
  // quindi il semaforo non richiede una migrazione dello schema.
  useEffect(() => {
    (async () => {
      const esito = await segnaVistaAnalisiBilancioAction(nomeSchema, aziendaId, 'xbrl');
      if (esito.success && esito.cambiato) router.refresh();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nomeSchema, aziendaId]);

  /**
   * Analizza e archivia un singolo file. Non lancia: restituisce l'esito, così
   * un file difettoso non interrompe il caricamento degli altri dello stesso
   * lotto — è il motivo per cui l'elenco degli esiti è per file.
   */
  const caricaUnFile = async (file: File): Promise<EsitoFile> => {
    try {
      const formData = new FormData();
      formData.append('file', file);
      const risposta = await fetch('/api/xbrl/parse', { method: 'POST', body: formData });
      const corpo = await risposta.json();
      if (!risposta.ok || corpo.error) {
        return {
          nome: file.name,
          anno: null,
          ok: false,
          messaggio: corpo.error || "Errore durante l'elaborazione del bilancio XBRL.",
        };
      }
      const analisi = corpo as AnalisiXbrlResult;
      const regX = await registraDocumentoOrigineAction(
        nomeSchema,
        aziendaId,
        'XBRL',
        await improntaFile(file)
      );
      const risultato = await salvaAnalisiXbrlAziendaAction(
        nomeSchema,
        aziendaId,
        analisi,
        regX.success && regX.documentoId ? regX.documentoId : null
      );
      if (!risultato.success) {
        return {
          nome: file.name,
          anno: analisi.annoBilancio ?? null,
          ok: false,
          messaggio: risultato.error || 'Impossibile salvare il bilancio.',
        };
      }
      return {
        nome: file.name,
        anno: analisi.annoBilancio ?? null,
        ok: true,
        messaggio: `Archiviato${analisi.annoBilancio ? ` per l'anno ${analisi.annoBilancio}` : ''}.`,
      };
    } catch (err: any) {
      return {
        nome: file.name,
        anno: null,
        ok: false,
        messaggio: `Impossibile leggere il file: ${err.message || err}`,
      };
    }
  };

  const handleCaricaBilanci = async (files: File[]) => {
    if (files.length === 0) return;
    setCaricamentoFile(true);
    setErrore(null);
    setEsiti([]);
    const raccolti: EsitoFile[] = [];
    try {
      // Uno alla volta: il parsing è pesante e ogni file scrive sullo storico
      // dell'azienda, quindi in sequenza l'ordine degli esiti è quello dei
      // file scelti e un errore non lascia scritture a metà.
      for (let i = 0; i < files.length; i++) {
        setAvanzamento({ fatti: i, totali: files.length });
        raccolti.push(await caricaUnFile(files[i]));
        setEsiti([...raccolti]);
      }
      setAvanzamento({ fatti: files.length, totali: files.length });
      // Lo storico conta le annualità DISTINTE effettivamente archiviate: un
      // file porta l'anno corrente e il comparativo, e ricaricare lo stesso
      // anno sovrascrive la riga senza aggiungerne una.
      const storicoRis = await ottieniStoricoXbrlAzienda(nomeSchema, aziendaId);
      if (storicoRis.success) setStorico(storicoRis.storico);
      // "Analisi Bilancio" e i passi successivi vivono nel layout (Server
      // Component): con un bilancio in archivio vanno riletti.
      if (raccolti.some((e) => e.ok)) router.refresh();
    } finally {
      setCaricamentoFile(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const riusciti = esiti.filter((e) => e.ok).length;
  const falliti = esiti.length - riusciti;

  if (caricamento) return <p className="text-xs text-slate-400">Caricamento...</p>;

  return (
    <div className="max-w-3xl space-y-4">
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <FileUp className="w-4 h-4 text-blue-600" />
          <h2 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
            Carica i bilanci XBRL
          </h2>
        </div>
        <p className="text-[11px] text-slate-500">
          Qui si carica il bilancio depositato, dopo il triage e prima dello Screening: è quello che
          l&apos;indicatore di attenzione e la relazione leggono. Si possono scegliere{' '}
          <strong>più file in un colpo solo</strong> (uno per anno depositato): ogni file porta
          l&apos;anno corrente e il comparativo, e ricaricare lo stesso anno lo aggiorna senza
          duplicarlo.
        </p>

        {errore && (
          <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
            {errore}
          </div>
        )}

        <div
          className="border-2 border-dashed border-slate-200 rounded-xl p-5 text-center space-y-2 bg-slate-50/50"
          onDragOver={(e) => {
            e.preventDefault();
          }}
          onDrop={(e) => {
            e.preventDefault();
            if (caricamentoFile) return;
            const scelti = Array.from(e.dataTransfer.files).filter((f) =>
              /\.(xbrl|xml)$/i.test(f.name)
            );
            if (scelti.length === 0) {
              setErrore('Trascina file .xbrl o .xml.');
              return;
            }
            handleCaricaBilanci(scelti);
          }}
        >
          <Upload className="w-5 h-5 text-slate-400 mx-auto" />
          <p className="text-[11px] text-slate-500">
            Trascina qui i file (anche più di uno) oppure scegli dal disco.
          </p>
          <label
            className={`inline-flex items-center gap-2 px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-[11px] uppercase rounded-lg cursor-pointer transition-colors ${
              caricamentoFile ? 'opacity-60 pointer-events-none' : ''
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            {caricamentoFile
              ? avanzamento
                ? `Analisi ${avanzamento.fatti + 1 > avanzamento.totali ? avanzamento.totali : avanzamento.fatti + 1} di ${avanzamento.totali}...`
                : 'Analisi in corso...'
              : 'Scegli i file XBRL'}
            <input
              ref={inputRef}
              type="file"
              accept=".xbrl,.xml"
              multiple
              className="hidden"
              disabled={caricamentoFile}
              onChange={(e) => {
                const scelti = Array.from(e.target.files ?? []);
                if (scelti.length > 0) handleCaricaBilanci(scelti);
                else e.target.value = '';
              }}
            />
          </label>
        </div>

        {esiti.length > 0 && (
          <div className="space-y-2">
            <p
              className={`text-[11px] font-bold ${
                falliti === 0 ? 'text-emerald-700' : 'text-amber-800'
              }`}
            >
              {riusciti} {riusciti === 1 ? 'bilancio archiviato' : 'bilanci archiviati'}
              {falliti > 0
                ? `, ${falliti} ${falliti === 1 ? 'file non caricato' : 'file non caricati'}`
                : ''}
              .
            </p>
            <ul className="space-y-1">
              {esiti.map((e, i) => (
                <li
                  key={`${e.nome}-${i}`}
                  className={`flex items-start gap-2 text-xs rounded-lg px-3 py-2 border ${
                    e.ok
                      ? 'text-emerald-800 bg-emerald-50 border-emerald-200'
                      : 'text-red-800 bg-red-50 border-red-200'
                  }`}
                >
                  {e.ok ? (
                    <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  ) : (
                    <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  )}
                  <span className="truncate font-medium">{e.nome}</span>
                  <span className="ml-auto text-right">{e.messaggio}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <FileSpreadsheet className="w-4 h-4 text-blue-600" />
          <h2 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
            Annualità in archivio
          </h2>
          <span className="ml-auto text-[10px] text-slate-400">{storico.length} in archivio</span>
        </div>

        {storico.length > 0 ? (
          <ul className="space-y-1">
            {storico.map((b) => (
              <li key={b.id} className="flex items-center gap-2 text-xs text-slate-700">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span className="font-bold">{b.annoBilancio ?? 'anno non determinato'}</span>
                <span className="text-slate-500 truncate">{b.nomeFile || 'file non indicato'}</span>
                <span className="ml-auto text-[10px] text-slate-400 shrink-0">
                  severità {b.severity}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
            Nessun bilancio caricato: senza, lo Screening procede sui soli dati disponibili e lo
            dichiara nella relazione.
          </p>
        )}

        <p className="text-[11px] text-slate-500">
          Le tab alimentate dai bilanci si scelgono in{' '}
          <Link
            href={hrefConfigurazione}
            className="font-bold text-blue-600 hover:text-blue-700 underline"
          >
            Configurazione XBRL
          </Link>
          ; gli indici calcolati si leggono in <strong>Indici</strong>.
        </p>
      </div>
    </div>
  );
}
