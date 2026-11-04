'use client';

// Il caricamento dei set demo dalla pagina Scenari. I PDF vengono generati
// qui nel browser (jsPDF), caricati sul blob dello spazio e poi registrati
// dalla Server Action. Il pulsante è visibile solo all'Admin di Spazio di un
// ente: è una funzione di configurazione, non un'operazione di lavoro.
//
// La filigrana DEMO è nel generatore dei PDF; qui si dice a parole che i dati
// sono inventati, perché chi apre la demo sappia sempre che cosa sta guardando.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2, Database, Loader2 } from 'lucide-react';
import {
  caricaSetDemoAction,
  statoSetDemoAction,
  type DocumentiSetDemo,
} from '@/app/actions/demoGiudice';
import {
  DESCRIZIONE_SET,
  ETICHETTA_SET,
  SET_DEMO,
  documentiPer,
  type TipoSetDemo,
} from '@/lib/demo/setGiudice';
import { creaPdfDemo } from '@/lib/demo/pdfDemo';

interface Props {
  nomeSchema: string;
  codice: string;
  tipoSpazio: 'ENTE' | 'NON_ENTE';
  eAdminSpazio: boolean;
  onCaricato?: () => void | Promise<void>;
}

export function CaricaSetDemo({ nomeSchema, codice, tipoSpazio, eAdminSpazio, onCaricato }: Props) {
  const router = useRouter();
  const [inCorso, setInCorso] = useState<TipoSetDemo | null>(null);
  const [passo, setPasso] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [esito, setEsito] = useState<string | null>(null);

  if (tipoSpazio !== 'ENTE' || !eAdminSpazio) return null;

  const carica = async (tipo: TipoSetDemo) => {
    setInCorso(tipo);
    setPasso('Verifico le aziende già presenti…');
    setErrore(null);
    setEsito(null);
    try {
      const stato = await statoSetDemoAction(nomeSchema, tipo);
      if (!stato.success) {
        setErrore(stato.error || 'Verifica del set non riuscita.');
        return;
      }
      if (!stato.mancanti || stato.mancanti.length === 0) {
        setEsito('Questo set è già stato caricato: nessuna azienda duplicata.');
        await onCaricato?.();
        return;
      }

      const aziende = SET_DEMO[tipo].filter((a) => stato.mancanti?.includes(a.ragioneSociale));
      const documenti: DocumentiSetDemo = {};

      for (let i = 0; i < aziende.length; i++) {
        const a = aziende[i];
        documenti[a.ragioneSociale] = [];
        const docs = documentiPer(a, tipo);
        for (let j = 0; j < docs.length; j++) {
          setPasso(
            `Azienda ${i + 1} di ${aziende.length}: genero «${docs[j].titolo}» (${j + 1}/${docs.length})…`
          );
          const blob = creaPdfDemo(docs[j], a);
          const formData = new FormData();
          formData.append('file', blob, docs[j].nome);
          formData.append('codice', codice);
          const risposta = await fetch('/api/blob-upload', { method: 'POST', body: formData });
          const corpo = await risposta.json();
          if (!risposta.ok || corpo.error) {
            setErrore(corpo.error || `Caricamento di «${docs[j].nome}» non riuscito.`);
            return;
          }
          documenti[a.ragioneSociale].push({ nome: docs[j].nome, url: corpo.url });
        }
      }

      setPasso('Registro aziende, scenari e confronti…');
      const risultato = await caricaSetDemoAction(nomeSchema, tipo, documenti);
      if (!risultato.success) {
        setErrore(risultato.error || 'Caricamento del set non riuscito.');
        return;
      }
      setEsito(
        `Caricate ${risultato.create ?? 0} aziende del set «${ETICHETTA_SET[tipo]}». Apri Scenari e scegli un’azienda per vedere il confronto già pronto.`
      );
      await onCaricato?.();
      router.refresh();
    } catch (error: unknown) {
      setErrore((error as Error).message || 'Errore durante il caricamento del set.');
    } finally {
      setInCorso(null);
      setPasso(null);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
      <div className="flex items-center gap-2">
        <Database className="w-4 h-4 text-slate-500" />
        <h2 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
          Set demo — provvedimenti del giudice
        </h2>
      </div>
      <p className="text-[11px] text-slate-500 leading-relaxed">
        Carica due gruppi di tre aziende, una per la liquidazione e una per il cram down, con
        posizione debitoria, scenario e documenti PDF. I dati sono inventati e ogni PDF porta la
        filigrana «DEMO — non valido ai fini di legge». Il caricamento è idempotente: le aziende già
        presenti non vengono duplicate.
      </p>

      {errore && (
        <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <p>{errore}</p>
        </div>
      )}
      {esito && (
        <div className="flex items-start gap-2 text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          <p>{esito}</p>
        </div>
      )}
      {passo && (
        <p className="flex items-center gap-2 text-[11px] text-slate-600">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> {passo}
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {(Object.keys(ETICHETTA_SET) as TipoSetDemo[]).map((tipo) => (
          <button
            key={tipo}
            type="button"
            onClick={() => carica(tipo)}
            disabled={inCorso !== null}
            className="text-left border border-slate-200 hover:border-sky-400 disabled:opacity-60 rounded-lg p-4 space-y-1.5 transition-colors"
          >
            <span className="block text-[10px] font-bold uppercase tracking-wider text-sky-700">
              {inCorso === tipo
                ? 'Caricamento in corso…'
                : `Carica ${SET_DEMO[tipo].length} aziende`}
            </span>
            <span className="block text-sm font-bold text-slate-900">{ETICHETTA_SET[tipo]}</span>
            <span className="block text-[11px] text-slate-600 leading-relaxed">
              {DESCRIZIONE_SET[tipo]}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
