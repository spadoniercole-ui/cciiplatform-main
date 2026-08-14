'use client';

import React, { useState, useRef } from 'react';
import {
  Upload,
  FileUp,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  FileSpreadsheet,
  FileText,
  RefreshCw,
  TrendingDown,
  Building2,
  MapPin,
  Hash,
  Activity,
  Bot,
  PieChart,
  ListChecks,
} from 'lucide-react';
import FunzioneParificazioneTag from '@/components/xbrl/caricamento/FunzioneParificazioneTag';
import type { AnalisiXbrlResult } from '@/lib/xbrl/types';
import { esportaPdf, esportaExcel } from '@/lib/xbrl/reportExport';
import { calcolaTrend, type PuntoStorico } from '@/lib/xbrl/trend';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

interface PuntoStoricoDb {
  id: number;
  ragione_sociale: string;
  anno_bilancio: number | null;
  nome_file: string | null;
  dati_finanziari: unknown;
  indici: IndiceCalculated[];
  altri_indici: IndiceCalculated[];
  situazione_debitoria: SituazioneDebitoria;
  severity: 'GREEN' | 'YELLOW' | 'RED';
  created_at: string;
}

interface CompanyInfo {
  ragioneSociale: string;
  codiceFiscale: string;
  indirizzoSedeLegale: string;
  codiceAteco: string;
}

interface IndiceCalculated {
  codice: string;
  nome: string;
  valore: number | string | null;
  soglia: string;
  esito: 'OK' | 'VIOLATO' | 'NON_CALCOLABILE';
  note?: string;
}

interface SituazioneDebitoria {
  debitiBanche: number;
  debitiFornitori: number;
  debitiTributari: number;
  debitiPrevidenziali: number;
  altriDebiti: number;
  totaleDebiti: number;
  disponibilitaLiquide: number;
  pfn: number;
}

interface XbrlParsedPayload {
  company: CompanyInfo;
  hasContoEconomico: boolean;
  indiciCndec: IndiceCalculated[];
  altriIndici: IndiceCalculated[];
  situazioneDebitoria: SituazioneDebitoria;
  relazioneAi: string;
}

