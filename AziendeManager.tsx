'use client';

// Import XBRL dello Scenario — qui avviene davvero il caricamento (l'unico
// punto della piattaforma dove si carica un file, coerente con quanto
// deciso: niente doppio caricamento in Aziende). Mostra solo le tab e solo
// gli indici configurati per l'azienda di questo scenario
// (Aziende → [azienda] → Configurazione XBRL / Indici) — gli scenari sono
// aziendali, quindi ereditano quella configurazione. Lo storico è salvato
// per azienda (condiviso tra tutti gli scenari della stessa azienda: i
// bilanci di un'azienda non dipendono da quale scenario li ha caricati).

import React, { useEffect, useState } from 'react';
import { useDichiaraContestoAssistente } from '@/components/ContestoAssistenteContext';
import {
  Upload,
  FileUp,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  Trash2,
  Save,
  TrendingUp,
} from 'lucide-react';
import {
  ottieniStoricoXbrlAzienda,
  salvaAnalisiXbrlAziendaAction,
  eliminaAnalisiXbrlAziendaAction,
  type BilancioStoricoAzienda,
} from '@/app/actions/xbrlAzienda';
import { ottieniTabXbrlAzienda, ottieniIndiciAzienda } from '@/app/actions/aziendaConfig';
import type { TabXbrlAzienda, IndiceAzienda } from '@/app/actions/aziendaConfig';
import { calcolaTrend, type PuntoStorico, type AndamentoIndice } from '@/lib/xbrl/trend';
import type { AnalisiXbrlResult, IndiceCcii } from '@/lib/xbrl/types';

interface Props {
  nomeSchema: string;
  aziendaId: number;
  scenarioId: number;
}

/**
 * Ricostruisce un AnalisiXbrlResult "di sola visualizzazione" dall'ultimo
 * bilancio già salvato — serve a mostrare il pannello completo (indici,
 * situazione debitoria...) quando si riapre la pagina di uno scenario
 * con XBRL già caricato in passato, senza dover rifare il parsing (il
 * file grezzo non viene conservato). Alcuni campi (anagrafica completa,
 * dato dell'anno precedente, metadati del parsing) non sono nello
 * storico salvato — restano a un valore neutro, non usato dal render del
 * pannello dettagli.
 */
function ricostruisciAnalisiDaStorico(bilancio: BilancioStoricoAzienda): AnalisiXbrlResult {
  const periodoVuoto = {
    ricaviVendite: 0,
    valoreProduzione: 0,
    costiProduzione: 0,
    ebit: 0,
    ammortamenti: 0,
    ebitda: 0,
    oneriFinanziari: 0,
    utileEsercizio: 0,
    totaleAttivo: 0,
    attivoCircolante: 0,
    disponibilitaLiquide: 0,
    immobilizzazioni: 0,
    patrimonioNetto: 0,
    totaleDebiti: 0,
    debitiBanche: 0,
    debitiFornitori: 0,
    debitiTributari: 0,
    debitiPrevidenziali: 0,
    passivoCorrente: 0,
    creditiClienti: 0,
  };
  return {
    meta: {
      nomeFile: bilancio.nomeFile || 'N/D',
      usatoFallbackMapping: false,
      numeroFactTotali: 0,
      numeroFactNonMappati: 0,
    },
    anagrafica: {
      ragioneSociale: '',
      codiceFiscale: '',
      indirizzo: '',
      codiceAteco: '',
      anagraficaIncompleta: true,
    },
    annoBilancio: bilancio.annoBilancio,
    corrente: bilancio.datiFinanziari,
    precedente: periodoVuoto,
    indici: bilancio.indici,
    altriIndici: bilancio.altriIndici,
    severity: bilancio.severity,
    situazioneDebitoria: bilancio.situazioneDebitoria,
    hasContoEconomico: true,
    factNonMappati: [],
    tuttiIFact: [],
    warnings: [],
  };
}

function formatEuro(val: number | null | undefined): string {
  if (val === null || val === undefined || Number.isNaN(val)) return '—';
  return val.toLocaleString('it-IT', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  });
}

