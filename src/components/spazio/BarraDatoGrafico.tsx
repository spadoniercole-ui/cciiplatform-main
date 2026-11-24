// UNA BARRA PER OGNI DATO — il disegno dei grafici delle dimensioni (0.256.6).
//
// La scala è quella del grafico (massimo assoluto), non una percentuale
// inventata: la lunghezza dice quanto vale il dato rispetto agli altri dello
// stesso grafico. Una barra rossa non è un giudizio, è un fatto sfavorevole
// (patrimonio negativo, ricavi in calo, debito non contabilizzato) che la
// dimensione ha già dichiarato.
//
// Vive in un componente suo perché lo usano due schermate — il ritratto
// aziendale e l'esito della verifica contabile: è lo stesso disegno, e due
// copie divergerebbero.

import type { BarraGrafico } from '@/lib/ritratto/iconografia';

export function BarraDato({ b, massimo }: { b: BarraGrafico; massimo: number }) {
  const quota =
    b.valore === null || massimo <= 0 ? 0 : Math.min(100, (Math.abs(b.valore) / massimo) * 100);
  return (
    <div className="mt-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] leading-snug text-slate-600">{b.etichetta}</span>
        <span
          className={`shrink-0 text-[10px] font-bold tabular-nums ${
            b.segnala ? 'text-red-700' : 'text-slate-800'
          }`}
        >
          {b.testo}
        </span>
      </div>
      <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-slate-200/70">
        <div
          className={`h-full rounded-full ${b.segnala ? 'bg-red-400' : 'bg-slate-400'}`}
          style={{ width: `${quota === 0 ? 0 : Math.max(2, quota)}%` }}
        />
      </div>
      {b.riferimento && <p className="text-[9px] leading-snug text-slate-400">{b.riferimento}</p>}
    </div>
  );
}
