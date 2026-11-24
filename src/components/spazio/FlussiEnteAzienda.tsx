'use client';

// I FLUSSI DELL'ENTE PER QUESTA AZIENDA.
//
// Quanti periodi l'ente doveva ricevere, quanti ne ha ricevuti, quali
// mancano e da quanti giorni, quali sono coperti da una sospensione della
// matricola o da una partita già passata in TS 27 o all'Agente della
// Riscossione. È la fotografia del rapporto azienda-ente, non un giudizio:
// elenca i fatti e lascia la lettura a chi conduce la verifica.

import React, { useCallback, useEffect, useState } from 'react';
import {
  CalendarDays,
  CalendarOff,
  ChevronDown,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import {
  calcolaCongruenzaFlussi,
  eliminaSospensioneFlusso,
  ottieniSospensioniFlusso,
  salvaSospensioneFlusso,
} from '@/app/actions/flussiEnte';
import type { EsitoCongruenza } from '@/lib/flussiEnte/congruenza';

/** «2025-06» → «06/2025», che è come si leggono i periodi nei documenti. */
const mese = (p: string) => `${p.slice(5)}/${p.slice(0, 4)}`;

/** Un elenco lungo non si stampa intero: i primi dodici e il resto in cifre. */
const compatta = (periodi: string[], massimo = 12) =>
  periodi.length <= massimo
    ? periodi.map(mese).join(', ')
    : `${periodi.slice(0, massimo).map(mese).join(', ')} e altri ${periodi.length - massimo}`;

const CLASSE_CAMPO =
  'w-full p-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900';

export function FlussiEnteAzienda({
  nomeSchema,
  aziendaId,
}: {
  nomeSchema: string;
  aziendaId: number;
}) {
  const [esiti, setEsiti] = useState<EsitoCongruenza[]>([]);
  const [sospensioni, setSospensioni] = useState<
    { id: number; dal: string; al: string; motivo: string }[]
  >([]);
  const [dal, setDal] = useState('');
  const [al, setAl] = useState('');
  const [dataVerifica, setDataVerifica] = useState('');
  const [periodiInArchivio, setPeriodiInArchivio] = useState(0);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);
  const [nuova, setNuova] = useState({ dal: '', al: '', motivo: '' });
  /** Filtro per ente: i flussi appartengono a un ente, e si leggono per ente. */
  const [enteFiltro, setEnteFiltro] = useState('');

  const carica = useCallback(
    async (finestra?: { dal?: string; al?: string }) => {
      setErrore(null);
      const [s, c] = await Promise.all([
        ottieniSospensioniFlusso(nomeSchema, aziendaId),
        calcolaCongruenzaFlussi(nomeSchema, aziendaId, finestra),
      ]);
      setSospensioni(s.sospensioni);
      if (!s.success) setErrore(s.error ?? null);
      if (!c.success) {
        setErrore(c.error ?? null);
        setCaricamento(false);
        return;
      }
      setEsiti(c.esiti);
      setDal(c.dal ?? '');
      setAl(c.al ?? '');
      setDataVerifica(c.dataVerifica);
      setPeriodiInArchivio(c.periodiInArchivio);
      setCaricamento(false);
    },
    [nomeSchema, aziendaId]
  );

  useEffect(() => {
    void carica();
  }, [carica]);

  const aggiungiSospensione = async () => {
    const r = await salvaSospensioneFlusso(nomeSchema, aziendaId, nuova);
    if (!r.success) {
      setErrore(r.error ?? 'Salvataggio non riuscito.');
      return;
    }
    setNuova({ dal: '', al: '', motivo: '' });
    await carica({ dal, al });
  };

  const rimuoviSospensione = async (id: number) => {
    const r = await eliminaSospensioneFlusso(nomeSchema, aziendaId, id);
    if (!r.success) {
      setErrore(r.error ?? 'Eliminazione non riuscita.');
      return;
    }
    await carica({ dal, al });
  };

  if (caricamento) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-2 text-xs text-slate-500">
        <Loader2 className="w-4 h-4 animate-spin" /> Leggo i flussi dell’ente…
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
            <CalendarDays className="w-3.5 h-3.5 text-blue-600" /> Flussi dell’ente
          </h3>
          <p className="mt-1 text-[10px] text-slate-500 leading-relaxed">
            Quello che l’azienda doveva trasmettere e quello che risulta trasmesso, periodo per
            periodo. L’arco si ricava dai dati in archivio ({periodiInArchivio} periodi letti) e si
            può restringere qui.
          </p>
        </div>
      </div>

      {errore && (
        <p className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">
          {errore}
        </p>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">
            Dal periodo
          </label>
          <input
            type="month"
            className={CLASSE_CAMPO}
            value={dal}
            onChange={(e) => setDal(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">
            Al periodo
          </label>
          <input
            type="month"
            className={CLASSE_CAMPO}
            value={al}
            onChange={(e) => setAl(e.target.value)}
          />
        </div>
        <button
          type="button"
          onClick={() => void carica({ dal, al })}
          disabled={!dal || !al}
          className="flex items-center gap-1 px-3 py-2 border border-slate-300 text-slate-700 font-bold text-[10px] uppercase rounded-lg hover:bg-slate-50 disabled:opacity-40"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Ricalcola
        </button>
        {esiti.length > 0 && (
          <div>
            <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Ente</label>
            <select
              className={CLASSE_CAMPO}
              value={enteFiltro}
              onChange={(e) => setEnteFiltro(e.target.value)}
            >
              <option value="">Tutti gli enti</option>
              {[...new Set(esiti.map((e) => e.ente))].map((ente) => (
                <option key={ente} value={ente}>
                  {ente}
                </option>
              ))}
            </select>
          </div>
        )}
        {dataVerifica && (
          <span className="text-[10px] text-slate-500 pb-2">
            ritardi misurati al {dataVerifica.split('-').reverse().join('/')}
          </span>
        )}
      </div>

      {!dal || !al ? (
        <p className="text-[11px] text-slate-600">
          L’archivio non porta periodi leggibili per questa azienda: indica l’arco qui sopra per
          contare i periodi attesi comunque.
        </p>
      ) : esiti.length === 0 ? (
        <p className="text-[11px] text-slate-600">
          Nessun profilo di flusso attivo per questo ente: si configura nei parametri dello spazio,
          alla voce «Flusso che l’ente riceve».
        </p>
      ) : (
        esiti
          .filter((e) => !enteFiltro || e.ente === enteFiltro)
          .map((e) => (
            <div
              key={`${e.ente}-${e.flusso}`}
              className="border border-slate-200 rounded-lg p-3 space-y-2"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-xs font-bold text-slate-900">
                  {e.ente ? <span className="text-slate-500 font-normal">{e.ente} · </span> : null}
                  {e.flusso}
                </p>
                <p className="text-[10px] text-slate-600">
                  {e.attesi} periodi attesi ({mese(e.dal)}–{mese(e.al)}) · {e.denunce}{' '}
                  {e.etichette.denuncia} · {e.deleghe} {e.etichette.pagamento}
                  {e.sospesi.length > 0 ? ` · ${e.sospesi.length} mesi sospesi` : ''}
                </p>
              </div>

              {e.completo && (
                <p className="text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg p-2">
                  Ogni periodo atteso ha la sua denuncia e il suo pagamento.
                </p>
              )}

              {e.senzaDenuncia.length > 0 && (
                <p className="text-[11px] text-slate-700">
                  <strong>Periodi senza {e.etichette.denuncia}:</strong> {compatta(e.senzaDenuncia)}
                </p>
              )}

              {e.senzaDelega.length > 0 && (
                <p className="text-[11px] text-slate-700">
                  <strong>Periodi senza {e.etichette.pagamento}:</strong> {compatta(e.senzaDelega)}
                </p>
              )}

              {e.regolarizzati.length > 0 && (
                <p className="text-[11px] text-slate-700">
                  <strong>Coperti da una partita:</strong>{' '}
                  {compatta(e.regolarizzati.map((r) => r.periodo))}
                </p>
              )}

              {e.fuoriPerimetro.denunce.length + e.fuoriPerimetro.deleghe.length > 0 && (
                <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">
                  <strong>Fuori dall’arco scelto:</strong>{' '}
                  {[
                    ...e.fuoriPerimetro.denunce.map((p) => `${mese(p)} denuncia`),
                    ...e.fuoriPerimetro.deleghe.map((p) => `${mese(p)} pagamento`),
                  ].join(', ')}
                </p>
              )}

              {e.scoperte.length > 0 && (
                <div>
                  {/* LA TABELLA DEGLI ADEMPIMENTI (0.256.0). Le righe sciolte
                      («06/2025 · denuncia — scadenza 16/07/2025, 210 giorni»)
                      costringevano a ricostruire a occhio la sequenza. In
                      tabella ogni posizione si legge per colonna: quando è
                      dovuta, da quale fonte, entro quale termine di legge, e
                      da quanto è in ritardo. */}
                  <p className="mb-1 text-[10px] font-bold uppercase text-slate-500">
                    Adempimenti scoperti — data, fonte, scadenza legale e ritardo
                  </p>
                  <div className="overflow-x-auto rounded-lg border border-slate-200">
                    <table className="w-full text-[11px]">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-left text-[9px] uppercase tracking-wider text-slate-500">
                          <th className="px-2 py-1.5">Data</th>
                          <th className="px-2 py-1.5">Fonte</th>
                          <th className="px-2 py-1.5">Scad. legale</th>
                          <th className="px-2 py-1.5 text-right">Ritardo</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {e.scoperte.map((s) => (
                          <tr key={`${s.periodo}-${s.tipo}`}>
                            <td className="px-2 py-1 tabular-nums text-slate-800">
                              {mese(s.periodo)}
                            </td>
                            <td className="px-2 py-1 text-slate-700">
                              {s.tipo === 'DENUNCIA' ? e.etichette.denuncia : e.etichette.pagamento}
                            </td>
                            <td className="px-2 py-1 tabular-nums text-slate-700">
                              {s.scadenza.split('-').reverse().join('/')}
                            </td>
                            <td
                              className={`px-2 py-1 text-right font-bold tabular-nums ${
                                s.giorni > 90 ? 'text-red-700' : 'text-amber-800'
                              }`}
                            >
                              {s.giorni} giorni
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-1 text-[10px] text-slate-500 leading-relaxed">
                    La fonte è il documento che l’adempimento doveva produrre; la scadenza legale è
                    quella del periodo di competenza; il ritardo si conta a oggi. In rosso oltre i
                    90 giorni — la soglia della certificazione dei debiti.
                  </p>
                </div>
              )}

              <p className="text-[10px] text-slate-500 leading-relaxed">{e.notaRitardi}</p>
            </div>
          ))
      )}

      <details className="group border-t border-slate-200 pt-2">
        <summary className="flex cursor-pointer list-none items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-600">
          <ChevronDown className="w-3.5 h-3.5 group-open:rotate-180" />
          Sospensioni della matricola
          {sospensioni.length > 0 ? ` (${sospensioni.length})` : ''}
        </summary>
        <div className="mt-2 space-y-2">
          <p className="text-[10px] text-slate-500 leading-relaxed">
            I mesi in cui la matricola è sospesa non hanno obbligo di denuncia né di versamento:
            restano fuori dal conteggio degli attesi invece di diventare periodi mancanti.
          </p>

          {sospensioni.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-2 text-[11px]">
              <span className="text-slate-700">
                {mese(s.dal)} – {mese(s.al)}
                {s.motivo ? ` · ${s.motivo}` : ''}
              </span>
              <button
                type="button"
                onClick={() => void rimuoviSospensione(s.id)}
                className="text-slate-400 hover:text-red-600"
                aria-label="Elimina la sospensione"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}

          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">
                Dal
              </label>
              <input
                type="month"
                className={CLASSE_CAMPO}
                value={nuova.dal}
                onChange={(e) => setNuova({ ...nuova, dal: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Al</label>
              <input
                type="month"
                className={CLASSE_CAMPO}
                value={nuova.al}
                onChange={(e) => setNuova({ ...nuova, al: e.target.value })}
              />
            </div>
            <div className="flex-1 min-w-[140px]">
              <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">
                Motivo
              </label>
              <input
                className={CLASSE_CAMPO}
                placeholder="es. sospensione dell’attività"
                value={nuova.motivo}
                onChange={(e) => setNuova({ ...nuova, motivo: e.target.value })}
              />
            </div>
            <button
              type="button"
              onClick={() => void aggiungiSospensione()}
              disabled={!nuova.dal || !nuova.al}
              className="flex items-center gap-1 px-3 py-2 bg-slate-800 hover:bg-slate-900 disabled:bg-slate-300 text-white font-bold text-[10px] uppercase rounded-lg"
            >
              <Plus className="w-3.5 h-3.5" /> Aggiungi
            </button>
          </div>
        </div>
      </details>

      {sospensioni.length === 0 && (
        <p className="text-[10px] text-slate-400 flex items-center gap-1">
          <CalendarOff className="w-3 h-3" /> Nessuna sospensione registrata per questa azienda.
        </p>
      )}
    </div>
  );
}