function BadgeEsito({ esito }: { esito: IndiceCcii['esito'] }) {
  if (esito === 'OK')
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
        <CheckCircle2 className="w-3 h-3" /> Regolare
      </span>
    );
  if (esito === 'VIOLATO')
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[10px] font-bold">
        <AlertTriangle className="w-3 h-3" /> Violato
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-semibold">
      <HelpCircle className="w-3 h-3" /> Non calcolabile
    </span>
  );
}

function TabellaIndici({
  indici,
  codiciAbilitati,
}: {
  indici: IndiceCcii[];
  codiciAbilitati: Set<string>;
}) {
  const visibili = indici.filter((i) => codiciAbilitati.has(i.codice));
  if (indici.length === 0) {
    return <p className="text-xs text-slate-400 italic p-4">Nessun indice presente nel file.</p>;
  }
  if (visibili.length === 0) {
    return (
      <p className="text-xs text-slate-400 italic p-4">
        Nessun indice di questa categoria è abilitato per questa azienda — configurali in Aziende →
        questa azienda → Indici.
      </p>
    );
  }
  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="bg-slate-100 text-[9px] font-bold text-slate-600 border-b border-slate-200 uppercase">
            <th className="p-2.5">Indicatore</th>
            <th className="p-2.5 text-center">Valore</th>
            <th className="p-2.5 text-center">Soglia</th>
            <th className="p-2.5 text-center">Esito</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 text-xs">
          {visibili.map((ind) => (
            <tr key={ind.codice} className="hover:bg-slate-50">
              <td className="p-2.5 font-bold text-slate-800">
                {ind.codice} — {ind.nome}
              </td>
              <td className="p-2.5 text-center font-mono font-bold text-slate-900">
                {typeof ind.valore === 'number'
                  ? ind.valore.toLocaleString('it-IT', { maximumFractionDigits: 2 })
                  : ind.valore}
              </td>
              <td className="p-2.5 text-center text-slate-500 font-mono">{ind.soglia}</td>
              <td className="p-2.5 text-center">
                <BadgeEsito esito={ind.esito} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ScenarioXbrlManager({ nomeSchema, aziendaId, scenarioId }: Props) {
  useDichiaraContestoAssistente({ pagina: 'xbrl', nomeSchema, scenarioId });
  const [tab, setTab] = useState<TabXbrlAzienda[]>([]);
  const [indiciAzienda, setIndiciAzienda] = useState<IndiceAzienda[]>([]);
  const [tabAttiva, setTabAttiva] = useState<string>('');
  const [storico, setStorico] = useState<BilancioStoricoAzienda[]>([]);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);

  const [caricamentoFile, setCaricamentoFile] = useState(false);
  const [analisi, setAnalisi] = useState<AnalisiXbrlResult | null>(null);
  const [erroreParsing, setErroreParsing] = useState<string | null>(null);
  const [salvataggio, setSalvataggio] = useState(false);
  const [salvato, setSalvato] = useState(false);
  const [atecoAggiornato, setAtecoAggiornato] = useState<{
    precedente: string | null;
    nuovo: string;
  } | null>(null);

  const carica = async () => {
    setCaricamento(true);
    try {
      const [risultatoTab, risultatoIndici, risultatoStorico] = await Promise.all([
        ottieniTabXbrlAzienda(nomeSchema, aziendaId),
        ottieniIndiciAzienda(nomeSchema, aziendaId),
        ottieniStoricoXbrlAzienda(nomeSchema, aziendaId),
      ]);
      if (risultatoTab.success) {
        const abilitate = risultatoTab.tab.filter((t) => t.abilitato);
        setTab(abilitate);
        if (abilitate.length > 0) setTabAttiva(abilitate[0].codice);
      } else {
        setErrore(risultatoTab.error || 'Impossibile caricare la configurazione delle tab.');
      }
      if (risultatoIndici.success) setIndiciAzienda(risultatoIndici.indici);
      if (risultatoStorico.success) {
        setStorico(risultatoStorico.storico);
        // Riaprire la pagina di uno scenario con XBRL già caricato in
        // passato non deve mostrare solo il riepilogo sommario ("1
        // bilancio già caricato") — il pannello con indici, tab e
        // situazione debitoria deve essere visibile subito, non solo
        // subito dopo un caricamento fresco nella stessa sessione.
        if (risultatoStorico.storico.length > 0 && !analisi) {
          const ultimo = [...risultatoStorico.storico].sort(
            (a, b) => (b.annoBilancio || 0) - (a.annoBilancio || 0)
          )[0];
          setAnalisi(ricostruisciAnalisiDaStorico(ultimo));
        }
      }
    } finally {
      setCaricamento(false);
    }
  };

  useEffect(() => {
    carica();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nomeSchema, aziendaId]);

  const codiciAbilitati = new Set(indiciAzienda.filter((i) => i.abilitato).map((i) => i.codice));

  const handleFile = async (file: File) => {
    setCaricamentoFile(true);
    setErroreParsing(null);
    setAnalisi(null);
    setSalvato(false);
    setAtecoAggiornato(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const risposta = await fetch('/api/xbrl/parse', { method: 'POST', body: formData });
      const corpo = await risposta.json();
      if (!risposta.ok || corpo.error) {
        setErroreParsing(corpo.error || "Errore durante l'elaborazione del file.");
        return;
      }
      const {
        meta,
        anagrafica,
        annoBilancio,
        corrente,
        precedente,
        indici,
        altriIndici,
        severity,
        situazioneDebitoria,
        hasContoEconomico,
        factNonMappati,
        tuttiIFact,
        warnings,
      } = corpo;
      setAnalisi({
        meta,
        anagrafica,
        annoBilancio,
        corrente,
        precedente,
        indici,
        altriIndici,
        severity,
        situazioneDebitoria,
        hasContoEconomico,
        factNonMappati,
        tuttiIFact,
        warnings,
      });
    } catch (error: any) {
      setErroreParsing(`Errore durante il caricamento: ${error.message || error}`);
    } finally {
      setCaricamentoFile(false);
    }
  };

  const handleSalva = async () => {
    if (!analisi) return;
    setSalvataggio(true);
    try {
      // Salva SEMPRE l'analisi completa (tutti i 9 indici), non filtrata:
      // la configurazione per azienda decide cosa mostrare, non cosa
      // conservare — se cambia in futuro, lo storico non va ricaricato.
      const risultato = await salvaAnalisiXbrlAziendaAction(nomeSchema, aziendaId, analisi);
      if (!risultato.success) {
        setErroreParsing(risultato.error || 'Impossibile salvare nello storico.');
        return;
      }
      setSalvato(true);
      setAtecoAggiornato(risultato.atecoAggiornato || null);
      const risultatoStorico = await ottieniStoricoXbrlAzienda(nomeSchema, aziendaId);
      if (risultatoStorico.success) setStorico(risultatoStorico.storico);
    } finally {
      setSalvataggio(false);
    }
  };

  const handleElimina = async (id: number) => {
    await eliminaAnalisiXbrlAziendaAction(nomeSchema, id);
    setStorico((prev) => prev.filter((s) => s.id !== id));
  };

  if (caricamento) return <p className="text-xs text-slate-400">Caricamento...</p>;

  const puntiStorico: PuntoStorico[] = storico.map((s) => ({
    anno: s.annoBilancio,
    indici: s.indici,
    severity: s.severity,
    situazioneDebitoria: s.situazioneDebitoria,
  }));
  const trend =
    puntiStorico.length >= 2
      ? calcolaTrend(puntiStorico.slice(0, -1), puntiStorico[puntiStorico.length - 1])
      : null;
  const andamentoFiltrato: AndamentoIndice[] | undefined = trend?.andamentoIndici.filter((a) =>
    codiciAbilitati.has(a.codice)
  );

  return (
    <div className="space-y-6">
      {errore && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          {errore}
        </div>
      )}

      {/* Sempre visibile, indipendentemente da quali tab sono abilitate:
          prima non c'era alcun segnale che un bilancio fosse già stato
          caricato — si arrivava qui e si trovava solo il form vuoto. */}
      {storico.length > 0 && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
            <div>
              <p className="text-xs font-bold text-emerald-800">
                {storico.length === 1
                  ? '1 bilancio già caricato per questa azienda'
                  : `${storico.length} bilanci già caricati per questa azienda`}
              </p>
              <p className="text-[11px] text-emerald-700">
                Ultimo: anno {storico[storico.length - 1].annoBilancio ?? 'n/d'} — severità{' '}
                {storico[storico.length - 1].severity} — file:{' '}
                {storico[storico.length - 1].nomeFile || 'n/d'}
              </p>
            </div>
          </div>
          {tab.some((t) => t.codice === 'storico') && (
            <button
              type="button"
              onClick={() => setTabAttiva('storico')}
              className="text-[10px] font-bold uppercase text-emerald-800 hover:text-emerald-900 underline shrink-0"
            >
              Vedi storico
            </button>
          )}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-2">
          <FileUp className="w-4 h-4 text-blue-600" />
          <h2 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
            Carica bilancio XBRL
          </h2>
        </div>
        <p className="text-[11px] text-slate-500">
          Carica un file .xbrl o .xml: viene analizzato subito (senza salvare). Le tab e gli indici
          mostrati sono solo quelli configurati per questa azienda.
        </p>
        <label className="inline-flex items-center gap-2 px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-[11px] uppercase rounded-lg cursor-pointer transition-colors w-fit">
          <Upload className="w-3.5 h-3.5" />
          {caricamentoFile ? 'Analisi in corso...' : 'Scegli file'}
          <input
            type="file"
            accept=".xbrl,.xml"
            className="hidden"
            disabled={caricamentoFile}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
              e.target.value = '';
            }}
          />
        </label>
        {erroreParsing && (
          <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
            {erroreParsing}
          </div>
        )}
      </div>

      {analisi && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2 border-b border-slate-100 pb-3">
            <div>
              <h3 className="font-bold text-slate-900 text-sm">
                {analisi.anagrafica.ragioneSociale || 'Analisi caricata'}
              </h3>
              <p className="text-[11px] text-slate-500">
                Anno bilancio: {analisi.annoBilancio ?? 'non determinato'} — File:{' '}
                {analisi.meta.nomeFile}
              </p>
            </div>
            <button
              type="button"
              onClick={handleSalva}
              disabled={salvataggio}
              className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-bold text-[10px] uppercase rounded-lg transition-colors"
            >
              <Save className="w-3.5 h-3.5" />
              {salvataggio ? 'Salvataggio...' : 'Salva nello storico'}
            </button>
          </div>
          {salvato && (
            <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
              Bilancio salvato nello storico dell&apos;azienda.
            </div>
          )}
          {atecoAggiornato && (
            <div className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-lg p-3">
              Codice ATECO dell&apos;azienda aggiornato da{' '}
              <strong>{atecoAggiornato.precedente || 'non impostato'}</strong> a{' '}
              <strong>{atecoAggiornato.nuovo}</strong>, in base al file XBRL appena caricato (fonte
              CCIAA, prevale su un valore inserito manualmente).
            </div>
          )}

          {tab.length > 0 ? (
            <>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {tab.map((t) => (
                  <button
                    key={t.codice}
                    type="button"
                    onClick={() => setTabAttiva(t.codice)}
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-bold whitespace-nowrap transition-colors shrink-0 ${
                      tabAttiva === t.codice
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-50 border border-slate-200 text-slate-600 hover:border-blue-300'
                    }`}
                  >
                    {t.etichetta}
                  </button>
                ))}
              </div>

              {tabAttiva === 'cndec' && (
                <TabellaIndici indici={analisi.indici} codiciAbilitati={codiciAbilitati} />
              )}
              {tabAttiva === 'altri_indici' && (
                <TabellaIndici indici={analisi.altriIndici} codiciAbilitati={codiciAbilitati} />
              )}
              {tabAttiva === 'debitoria' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <div className="bg-slate-100 p-2.5 border-b border-slate-200 font-bold text-slate-700 uppercase text-[10px]">
                      Dettaglio Debiti
                    </div>
                    <table className="w-full text-left text-xs">
                      <tbody className="divide-y divide-slate-100">
                        <tr>
                          <td className="p-2.5 text-slate-600">Debiti verso Banche</td>
                          <td className="p-2.5 text-right font-bold text-slate-900">
                            {formatEuro(analisi.situazioneDebitoria.debitiBanche)}
                          </td>
                        </tr>
                        <tr>
                          <td className="p-2.5 text-slate-600">Debiti verso Fornitori</td>
                          <td className="p-2.5 text-right font-bold text-slate-900">
                            {formatEuro(analisi.situazioneDebitoria.debitiFornitori)}
                          </td>
                        </tr>
                        <tr>
                          <td className="p-2.5 text-slate-600">Debiti Tributari</td>
                          <td className="p-2.5 text-right font-bold text-amber-700">
                            {formatEuro(analisi.situazioneDebitoria.debitiTributari)}
                          </td>
                        </tr>
                        <tr>
                          <td className="p-2.5 text-slate-600">Debiti Previdenziali</td>
                          <td className="p-2.5 text-right font-bold text-amber-700">
                            {formatEuro(analisi.situazioneDebitoria.debitiPrevidenziali)}
                          </td>
                        </tr>
                        <tr>
                          <td className="p-2.5 text-slate-600">Altri Debiti</td>
                          <td className="p-2.5 text-right font-bold text-slate-900">
                            {formatEuro(analisi.situazioneDebitoria.altriDebiti)}
                          </td>
                        </tr>
                        <tr className="bg-slate-50 font-black text-slate-900">
                          <td className="p-2.5 uppercase">Totale Debiti</td>
                          <td className="p-2.5 text-right">
                            {formatEuro(analisi.situazioneDebitoria.totaleDebiti)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <div className="space-y-3">
                    <div className="bg-slate-900 text-white p-4 rounded-lg space-y-1.5">
                      <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block">
                        Posizione Finanziaria Netta (PFN)
                      </span>
                      <div className="text-xl font-black">
                        {formatEuro(analisi.situazioneDebitoria.pfn)}
                      </div>
                    </div>
                    <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg space-y-1.5">
                      <span className="text-[10px] text-blue-800 uppercase font-bold block">
                        Disponibilità Liquide
                      </span>
                      <div className="text-lg font-bold text-blue-900">
                        {formatEuro(analisi.situazioneDebitoria.disponibilitaLiquide)}
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {tabAttiva === 'storico' && (
                <StoricoAzienda
                  storico={storico}
                  andamentoFiltrato={andamentoFiltrato}
                  direzioneSeverity={trend?.direzioneSeverity}
                  segnalazioni={trend?.segnalazioni}
                  onElimina={handleElimina}
                />
              )}
            </>
          ) : (
            <p className="text-xs text-slate-400 italic">
              Nessuna tab attiva per questa azienda — configurale in Aziende → questa azienda →
              Configurazione XBRL.
            </p>
          )}
        </div>
      )}

      {!analisi && tab.some((t) => t.codice === 'storico') && storico.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <TrendingUp className="w-4 h-4 text-blue-600" />
            <h2 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
              Andamento storico
            </h2>
          </div>
          <StoricoAzienda
            storico={storico}
            andamentoFiltrato={andamentoFiltrato}
            direzioneSeverity={trend?.direzioneSeverity}
            segnalazioni={trend?.segnalazioni}
            onElimina={handleElimina}
          />
        </div>
      )}
    </div>
  );
}

function StoricoAzienda({
  storico,
  andamentoFiltrato,
  direzioneSeverity,
  segnalazioni,
  onElimina,
}: {
  storico: BilancioStoricoAzienda[];
  andamentoFiltrato?: AndamentoIndice[];
  direzioneSeverity?: string;
  segnalazioni?: string[];
  onElimina: (id: number) => void;
}) {
  const [selezionati, setSelezionati] = useState<Set<number>>(new Set());
  const [eliminazioneInCorso, setEliminazioneInCorso] = useState(false);

  if (storico.length === 0) {
    return (
      <p className="text-xs text-slate-400 italic p-2">
        Nessun bilancio ancora salvato nello storico di questa azienda.
      </p>
    );
  }

  const toggleSelezione = (id: number) => {
    setSelezionati((prev) => {
      const nuovo = new Set(prev);
      if (nuovo.has(id)) nuovo.delete(id);
      else nuovo.add(id);
      return nuovo;
    });
  };

  const toggleSelezionaTutti = () => {
    setSelezionati((prev) =>
      prev.size === storico.length ? new Set() : new Set(storico.map((s) => s.id))
    );
  };

  const handleEliminaSelezionati = async () => {
    if (selezionati.size === 0) return;
    const conferma = window.confirm(
      `Eliminare ${selezionati.size} bilanci${selezionati.size === 1 ? 'o' : ''} selezionat${selezionati.size === 1 ? 'o' : 'i'} dallo storico? L'operazione non è reversibile.`
    );
    if (!conferma) return;
    setEliminazioneInCorso(true);
    try {
      for (const id of selezionati) {
        onElimina(id);
      }
      setSelezionati(new Set());
    } finally {
      setEliminazioneInCorso(false);
    }
  };

  return (
    <div className="space-y-4">
      {selezionati.size > 0 && (
        <div className="flex items-center justify-between bg-red-50 border border-red-200 rounded-lg p-2.5">
          <span className="text-[11px] font-bold text-red-800">
            {selezionati.size} selezionat{selezionati.size === 1 ? 'o' : 'i'}
          </span>
          <button
            type="button"
            onClick={handleEliminaSelezionati}
            disabled={eliminazioneInCorso}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-red-600 hover:bg-red-700 disabled:bg-slate-300 text-white font-bold text-[9px] uppercase rounded transition-colors"
          >
            <Trash2 className="w-3 h-3" />
            {eliminazioneInCorso ? 'Eliminazione...' : 'Elimina selezionati'}
          </button>
        </div>
      )}
      <div className="border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-100 text-[9px] font-bold text-slate-600 border-b border-slate-200 uppercase">
              <th className="p-2.5 w-8">
                <input
                  type="checkbox"
                  checked={selezionati.size === storico.length}
                  onChange={toggleSelezionaTutti}
                  aria-label="Seleziona tutti i bilanci"
                />
              </th>
              <th className="p-2.5">Anno</th>
              <th className="p-2.5">File</th>
              <th className="p-2.5 text-center">Severità</th>
              <th className="p-2.5 text-center">Azioni</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-xs">
            {storico.map((s) => (
              <tr key={s.id} className="hover:bg-slate-50">
                <td className="p-2.5">
                  <input
                    type="checkbox"
                    checked={selezionati.has(s.id)}
                    onChange={() => toggleSelezione(s.id)}
                    aria-label={`Seleziona bilancio anno ${s.annoBilancio}`}
                  />
                </td>
                <td className="p-2.5 font-bold text-slate-900">{s.annoBilancio ?? '—'}</td>
                <td className="p-2.5 text-slate-500">{s.nomeFile || '—'}</td>
                <td className="p-2.5 text-center">
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      s.severity === 'GREEN'
                        ? 'bg-emerald-100 text-emerald-800'
                        : s.severity === 'YELLOW'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-rose-100 text-rose-800'
                    }`}
                  >
                    {s.severity}
                  </span>
                </td>
                <td className="p-2.5 text-center">
                  <button
                    type="button"
                    onClick={() => onElimina(s.id)}
                    className="text-slate-400 hover:text-red-600 transition-colors"
                    title="Elimina dallo storico"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {direzioneSeverity && (
        <div className="space-y-2">
          <p className="text-[11px] font-bold text-slate-500 uppercase">
            Direzione: {direzioneSeverity}
          </p>
          {segnalazioni && segnalazioni.length > 0 && (
            <ul className="text-[11px] text-slate-600 list-disc list-inside space-y-0.5">
              {segnalazioni.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {andamentoFiltrato && andamentoFiltrato.length > 0 && (
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <div className="bg-slate-100 p-2.5 border-b border-slate-200 font-bold text-slate-700 uppercase text-[10px]">
            Andamento indici (solo quelli abilitati per l&apos;azienda)
          </div>
          <table className="w-full text-left text-xs">
            <tbody className="divide-y divide-slate-100">
              {andamentoFiltrato.map((a) => (
                <tr key={a.codice}>
                  <td className="p-2.5 font-bold text-slate-800">
                    {a.codice} — {a.nome}
                  </td>
                  <td className="p-2.5 text-right font-mono">
                    {a.serie
                      .map((p) => (typeof p.valore === 'number' ? p.valore.toFixed(2) : p.valore))
                      .join(' → ')}
                  </td>
                  <td className="p-2.5 text-center">
                    {a.peggioratoUltimoPeriodo && (
                      <span className="text-[10px] font-bold text-rose-700">Peggiorato</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
