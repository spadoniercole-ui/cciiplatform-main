// LA FOTOGRAFIA COMPLESSIVA — le due verifiche incrociate, non affiancate.
//
// Un solo componente per la scheda della verifica aziendale e per il documento
// che si rilascia all'ente: stesso contenuto, stessa lettura. Componente
// presentazionale, senza stato e senza accesso al dato: lo compone la pagina.
//
// Ogni incrocio dice che cosa vede ciascuna verifica, se le due letture
// concordano o divergono, che cosa significa leggerle insieme e — quando
// divergono — l'errore che la spiegazione evita. Le divergenze non si spengono:
// sono la parte più informativa del documento.

import type {
  FotografiaComplessiva,
  Incrocio,
  NaturaIncrocio,
} from '@/lib/verificaAzienda/interpolazione';

const NATURA: Record<NaturaIncrocio, { parola: string; classe: string }> = {
  CONCORDE: {
    parola: 'concordano',
    classe: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  DIVERGENTE: { parola: 'divergono', classe: 'bg-red-50 text-red-700 border-red-200' },
  SOLO_AMMINISTRATIVA: {
    parola: 'solo amministrativa',
    classe: 'bg-amber-50 text-amber-800 border-amber-200',
  },
  SOLO_CONTABILE: {
    parola: 'solo contabile',
    classe: 'bg-slate-100 text-slate-600 border-slate-200',
  },
};

function IncrocioCard({ i }: { i: Incrocio }) {
  const n = NATURA[i.natura];
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-1.5 break-inside-avoid">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-bold text-slate-900">{i.tema}</p>
        <span
          className={`shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${n.classe}`}
        >
          {n.parola}
        </span>
      </div>
      <p className="text-[10px] text-slate-600 leading-relaxed">
        <span className="font-bold uppercase tracking-wider text-[9px] text-slate-400">
          Amministrativa
        </span>{' '}
        {i.amministrativa}
      </p>
      <p className="text-[10px] text-slate-600 leading-relaxed">
        <span className="font-bold uppercase tracking-wider text-[9px] text-slate-400">
          Contabile
        </span>{' '}
        {i.contabile}
      </p>
      <p className="text-[11px] text-slate-700 leading-relaxed">{i.lettura}</p>
      {i.rischio && <p className="text-[10px] text-amber-900 leading-relaxed">— {i.rischio}</p>}
    </div>
  );
}

export function FotografiaComplessivaView({
  complessiva,
  compatta = false,
}: {
  complessiva: FotografiaComplessiva;
  /** Nella scheda i blocchi di rilascio stanno in fondo; nel documento aprono. */
  compatta?: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <p className="text-[11px] text-slate-700 leading-relaxed flex-1 min-w-[240px]">
          {complessiva.sintesi}
        </p>
        {complessiva.incroci.length > 0 && (
          <p className="text-[10px] text-slate-500 tabular-nums">
            {complessiva.concordanze} concordi · {complessiva.divergenze} divergenti
          </p>
        )}
      </div>

      {complessiva.incroci.length > 0 && (
        <div className="grid gap-2 md:grid-cols-2">
          {complessiva.incroci.map((i) => (
            <IncrocioCard key={i.codice} i={i} />
          ))}
        </div>
      )}

      {!compatta && complessiva.daRilasciare.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
          <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
            Ciò che il documento consegnato all’ente porta
          </p>
          {complessiva.daRilasciare.map((b) => (
            <div key={b.titolo}>
              <p className="text-[11px] font-bold text-slate-800">{b.titolo}</p>
              <p className="text-[11px] text-slate-700 leading-relaxed">{b.testo}</p>
            </div>
          ))}
        </div>
      )}

      {complessiva.lacune.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 space-y-1">
          <p className="text-[9px] font-bold uppercase tracking-wider text-amber-800">
            Ciò che manca per chiudere la fotografia
          </p>
          <ul className="space-y-0.5">
            {[...new Set(complessiva.lacune)].map((l) => (
              <li key={l} className="text-[10px] text-amber-900 leading-relaxed">
                — {l}
              </li>
            ))}
          </ul>
        </div>
      )}

      <ul className="space-y-0.5">
        {complessiva.avvertenze.map((a) => (
          <li key={a} className="text-[10px] text-slate-500 leading-relaxed">
            — {a}
          </li>
        ))}
      </ul>
    </div>
  );
}
