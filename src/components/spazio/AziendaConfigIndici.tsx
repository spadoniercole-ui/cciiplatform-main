'use client';

// Indici per una specifica azienda: quali indici (tra quelli già attivi
// per l'intero spazio) si applicano a questa azienda. Utile quando nello
// stesso spazio (es. lo studio di un commercialista) gravitano aziende di
// settori ATECO diversi, per cui non tutti gli indici hanno senso per
// tutte le aziende.

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TrendingUp } from 'lucide-react';
import {
  ottieniIndiciAzienda,
  impostaIndiceAziendaAction,
  type IndiceAzienda,
} from '@/app/actions/aziendaConfig';
import { segnaVistaAnalisiBilancioAction } from '@/app/actions/analisiBilancioStep';
import { ottieniStoricoXbrlAzienda, type BilancioStoricoAzienda } from '@/app/actions/xbrlAzienda';
import type { IndiceCcii } from '@/lib/xbrl/types';

interface Props {
  nomeSchema: string;
  aziendaId: number;
}

export function AziendaConfigIndici({ nomeSchema, aziendaId }: Props) {
  const router = useRouter();
  const [indici, setIndici] = useState<IndiceAzienda[]>([]);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);
  const [erroreSalvataggio, setErroreSalvataggio] = useState<string | null>(null);
  const [storico, setStorico] = useState<BilancioStoricoAzienda[]>([]);

  useEffect(() => {
    (async () => {
      setCaricamento(true);
      const [risultato, st] = await Promise.all([
        ottieniIndiciAzienda(nomeSchema, aziendaId),
        ottieniStoricoXbrlAzienda(nomeSchema, aziendaId),
      ]);
      if (risultato.success) setIndici(risultato.indici);
      else setErrore(risultato.error || 'Impossibile caricare gli indici.');
      if (st.success) setStorico(st.storico);
      setCaricamento(false);
    })();
  }, [nomeSchema, aziendaId]);

  // Presa visione della sotto-sezione: aprirla concorre a rendere verde
  // "Analisi Bilancio". Segniamo la visita e aggiorniamo il semaforo del
  // layout solo alla prima apertura (cambiato).
  useEffect(() => {
    (async () => {
      const esito = await segnaVistaAnalisiBilancioAction(nomeSchema, aziendaId, 'indici');
      if (esito.success && esito.cambiato) router.refresh();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nomeSchema, aziendaId]);

  const handleToggle = async (indice: IndiceAzienda) => {
    setErroreSalvataggio(null);
    const nuovoValore = !indice.abilitato;
    setIndici((prev) =>
      prev.map((i) => (i.id === indice.id ? { ...i, abilitato: nuovoValore } : i))
    );

    const risultato = await impostaIndiceAziendaAction(
      nomeSchema,
      aziendaId,
      indice.id,
      nuovoValore
    );
    if (!risultato.success) {
      // Il salvataggio è fallito davvero: annulla il toggle ottimistico e
      // mostra il perché, invece di lasciare che sparisca in silenzio al
      // prossimo caricamento della pagina.
      setIndici((prev) =>
        prev.map((i) => (i.id === indice.id ? { ...i, abilitato: indice.abilitato } : i))
      );
      setErroreSalvataggio(risultato.error || "Impossibile salvare la modifica dell'indice.");
    }
  };

  if (caricamento) return <p className="text-xs text-slate-400">Caricamento...</p>;

  const indiciPerCategoria = indici.reduce<Record<string, IndiceAzienda[]>>((acc, i) => {
    (acc[i.categoria] ||= []).push(i);
    return acc;
  }, {});

  // I CALCOLI, non solo le scelte: per ogni bilancio caricato il valore di
  // ciascun indice abilitato, con la soglia di riferimento e l'esito. Sono
  // i valori del bilancio depositato; nello scenario gli stessi indici sono
  // ricalcolati sui dati attualizzati (Posizione Aggiornata).
  const anni = storico.filter((b) => b.indici || b.altriIndici);
  const perAnno = anni.map((b) => {
    const m = new Map<string, IndiceCcii>();
    for (const i of [...(b.indici ?? []), ...(b.altriIndici ?? [])]) m.set(i.codice, i);
    return { anno: b.annoBilancio, mappa: m };
  });
  const abilitati = indici.filter((i) => i.abilitato);
  const fmt = (v: number | 'N/D') =>
    v === 'N/D' ? 'n/d' : v.toLocaleString('it-IT', { maximumFractionDigits: 2 });
  const sogliaDi = (codice: string) =>
    perAnno.map((a) => a.mappa.get(codice)?.soglia).find((x) => !!x) ?? '—';

  return (
    // Affiancati: a sinistra i calcoli, a destra le scelte — senza scorrere.
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] items-start">
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <TrendingUp className="w-4 h-4 text-blue-600" />
          <h2 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
            Calcoli dai bilanci caricati
          </h2>
        </div>
        {perAnno.length === 0 ? (
          <p className="text-xs text-slate-500">
            Nessun bilancio XBRL caricato per questa azienda: i valori degli indici compariranno qui
            al caricamento (Analisi Bilancio › Configurazione XBRL).
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-[10px] uppercase text-slate-500 font-bold border-b border-slate-100">
                  <th className="p-2">Indice</th>
                  <th className="p-2">Soglia di riferimento</th>
                  {perAnno.map((a, k) => (
                    <th key={k} className="p-2 text-right">
                      {a.anno ?? 'n/d'}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {abilitati.map((ind) => (
                  <tr key={ind.id}>
                    <td className="p-2 text-slate-800">
                      <span className="font-mono text-[10px] text-slate-400 mr-1">
                        {ind.codice}
                      </span>
                      {ind.nome}
                    </td>
                    <td className="p-2 text-slate-500 text-[11px]">{sogliaDi(ind.codice)}</td>
                    {perAnno.map((a, k) => {
                      const v = a.mappa.get(ind.codice);
                      const cls =
                        v?.esito === 'VIOLATO'
                          ? 'text-red-700 font-bold'
                          : v?.esito === 'OK'
                            ? 'text-emerald-700'
                            : 'text-slate-400';
                      return (
                        <td
                          key={k}
                          className={`p-2 text-right tabular-nums ${cls}`}
                          title={v?.note}
                        >
                          {v ? fmt(v.valore) : '—'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[10px] text-slate-400 mt-2 leading-relaxed">
              Valori del bilancio depositato (in rosso oltre la soglia). Strumenti operativi di
              lettura, non parametri normativi: il sistema di indici dell’originario art. 13 CCII è
              abrogato. Nello scenario gli stessi indici sono ricalcolati anche sulla Posizione
              Aggiornata, con i dati attualizzati.
            </p>
          </div>
        )}
      </div>
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <TrendingUp className="w-4 h-4 text-blue-600" />
          <h2 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
            Indici per questa azienda
          </h2>
        </div>
        <p className="text-[11px] text-slate-500">
          Questi sono i 9 indici che il motore XBRL calcola davvero da un bilancio caricato (5
          CNDCEC/CCII + 4 di lettura economico-finanziaria). L&apos;elenco mostra solo quelli già
          attivi per l&apos;intero spazio (Parametri di Spazio). Spegnili qui se non sono rilevanti
          per il settore o le caratteristiche di questa azienda.
        </p>

        {errore && (
          <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
            {errore}
          </div>
        )}
        {erroreSalvataggio && (
          <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
            {erroreSalvataggio}
          </div>
        )}

        <div className="space-y-4">
          {Object.entries(indiciPerCategoria).map(([categoria, elenco]) => (
            <div key={categoria}>
              <h3 className="text-[10px] font-bold text-slate-400 uppercase mb-1.5">{categoria}</h3>
              <div className="space-y-1">
                {elenco.map((indice) => (
                  <label
                    key={indice.id}
                    className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer py-1"
                  >
                    <input
                      type="checkbox"
                      checked={indice.abilitato}
                      onChange={() => handleToggle(indice)}
                    />
                    <span className={indice.abilitato ? '' : 'text-slate-400 line-through'}>
                      {indice.nome}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ))}
          {indici.length === 0 && (
            <p className="text-xs text-slate-400">
              Nessun indice attivo per questo spazio — configurali prima in Parametri di Spazio.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
