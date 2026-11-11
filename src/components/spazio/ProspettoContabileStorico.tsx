'use client';

// IL PROSPETTO STORICO DELLA VERIFICA CONTABILE.
//
// I bilanci XBRL già in archivio, letti come si leggono in contabilità: voci a
// scalare, una colonna per annualità. Nessun calcolo nuovo — i dati sono
// quelli salvati dal motore XBRL — e nessuna proiezione: la simulazione è
// materia della verifica azienda, qui si guarda il dato depositato e gli
// indici che ne derivano.
//
// Anni in ordine crescente, come in un prospetto di bilancio; le voci seguono
// la sequenza del conto economico e poi dello stato patrimoniale essenziale.

import { useEffect, useState } from 'react';
import { Table2 } from 'lucide-react';
import { ottieniStoricoXbrlAzienda, type BilancioStoricoAzienda } from '@/app/actions/xbrlAzienda';
import type { DatiFinanziariPeriodo } from '@/lib/xbrl/types';

const euro = (n: number | undefined) =>
  typeof n === 'number' && Number.isFinite(n) ? `${Math.round(n).toLocaleString('it-IT')} €` : '—';

const num = (n: unknown) =>
  typeof n === 'number' && Number.isFinite(n)
    ? n.toLocaleString('it-IT', { maximumFractionDigits: 2 })
    : 'n/d';

/** Le voci del prospetto, nell'ordine in cui si leggono. */
const VOCI: { etichetta: string; chiave: keyof DatiFinanziariPeriodo; forte?: boolean }[] = [
  { etichetta: 'Ricavi delle vendite', chiave: 'ricaviVendite' },
  { etichetta: 'Valore della produzione', chiave: 'valoreProduzione' },
  { etichetta: 'Costi della produzione', chiave: 'costiProduzione' },
  { etichetta: 'EBITDA', chiave: 'ebitda', forte: true },
  { etichetta: 'Ammortamenti', chiave: 'ammortamenti' },
  { etichetta: 'EBIT', chiave: 'ebit', forte: true },
  { etichetta: 'Oneri finanziari', chiave: 'oneriFinanziari' },
  { etichetta: 'Risultato d’esercizio', chiave: 'utileEsercizio', forte: true },
  { etichetta: 'Patrimonio netto', chiave: 'patrimonioNetto', forte: true },
  { etichetta: 'Totale debiti', chiave: 'totaleDebiti' },
  { etichetta: 'Disponibilità liquide', chiave: 'disponibilitaLiquide' },
];

const pfn = (d: DatiFinanziariPeriodo) =>
  typeof d.debitiBanche === 'number' && typeof d.disponibilitaLiquide === 'number'
    ? d.debitiBanche - d.disponibilitaLiquide
    : undefined;

export function ProspettoContabileStorico({
  nomeSchema,
  aziendaId,
  indiciAbilitati = [],
}: {
  nomeSchema: string;
  aziendaId: number;
  /**
   * I codici degli indici abilitati nello spazio (Parametri di Spazio →
   * Indici). La tabella mostra questi, non i primi cinque che il motore
   * calcola: parlare di indici che l'ente non usa è rumore. Vuoto = ripiego
   * sugli indici del bilancio, così la tabella non resta mai senza righe.
   */
  indiciAbilitati?: string[];
}) {
  const [storico, setStorico] = useState<BilancioStoricoAzienda[]>([]);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setCaricamento(true);
      const r = await ottieniStoricoXbrlAzienda(nomeSchema, aziendaId);
      if (r.success) setStorico(r.storico.filter((b) => b.annoBilancio !== null));
      else setErrore(r.error ?? 'Impossibile leggere i bilanci archiviati.');
      setCaricamento(false);
    })();
  }, [nomeSchema, aziendaId]);

  if (caricamento) return <p className="text-xs text-slate-400">Caricamento del prospetto…</p>;
  if (errore) return <p className="text-xs text-red-700">{errore}</p>;
  if (storico.length === 0) {
    return (
      <p className="text-xs text-slate-500">
        Nessun bilancio XBRL in archivio: il prospetto compare appena carichi il primo file.
      </p>
    );
  }

  // Gli indici abilitati nello spazio, nell'ordine con cui li propone il
  // motore: la tabella deve parlare degli indici che questo ente usa davvero.
  const indiciUltimo = storico[storico.length - 1].indici;
  const codici = indiciAbilitati.length > 0 ? indiciAbilitati : indiciUltimo.map((i) => i.codice);
  const indici = codici
    .map((codice) => indiciUltimo.find((x) => x.codice === codice))
    .filter((x): x is NonNullable<typeof x> => Boolean(x));

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-[9px] uppercase text-slate-400 border-b border-slate-200">
              <th className="text-left py-1.5 pr-2">Voce</th>
              {storico.map((b) => (
                <th key={b.id} className="text-right py-1.5 px-1 whitespace-nowrap">
                  {b.annoBilancio}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {VOCI.map((v) => (
              <tr key={v.chiave} className={v.forte ? 'bg-slate-50/60' : undefined}>
                <td
                  className={`py-1 pr-2 ${v.forte ? 'font-bold text-slate-800' : 'text-slate-600'}`}
                >
                  {v.etichetta}
                </td>
                {storico.map((b) => (
                  <td
                    key={b.id}
                    className={`py-1 px-1 text-right tabular-nums ${
                      v.forte ? 'font-bold text-slate-900' : 'text-slate-700'
                    }`}
                  >
                    {euro(b.datiFinanziari[v.chiave] as number | undefined)}
                  </td>
                ))}
              </tr>
            ))}
            <tr className="border-t-2 border-slate-200">
              <td className="py-1 pr-2 font-bold text-slate-800">Posizione finanziaria netta</td>
              {storico.map((b) => (
                <td
                  key={b.id}
                  className="py-1 px-1 text-right tabular-nums font-bold text-slate-900"
                >
                  {euro(pfn(b.datiFinanziari))}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1 flex items-center gap-1.5">
          <Table2 className="w-3 h-3" /> Indici per annualità
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-[9px] uppercase text-slate-400 border-b border-slate-200">
                <th className="text-left py-1.5 pr-2">Indice</th>
                <th className="text-right py-1.5 px-1">Soglia</th>
                {storico.map((b) => (
                  <th key={b.id} className="text-right py-1.5 px-1">
                    {b.annoBilancio}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {indici.map((ind) => (
                <tr key={ind.codice}>
                  <td className="py-1 pr-2 text-slate-700">
                    <span className="font-mono text-[9px] text-slate-400 mr-1">{ind.codice}</span>
                    {ind.nome.replace(new RegExp(`^${ind.codice}\\s*[—-]\\s*`), '')}
                  </td>
                  <td className="py-1 px-1 text-right text-slate-500 text-[10px]">{ind.soglia}</td>
                  {storico.map((b) => {
                    const v = b.indici.find((x) => x.codice === ind.codice);
                    return (
                      <td
                        key={b.id}
                        title={v?.note}
                        className={`py-1 px-1 text-right tabular-nums ${
                          v?.esito === 'VIOLATO'
                            ? 'text-red-700 font-bold'
                            : v?.esito === 'OK'
                              ? 'text-emerald-700'
                              : 'text-slate-400'
                        }`}
                      >
                        {v ? num(v.valore) : '—'}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-1 text-[10px] text-slate-400 leading-relaxed">
          Stesse formule del resto della piattaforma. In rosso i valori oltre soglia: strumenti
          operativi di lettura, non parametri normativi.
        </p>
      </div>
    </div>
  );
}
