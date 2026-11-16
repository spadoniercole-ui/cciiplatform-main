import Link from 'next/link';
import { valutaValidita } from '@/lib/screening/validitaVerifica';

// IL PORTAFOGLIO DELL'ENTE (0.242.0).
//
// Tutto il resto della catena è per azienda; un ente ragiona per insieme:
// quante posizioni ha verificato, quante stanno invecchiando, quante sono
// rosse, su quante la contabile non è completa. Senza questo, l'invecchiamento
// e la prontezza restano un dettaglio di pagina e non diventano una pratica di
// lavoro.
//
// Componente server: legge quello che la pagina ha già letto, non ricalcola
// nulla e non chiama motori.

export interface RigaCruscotto {
  id: number;
  ragioneSociale: string;
  esito: string | null;
  eseguitaIl: string | null;
}

export function CruscottoVerificheEnte({
  codice,
  righe,
  contabileIncompleta,
}: {
  codice: string;
  righe: RigaCruscotto[];
  contabileIncompleta: number;
}) {
  if (righe.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-5">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
          Portafoglio dell’ente
        </p>
        <p className="mt-1 text-[11px] text-slate-600">
          Nessuna verifica eseguita: il cruscotto si popola dalla prima posizione chiusa.
        </p>
      </div>
    );
  }

  const conValidita = righe.map((r) => ({ ...r, validita: valutaValidita(r.eseguitaIl) }));
  const daRivedere = conValidita.filter((r) => r.validita.stato === 'da_rivedere');
  const inScadenza = conValidita.filter((r) => r.validita.stato === 'in_scadenza');
  const rosse = conValidita.filter((r) => r.esito === 'ROSSO');
  const gialle = conValidita.filter((r) => r.esito === 'GIALLO');
  const invecchiate = [...daRivedere].sort((a, b) => b.validita.giorni - a.validita.giorni);

  const riquadri = [
    { etichetta: 'Posizioni verificate', valore: righe.length, nota: 'nello storico' },
    {
      etichetta: 'Da rivedere',
      valore: daRivedere.length,
      nota: `in scadenza: ${inScadenza.length}`,
    },
    { etichetta: 'Rosse', valore: rosse.length, nota: `gialle: ${gialle.length}` },
    {
      etichetta: 'Contabile incompleta',
      valore: contabileIncompleta,
      nota: 'visura, anagrafica o bilanci',
    },
  ];

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
          Portafoglio dell’ente
        </p>
        <p className="text-[10px] text-slate-400">
          Conteggi sullo storico delle verifiche; l’esito non si ricalcola qui.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-4">
        {riquadri.map((r) => (
          <div key={r.etichetta} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
              {r.etichetta}
            </p>
            <p className="text-lg font-bold tabular-nums text-slate-900">{r.valore}</p>
            <p className="text-[9px] text-slate-500">{r.nota}</p>
          </div>
        ))}
      </div>
      {invecchiate.length > 0 && (
        <div className="space-y-1">
          <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
            Prima da rivedere
          </p>
          <ul className="space-y-1">
            {invecchiate.slice(0, 3).map((r) => (
              <li key={r.id} className="flex items-baseline justify-between gap-2 text-[11px]">
                <Link
                  href={`/spazio/${codice}/verifica-salute/${r.id}/posizione`}
                  className="font-bold text-blue-700 hover:text-blue-800"
                >
                  {r.ragioneSociale}
                </Link>
                <span className="text-[10px] text-slate-500">{r.validita.etichetta}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
