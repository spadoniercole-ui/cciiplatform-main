'use client';

// Fascicolo di evidenza — elenco degli importi su cui poggia un testo, ciascuno
// con la propria provenienza e il proprio stato di verifica. Prima tappa: si
// compone al volo da proposta, posizione debitoria dell'ente e V.E.R.A.
//
// Il pannello dichiara anche cio' che NON sa: di molte righe la piattaforma
// non ha ancora registrato il documento di origine.

import React, { useEffect, useState } from 'react';
import { FolderSearch, ChevronDown, ChevronRight } from 'lucide-react';
import { ottieniFascicoloAction } from '@/app/actions/fascicoloEvidenza';
import { riepilogoFascicolo, type Evidenza, type StatoEvidenza } from '@/lib/fascicolo/evidenza';
import { improntaBreve } from '@/lib/fascicolo/impronta';

const STILE_STATO: Record<StatoEvidenza, { etichetta: string; classe: string }> = {
  TITOLO_ENTE: { etichetta: 'Titolo dell’ente', classe: 'bg-emerald-100 text-emerald-800' },
  DICHIARATO: { etichetta: 'Dichiarato dall’azienda', classe: 'bg-slate-100 text-slate-700' },
  IMPORTO_NON_NOTO: { etichetta: 'Importo non noto', classe: 'bg-red-100 text-red-800' },
  DERIVATO: { etichetta: 'Calcolato', classe: 'bg-slate-200 text-slate-700' },
};

interface Props {
  nomeSchema: string;
  aziendaId: number;
  /** null = fascicolo dell'azienda, senza le righe della proposta. */
  scenarioId: number | null;
  onCaricato?: (fascicolo: Evidenza[]) => void;
}

