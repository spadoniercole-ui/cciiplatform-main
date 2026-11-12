import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, TrendingUp } from 'lucide-react';
import { ottieniContestoAccessoSpazio } from '@/app/actions/spazi';
import { ottieniAziendaPerId } from '@/app/actions/aziende';
import { ottieniDatiSettore } from '@/app/actions/datiSettore';
import { crescitaDaSerie } from '@/lib/piano/automatico';
import { ELASTICITA_COSTI } from '@/lib/verificaAzienda/simulazione';

// L'ANDAMENTO DEL SETTORE DI UNA SOLA AZIENDA.
//
// Tre letture, nell'ordine in cui la simulazione le usa: la serie ISTAT così
// com'è (valori annuali), la crescita composta che ne esce, e la traiettoria
// applicata ai ricavi e ai costi. I costi non seguono i ricavi uno a uno:
// arrivano a una quota della crescita di settore, dichiarata qui.

export const dynamic = 'force-dynamic';

const numero = (v: number) =>
  v.toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export default async function AndamentoSettorePage({
  params,
}: {
  params: Promise<{ codice: string; aziendaId: string }>;
}) {
  const { codice, aziendaId } = await params;
  const contesto = await ottieniContestoAccessoSpazio(codice);
  if (!contesto) redirect('/');
  if (contesto.modalita === 'OPERATORE') redirect(`/spazio/${codice}`);

  const id = Number(aziendaId);
  if (!Number.isInteger(id) || id <= 0) redirect(`/spazio/${codice}/studi-settore`);

  const azienda = await ottieniAziendaPerId(contesto.nomeSchema, id);
  if (!azienda.success || !azienda.azienda) redirect(`/spazio/${codice}/studi-settore`);

  const settore = await ottieniDatiSettore(contesto.nomeSchema, id).catch(() => null);

  // La serie si legge per anno (media dei periodi pubblicati), dal più vecchio
  // al più recente: è l'ordine in cui la crescita composta la attraversa.
  const perAnno = new Map<string, number[]>();
  for (const punto of settore?.punti ?? []) {
    const anno = String(punto.periodo).slice(0, 4);
    if (!/^\d{4}$/.test(anno) || !Number.isFinite(punto.valore)) continue;
    if (!perAnno.has(anno)) perAnno.set(anno, []);
    perAnno.get(anno)!.push(punto.valore);
  }
  const anni = Array.from(perAnno.entries())
    .map(([anno, valori]) => ({
      anno: Number(anno),
      valore: valori.reduce((x, y) => x + y, 0) / valori.length,
    }))
    .sort((a, b) => a.anno - b.anno);
  const crescita = crescitaDaSerie(settore?.punti ?? []);
  const crescitaCosti = crescita ? crescita.tasso * ELASTICITA_COSTI : null;

  return (
    <div className="max-w-4xl space-y-4">
      <Link
        href={`/spazio/${codice}/studi-settore`}
        className="inline-flex items-center gap-1.5 text-[11px] text-slate-500 hover:text-blue-600 font-bold uppercase tracking-wider"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Torna agli studi di settore
      </Link>

      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <h1 className="text-lg font-bold text-slate-900 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-blue-600" /> Andamento del settore —{' '}
          {azienda.azienda.ragioneSociale}
        </h1>
        <p className="text-xs text-slate-500 mt-1 leading-relaxed max-w-3xl">
          Il settore è quello del codice ATECO dell’azienda: è il riferimento che la simulazione usa
          per far convergere la crescita storica. I valori sono la serie ISTAT, non una stima della
          piattaforma.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
            Codice ATECO
          </p>
          <p className="mt-1 text-sm font-bold text-slate-900">
            {azienda.azienda.codiceAteco || 'non impostato'}
          </p>
          {settore?.info && (
            <p className="mt-1 text-[10px] text-slate-500">
              Gruppo {settore.info.gruppo}
              {settore.info.sezione ? ` · sezione ${settore.info.sezione}` : ''}
              {settore.livelloUsato === 'divisione' ? ' · serie di divisione' : ''}
            </p>
          )}
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
            Crescita di settore
          </p>
          <p className="mt-1 text-sm font-bold text-slate-900">
            {crescita ? `${numero(crescita.tasso)}% l’anno` : 'non calcolabile'}
          </p>
          <p className="mt-1 text-[10px] text-slate-500">
            {crescita
              ? `composta dal ${crescita.dal} al ${crescita.al}`
              : 'servono almeno due annualità pubblicate'}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
            Destinazione dei costi
          </p>
          <p className="mt-1 text-sm font-bold text-slate-900">
            {crescitaCosti !== null ? `${numero(crescitaCosti)}% l’anno` : 'non calcolabile'}
          </p>
          <p className="mt-1 text-[10px] text-slate-500">
            crescita di settore × elasticità dichiarata {Math.round(ELASTICITA_COSTI * 100)}%: solo
            la parte variabile dei costi segue i volumi.
          </p>
        </div>
      </div>

      {settore && !settore.success && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
          {settore.error ?? 'Serie di settore non leggibile per questa azienda.'}
        </p>
      )}

      {settore?.success && anni.length === 0 && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
          Nessuna serie in archivio per questo gruppo ATECO. Il dato non viene interrogato da qui:
          si aggiorna dalla scheda di settore della verifica contabile, quando serve, perché ISTAT
          ammette poche richieste al minuto.
        </p>
      )}

      {anni.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Serie ISTAT del gruppo {settore?.info?.gruppo ?? ''}
            </p>
            <p className="text-[10px] text-slate-400">
              {settore?.aggiornatoIl
                ? `aggiornata il ${new Date(settore.aggiornatoIl).toLocaleDateString('it-IT')}`
                : ''}
            </p>
          </div>
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-[9px] uppercase text-slate-400 border-b border-slate-200">
                <th className="text-left py-1.5">Anno</th>
                <th className="text-right py-1.5">Valore</th>
                <th className="text-right py-1.5">Variazione</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {anni.map((a, i) => {
                const precedente = i > 0 ? anni[i - 1].valore : null;
                const variazione =
                  precedente && precedente !== 0
                    ? ((a.valore - precedente) / precedente) * 100
                    : null;
                return (
                  <tr key={a.anno}>
                    <td className="py-1 text-slate-700">{a.anno}</td>
                    <td className="py-1 text-right tabular-nums text-slate-800">
                      {a.valore.toLocaleString('it-IT', { maximumFractionDigits: 2 })}
                    </td>
                    <td className="py-1 text-right tabular-nums text-slate-600">
                      {variazione === null
                        ? '—'
                        : `${variazione > 0 ? '+' : ''}${numero(variazione)}%`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="text-[10px] text-slate-400 leading-relaxed">
            La crescita di settore è la composta fra la prima e l’ultima annualità della serie, non
            la media delle variazioni annuali.
          </p>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
          Come la simulazione usa questo dato
        </p>
        <p className="text-[11px] text-slate-600 leading-relaxed">
          I ricavi partono dalla crescita storica dell’azienda e si avvicinano anno dopo anno alla
          crescita di settore ({crescita ? `${numero(crescita.tasso)}%` : 'non disponibile'}). I
          costi partono dalla <em>loro</em> crescita storica e arrivano alla quota dichiarata (
          {crescitaCosti !== null ? `${numero(crescitaCosti)}%` : 'non disponibile'}): le due
          colonne non crescono della stessa misura, perché non dipendono dagli stessi fattori.
        </p>
        <Link
          href={`/spazio/${codice}/verifica-azienda/${id}`}
          className="inline-flex text-[10px] font-bold uppercase tracking-wider text-blue-700 hover:text-blue-800"
        >
          Apri la mappa della verifica azienda →
        </Link>
      </div>
    </div>
  );
}
