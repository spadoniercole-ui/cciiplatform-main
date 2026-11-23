// IL RITRATTO AZIENDALE — i quattro riquadri a schermo.
//
// Componente di sola presentazione: riceve il ritratto già composto da
// `componiRitratto` e non calcola nulla. Nessun numero nuovo, nessun totale:
// il giudizio è quello del semaforo e le barre dicono solo quanto pesa
// ciascuna dimensione.
//
// Il riquadro in fondo — «Che cosa il ritratto non dice» — non è un dettaglio
// tecnico: senza, una fotografia sintetica sembra completa anche quando non lo
// è, ed è il modo più semplice per prendere una decisione su un dato che non
// c'è.

import type { EsitoAttenzione } from '@/lib/screening/indicatore';
import type {
  RiquadroGiudizio,
  Ritratto,
  StatoLettura,
  VoceDirettrice,
} from '@/lib/ritratto/ritratto';

interface Props {
  ritratto: Ritratto;
}

const STILE_ESITO: Record<EsitoAttenzione, { banda: string; pallino: string; testo: string }> = {
  ROSSO: {
    banda: 'border-red-200 bg-red-50',
    pallino: 'bg-red-500',
    testo: 'text-red-900',
  },
  GIALLO: {
    banda: 'border-amber-200 bg-amber-50',
    pallino: 'bg-amber-400',
    testo: 'text-amber-900',
  },
  ATTENZIONE_MINIMA: {
    banda: 'border-emerald-200 bg-emerald-50',
    pallino: 'bg-emerald-500',
    testo: 'text-emerald-900',
  },
};

const STILE_DIRETTRICE: Record<VoceDirettrice['stato'], { pallino: string; testo: string }> = {
  COMPLETO: { pallino: 'bg-emerald-500', testo: 'text-emerald-700' },
  PARZIALE: { pallino: 'bg-amber-400', testo: 'text-amber-700' },
  MANCANTE: { pallino: 'bg-slate-300', testo: 'text-slate-500' },
  NON_DISPONIBILE: { pallino: 'bg-slate-200', testo: 'text-slate-400' },
};

const ETICHETTA_LETTURA: Record<StatoLettura, { testo: string; classe: string }> = {
  LETTA: { testo: 'letta', classe: 'bg-emerald-50 text-emerald-700' },
  PARZIALE: { testo: 'parziale', classe: 'bg-amber-50 text-amber-700' },
  NON_LETTA: { testo: 'non misurata', classe: 'bg-slate-100 text-slate-500' },
};

function TitoloRiquadro({
  numero,
  titolo,
  nota,
}: {
  numero: number;
  titolo: string;
  nota?: string;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[10px] font-black text-white">
        {numero}
      </span>
      <h2 className="text-[11px] font-black uppercase tracking-widest text-slate-700">{titolo}</h2>
      {nota && <span className="text-[10px] text-slate-400">{nota}</span>}
    </div>
  );
}

