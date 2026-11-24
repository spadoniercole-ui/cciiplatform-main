// I PASSI DI UNA PROCEDURA, NUMERATI (0.256.0).
//
// Ogni verifica è una sequenza di passaggi, e l'utente deve sapere sempre dove
// si trova e perché quel passaggio esiste. Il numero dice l'ordine, il titolo
// dice il passaggio, l'obiettivo dice a che cosa serve: senza quest'ultimo un
// elenco di sezioni resta un modulo da compilare, non un percorso guidato.
//
// Il componente è puramente presentativo e non è un client component: si usa
// dentro le pagine server e dentro i componenti client senza distinzione.

import type { LucideIcon } from 'lucide-react';
import { CheckCircle2, CircleDashed } from 'lucide-react';

export function PassoProcedura({
  numero,
  titolo,
  obiettivo,
  icona: Icona,
  fatto,
  azione,
  id,
}: {
  /** Posizione del passaggio nella procedura: 1, 2, 3… */
  numero: number;
  /** Ancora della sezione: serve ai ritorni da una pagina di servizio. */
  id?: string;
  titolo: string;
  /** Una frase: che cosa si ottiene con questo passaggio. */
  obiettivo: string;
  icona?: LucideIcon;
  /** Quando è noto: il passaggio è chiuso o ancora da fare. */
  fatto?: boolean;
  /** Comando a destra, per esempio «Aggiungi». */
  azione?: React.ReactNode;
}) {
  return (
    <div id={id} className="flex items-start gap-3 scroll-mt-4">
      <span
        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold tabular-nums ${
          fatto === true
            ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
            : fatto === false
              ? 'border-amber-300 bg-amber-50 text-amber-800'
              : 'border-slate-300 bg-white text-slate-700'
        }`}
        aria-hidden
      >
        {numero}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-700">
            {Icona && <Icona className="w-3.5 h-3.5 text-blue-600" />}
            Passo {numero} · {titolo}
            {fatto !== undefined &&
              (fatto ? (
                <CheckCircle2 className="w-3 h-3 text-emerald-600" aria-label="completato" />
              ) : (
                <CircleDashed className="w-3 h-3 text-amber-600" aria-label="da completare" />
              ))}
          </h2>
          {azione}
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{obiettivo}</p>
      </div>
    </div>
  );
}
