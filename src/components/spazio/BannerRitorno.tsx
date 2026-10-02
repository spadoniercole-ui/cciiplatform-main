import Link from 'next/link';
import type { Ritorno } from '@/lib/ritorno';

/** Avviso in testa alle pagine di servizio aperte dalla pagina unica dello scenario. */
export function BannerRitorno({ ritorno, nota }: { ritorno: Ritorno; nota?: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-sky-900 bg-sky-50 border border-sky-200 rounded-lg p-3">
      <span>
        Sei qui dalla <span className="font-bold">{ritorno.da}</span>
        {nota ? `: ${nota}` : ': quando hai finito torni al punto da cui sei partito.'}
      </span>
      <Link
        href={ritorno.url}
        className="px-3 py-1.5 bg-white border border-sky-300 hover:bg-sky-100 text-sky-800 font-bold text-[10px] uppercase rounded-lg"
      >
        ← {ritorno.pulsante}
      </Link>
    </div>
  );
}