function BloccoGiudizio({ giudizio }: { giudizio: RiquadroGiudizio }) {
  if (!giudizio.presente || !giudizio.esito) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-5">
        <p className="text-xs font-bold text-slate-600">{giudizio.sintesi}</p>
        <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{giudizio.nota}</p>
      </div>
    );
  }
  const s = STILE_ESITO[giudizio.esito];
  return (
    <div className={`rounded-lg border px-4 py-4 ${s.banda}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${s.pallino}`} />
          <span className={`text-sm font-black ${s.testo}`}>{giudizio.etichetta}</span>
        </span>
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
          {giudizio.parola}
        </span>
        <span className="ml-auto rounded bg-white/70 px-2 py-0.5 text-[10px] font-bold text-slate-600">
          copertura {giudizio.copertura?.testo}
        </span>
      </div>

      <p className="mt-1.5 text-[11px] text-slate-600">
        Fattore determinante: <span className="font-bold">{giudizio.fattoreDeterminante}</span>
      </p>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div>
          <h3 className="text-[9px] font-black uppercase tracking-widest text-slate-500">
            Accertato
          </h3>
          {giudizio.accertato.length > 0 ? (
            <ul className="mt-1 space-y-1">
              {giudizio.accertato.map((x, i) => (
                <li key={i} className="text-[11px] leading-snug text-slate-700">
                  — {x}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-[11px] text-slate-400">Nessun elemento accertato.</p>
          )}
        </div>
        <div>
          <h3 className="text-[9px] font-black uppercase tracking-widest text-slate-500">
            Da accertare
          </h3>
          {giudizio.daAccertare.length > 0 ? (
            <ul className="mt-1 space-y-1">
              {giudizio.daAccertare.map((x, i) => (
                <li key={i} className="text-[11px] leading-snug text-slate-700">
                  — {x}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-[11px] text-slate-400">
              Nulla da integrare con i dati previsti.
            </p>
          )}
        </div>
      </div>

      {giudizio.copertura?.limitata && (
        <p className="mt-2 text-[10px] leading-relaxed text-slate-600">
          Il giudizio è limitato ai dati disponibili: {giudizio.copertura.determinate} dimensioni su{' '}
          {giudizio.copertura.totali} erano determinabili.
        </p>
      )}
    </div>
  );
}

export function RitrattoAzienda({ ritratto }: Props) {
  const { testata, direttrici, giudizio, dimensioni, mancanze } = ritratto;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-base font-black text-slate-900">Iconografia aziendale</h1>
        <p className="mt-0.5 max-w-2xl text-[11px] leading-relaxed text-slate-500">
          Quanto il sistema ha sviluppato su questa posizione, in quattro riquadri. Nessun punteggio
          nuovo: il giudizio è quello della verifica e le dimensioni lo spiegano.
        </p>
      </div>

      {/* 1 · L'impresa */}
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <TitoloRiquadro numero={1} titolo="L’impresa" nota="anagrafica e dati già acquisiti" />
        <div className="mt-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-sm font-black text-slate-900">{testata.nome}</p>
            {testata.sottotitolo && (
              <p className="text-[11px] text-slate-500">{testata.sottotitolo}</p>
            )}
          </div>
          <span
            className={`rounded px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${
              testata.attiva ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
            }`}
          >
            {testata.attiva ? 'Attiva' : 'Disabilitata'}
          </span>
        </div>

        <dl className="mt-3 grid gap-x-4 gap-y-1.5 text-[11px] sm:grid-cols-2 lg:grid-cols-3">
          {testata.identificativi.map((i) => (
            <div key={`${i.etichetta}-${i.valore}`}>
              <dt className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                {i.etichetta}
              </dt>
              <dd className="text-slate-700">{i.valore}</dd>
            </div>
          ))}
          <div>
            <dt className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
              Verifica amministrativa
            </dt>
            <dd className="text-slate-700">
              {testata.verificataIl ? `del ${testata.verificataIl}` : 'mai eseguita'}
            </dd>
          </div>
          <div>
            <dt className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
              Debito memorizzato
            </dt>
            <dd className="text-slate-700">
              {testata.debito
                ? `${testata.debito.testo}${testata.debito.il ? ` · ${testata.debito.il}` : ''}`
                : 'nessun debito memorizzato'}
            </dd>
          </div>
        </dl>
      </section>

      {/* 2 · Le tre direttrici */}
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <TitoloRiquadro numero={2} titolo="Le tre direttrici" nota={direttrici.nota} />
        <div className="mt-3 grid gap-2 md:grid-cols-3">
          {direttrici.voci.map((v) => {
            const s = STILE_DIRETTRICE[v.stato];
            return (
              <div key={v.id} className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${s.pallino}`} />
                  <span className="text-[11px] font-black text-slate-800">{v.nome}</span>
                  <span
                    className={`ml-auto text-[9px] font-bold uppercase tracking-wider ${s.testo}`}
                  >
                    {v.etichettaStato}
                  </span>
                </div>
                <p className="mt-1.5 text-[10px] leading-snug text-slate-500">{v.cosa}</p>
                {v.richiede && (
                  <p className="mt-1.5 text-[10px] leading-snug text-amber-800">{v.richiede}</p>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* 3 · Il giudizio */}
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <TitoloRiquadro numero={3} titolo="Il giudizio" nota="uno solo, con la sua copertura" />
        <div className="mt-3">
          <BloccoGiudizio giudizio={giudizio} />
        </div>
        <p className="mt-2 text-[10px] leading-relaxed text-slate-400">{giudizio.nota}</p>
      </section>

      {/* 4 · Le cinque dimensioni */}
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <TitoloRiquadro
          numero={4}
          titolo="Le cinque dimensioni"
          nota={dimensioni.presente ? `${dimensioni.lette} lette per intero` : undefined}
        />
        {dimensioni.presente ? (
          <div className="mt-3 divide-y divide-slate-100">
            {dimensioni.voci.map((v) => {
              const lettura = ETICHETTA_LETTURA[v.stato];
              return (
                <div key={v.lettera} className="py-2.5 first:pt-0 last:pb-0">
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-slate-900 text-[10px] font-black text-white">
                      {v.lettera}
                    </span>
                    <span className="text-[11px] font-bold text-slate-800">{v.nome}</span>
                    <span
                      className={`ml-auto rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${lettura.classe}`}
                    >
                      {lettura.testo}
                    </span>
                  </div>

                  {/* LA BARRA, NON LA RAGNATELA.
                      Le cinque dimensioni non si sommano e non hanno pesi: la
                      barra dice quanto pesa ciascuna, da sola. Una ragnatela a
                      cinque assi — o una bolla — chiuderebbe i vertici in
                      un'area, e l'area è un voto d'insieme: il secondo
                      giudizio che il modello evita (vedi `lib/ritratto/ritratto.ts`). */}
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={
                          v.punteggio >= 50
                            ? 'h-full rounded-full bg-red-400'
                            : 'h-full rounded-full bg-slate-300'
                        }
                        style={{ width: `${Math.max(2, Math.min(100, v.punteggio))}%` }}
                      />
                    </div>
                    <span className="w-8 shrink-0 text-right text-[9px] font-mono text-slate-400">
                      {v.punteggio}
                    </span>
                  </div>

                  {v.motivi.length > 0 && (
                    <ul className="mt-1 space-y-0.5">
                      {v.motivi.map((m, i) => (
                        <li key={i} className="text-[10px] leading-snug text-slate-600">
                          — {m}
                        </li>
                      ))}
                    </ul>
                  )}
                  {v.lacune.length > 0 && (
                    <p className="mt-0.5 text-[10px] leading-snug text-slate-400">
                      Lacuna: {v.lacune.join('; ')}.
                    </p>
                  )}
                  {v.motivi.length === 0 && v.lacune.length === 0 && (
                    <p className="mt-1 text-[10px] text-slate-400">
                      {v.punteggio > 0
                        ? 'Nessun determinante in chiaro: l’intensità resta quella misurata dal motore.'
                        : 'Nessun determinante su questa dimensione.'}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="mt-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-[11px] text-slate-500">
            Non disponibili: le dimensioni si calcolano sulla verifica della posizione.
          </p>
        )}
        <p className="mt-2 text-[10px] leading-relaxed text-slate-400">{dimensioni.nota}</p>
      </section>

      {mancanze.length > 0 && (
        <section className="rounded-xl border border-amber-200 bg-amber-50/70 p-4">
          <h2 className="text-[10px] font-black uppercase tracking-widest text-amber-900">
            Che cosa l’iconografia non dice
          </h2>
          <ul className="mt-1.5 space-y-1">
            {mancanze.map((m, i) => (
              <li key={i} className="text-[11px] leading-snug text-amber-900">
                — {m}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
