'use client';

// ISTRUTTORIA DEL PROVVEDIMENTO (0.170.0) — decreto di liquidazione o cram
// down. Tre passi, come per la proposta, ma con un esito diverso: qui non si
// dice se una proposta è ricevibile, si dice quanto il provvedimento del
// giudice si discosta dai dati dell'ente, quanto costa quella distanza in
// termini di perdita e se ci sono elementi che meritano una contestazione.
//
// Il confronto e la perdita sono calcolati dal modulo puro, non dall'AI: il
// testo che si legge in fondo è la spiegazione di quei numeri, non la loro
// fonte. Per questo la tabella resta visibile anche dopo la generazione.

import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  FileText,
  RefreshCw,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import {
  caricaDocumentiProvvedimentoAction,
  generaAnalisiCriticaAction,
  ottieniIstruttoriaGiudiceAction,
  type DocumentoProvvedimento,
  type StatoIstruttoriaGiudice,
} from '@/app/actions/istruttoriaGiudice';
import { ETICHETTA_ATTO, type TipoAttoGiudice } from '@/lib/giudice/lettura';
import { useDemo } from '@/components/spazio/DemoUploadProvider';
import type { ConfrontoProvvedimento as Confronto } from '@/lib/giudice/confronto';

const euro = (n: number | null) =>
  n === null
    ? '—'
    : n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 });

const percentuale = (n: number | null) =>
  n === null ? '—' : `${n.toLocaleString('it-IT', { maximumFractionDigits: 2 })}%`;