export function FascicoloEvidenza({ nomeSchema, aziendaId, scenarioId, onCaricato }: Props) {
  const [fascicolo, setFascicolo] = useState<Evidenza[] | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [aperto, setAperto] = useState(false);

  useEffect(() => {
    let attivo = true;
    ottieniFascicoloAction(nomeSchema, aziendaId, scenarioId).then((r) => {
      if (!attivo) return;
      if (r.success && r.fascicolo) {
        setFascicolo(r.fascicolo);
        onCaricato?.(r.fascicolo);
      } else {
        setErrore(r.error || 'Fascicolo non disponibile.');
      }
    });
    return () => {
      attivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nomeSchema, aziendaId, scenarioId]);

  if (errore) return <p className="text-[11px] text-red-700">{errore}</p>;
  if (!fascicolo) return null;

  const conteggi = riepilogoFascicolo(fascicolo);
  const senzaTitolo = fascicolo.filter(
    (e) => e.stato === 'TITOLO_ENTE' && e.codicePartita && !e.titolo
  ).length;
  const euro = (n: number | null) =>
    n === null
      ? 'non noto'
      : `€ ${n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <section
      className="bg-white border border-slate-200 rounded-xl p-4 space-y-3"
      aria-label="Fascicolo di evidenza"
    >
      <div className="flex items-start gap-2">
        <FolderSearch className="w-4 h-4 text-blue-600 mt-0.5" />
        <div>
          <h3 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
            Fascicolo di evidenza
          </h3>
          <p className="text-[11px] text-slate-600 mt-0.5">
            Gli importi su cui il testo può poggiare, con la loro provenienza. Oggi copre proposta,
            posizione debitoria dell’ente, V.E.R.A. e bilanci XBRL; il revisore segnala ogni importo
            del testo che non trova qui.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <span className="text-[10px] font-bold uppercase rounded px-2 py-1 bg-slate-100 text-slate-700">
          Evidenze: {fascicolo.length}
        </span>
        {(Object.keys(STILE_STATO) as StatoEvidenza[]).map((s) =>
          conteggi[s] > 0 ? (
            <span
              key={s}
              className={`text-[10px] font-bold uppercase rounded px-2 py-1 ${STILE_STATO[s].classe}`}
            >
              {STILE_STATO[s].etichetta}: {conteggi[s]}
            </span>
          ) : null
        )}
      </div>

      {conteggi.IMPORTO_NON_NOTO > 0 && (
        <p className="text-[11px] text-red-800 bg-red-50 border border-red-200 rounded p-2">
          {conteggi.IMPORTO_NON_NOTO === 1
            ? 'Una voce ha'
            : `${conteggi.IMPORTO_NON_NOTO} voci hanno`}{' '}
          importo non noto: non valgono zero. Ogni totale che le riguarda è un minimo, e un
          confronto con una soglia non è esprimibile finché l’importo manca.
        </p>
      )}
      {conteggi.TITOLO_ENTE > 0 && (
        <p className="text-[11px] text-slate-700 bg-slate-50 border border-slate-200 rounded p-2">
          I crediti dell’ente sono acquisiti come certi, liquidi ed esigibili sul presupposto degli
          atti che li fondano; per ogni partita è indicato il titolo presunto in base al codice. La
          verifica degli atti, della notifica e dei termini resta all’ente.
          {senzaTitolo > 0 &&
            ` ${senzaTitolo} ${senzaTitolo === 1 ? 'partita ha' : 'partite hanno'} un codice non configurato: Parametri di Spazio › Titoli di credito dell’ente.`}
        </p>
      )}

      <button
        type="button"
        onClick={() => setAperto((v) => !v)}
        className="flex items-center gap-1 text-[10px] font-bold uppercase text-slate-500 hover:text-blue-700"
      >
        {aperto ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        Elenco delle evidenze
      </button>

      {aperto && (
        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-[9px] uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2 font-bold">Identificativo</th>
                <th className="px-3 py-2 font-bold">Dato</th>
                <th className="px-3 py-2 font-bold">Importo</th>
                <th className="px-3 py-2 font-bold">Data</th>
                <th className="px-3 py-2 font-bold">Titolo presunto</th>
                <th className="px-3 py-2 font-bold">Documento</th>
                <th className="px-3 py-2 font-bold">Stato</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {fascicolo.map((e) => (
                <tr key={e.id}>
                  <td className="px-3 py-2">
                    <code className="font-mono text-[10px] text-slate-500">{e.id}</code>
                  </td>
                  <td className="px-3 py-2 text-slate-800">
                    {e.descrizione}
                    {e.derivatoDa && (
                      <span className="block text-[10px] text-slate-400">
                        {e.derivatoDa.operazione} — da {e.derivatoDa.ids.slice(0, 4).join(', ')}
                        {e.derivatoDa.ids.length > 4 ? '…' : ''}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-900 whitespace-nowrap">{euro(e.importo)}</td>
                  <td className="px-3 py-2 text-slate-600 whitespace-nowrap">
                    {e.dataRiferimento ?? '—'}
                  </td>
                  <td className="px-3 py-2 text-slate-700">
                    {e.stato === 'TITOLO_ENTE' ? (
                      e.titolo ? (
                        <span>
                          <strong>{e.titolo.codice}</strong> — {e.titolo.atto}
                          {e.titolo.presuppostoGiuridico && (
                            <span className="block text-[10px] text-slate-500">
                              {e.titolo.presuppostoGiuridico}
                            </span>
                          )}
                        </span>
                      ) : e.codicePartita ? (
                        <span className="text-amber-700">
                          codice {e.codicePartita}: da configurare
                        </span>
                      ) : (
                        <span className="text-slate-400">codice non presente</span>
                      )
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-600">
                    {e.documento ? (
                      <span title={`SHA-256 ${e.documento.impronta ?? ''}`}>
                        {e.documento.nome}
                        {e.documento.impronta && (
                          <code className="block font-mono text-[10px] text-slate-400">
                            {improntaBreve(e.documento.impronta)}…
                          </code>
                        )}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`text-[9px] font-bold uppercase rounded px-1.5 py-0.5 ${STILE_STATO[e.stato].classe}`}
                    >
                      {STILE_STATO[e.stato].etichetta}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
