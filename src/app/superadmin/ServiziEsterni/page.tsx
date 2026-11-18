'use client';

// IL PANNELLO DEI SERVIZI A PAGAMENTO (0.245.0).
//
// Una riga per servizio: nome, chiave che lo accende, stato, dettaglio della
// risposta del fornitore e che cosa fare. Lo stato si chiede al fornitore, non
// si deduce: «non configurato», «credito esaurito» e «limite raggiunto» sono
// tre cose diverse, con tre rimedi diversi, e il pannello le distingue.
//
// Sotto, i consumi AI delle ultime 24 ore: servono a capire se un tetto
// raggiunto è un abuso o il lavoro ordinario di un ente.

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, HelpCircle, RefreshCw, ShieldAlert } from 'lucide-react';
import { verificaServiziEsterniAction } from '@/app/actions/serviziEsterni';
import { ETICHETTA_STATO, type StatoCredito } from '@/lib/serviziEsterni/crediti';
import type { EsitoServiziEsterni, VoceServizio } from '@/lib/serviziEsterni/tipi';

const COLORE: Record<StatoCredito, string> = {
  OK: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  NON_CONFIGURATO: 'bg-zinc-500/10 text-zinc-300 border-zinc-600',
  CREDITO_ESAURITO: 'bg-red-500/10 text-red-400 border-red-500/30',
  CREDENZIALE_NON_VALIDA: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  LIMITE_RAGGIUNGIMENTO: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  NON_RAGGIUNGIBILE: 'bg-red-500/10 text-red-400 border-red-500/30',
};

function IconaStato({ stato }: { stato: StatoCredito }) {
  if (stato === 'OK') return <CheckCircle2 className="w-4 h-4 shrink-0" />;
  if (stato === 'CREDITO_ESAURITO' || stato === 'NON_RAGGIUNGIBILE')
    return <ShieldAlert className="w-4 h-4 shrink-0" />;
  if (stato === 'NON_CONFIGURATO') return <HelpCircle className="w-4 h-4 shrink-0" />;
  return <AlertTriangle className="w-4 h-4 shrink-0" />;
}

export default function ServiziEsterniPage() {
  const [esito, setEsito] = useState<EsitoServiziEsterni | null>(null);
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  const verifica = useCallback(async () => {
    setInCorso(true);
    setErrore(null);
    try {
      const r = await verificaServiziEsterniAction();
      setEsito(r);
    } catch (e) {
      setErrore(`Verifica non riuscita: ${(e as Error).message || e}`);
    } finally {
      setInCorso(false);
    }
  }, []);

  useEffect(() => {
    void verifica();
  }, [verifica]);

  const conteggi = (esito?.voci ?? []).reduce<Record<string, number>>((acc, v) => {
    acc[v.lettura.stato] = (acc[v.lettura.stato] ?? 0) + 1;
    return acc;
  }, {});
  const daSistemare = (esito?.voci ?? []).filter((v) => v.lettura.stato !== 'OK').length;

  return (
    <div className="max-w-6xl mx-auto space-y-8 font-mono">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 pb-6 border-b border-zinc-800">
        <div>
          <h1 className="text-2xl font-black text-white tracking-wider uppercase">
            Servizi a pagamento
          </h1>
          <p className="text-xs text-zinc-400 mt-1 max-w-2xl leading-relaxed">
            Il credito e i limiti dei servizi che costano per chiamata. Lo stato si chiede al
            fornitore: qui si legge se la chiave c&apos;è, se il credito c&apos;è e se il limite è
            stato raggiunto, con la cosa da fare per ciascuno.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void verifica()}
          disabled={inCorso}
          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-white hover:bg-blue-500 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${inCorso ? 'animate-spin' : ''}`} />
          {inCorso ? 'Verifica in corso…' : 'Verifica ora'}
        </button>
      </div>

      {errore && (
        <p className="rounded-xl border border-red-800 bg-red-950/40 p-3 text-xs text-red-300">
          {errore}
        </p>
      )}

      {esito && (
        <div
          className={`rounded-2xl border p-5 ${
            daSistemare === 0
              ? 'border-emerald-800 bg-emerald-950/30'
              : 'border-amber-800 bg-amber-950/20'
          }`}
        >
          <p className="text-sm font-bold text-white">
            {daSistemare === 0
              ? 'Tutti i servizi rispondono.'
              : `${daSistemare} ${daSistemare === 1 ? 'servizio' : 'servizi'} da sistemare`}
          </p>
          <p className="mt-1 text-[11px] text-zinc-300 leading-relaxed">
            {daSistemare === 0
              ? 'Chiavi presenti, credito disponibile e limiti non raggiunti alla data della verifica.'
              : 'Un servizio non disponibile non ferma il prodotto, ma spegne le funzioni che lo usano: il dettaglio dice quale e perché.'}
          </p>
          <p className="mt-2 text-[10px] text-zinc-500 tabular-nums">
            Verifica del {new Date(esito.quando).toLocaleString('it-IT')} ·{' '}
            {Object.entries(conteggi)
              .map(([stato, n]) => `${n} ${ETICHETTA_STATO[stato as StatoCredito].toLowerCase()}`)
              .join(' · ')}
          </p>
        </div>
      )}

      <div className="space-y-3">
        {(esito?.voci ?? []).map((v: VoceServizio) => (
          <div key={v.chiave} className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-white">{v.nome}</p>
                <p className="text-[11px] text-zinc-500">
                  <code className="text-zinc-400">{v.chiave}</code> ·{' '}
                  {v.configurazione === 'PRESENTE' ? 'configurata' : 'non configurata'}
                </p>
              </div>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${COLORE[v.lettura.stato]}`}
              >
                <IconaStato stato={v.lettura.stato} />
                {ETICHETTA_STATO[v.lettura.stato]}
              </span>
            </div>
            <p className="mt-3 text-[11px] text-zinc-300 leading-relaxed">{v.lettura.dettaglio}</p>
            <p className="mt-1 text-[11px] text-zinc-400 leading-relaxed">
              <span className="font-bold text-zinc-300">Da fare:</span> {v.lettura.rimedio}
            </p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
        <h2 className="text-sm font-bold text-white uppercase tracking-wider">
          Consumi AI delle ultime 24 ore
        </h2>
        {esito && esito.usoAi.length === 0 ? (
          <p className="mt-2 text-[11px] text-zinc-400">
            Nessuna chiamata AI registrata nelle ultime 24 ore (o contatore non disponibile).
          </p>
        ) : (
          <ul className="mt-3 space-y-1 text-[11px] text-zinc-300">
            {(esito?.usoAi ?? []).map((u) => (
              <li
                key={u.funzione}
                className="flex justify-between border-b border-zinc-800/60 py-1"
              >
                <span>{u.funzione}</span>
                <span className="tabular-nums text-zinc-400">{u.chiamate} chiamate</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-[10px] text-zinc-500 leading-relaxed">
          I tetti per utente e per spazio restano quelli configurati (variabili AI_*): un tetto
          raggiunto non è un credito finito, ed è per questo che i due numeri si leggono separati.
        </p>
      </div>
    </div>
  );
}
