// LA LEGENDA A MARGINE — il colore non resta muto.
//
// Un semaforo rosso senza legenda chiede di indovinare: rosso quanto? rispetto
// a cosa? Ogni schermata che colora un giudizio porta questa riga accanto, con
// il significato dei toni che usa. Le etichette si adattano al contesto (in una
// tabella «oltre la soglia», in un semaforo «priorità alta»), la parola di
// fondo no: viene da `src/lib/colori/significato.ts`.
//
// Il componente non ha stato né 'use client': vive sia nei Server Component sia
// in quelli client, così la legenda non resta fuori dalle schermate interattive.

import { PALLINO, SIGNIFICATO_TONO, TONI, type Tono } from '@/lib/colori/significato';

interface Props {
  /** I toni che questa schermata usa davvero. Predefiniti: tutti e quattro. */
  toni?: readonly Tono[];
  /** Il significato di questo contesto, quando è più preciso di quello generale. */
  etichette?: Partial<Record<Tono, string>>;
  /** La riga finale: contesto, limiti, o perché il colore non è un voto. */
  nota?: string;
  titolo?: string;
}

export function LegendaColori({ toni = TONI, etichette, nota, titolo }: Props) {
  return (
    <aside
      aria-label={titolo ?? 'Legenda dei colori'}
      className="text-[10px] leading-relaxed text-slate-500"
    >
      <dl className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
        {toni.map((tono) => (
          <div key={tono} className="flex items-baseline gap-1.5">
            <span
              aria-hidden="true"
              className={`inline-block w-2 h-2 rounded-full shrink-0 self-center ${PALLINO[tono]}`}
            />
            <dt className="font-bold text-slate-600">
              {etichette?.[tono] ?? SIGNIFICATO_TONO[tono].breve}
            </dt>
            <dd className="text-slate-500">{SIGNIFICATO_TONO[tono].esteso}</dd>
          </div>
        ))}
      </dl>
      {nota && <p className="mt-1 text-slate-400 text-[9px]">{nota}</p>}
    </aside>
  );
}
