// UNA BARRA PER OGNI DATO — il disegno dei grafici delle dimensioni (0.256.7).
//
// La scala è quella del grafico (dal fondo al massimo), non una percentuale
// inventata: la lunghezza dice quanto vale il dato rispetto agli altri dello
// stesso grafico. Una barra rossa non è un giudizio, è un fatto sfavorevole
// (patrimonio negativo, ricavi in calo, debito non contabilizzato) che la
// dimensione ha già dichiarato.
//
// SOTTO ZERO SI VA A SINISTRA. Quando la scala scende sotto zero — patrimonio
// netto negativo, perdita d'esercizio — la barra parte dalla linea dello zero e
// cresce verso sinistra: disegnarla verso destra come un valore positivo
// lascerebbe il segno soltanto nella cifra, e la lunghezza direbbe il falso.
//
// Vive in un componente suo perché lo usano due schermate — il ritratto
// aziendale e l'esito della verifica contabile: è lo stesso disegno, e due
// copie divergerebbero.

import type { BarraGrafico } from '@/lib/ritratto/iconografia';

export function BarraDato({
  b,
  massimo,
  minimo = 0,
}: {
  b: BarraGrafico;
  massimo: number;
  minimo?: number;
}) {
  const fondo = Math.min(0, minimo);
  const cima = Math.max(massimo, 1);
  const ampiezza = cima - fondo || 1;
  const zero = ((0 - fondo) / ampiezza) * 100;
  const valore = b.valore === null ? null : b.valore;
  const inizio = valore === null ? zero : ((Math.min(valore, 0) - fondo) / ampiezza) * 100;
  const larghezza = valore === null ? 0 : (Math.abs(valore) / ampiezza) * 100;

  return (
    <div className="mt-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 text-[10px] leading-snug text-slate-600">{b.etichetta}</span>
        <span
          className={`shrink-0 text-[10px] font-bold tabular-nums ${
            b.segnala ? 'text-red-700' : 'text-slate-800'
          }`}
        >
          {b.testo}
        </span>
      </div>
      <div className="relative mt-0.5 h-1.5 overflow-hidden rounded-full bg-slate-200/70">
        <div
          className={`absolute top-0 h-full rounded-full ${
            b.segnala ? 'bg-red-400' : 'bg-slate-400'
          }`}
          style={{
            left: `${inizio}%`,
            width: `${larghezza === 0 ? 0 : Math.max(0.8, larghezza)}%`,
          }}
        />
        {/* La linea dello zero: senza, una barra che parte da sinistra non dice
            da dove parte, e il suo inizio sembra il bordo del grafico. */}
        {fondo < 0 && (
          <div
            className="absolute top-0 z-10 h-full w-[2px] bg-slate-700"
            style={{ left: `calc(${zero}% - 1px)` }}
            aria-hidden
          />
        )}
      </div>
      {b.riferimento && <p className="text-[9px] leading-snug text-slate-400">{b.riferimento}</p>}
    </div>
  );
}