export default function GestioneXBRLPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [xbrlData, setXbrlData] = useState<XbrlParsedPayload | null>(null);
  // Risultato completo del motore (non solo la proiezione "data"): serve alla
  // tab di Parificazione Tag e al banner di avvisi (fallback mapping, ecc.)
  const [analisiGrezza, setAnalisiGrezza] = useState<AnalisiXbrlResult | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [generandoRelazione, setGenerandoRelazione] = useState(false);
  const [erroreRelazione, setErroreRelazione] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<
    'cndec' | 'altri_indici' | 'debitoria' | 'relazione' | 'report' | 'parificazione' | 'storico'
  >('cndec');
  const [storico, setStorico] = useState<PuntoStoricoDb[]>([]);
  const [caricandoStorico, setCaricandoStorico] = useState(false);
  const [salvandoStorico, setSalvandoStorico] = useState(false);
  const [messaggioStorico, setMessaggioStorico] = useState<string | null>(null);

  const handleFileUpload = async (file: File) => {
    if (!file) return;
    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/xbrl/parse', {
        method: 'POST',
        body: formData,
      });

      const result = await res.json();

      if (res.ok && (result.success || result.data)) {
        const raw = result.data || result;

        // NORMALIZZAZIONE E FALLBACK DIFENSIVO DEI DATI
        const sanitizedPayload: XbrlParsedPayload = {
          company: {
            ragioneSociale:
              raw.company?.ragioneSociale ||
              raw.ragioneSociale ||
              raw.companyInfo?.ragioneSociale ||
              'Dato non rilevato',
            codiceFiscale:
              raw.company?.codiceFiscale ||
              raw.codiceFiscale ||
              raw.companyInfo?.codiceFiscale ||
              'N/D',
            indirizzoSedeLegale:
              raw.company?.indirizzoSedeLegale ||
              raw.indirizzoSedeLegale ||
              raw.companyInfo?.indirizzoSedeLegale ||
              'N/D',
            codiceAteco:
              raw.company?.codiceAteco || raw.codiceAteco || raw.companyInfo?.codiceAteco || 'N/D',
          },
          hasContoEconomico: Boolean(raw.hasContoEconomico ?? true),
          indiciCndec: Array.isArray(raw.indiciCndec)
            ? raw.indiciCndec
            : Array.isArray(raw.indici)
              ? raw.indici
              : [],
          altriIndici: Array.isArray(raw.altriIndici) ? raw.altriIndici : [],
          situazioneDebitoria: {
            debitiBanche: raw.situazioneDebitoria?.debitiBanche ?? 0,
            debitiFornitori: raw.situazioneDebitoria?.debitiFornitori ?? 0,
            debitiTributari: raw.situazioneDebitoria?.debitiTributari ?? 0,
            debitiPrevidenziali: raw.situazioneDebitoria?.debitiPrevidenziali ?? 0,
            altriDebiti: raw.situazioneDebitoria?.altriDebiti ?? 0,
            totaleDebiti: raw.situazioneDebitoria?.totaleDebiti ?? 0,
            disponibilitaLiquide: raw.situazioneDebitoria?.disponibilitaLiquide ?? 0,
            pfn: raw.situazioneDebitoria?.pfn ?? 0,
          },
          relazioneAi: raw.relazioneAi || raw.relazione || '',
        };

        setXbrlData(sanitizedPayload);
        setAnalisiGrezza(result as AnalisiXbrlResult);
        setFileName(file.name);
        setMessaggioStorico(null);

        if (result.anagrafica?.codiceFiscale) {
          caricaStorico(result.anagrafica.codiceFiscale);
        } else {
          setStorico([]);
        }
      } else {
        alert(`Errore elaborazione XBRL: ${result.error || 'Risposta non valida dal server'}`);
      }
    } catch (err) {
      console.error('Errore durante il parsing XBRL:', err);
      alert('Si è verificato un errore durante la lettura del file XBRL.');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const formatEuro = (val: number | null | undefined) => {
    if (val === null || val === undefined) return 'N/D';
    return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(val);
  };

  // Converte gli indici CNDCEC (soglia testuale, es. "< 0.80") nel formato
  // {operatore, soglia numerica} richiesto da /api/xbrl/report-ai. Gli indici
  // "informativi" (senza un vero confronto di soglia, es. ROE/ROI) vengono
  // esclusi dal payload: non c'è un operatore/soglia da comunicare al modello.
  const mappaIndiciPerReportAi = (indici: IndiceCalculated[]) => {
    return indici.reduce<
      {
        codice: string;
        nome: string;
        valore: number;
        soglia: number;
        operatore: '<' | '>';
        superato: boolean;
      }[]
    >((acc, ind) => {
      const match = /^([<>])\s*([\d.]+)/.exec(ind.soglia || '');
      if (!match || typeof ind.valore !== 'number') return acc;
      acc.push({
        codice: ind.codice,
        nome: ind.nome,
        valore: ind.valore,
        soglia: parseFloat(match[2]),
        operatore: match[1] as '<' | '>',
        superato: ind.esito === 'VIOLATO',
      });
      return acc;
    }, []);
  };

  const caricaStorico = async (codiceFiscale: string) => {
    setCaricandoStorico(true);
    try {
      const res = await fetch(
        `/api/xbrl/storico?codiceFiscale=${encodeURIComponent(codiceFiscale)}`
      );
      const result = await res.json();
      if (res.ok && result.success) {
        setStorico(result.storico || []);
      } else {
        setStorico([]);
      }
    } catch (err) {
      console.error('Errore durante il recupero dello storico:', err);
      setStorico([]);
    } finally {
      setCaricandoStorico(false);
    }
  };

  const salvaAnalisiNelloStorico = async () => {
    if (!analisiGrezza) return;
    setSalvandoStorico(true);
    setMessaggioStorico(null);

    try {
      const res = await fetch('/api/xbrl/storico', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analisi: analisiGrezza }),
      });
      const result = await res.json();

      if (!res.ok || !result.success) {
        setMessaggioStorico(result.error || 'Errore durante il salvataggio nello storico.');
        return;
      }

      setMessaggioStorico('Analisi salvata nello storico.');
      if (analisiGrezza.anagrafica.codiceFiscale) {
        await caricaStorico(analisiGrezza.anagrafica.codiceFiscale);
      }
    } catch (err) {
      console.error('Errore durante il salvataggio nello storico:', err);
      setMessaggioStorico('Impossibile completare il salvataggio. Verifica la connessione.');
    } finally {
      setSalvandoStorico(false);
    }
  };

  // Trend calcolato lato client: storico (già ordinato dal server per anno)
  // + il punto corrente in coda. Nessuna chiamata DB aggiuntiva: usa gli
  // stessi dati già caricati per la tab e per il salvataggio.
  const trend =
    analisiGrezza && storico.length >= 0
      ? calcolaTrend(
          storico.map((s) => ({
            anno: s.anno_bilancio,
            indici: s.indici,
            severity: s.severity,
            situazioneDebitoria: s.situazione_debitoria,
          })) as PuntoStorico[],
          {
            anno: analisiGrezza.annoBilancio,
            indici: analisiGrezza.indici,
            severity: analisiGrezza.severity,
            situazioneDebitoria: analisiGrezza.situazioneDebitoria,
          }
        )
      : null;

  const handleGeneraRelazioneAi = async () => {
    if (!xbrlData) return;
    setGenerandoRelazione(true);
    setErroreRelazione(null);

    try {
      const res = await fetch('/api/xbrl/report-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company: {
            ragioneSociale: xbrlData.company.ragioneSociale,
            codiceFiscale: xbrlData.company.codiceFiscale,
            indirizzoSedeLegale: xbrlData.company.indirizzoSedeLegale,
            settoreAteco: xbrlData.company.codiceAteco,
          },
          situazioneDebitoria: xbrlData.situazioneDebitoria,
          indici: mappaIndiciPerReportAi(xbrlData.indiciCndec || []),
          andamentoStorico: trend
            ? {
                direzioneSeverity: trend.direzioneSeverity,
                segnalazioni: trend.segnalazioni,
                numeroPeriodiConfrontati: storico.length + 1,
              }
            : null,
        }),
      });

      const result = await res.json();

      if (!res.ok || !result.report) {
        setErroreRelazione(result.error || `Errore del server: ${res.status}`);
        return;
      }

      setXbrlData((prev) => (prev ? { ...prev, relazioneAi: result.report } : prev));
      if (result.troncato) {
        setErroreRelazione(
          'Attenzione: la relazione generata potrebbe risultare troncata (limite di lunghezza raggiunto). Prova a rigenerarla; se il problema persiste, va aumentato ulteriormente il limite lato server.'
        );
      }
    } catch (err) {
      console.error('Errore durante la generazione della relazione AI:', err);
      setErroreRelazione('Impossibile completare la richiesta. Verifica la connessione.');
    } finally {
      setGenerandoRelazione(false);
    }
  };

  return (
    <div className="w-full min-h-screen bg-slate-50 font-mono text-xs text-slate-800 p-4 md:p-6 space-y-4">
      <input
        type="file"
        ref={fileInputRef}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFileUpload(file);
        }}
        accept=".xbrl,.xml"
        className="hidden"
      />

      {/* HEADER DINAMICO */}
      {!xbrlData ? (
        <div className="bg-slate-900 text-white rounded-xl p-6 shadow-md border border-slate-800">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h1 className="text-lg font-black tracking-tight uppercase">Analisi Istanza XBRL</h1>
              <p className="text-slate-400 font-sans text-xs">
                Carica un file XBRL reale per estrarre l&apos;anagrafica ed elaborare gli indici
              </p>
            </div>
          </div>

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              const file = e.dataTransfer.files?.[0];
              if (file) handleFileUpload(file);
            }}
            className={`border-2 border-dashed rounded-xl p-10 text-center transition-all bg-slate-800/50 ${
              isDragging
                ? 'border-blue-500 bg-blue-900/20 scale-[1.01]'
                : 'border-slate-700 hover:border-slate-500'
            }`}
          >
            <div className="mx-auto w-12 h-12 mb-3 flex items-center justify-center rounded-full bg-blue-500/10 text-blue-400">
              <FileUp className="w-6 h-6" />
            </div>
            <h2 className="text-sm font-bold text-white mb-1">
              Trascina qui il file XBRL (.xbrl o .xml)
            </h2>
            <p className="text-xs text-slate-400 font-sans mb-4">
              I dati reali verranno estratti ed elaborati senza mock data
            </p>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-bold px-4 py-2 rounded-lg text-xs uppercase tracking-wider transition-all disabled:opacity-50 cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              <span>{isUploading ? 'Analisi in corso...' : 'Seleziona File XBRL'}</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-slate-900 text-white rounded-xl p-4 shadow-md border border-slate-800 space-y-3">
          <div className="flex justify-between items-start border-b border-slate-800 pb-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-blue-400" />
                <h1 className="text-base font-black text-white uppercase tracking-wide">
                  {xbrlData?.company?.ragioneSociale || 'Ragione Sociale Non Rilevata'}
                </h1>
              </div>
              <div className="flex flex-wrap items-center gap-4 text-slate-300 font-sans text-xs pt-1">
                <span className="flex items-center gap-1">
                  <Hash className="w-3.5 h-3.5 text-slate-500" />
                  CF/P.IVA:{' '}
                  <strong className="font-mono text-white">
                    {xbrlData?.company?.codiceFiscale || 'N/D'}
                  </strong>
                </span>
                <span className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-slate-500" />
                  Sede:{' '}
                  <strong className="text-white">
                    {xbrlData?.company?.indirizzoSedeLegale || 'N/D'}
                  </strong>
                </span>
                <span className="flex items-center gap-1">
                  <Activity className="w-3.5 h-3.5 text-slate-500" />
                  ATECO:{' '}
                  <strong className="font-mono text-amber-400">
                    {xbrlData?.company?.codiceAteco || 'N/D'}
                  </strong>
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-1 rounded border border-slate-700 font-mono">
                {fileName}
              </span>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="flex items-center gap-1 bg-slate-800 hover:bg-slate-700 text-blue-400 hover:text-blue-300 font-bold px-3 py-1.5 rounded-lg text-[10px] uppercase tracking-wider border border-slate-700 transition-all cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
                <span>{isUploading ? 'Elaborazione...' : 'Sostituisci File'}</span>
              </button>
            </div>
          </div>

          {!xbrlData?.hasContoEconomico && (
            <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-center justify-between text-amber-300 font-sans text-xs">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>
                  <strong>Conto Economico assente nell&apos;istanza.</strong> Gli indici
                  reddituali/CE sono disabilitati o indicati come N/D.
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Avvisi del motore (fallback mapping, anagrafica incompleta, ecc.) */}
      {analisiGrezza && analisiGrezza.warnings.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-3 space-y-1 font-mono text-xs">
          {analisiGrezza.warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span className="font-sans">{w}</span>
            </div>
          ))}
        </div>
      )}

      {/* TABS OPERATIVE */}
      {xbrlData && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
          <div className="flex flex-wrap border-b border-slate-200 bg-slate-100">
            <button
              type="button"
              onClick={() => setActiveTab('cndec')}
              className={`flex items-center gap-2 px-4 py-3 text-[10px] font-bold uppercase tracking-wider border-r border-slate-200 outline-none transition-all cursor-pointer ${
                activeTab === 'cndec'
                  ? 'bg-white text-blue-600 border-b-2 border-b-blue-600'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Activity className="w-3.5 h-3.5" /> 1. 5 Indici CNDEC
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('altri_indici')}
              className={`flex items-center gap-2 px-4 py-3 text-[10px] font-bold uppercase tracking-wider border-r border-slate-200 outline-none transition-all cursor-pointer ${
                activeTab === 'altri_indici'
                  ? 'bg-white text-blue-600 border-b-2 border-b-blue-600'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <PieChart className="w-3.5 h-3.5" /> 2. Tutti gli altri Indici (
              {xbrlData?.altriIndici?.length || 0})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('debitoria')}
              className={`flex items-center gap-2 px-4 py-3 text-[10px] font-bold uppercase tracking-wider border-r border-slate-200 outline-none transition-all cursor-pointer ${
                activeTab === 'debitoria'
                  ? 'bg-white text-blue-600 border-b-2 border-b-blue-600'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <TrendingDown className="w-3.5 h-3.5" /> 3. Situazione Debitoria e Finanziaria
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('relazione')}
              className={`flex items-center gap-2 px-4 py-3 text-[10px] font-bold uppercase tracking-wider border-r border-slate-200 outline-none transition-all cursor-pointer ${
                activeTab === 'relazione'
                  ? 'bg-white text-purple-600 border-b-2 border-b-purple-600'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Bot className="w-3.5 h-3.5 text-purple-600" /> 4. Relazione Dinamica AI
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('report')}
              className={`flex items-center gap-2 px-4 py-3 text-[10px] font-bold uppercase tracking-wider outline-none transition-all cursor-pointer ${
                activeTab === 'report'
                  ? 'bg-white text-emerald-600 border-b-2 border-b-emerald-600'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <FileText className="w-3.5 h-3.5 text-emerald-600" /> 5. Reportistica (PDF / Excel)
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('parificazione')}
              className={`flex items-center gap-2 px-4 py-3 text-[10px] font-bold uppercase tracking-wider border-l border-slate-200 outline-none transition-all cursor-pointer ${
                activeTab === 'parificazione'
                  ? 'bg-white text-blue-600 border-b-2 border-b-blue-600'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <ListChecks className="w-3.5 h-3.5" /> 6. Parificazione Tag
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('storico')}
              className={`flex items-center gap-2 px-4 py-3 text-[10px] font-bold uppercase tracking-wider border-l border-slate-200 outline-none transition-all cursor-pointer ${
                activeTab === 'storico'
                  ? 'bg-white text-blue-600 border-b-2 border-b-blue-600'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <TrendingDown className="w-3.5 h-3.5" /> 7. Andamento Storico
            </button>
          </div>

          <div className="p-5 min-h-[400px]">
            {/* TAB 1 */}
            {activeTab === 'cndec' && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="font-bold text-slate-900 uppercase text-xs">
                    Indici del Codice della Crisi (CNDEC / CCII)
                  </h3>
                  <span className="text-[10px] text-slate-500 font-sans">
                    Valori calcolati direttamente sull&apos;istanza XBRL
                  </span>
                </div>

                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-100 text-[9px] font-bold text-slate-600 border-b border-slate-200 uppercase">
                        <th className="p-3">Indicatore</th>
                        <th className="p-3 text-center">Valore XBRL Estratto</th>
                        <th className="p-3 text-center">Soglia Normativa</th>
                        <th className="p-3 text-center">Esito Diagnostico</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs font-mono">
                      {xbrlData?.indiciCndec && xbrlData.indiciCndec.length > 0 ? (
                        xbrlData.indiciCndec.map((ind) => (
                          <tr key={ind.codice} className="hover:bg-slate-50">
                            <td className="p-3 font-bold text-slate-800 font-sans">
                              {ind.codice} - {ind.nome}
                            </td>
                            <td className="p-3 text-center font-bold text-slate-900">
                              {ind.valore !== null && ind.valore !== undefined
                                ? typeof ind.valore === 'number'
                                  ? ind.valore.toLocaleString('it-IT', { maximumFractionDigits: 2 })
                                  : ind.valore
                                : 'N/D'}
                            </td>
                            <td className="p-3 text-center text-slate-500">{ind.soglia}</td>
                            <td className="p-3 text-center">
                              {ind.esito === 'OK' && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-sans font-bold">
                                  <CheckCircle2 className="w-3 h-3 text-emerald-600" /> REGOLARE
                                </span>
                              )}
                              {ind.esito === 'VIOLATO' && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-100 text-rose-800 text-[10px] font-sans font-bold">
                                  <AlertTriangle className="w-3 h-3 text-rose-600" /> VIOLATO
                                </span>
                              )}
                              {ind.esito === 'NON_CALCOLABILE' && (
                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-slate-100 text-slate-600 text-[10px] font-sans font-semibold">
                                  <HelpCircle className="w-3 h-3 text-slate-400" /> Non Calcolabile
                                </span>
                              )}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td
                            colSpan={4}
                            className="p-4 text-center text-slate-400 italic font-sans"
                          >
                            Nessun indice CNDEC ritornato dall&apos;elaborazione XBRL.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB 2 */}
            {activeTab === 'altri_indici' && (
              <div className="space-y-4">
                <h3 className="font-bold text-slate-900 uppercase text-xs">
                  Set Completo Indici Economici, Patrimoniali e Finanziari
                </h3>

                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-100 text-[9px] font-bold text-slate-600 border-b border-slate-200 uppercase">
                        <th className="p-2.5">Codice & Nome Indice</th>
                        <th className="p-2.5 text-center">Valore Calcolato</th>
                        <th className="p-2.5 text-center">Riferimento</th>
                        <th className="p-2.5">Note</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs font-mono">
                      {xbrlData?.altriIndici && xbrlData.altriIndici.length > 0 ? (
                        xbrlData.altriIndici.map((ind) => (
                          <tr key={ind.codice} className="hover:bg-slate-50">
                            <td className="p-2.5 font-bold text-slate-800 font-sans">
                              <span className="text-blue-600 font-mono mr-2">[{ind.codice}]</span>
                              {ind.nome}
                            </td>
                            <td className="p-2.5 text-center font-bold text-slate-900">
                              {ind.valore !== null && ind.valore !== undefined
                                ? typeof ind.valore === 'number'
                                  ? ind.valore.toLocaleString('it-IT', { maximumFractionDigits: 2 })
                                  : ind.valore
                                : 'N/D'}
                            </td>
                            <td className="p-2.5 text-center text-slate-500">
                              {ind.soglia || '-'}
                            </td>
                            <td className="p-2.5 text-slate-500 font-sans text-[11px]">
                              {ind.note || 'Estratto da prospetti XBRL'}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td
                            colSpan={4}
                            className="p-4 text-center text-slate-400 italic font-sans"
                          >
                            Nessun indice supplementare presente nel file.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB 3 */}
            {activeTab === 'debitoria' && (
              <div className="space-y-6">
                <h3 className="font-bold text-slate-900 uppercase text-xs">
                  Scomposizione Debito ed Esposizione Finanziaria
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <div className="bg-slate-100 p-2.5 border-b border-slate-200 font-bold text-slate-700 uppercase text-[10px]">
                      Dettaglio Passività e Debiti
                    </div>
                    <table className="w-full text-left font-mono text-xs">
                      <tbody className="divide-y divide-slate-100">
                        <tr>
                          <td className="p-2.5 text-slate-600 font-sans">Debiti verso Banche</td>
                          <td className="p-2.5 text-right font-bold">
                            {formatEuro(xbrlData?.situazioneDebitoria?.debitiBanche)}
                          </td>
                        </tr>
                        <tr>
                          <td className="p-2.5 text-slate-600 font-sans">Debiti verso Fornitori</td>
                          <td className="p-2.5 text-right font-bold">
                            {formatEuro(xbrlData?.situazioneDebitoria?.debitiFornitori)}
                          </td>
                        </tr>
                        <tr>
                          <td className="p-2.5 text-slate-600 font-sans">Debiti Tributari</td>
                          <td className="p-2.5 text-right font-bold text-amber-700">
                            {formatEuro(xbrlData?.situazioneDebitoria?.debitiTributari)}
                          </td>
                        </tr>
                        <tr>
                          <td className="p-2.5 text-slate-600 font-sans">Debiti Previdenziali</td>
                          <td className="p-2.5 text-right font-bold text-amber-700">
                            {formatEuro(xbrlData?.situazioneDebitoria?.debitiPrevidenziali)}
                          </td>
                        </tr>
                        <tr>
                          <td className="p-2.5 text-slate-600 font-sans">Altri Debiti</td>
                          <td className="p-2.5 text-right font-bold">
                            {formatEuro(xbrlData?.situazioneDebitoria?.altriDebiti)}
                          </td>
                        </tr>
                        <tr className="bg-slate-50 font-black text-slate-900">
                          <td className="p-3 uppercase font-sans">Totale Debiti Complessivi</td>
                          <td className="p-3 text-right text-sm">
                            {formatEuro(xbrlData?.situazioneDebitoria?.totaleDebiti)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <div className="space-y-4">
                    <div className="bg-slate-900 text-white p-4 rounded-lg space-y-3">
                      <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block">
                        Posizione Finanziaria Netta (PFN)
                      </span>
                      <div className="text-xl font-black font-mono">
                        {formatEuro(xbrlData?.situazioneDebitoria?.pfn)}
                      </div>
                    </div>

                    <div className="bg-blue-50/50 border border-blue-200 p-4 rounded-lg space-y-2">
                      <span className="text-[10px] text-blue-800 uppercase font-bold block">
                        Disponibilità Liquide
                      </span>
                      <div className="text-lg font-bold font-mono text-blue-900">
                        {formatEuro(xbrlData?.situazioneDebitoria?.disponibilitaLiquide)}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 4 */}
            {activeTab === 'relazione' && (
              <div className="space-y-4">
                <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                  <div className="flex items-center gap-2">
                    <Bot className="w-4 h-4 text-purple-600" />
                    <h3 className="font-bold text-slate-900 uppercase text-xs">
                      Relazione Automatica e Valutazione AI
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={handleGeneraRelazioneAi}
                    disabled={generandoRelazione}
                    className="flex items-center gap-2 bg-purple-600 hover:bg-purple-500 disabled:bg-purple-300 text-white font-bold text-[10px] uppercase tracking-wider px-4 py-2 rounded-lg transition-colors"
                  >
                    <Bot className="w-3.5 h-3.5" />
                    {generandoRelazione ? 'Generazione in corso...' : 'Genera Relazione AI'}
                  </button>
                </div>

                {erroreRelazione && (
                  <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 font-sans">
                    {erroreRelazione}
                  </div>
                )}

                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 font-sans text-xs text-slate-800 space-y-3">
                  <textarea
                    rows={12}
                    value={xbrlData?.relazioneAi || ''}
                    onChange={(e) =>
                      setXbrlData((prev) =>
                        prev ? { ...prev, relazioneAi: e.target.value } : prev
                      )
                    }
                    className="w-full p-3 bg-white border border-slate-300 rounded-lg outline-none focus:border-purple-500 font-sans text-xs leading-relaxed"
                    placeholder="Nessuna relazione generata. Premi 'Genera Relazione AI' oppure scrivi qui manualmente..."
                  />
                </div>
              </div>
            )}

            {/* TAB 5 */}
            {activeTab === 'report' && (
              <div className="space-y-6">
                <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="font-bold text-slate-900 uppercase text-xs">
                      Quadro Sinottico e Download Report
                    </h3>
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => xbrlData && esportaPdf(xbrlData)}
                      disabled={!xbrlData}
                      className="px-4 py-2 bg-slate-900 text-white font-bold rounded-lg text-[10px] uppercase tracking-wider flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <FileText className="w-3.5 h-3.5 text-rose-400" /> Esporta PDF
                    </button>
                    <button
                      type="button"
                      onClick={() => xbrlData && esportaExcel(xbrlData)}
                      disabled={!xbrlData}
                      className="px-4 py-2 bg-emerald-700 text-white font-bold rounded-lg text-[10px] uppercase tracking-wider flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5" /> Esporta Excel
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                    <span className="text-[9px] text-slate-400 font-bold uppercase">
                      Società Analizzata
                    </span>
                    <div className="font-bold text-slate-900 font-sans truncate">
                      {xbrlData?.company?.ragioneSociale || 'Non rilevata'}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      CF: {xbrlData?.company?.codiceFiscale || 'N/D'}
                    </div>
                  </div>

                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                    <span className="text-[9px] text-slate-400 font-bold uppercase">
                      Esito CNDEC
                    </span>
                    <div className="font-bold text-slate-900">
                      {xbrlData?.indiciCndec?.some((i) => i.esito === 'VIOLATO') ? (
                        <span className="text-rose-600 flex items-center gap-1">
                          <AlertTriangle className="w-4 h-4" /> Anomalia Rilevata
                        </span>
                      ) : (
                        <span className="text-emerald-600 flex items-center gap-1">
                          <CheckCircle2 className="w-4 h-4" /> Nessuna Criticità
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                    <span className="text-[9px] text-slate-400 font-bold uppercase">
                      Esposizione Complessiva
                    </span>
                    <div className="font-bold text-slate-900 font-mono">
                      {formatEuro(xbrlData?.situazioneDebitoria?.totaleDebiti)}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 6: PARIFICAZIONE TAG */}
            {activeTab === 'parificazione' && analisiGrezza && (
              <FunzioneParificazioneTag
                analisi={analisiGrezza}
                onSalvataggioCompletato={(numeroSalvati) => {
                  alert(
                    `${numeroSalvati} correzion${numeroSalvati === 1 ? 'e salvata' : 'i salvate'} su xbrl_tag_mappings. I prossimi file caricati useranno questo mapping.`
                  );
                }}
              />
            )}

            {/* TAB 7: ANDAMENTO STORICO */}
            {activeTab === 'storico' && analisiGrezza && (
              <div className="space-y-5">
                <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                  <div className="flex items-center gap-2">
                    <TrendingDown className="w-4 h-4 text-blue-600" />
                    <h3 className="font-bold text-slate-900 uppercase text-xs">
                      Andamento Storico ({storico.length + 1} period
                      {storico.length === 0 ? 'o' : 'i'} disponibil
                      {storico.length === 0 ? 'e' : 'i'})
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={salvaAnalisiNelloStorico}
                    disabled={salvandoStorico}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-300 text-white font-bold text-[10px] uppercase tracking-wider px-4 py-2 rounded-lg transition-colors"
                  >
                    {salvandoStorico ? 'Salvataggio...' : 'Salva questa analisi nello storico'}
                  </button>
                </div>

                {messaggioStorico && (
                  <div className="text-xs bg-blue-50 border border-blue-200 text-blue-800 rounded-lg p-3 font-sans">
                    {messaggioStorico}
                  </div>
                )}

                {caricandoStorico && (
                  <p className="text-xs text-slate-400 font-sans">Caricamento storico...</p>
                )}

                {!caricandoStorico && storico.length === 0 && (
                  <p className="text-xs text-slate-500 font-sans">
                    Nessuna analisi precedente salvata per questa azienda (CF:{' '}
                    {analisiGrezza.anagrafica.codiceFiscale || 'N/D'}). Salva questa analisi per
                    iniziare a costruire lo storico e poter confrontare i prossimi bilanci.
                  </p>
                )}

                {trend && (trend.segnalazioni.length > 0 || storico.length > 0) && (
                  <div className="space-y-3">
                    {trend.segnalazioni.length > 0 && (
                      <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-lg p-3 space-y-1">
                        {trend.segnalazioni.map((s, i) => (
                          <div key={i} className="flex items-start gap-2 text-xs">
                            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                            <span className="font-sans">{s}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
                      <span className="text-[10px] font-bold text-slate-500 uppercase block mb-3">
                        Posizione Finanziaria Netta nel tempo
                      </span>
                      <ResponsiveContainer width="100%" height={220}>
                        <LineChart
                          data={trend.andamentoPfn.map((p) => ({
                            anno: p.anno ?? 'N/D',
                            PFN: p.valore,
                          }))}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis dataKey="anno" tick={{ fontSize: 11 }} />
                          <YAxis tick={{ fontSize: 11 }} />
                          <Tooltip formatter={(val: number) => formatEuro(val)} />
                          <Legend />
                          <Line type="monotone" dataKey="PFN" stroke="#dc2626" strokeWidth={2} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="overflow-x-auto border border-slate-200 rounded-lg">
                      <table className="w-full text-left border-collapse text-[11px]">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase text-slate-500 font-bold">
                            <th className="p-2">Indice</th>
                            {trend.andamentoIndici[0]?.serie.map((p, i) => (
                              <th key={i} className="p-2 text-center">
                                {p.anno ?? 'N/D'}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-mono">
                          {trend.andamentoIndici.map((ind) => (
                            <tr
                              key={ind.codice}
                              className={ind.peggioratoUltimoPeriodo ? 'bg-rose-50' : ''}
                            >
                              <td className="p-2 font-bold text-slate-700 font-sans">
                                [{ind.codice}] {ind.nome}
                              </td>
                              {ind.serie.map((p, i) => (
                                <td
                                  key={i}
                                  className={`p-2 text-center ${
                                    p.esito === 'VIOLATO'
                                      ? 'text-rose-600 font-bold'
                                      : p.esito === 'OK'
                                        ? 'text-emerald-600'
                                        : 'text-slate-400'
                                  }`}
                                >
                                  {p.valore}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
