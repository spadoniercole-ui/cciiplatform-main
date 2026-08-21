'use client';

// Gestione Scenari: selezione azienda → elenco/creazione dei suoi scenari
// → ingresso nel contesto di uno scenario (Check List, e in futuro Indici,
// XBRL, Report). Un unico punto di ingresso, non più un selettore
// duplicato in ogni singola pagina di analisi.

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, FolderOpen, Building2, Archive, ArchiveRestore, Trash2 } from 'lucide-react';
import { ottieniAziende, type Azienda } from '@/app/actions/aziende';
import {
  ottieniScenari,
  creaScenarioAction,
  archiviaScenarioAction,
  eliminaScenarioAction,
  type Scenario,
} from '@/app/actions/scenari';
import { ORIGINI_PER_TIPO, type TipoProposta } from '@/lib/origineProposta';

interface Props {
  codiceSpazio: string;
  nomeSchema: string;
  /** Se presente (Operatore/Consultatore), limita le aziende selezionabili a queste. */
  aziendeConsentite?: number[];
  /** ENTE non redige mai proposte, le riceve sempre — condiziona la scelta di default in creazione, vedi sotto. */
  tipoSpazio: 'ENTE' | 'NON_ENTE';
}

/** Timeout esplicito: stesso principio già applicato in ChecklistManager —
 * una chiamata sospesa senza mai risolversi né rifiutarsi non viene
 * intercettata da un try/catch, va forzata a scadere. */
function conTimeout<T>(promessa: Promise<T>, secondi: number, messaggio: string): Promise<T> {
  return Promise.race([
    promessa,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(messaggio)), secondi * 1000)),
  ]);
}

