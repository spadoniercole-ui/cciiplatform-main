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
// lascerebbe il segno soltanto nella cifra, e la lunghezza direbbe il falso. La
// posizione la calcola `geometriaBarra`, che ha i suoi test.
//
// Vive in un componente suo perché lo usano due schermate — il ritratto
// aziendale e l'esito della verifica contabile: è lo stesso disegno, e due
// copie divergerebbero.

import { geometriaBarra, type BarraGrafico } from '@/lib/ritratto/iconografia';
import { BARRA_TONO, TESTO_TONO, tonoDelDato } from '@/lib/ritratto/toni';

export function BarraDato({
  b,
  massimo,
  minimo = 0,
}: {
  b: BarraGrafico;
  massimo: number;
  minimo?: number;
}) {
  const { zero, inizio, larghezza } = geometriaBarra(b.valore, massimo, minimo);
  // Il colore dice il verso del dato: verde se favorevole, rosso se sfavorevole,
  // arancione se neutro; grigio — uno solo — se il valore non c'è e quindi non
  // si interpreta. Non è un giudizio: è la stessa regola del ritratto.
  const tono = tonoDelDato({ valore: b.valore, segnala: b.segnala });

  return (
    <div className="mt-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 text-[10px] leading-snug text-slate-600">{b.etichetta}</span>
        <span className={`shrink-0 text-[10px] font-bold tabular-nums ${TESTO_TONO[tono]}`}>
          {b.testo}
        </span>
      </div>
      <div className="relative mt-0.5 h-1.5 overflow-hidden rounded-full bg-slate-200/70">
        <div
          className={`absolute top-0 h-full rounded-full ${BARRA_TONO[tono]}`}
          style={{
            left: `${inizio}%`,
            width: `${larghezza === 0 ? 0 : Math.max(0.8, larghezza)}%`,
          }}
        />
        {/* La linea dello zero: senza, una barra che parte da sinistra non dice
            da dove parte, e il suo inizio sembra il bordo del grafico. */}
        {minimo < 0 && (
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