const ESITO: Record<string, { etichetta: string; classe: string }> = {
  CONFORME: { etichetta: 'Conforme', classe: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  MINORE: { etichetta: 'Minore', classe: 'bg-red-50 text-red-800 border-red-200' },
  MAGGIORE: { etichetta: 'Maggiore', classe: 'bg-amber-50 text-amber-900 border-amber-200' },
  NON_RISCONTRATO: {
    etichetta: 'Non riscontrato',
    classe: 'bg-red-50 text-red-800 border-red-200',
  },
  NON_PRESENTE_NEI_DATI_ENTE: {
    etichetta: 'Non nei dati ente',
    classe: 'bg-slate-50 text-slate-700 border-slate-200',
  },
};

interface Props {
  nomeSchema: string;
  scenarioId: number;
  codice: string;
  tipoAtto: Exclude<TipoAttoGiudice, 'PROPOSTA'>;
}

export function IstruttoriaProvvedimento({ nomeSchema, scenarioId, codice, tipoAtto }: Props) {
  const demo = useDemo();
  const [stato, setStato] = useState<StatoIstruttoriaGiudice | null>(null);
  const [caricamento, setCaricamento] = useState(true);
  const [fileScelti, setFileScelti] = useState<File[]>([]);
  const [letturaInCorso, setLetturaInCorso] = useState(false);
  const [generazioneInCorso, setGenerazioneInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [copiaFatta, setCopiaFatta] = useState(false);

  const carica = async () => {
    const esito = await ottieniIstruttoriaGiudiceAction(nomeSchema, scenarioId);
    if (esito.success) setStato(esito);
    else setErrore(esito.error || "Impossibile caricare l'istruttoria.");
    setCaricamento(false);
  };

  useEffect(() => {
    void carica();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nomeSchema, scenarioId]);

  const handleScegli = (lista: FileList | null) => {
    setErrore(null);
    if (!lista) return;
    const nuovi: File[] = [];
    for (const f of Array.from(lista)) {
      if (f.type !== 'application/pdf' && !f.name.toLowerCase().endsWith('.pdf')) {
        setErrore(`«${f.name}» non è un PDF: carica il provvedimento e gli allegati in PDF.`);
        continue;
      }
      nuovi.push(f);
    }
    setFileScelti((prev) => {
      const nomi = new Set(prev.map((f) => f.name));
      return [...prev, ...nuovi.filter((f) => !nomi.has(f.name))];
    });
  };

  const handleCarica = async () => {
    if (fileScelti.length === 0) return;
    setLetturaInCorso(true);
    setErrore(null);
    try {
      const caricati: DocumentoProvvedimento[] = [];
      for (const file of fileScelti) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('codice', codice);
        const risposta = await fetch('/api/blob-upload', { method: 'POST', body: formData });
        const corpo = await risposta.json();
        if (!risposta.ok || corpo.error) {
          setErrore(corpo.error || `Impossibile caricare «${file.name}».`);
          return;
        }
        caricati.push({ nome: file.name, url: corpo.url });
      }
      const esito = await caricaDocumentiProvvedimentoAction(nomeSchema, scenarioId, caricati);
      if (!esito.success) {
        setErrore(esito.error || 'Lettura non riuscita.');
        return;
      }
      setStato(esito);
      setFileScelti([]);
    } catch (error: unknown) {
      setErrore((error as Error).message || 'Errore durante il caricamento.');
    } finally {
      setLetturaInCorso(false);
    }
  };

  const handleGenera = async () => {
    setGenerazioneInCorso(true);
    setErrore(null);
    const esito = await generaAnalisiCriticaAction(nomeSchema, scenarioId);
    if (!esito.success || !esito.relazione) {
      setErrore(esito.error || "Impossibile generare l'analisi.");
    } else {
      setStato((prev) => (prev ? { ...prev, relazione: esito.relazione, documenti: [] } : prev));
    }
    setGenerazioneInCorso(false);
  };

  if (caricamento) return <p className="text-xs text-slate-400">Caricamento…</p>;

  const confronto: Confronto | null = stato?.confronto ?? null;
  const lettura = stato?.lettura ?? null;
  const haDocumenti = (stato?.documenti?.length ?? 0) > 0;
  const puoGenerare = Boolean(stato?.confronto && !stato.relazione);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-sky-700">
          {ETICHETTA_ATTO[tipoAtto]}
        </p>
        <h2 className="font-bold text-slate-900 uppercase text-xs tracking-wider mt-1">
          Istruttoria del provvedimento
        </h2>
        <p className="text-[11px] text-slate-500 mt-1 max-w-4xl leading-relaxed">
          Carica il provvedimento e gli allegati. La piattaforma legge i crediti che il giudice ha
          riconosciuto, li confronta voce per voce con la posizione debitoria dell’ente e calcola la
          perdita; l’analisi critica spiega quei numeri. Qui non si valuta una proposta e non si
          esprime un parere legale.
        </p>
        {demo && (
          <p className="text-[11px] text-sky-900 bg-sky-50 border border-sky-200 rounded-lg p-3 mt-2 leading-relaxed">
            <span className="font-bold">Percorso demo.</span> Il provvedimento, la lettura dei
            crediti e il confronto sono già predisposti: non serve caricare file reali e l’analisi
            critica è già scritta.
          </p>
        )}
      </div>

      {errore && (
        <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <p>{errore}</p>
        </div>
      )}

      {stato?.posizioneAssente && (
        <div className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-3 leading-relaxed">
          Non c’è ancora una posizione debitoria dell’ente per questa azienda: il confronto sarà
          vuoto. Caricala prima in{' '}
          <a
            className="font-bold underline"
            href={`/spazio/${codice}/scenari/${scenarioId}/situazione-debitoria`}
          >
            Situazione debitoria
          </a>
          .
        </div>
      )}

      {/* 1 · Documenti */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <span className="w-5 h-5 rounded-full bg-slate-900 text-white text-[10px] font-bold flex items-center justify-center">
            1
          </span>
          <h3 className="font-bold text-slate-900 uppercase text-[11px] tracking-wider">
            Provvedimento e documenti
          </h3>
        </div>

        {haDocumenti ? (
          <div className="space-y-2">
            <p className="text-[11px] text-slate-500">
              Documenti letti. I file sono stati eliminati dopo la lettura: restano i dati estratti
              e il confronto.
            </p>
            <ul className="text-xs text-slate-700 space-y-1">
              {stato?.documenti?.map((d) => (
                <li key={d.url}>
                  <FileText className="w-3.5 h-3.5 text-slate-400 inline mr-1" />
                  {demo ? (
                    <a
                      href={d.url}
                      target="_blank"
                      rel="noreferrer"
                      className="font-bold text-sky-700 hover:underline"
                    >
                      {d.nome}
                    </a>
                  ) : (
                    d.nome
                  )}
                </li>
              ))}
            </ul>
            <p className="text-[10px] text-slate-400">
              Lettura del{' '}
              {stato?.letturaIl ? new Date(stato.letturaIl).toLocaleString('it-IT') : '—'}
            </p>
          </div>
        ) : (
          <>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Carica insieme il provvedimento e ciò che lo correda: stato passivo, perizia o
              relazione del commissario, piano. Più documenti aiutano a leggere crediti, percentuali
              e tempi; se il decreto non contiene lo stato passivo, il confronto lo dirà.
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
              onClick={handleCarica}
              disabled={letturaInCorso || fileScelti.length === 0}
              className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white font-bold uppercase tracking-wider rounded-lg text-xs transition-colors"
            >
              {letturaInCorso ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Upload className="w-3.5 h-3.5" />
              )}
              {letturaInCorso
                ? 'Lettura in corso… (fino a due minuti)'
                : 'Carica e leggi il provvedimento'}
            </button>
          </>
        )}

        {lettura && (
          <div className="border-t border-slate-100 pt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <p className="text-[10px] uppercase font-bold text-slate-500">Data atto</p>
              <p className="text-slate-900">
                {lettura.dataAtto
                  ? lettura.dataAtto.split('-').reverse().join('/')
                  : 'non indicata'}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-slate-500">Spese procedura</p>
              <p className="text-slate-900">{percentuale(lettura.speseProceduraPct)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-slate-500">Tempi</p>
              <p className="text-slate-900">
                {lettura.tempiMesi === null ? 'non indicati' : `${lettura.tempiMesi} mesi`}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-slate-500">Crediti letti</p>
              <p className="text-slate-900 tabular-nums">{lettura.crediti.length}</p>
            </div>
          </div>
        )}
      </div>

      {/* 2 · Confronto */}
      {confronto && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-slate-900 text-white text-[10px] font-bold flex items-center justify-center">
              2
            </span>
            <h3 className="font-bold text-slate-900 uppercase text-[11px] tracking-wider">
              Confronto con la posizione dell’ente
            </h3>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              ['Credito a ruolo', euro(confronto.creditoEnte)],
              ['Ammesso dal giudice', euro(confronto.ammessoGiudice)],
              [
                'Recupero atteso',
                confronto.recuperoAtteso === null
                  ? 'non calcolabile'
                  : euro(confronto.recuperoAtteso),
              ],
              [
                'Perdita',
                confronto.perditaTotale === null
                  ? 'non calcolabile'
                  : euro(confronto.perditaTotale),
              ],
            ].map(([etichetta, valore]) => (
              <div key={etichetta} className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                <p className="text-[9px] uppercase font-bold text-slate-500">{etichetta}</p>
                <p className="text-sm font-bold text-slate-900 tabular-nums mt-1">{valore}</p>
              </div>
            ))}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-slate-500">
                  <th className="border-b border-slate-200 px-2 py-2">Voce</th>
                  <th className="border-b border-slate-200 px-2 py-2">Ente</th>
                  <th className="border-b border-slate-200 px-2 py-2">Giudice</th>
                  <th className="border-b border-slate-200 px-2 py-2">Differenza</th>
                  <th className="border-b border-slate-200 px-2 py-2">Esito</th>
                  <th className="border-b border-slate-200 px-2 py-2">Recupero</th>
                </tr>
              </thead>
              <tbody>
                {confronto.voci.map((v, i) => {
                  const esito = ESITO[v.esito] ?? ESITO.NON_PRESENTE_NEI_DATI_ENTE;
                  return (
                    <tr key={`${v.voce}-${i}`} className="align-top">
                      <td className="border-b border-slate-100 px-2 py-2">
                        <p className="font-bold text-slate-800">{v.voce}</p>
                        {v.voceGiudice && v.voceGiudice !== v.voce && (
                          <p className="text-[10px] text-slate-500">
                            nel provvedimento: {v.voceGiudice}
                          </p>
                        )}
                        {v.rango && <p className="text-[10px] text-slate-500">{v.rango}</p>}
                      </td>
                      <td className="border-b border-slate-100 px-2 py-2 tabular-nums text-slate-700">
                        {euro(v.importoEnte)}
                      </td>
                      <td className="border-b border-slate-100 px-2 py-2 tabular-nums text-slate-700">
                        {euro(v.importoGiudice)}
                      </td>
                      <td className="border-b border-slate-100 px-2 py-2 tabular-nums text-slate-700">
                        {euro(v.differenza)}
                        {v.differenzaPct !== null && (
                          <span className="text-[10px] text-slate-500">
                            {' '}
                            ({percentuale(v.differenzaPct)})
                          </span>
                        )}
                      </td>
                      <td className="border-b border-slate-100 px-2 py-2">
                        <span
                          className={`inline-block border rounded px-1.5 py-0.5 text-[10px] font-bold ${esito.classe}`}
                        >
                          {esito.etichetta}
                        </span>
                      </td>
                      <td className="border-b border-slate-100 px-2 py-2 tabular-nums text-slate-700">
                        {euro(v.realizzoAtteso)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {confronto.totaliRango.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-wider text-slate-500">
                    <th className="border-b border-slate-200 px-2 py-2">Rango</th>
                    <th className="border-b border-slate-200 px-2 py-2">Ente</th>
                    <th className="border-b border-slate-200 px-2 py-2">Ammesso</th>
                    <th className="border-b border-slate-200 px-2 py-2">Recupero</th>
                    <th className="border-b border-slate-200 px-2 py-2">Perdita</th>
                  </tr>
                </thead>
                <tbody>
                  {confronto.totaliRango.map((t) => (
                    <tr key={t.rango}>
                      <td className="border-b border-slate-100 px-2 py-1.5 font-bold text-slate-800">
                        {t.rango === 'NON_INDICATO' ? 'Rango non indicato' : t.rango}
                      </td>
                      <td className="border-b border-slate-100 px-2 py-1.5 tabular-nums">
                        {euro(t.importoEnte)}
                      </td>
                      <td className="border-b border-slate-100 px-2 py-1.5 tabular-nums">
                        {euro(t.ammessoGiudice)}
                      </td>
                      <td className="border-b border-slate-100 px-2 py-1.5 tabular-nums">
                        {t.recuperoAtteso === null ? 'non calcolabile' : euro(t.recuperoAtteso)}
                      </td>
                      <td className="border-b border-slate-100 px-2 py-1.5 tabular-nums">
                        {t.perdita === null ? 'non calcolabile' : euro(t.perdita)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {confronto.avvisi.length > 0 && (
            <ul className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-1 leading-relaxed">
              {confronto.avvisi.map((a) => (
                <li key={a}>• {a}</li>
              ))}
            </ul>
          )}

          {confronto.elementiContestabili.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                Elementi che possono fondare una contestazione
              </p>
              <ul className="space-y-1 text-[11px] text-slate-700">
                {confronto.elementiContestabili.map((e) => (
                  <li key={`${e.voce}-${e.motivo}`} className="flex gap-2">
                    <span className="text-red-700 font-bold shrink-0">{euro(e.importo)}</span>
                    <span>{e.motivo}</span>
                  </li>
                ))}
              </ul>
              <p className="text-[10px] text-slate-400 mt-2 leading-relaxed">
                Sono difformità da verificare, non una qualificazione giuridica: la valutazione del
                rimedio resta al legale dell’ente.
              </p>
            </div>
          )}
        </div>
      )}

      {/* 3 · Analisi */}
      {confronto && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-slate-900 text-white text-[10px] font-bold flex items-center justify-center">
                3
              </span>
              <h3 className="font-bold text-slate-900 uppercase text-[11px] tracking-wider">
                Analisi critica e perdita
              </h3>
            </div>
            {stato?.relazione && (
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(stato?.relazione ?? '');
                  setCopiaFatta(true);
                  setTimeout(() => setCopiaFatta(false), 2000);
                }}
                className="flex items-center gap-1 text-[10px] font-bold uppercase text-sky-700 hover:underline"
              >
                {copiaFatta ? (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                {copiaFatta ? 'Copiato' : 'Copia'}
              </button>
            )}
          </div>

          {stato?.relazione ? (
            <>
              <div className="text-xs text-slate-800 whitespace-pre-wrap leading-relaxed border border-slate-100 rounded-lg p-4 bg-slate-50">
                {stato.relazione}
              </div>
              {demo ? (
                <p className="text-[10px] font-bold uppercase text-emerald-700">
                  Analisi demo già predisposta
                </p>
              ) : (
                <button
                  type="button"
                  onClick={handleGenera}
                  disabled={generazioneInCorso}
                  className="text-[10px] font-bold uppercase text-sky-700 hover:underline disabled:text-slate-400"
                >
                  Rigenera l’analisi
                </button>
              )}
            </>
          ) : (
            <>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                L’analisi spiega le difformità, la perdita e gli elementi da verificare. Non
                ricalcola nulla: i numeri sono quelli del confronto qui sopra.
              </p>
              <button
                type="button"
                onClick={handleGenera}
                disabled={generazioneInCorso || !puoGenerare}
                className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white font-bold uppercase tracking-wider rounded-lg text-xs transition-colors"
              >
                {generazioneInCorso ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                {generazioneInCorso ? 'Analisi in corso…' : 'Genera l’analisi critica'}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