export function ScenariManager({ codiceSpazio, nomeSchema, aziendeConsentite, tipoSpazio }: Props) {
  const router = useRouter();
  const [aziende, setAziende] = useState<Azienda[]>([]);
  const [aziendaSelezionata, setAziendaSelezionata] = useState<number | null>(null);
  const [scenari, setScenari] = useState<Scenario[]>([]);
  const [caricamento, setCaricamento] = useState(true);
  const [caricamentoScenari, setCaricamentoScenari] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  const [mostraForm, setMostraForm] = useState(false);
  const [nomeNuovo, setNomeNuovo] = useState('');
  const [tipoNuovo, setTipoNuovo] = useState<TipoProposta>(
    tipoSpazio === 'ENTE' ? 'RICEVUTA' : 'DA_DEFINIRE'
  );
  const [origineNuova, setOrigineNuova] = useState(tipoSpazio === 'ENTE' ? 'Azienda' : 'Studio');
  const [simulazioneAttivaNuova, setSimulazioneAttivaNuova] = useState(false);
  const [mostraArchiviati, setMostraArchiviati] = useState(false);
  const [scenarioDaEliminare, setScenarioDaEliminare] = useState<Scenario | null>(null);
  const [confermaNome, setConfermaNome] = useState('');
  const [azioneInCorso, setAzioneInCorso] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const risultato = await conTimeout(
          ottieniAziende(nomeSchema),
          15,
          'Richiesta delle aziende scaduta: verifica la connessione e riprova.'
        );
        if (risultato.success) {
          setAziende(
            aziendeConsentite
              ? risultato.aziende.filter((a) => aziendeConsentite.includes(a.id))
              : risultato.aziende
          );
        } else {
          setErrore(risultato.error || 'Impossibile caricare le aziende.');
        }
      } catch (err: any) {
        setErrore(`Errore imprevisto durante il caricamento: ${err.message || err}`);
      } finally {
        setCaricamento(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nomeSchema]);

  const caricaScenari = async (aziendaId: number) => {
    setCaricamentoScenari(true);
    setErrore(null);
    try {
      const risultato = await conTimeout(
        ottieniScenari(nomeSchema, aziendaId),
        15,
        'Richiesta degli scenari scaduta: verifica la connessione e riprova.'
      );
      if (risultato.success) {
        setScenari(risultato.scenari);
      } else {
        setErrore(risultato.error || 'Impossibile caricare gli scenari.');
      }
    } catch (err: any) {
      setErrore(`Errore imprevisto durante il caricamento: ${err.message || err}`);
    } finally {
      setCaricamentoScenari(false);
    }
  };

  const handleSelezionaAzienda = (aziendaId: number) => {
    setAziendaSelezionata(aziendaId);
    setScenari([]);
    setMostraForm(false);
    caricaScenari(aziendaId);
  };

  const handleCreaScenario = async () => {
    if (!aziendaSelezionata || !nomeNuovo.trim()) return;
    setErrore(null);
    const risultato = await creaScenarioAction(
      nomeSchema,
      aziendaSelezionata,
      nomeNuovo,
      tipoNuovo,
      origineNuova,
      // La simulazione a levette è sempre attiva per il Redigente; il flag
      // conta solo per il Ricevente (RICEVUTA).
      tipoNuovo === 'RICEVUTA' ? simulazioneAttivaNuova : true
    );
    if (!risultato.success) {
      setErrore(risultato.error || 'Impossibile creare lo scenario.');
      return;
    }
    setNomeNuovo('');
    setTipoNuovo(tipoSpazio === 'ENTE' ? 'RICEVUTA' : 'DA_DEFINIRE');
    setOrigineNuova(tipoSpazio === 'ENTE' ? 'Azienda' : 'Studio');
    setSimulazioneAttivaNuova(false);
    setMostraForm(false);
    await caricaScenari(aziendaSelezionata);
    if (risultato.scenarioId) {
      router.push(`/spazio/${codiceSpazio}/scenari/${risultato.scenarioId}`);
    }
  };

  const handleArchivia = async (s: Scenario, archiviare: boolean) => {
    if (!aziendaSelezionata) return;
    setAzioneInCorso(s.id);
    setErrore(null);
    const risultato = await archiviaScenarioAction(nomeSchema, s.id, archiviare);
    setAzioneInCorso(null);
    if (!risultato.success) {
      setErrore(risultato.error || 'Impossibile aggiornare lo scenario.');
      return;
    }
    await caricaScenari(aziendaSelezionata);
  };

  const handleConfermaElimina = async () => {
    if (!aziendaSelezionata || !scenarioDaEliminare) return;
    if (confermaNome.trim() !== scenarioDaEliminare.nome) return;
    setAzioneInCorso(scenarioDaEliminare.id);
    setErrore(null);
    const risultato = await eliminaScenarioAction(nomeSchema, scenarioDaEliminare.id);
    setAzioneInCorso(null);
    if (!risultato.success) {
      setErrore(risultato.error || 'Impossibile eliminare lo scenario.');
      return;
    }
    setScenarioDaEliminare(null);
    setConfermaNome('');
    await caricaScenari(aziendaSelezionata);
  };

  if (caricamento) return <p className="text-xs text-slate-400">Caricamento...</p>;

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Scenari</h1>
        <p className="text-slate-500 text-xs mt-1">
          Ogni scenario nasce da una proposta (ricevuta o da definire) e ingabbia Check List,
          Indici, XBRL e Report di quell&apos;analisi specifica.
        </p>
      </div>

      {errore && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          {errore}
        </div>
      )}

      {aziende.length === 0 ? (
        <p className="text-xs text-amber-600">
          Crea prima almeno un&apos;azienda nella sezione Aziende.
        </p>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3 mb-4">
            <Building2 className="w-4 h-4 text-blue-600" />
            <h2 className="font-bold text-slate-900 uppercase text-xs tracking-wider">Azienda</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {aziende
              .filter((a) => a.attiva)
              .map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => handleSelezionaAzienda(a.id)}
                  className={`px-3 py-2 rounded-lg text-xs font-bold transition-colors ${
                    aziendaSelezionata === a.id
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {a.ragioneSociale}
                </button>
              ))}
            {aziende.some((a) => !a.attiva) && (
              <p className="w-full text-[10px] text-slate-400 mt-1">
                {aziende.filter((a) => !a.attiva).length} azienda/e disabilitata/e non mostrata/e
                qui — riattivala in Aziende se serve crearci uno scenario.
              </p>
            )}
          </div>
        </div>
      )}

      {aziendaSelezionata && (
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
            <div className="flex items-center gap-2">
              <FolderOpen className="w-4 h-4 text-blue-600" />
              <h2 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
                Scenari ({scenari.filter((s) => !s.archiviato).length})
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setMostraForm((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-[11px] uppercase tracking-wider rounded-lg transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Nuovo Scenario
            </button>
          </div>

          {mostraForm && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 mb-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">
                    Tipo proposta
                  </label>
                  {tipoSpazio === 'ENTE' ? (
                    <div
                      className="w-full p-2 text-xs bg-slate-100 border border-slate-200 rounded-lg text-slate-500"
                      title="Uno spazio ENTE riceve sempre proposte, non le redige mai."
                    >
                      Ricevuta (fisso per uno spazio ENTE)
                    </div>
                  ) : (
                    <select
                      value={tipoNuovo}
                      onChange={(e) => {
                        const tipo = e.target.value as TipoProposta;
                        setTipoNuovo(tipo);
                        setOrigineNuova(ORIGINI_PER_TIPO[tipo][0]);
                      }}
                      className="w-full p-2 text-xs bg-white border border-slate-200 rounded-lg text-slate-900"
                    >
                      <option value="DA_DEFINIRE">Da definire</option>
                      <option value="RICEVUTA">Ricevuta</option>
                    </select>
                  )}
                </div>
                <div>
                  <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">
                    Origine
                  </label>
                  <select
                    value={origineNuova}
                    onChange={(e) => setOrigineNuova(e.target.value)}
                    className="w-full p-2 text-xs bg-white border border-slate-200 rounded-lg text-slate-900"
                  >
                    {ORIGINI_PER_TIPO[tipoNuovo].map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {tipoNuovo === 'RICEVUTA' && (
                <label className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                  <input
                    type="checkbox"
                    checked={simulazioneAttivaNuova}
                    onChange={(e) => setSimulazioneAttivaNuova(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="font-bold">
                      Attiva la simulazione per la sostenibilità del piano aziendale
                    </span>
                    <span className="block text-[10px] text-slate-500 mt-0.5">
                      Lo strumento a &quot;levette&quot; (personale, giorni di incasso/pagamento,
                      imposte) per valutare se il piano regge. Richiede la funzione Simulazione
                      abilitata sullo spazio.
                    </span>
                  </span>
                </label>
              )}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={nomeNuovo}
                  onChange={(e) => setNomeNuovo(e.target.value)}
                  placeholder="Nome scenario: es. Bilancio 2025, Ipotesi A..."
                  className="flex-1 p-2 text-xs bg-white border border-slate-200 rounded-lg outline-none focus:border-blue-500 text-slate-900"
                />
                <button
                  type="button"
                  onClick={handleCreaScenario}
                  disabled={!nomeNuovo.trim()}
                  className="px-3 py-2 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white font-bold text-[10px] uppercase rounded-lg transition-colors shrink-0"
                >
                  Crea
                </button>
              </div>
            </div>
          )}

          {caricamentoScenari && <p className="text-xs text-slate-400">Caricamento scenari...</p>}
          {!caricamentoScenari && scenari.length === 0 && (
            <p className="text-xs text-slate-400">Nessuno scenario creato per questa azienda.</p>
          )}

          {(() => {
            const attivi = scenari.filter((s) => !s.archiviato);
            const archiviati = scenari.filter((s) => s.archiviato);
            const visibili = mostraArchiviati ? archiviati : attivi;
            return (
              <>
                {archiviati.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setMostraArchiviati((v) => !v)}
                    className="text-[10px] font-bold text-slate-400 hover:text-slate-600 uppercase mb-2"
                  >
                    {mostraArchiviati
                      ? `← Torna agli attivi (${attivi.length})`
                      : `Mostra archiviati (${archiviati.length})`}
                  </button>
                )}
                <div className="space-y-2">
                  {visibili.map((s) => (
                    <div
                      key={s.id}
                      className="w-full border border-slate-200 rounded-lg p-3 hover:border-blue-300 hover:bg-blue-50/30 transition-colors flex items-center justify-between gap-2"
                    >
                      <button
                        type="button"
                        onClick={() => router.push(`/spazio/${codiceSpazio}/scenari/${s.id}`)}
                        className="flex-1 text-left"
                      >
                        <div className="font-bold text-slate-900 text-xs">{s.nome}</div>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          {s.tipoProposta === 'RICEVUTA' ? 'Ricevuta da' : 'Da definire —'}{' '}
                          {s.origineProposta} · Stato: {s.stato}
                        </div>
                      </button>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          title={s.archiviato ? 'Ripristina' : 'Archivia'}
                          disabled={azioneInCorso === s.id}
                          onClick={() => handleArchivia(s, !s.archiviato)}
                          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors disabled:opacity-40"
                        >
                          {s.archiviato ? (
                            <ArchiveRestore className="w-3.5 h-3.5" />
                          ) : (
                            <Archive className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <button
                          type="button"
                          title="Elimina"
                          disabled={azioneInCorso === s.id}
                          onClick={() => {
                            setScenarioDaEliminare(s);
                            setConfermaNome('');
                          }}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors disabled:opacity-40"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                  {mostraArchiviati && archiviati.length === 0 && (
                    <p className="text-xs text-slate-400">Nessuno scenario archiviato.</p>
                  )}
                </div>
              </>
            );
          })()}

          {scenarioDaEliminare && (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-xl p-5 max-w-sm w-full space-y-3">
                <div className="font-bold text-slate-900 text-sm">Eliminare questo scenario?</div>
                <p className="text-xs text-slate-500">
                  Cancella per intero <strong>{scenarioDaEliminare.nome}</strong> — proposta,
                  posizione ente, check list, indici, simulazioni, tutto. Non è recuperabile; usa
                  &quot;Archivia&quot; invece se vuoi solo toglierlo dalla vista principale. Per
                  confermare, scrivi il nome esatto dello scenario:
                </p>
                <input
                  type="text"
                  value={confermaNome}
                  onChange={(e) => setConfermaNome(e.target.value)}
                  placeholder={scenarioDaEliminare.nome}
                  className="w-full p-2 text-xs bg-white border border-slate-200 rounded-lg outline-none focus:border-red-400 text-slate-900"
                  autoFocus
                />
                <div className="flex gap-2 justify-end pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setScenarioDaEliminare(null);
                      setConfermaNome('');
                    }}
                    className="px-3 py-2 text-xs font-bold text-slate-500 hover:text-slate-700 uppercase"
                  >
                    Annulla
                  </button>
                  <button
                    type="button"
                    disabled={
                      confermaNome.trim() !== scenarioDaEliminare.nome ||
                      azioneInCorso === scenarioDaEliminare.id
                    }
                    onClick={handleConfermaElimina}
                    className="px-3 py-2 bg-red-600 hover:bg-red-700 disabled:bg-slate-300 text-white font-bold text-[10px] uppercase rounded-lg transition-colors"
                  >
                    Elimina definitivamente
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
