'use client';

import Link from 'next/link';
import { Building2, FolderOpen, Gauge, Stethoscope } from 'lucide-react';

export interface RigaVerificaDashboard {
  id: number;
  ragioneSociale: string;
  partitaIva: string | null;
  esito: string | null;
  presaInCarico: boolean;
  archiviata: boolean;
}

export interface RigaScenario {
  id: number;
  nome: string;
  aziendaRagioneSociale: string;
}

export interface RigaContabileDashboard {
  id: number;
  ragioneSociale: string;
  partitaIva: string | null;
  completa: boolean;
  anniXbrl: number;
  visuraPresente: boolean;
}

export interface RigaAziendaDashboard {
  id: number;
  ragioneSociale: string;
  debitoMemorizzato: number | null;
  anniXbrl: number;
}

interface Props {
  codice: string;
  verifiche?: RigaVerificaDashboard[];
  /** null = non leggibile a questo accesso (Operatore): la card lo dichiara. */
  contabile: RigaContabileDashboard[] | null;
  /** null = non leggibile a questo accesso (Operatore): la card lo dichiara. */
  azienda: RigaAziendaDashboard[] | null;
  scenari: RigaScenario[];
  totaleScenari: number | '—';
}

const MAX = 4;

/** Intestazione comune delle card: icona, etichetta e conteggio. */
function Intestazione({
  icon: Icon,
  colore,
  label,
  totale,
}: {
  icon: typeof Stethoscope;
  colore: string;
  label: string;
  totale: number | '—';
}) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <div className={`inline-flex p-2 rounded-lg ${colore}`}>
          <Icon className="w-4 h-4" />
        </div>
        <span className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">
          {label}
        </span>
      </div>
      <span className="text-2xl font-bold text-slate-900 leading-none">{totale}</span>
    </div>
  );
}

function Vuoto({ testo }: { testo: string }) {
  return <p className="text-[11px] text-slate-400 py-2">{testo}</p>;
}

function VediTutti({ href, testo }: { href: string; testo: string }) {
  return (
    <Link
      href={href}
      className="block text-[10px] font-bold uppercase tracking-wider text-blue-600 hover:text-blue-700 pt-2 mt-1 border-t border-slate-100"
    >
      {testo} →
    </Link>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="bg-white border border-slate-200 rounded-xl p-4">{children}</div>;
}

export function DashboardPannelli({
  codice,
  verifiche = [],
  contabile,
  azienda,
  scenari,
  totaleScenari,
}: Props) {
  const daDecidere = verifiche.filter((v) => !v.presaInCarico && !v.archiviata).length;
  const contabiliDaCompletare = contabile ? contabile.filter((a) => !a.completa).length : null;
  const debitiDaMemorizzare = azienda
    ? azienda.filter((a) => a.debitoMemorizzato === null).length
    : null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Verifica amministrativa — il triage: posizioni guardate ma non ancora
          prese in carico. In dashboard serve più sapere cosa aspetta una
          decisione che l'elenco degli utenti, che ha già la sua pagina. */}
      <Card>
        <Intestazione
          icon={Stethoscope}
          colore="text-amber-600 bg-amber-50"
          label="Verifica amministrativa"
          totale={daDecidere}
        />
        {verifiche.length === 0 ? (
          <Vuoto testo="Nessuna verifica eseguita." />
        ) : (
          <div className="divide-y divide-slate-100">
            {/* Si mostrano TUTTE le verifiche, non solo quelle in sospeso: una
                verifica conclusa spariva dalla dashboard, e la traccia
                promessa a schermo non era da nessuna parte. Il numero in
                testa resta il conteggio di quelle che aspettano una
                decisione — è quello che serve come coda di lavoro. */}
            {verifiche.slice(0, MAX).map((v) => (
              <a
                key={v.id}
                // Una verifica in sospeso si riapre NEL TRIAGE: è lì che ci sono
                // le comunicazioni già preparate e la decisione da prendere.
                href={
                  !v.presaInCarico && !v.archiviata
                    ? `/spazio/${codice}/verifica-salute?azienda=${v.id}`
                    : `/spazio/${codice}/aziende/${v.id}`
                }
                className="flex items-center justify-between gap-3 py-2 hover:bg-slate-50 -mx-2 px-2 rounded"
              >
                <span className="min-w-0">
                  <span className="block font-bold text-slate-900 text-xs truncate">
                    {v.ragioneSociale}
                  </span>
                  {v.partitaIva && (
                    <span className="block text-[10px] text-slate-400 font-mono truncate">
                      P.IVA {v.partitaIva}
                    </span>
                  )}
                  {!v.presaInCarico && !v.archiviata && (
                    <span className="mt-0.5 inline-block rounded bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-700">
                      Triage — da decidere
                    </span>
                  )}
                </span>
                {v.esito && (
                  <span
                    className={`text-[9px] font-bold uppercase tracking-wider border rounded px-1.5 py-0.5 whitespace-nowrap ${
                      v.esito === 'ROSSO'
                        ? 'bg-red-50 text-red-700 border-red-200'
                        : v.esito === 'GIALLO'
                          ? 'bg-amber-50 text-amber-700 border-amber-200'
                          : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    }`}
                  >
                    {v.esito === 'ATTENZIONE_MINIMA' ? 'Minima' : v.esito.toLowerCase()}
                  </span>
                )}
              </a>
            ))}
          </div>
        )}
        <VediTutti
          href={`/spazio/${codice}/verifica-salute`}
          testo="Tutte le verifiche amministrative"
        />
      </Card>

      {/* Verifica contabile — il dato storico dell'azienda: visura, parametri
          dell'ente, bilanci. Il numero in testa è la coda: le aziende la cui
          contabile non è ancora completa. */}
      <Card>
        <Intestazione
          icon={Building2}
          colore="text-emerald-600 bg-emerald-50"
          label="Verifica contabile"
          totale={contabiliDaCompletare ?? '—'}
        />
        {contabile === null ? (
          <Vuoto testo="Riservata all’Admin di Spazio." />
        ) : contabile.length === 0 ? (
          <Vuoto testo="Nessuna azienda attiva." />
        ) : (
          <div className="divide-y divide-slate-100">
            {[...contabile]
              .sort((a, b) => Number(a.completa) - Number(b.completa))
              .slice(0, MAX)
              .map((a) => (
                <Link
                  key={a.id}
                  href={`/spazio/${codice}/verifica-contabile/${a.id}`}
                  className="flex items-center justify-between gap-3 py-2 hover:bg-slate-50 -mx-2 px-2 rounded"
                >
                  <span className="min-w-0">
                    <span className="block font-bold text-slate-900 text-xs truncate">
                      {a.ragioneSociale}
                    </span>
                    <span className="block text-[10px] text-slate-400 truncate">
                      {a.anniXbrl > 0
                        ? `${a.anniXbrl} ${a.anniXbrl === 1 ? 'annualità XBRL' : 'annualità XBRL'}`
                        : 'Bilanci da caricare'}
                      {a.visuraPresente ? ' · visura acquisita' : ' · visura da acquisire'}
                    </span>
                  </span>
                  {!a.completa && (
                    <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider border rounded px-1.5 py-0.5 bg-amber-50 text-amber-700 border-amber-200">
                      Da completare
                    </span>
                  )}
                </Link>
              ))}
          </div>
        )}
        <VediTutti
          href={`/spazio/${codice}/verifica-contabile`}
          testo="Tutte le verifiche contabili"
        />
      </Card>

      {/* Verifica azienda — le due verifiche lette insieme. Il numero in testa
          è ciò che manca perché la mappa sia leggibile: il debito dell'ente
          non ancora memorizzato. */}
      <Card>
        <Intestazione
          icon={Gauge}
          colore="text-violet-600 bg-violet-50"
          label="Verifica azienda"
          totale={debitiDaMemorizzare ?? '—'}
        />
        {azienda === null ? (
          <Vuoto testo="Riservata all’Admin di Spazio." />
        ) : azienda.length === 0 ? (
          <Vuoto testo="Nessuna azienda attiva." />
        ) : (
          <div className="divide-y divide-slate-100">
            {[...azienda]
              .sort(
                (a, b) =>
                  Number(a.debitoMemorizzato !== null) - Number(b.debitoMemorizzato !== null)
              )
              .slice(0, MAX)
              .map((a) => (
                <Link
                  key={a.id}
                  href={`/spazio/${codice}/verifica-azienda/${a.id}`}
                  className="flex items-center justify-between gap-3 py-2 hover:bg-slate-50 -mx-2 px-2 rounded"
                >
                  <span className="min-w-0">
                    <span className="block font-bold text-slate-900 text-xs truncate">
                      {a.ragioneSociale}
                    </span>
                    <span className="block text-[10px] text-slate-400 truncate">
                      {a.debitoMemorizzato !== null
                        ? `Debito ente ${Math.round(a.debitoMemorizzato).toLocaleString('it-IT')} €`
                        : 'Debito ente da memorizzare'}
                      {a.anniXbrl > 0
                        ? ` · ${a.anniXbrl} annualità XBRL`
                        : ' · bilanci da caricare'}
                    </span>
                  </span>
                  {a.debitoMemorizzato === null && (
                    <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider border rounded px-1.5 py-0.5 bg-amber-50 text-amber-700 border-amber-200">
                      Da memorizzare
                    </span>
                  )}
                </Link>
              ))}
          </div>
        )}
        <VediTutti href={`/spazio/${codice}/verifica-azienda`} testo="Tutte le verifiche azienda" />
      </Card>

      {/* Scenari */}
      <Card>
        <Intestazione
          icon={FolderOpen}
          colore="text-blue-600 bg-blue-50"
          label="Scenari"
          totale={totaleScenari}
        />
        {scenari.length === 0 ? (
          <Vuoto testo="Nessuno scenario creato." />
        ) : (
          <div className="divide-y divide-slate-100">
            {scenari.slice(0, MAX).map((s) => (
              <Link
                key={s.id}
                href={`/spazio/${codice}/scenari/${s.id}`}
                className="flex items-center justify-between gap-3 py-2 group"
              >
                <span className="min-w-0">
                  <span className="block font-bold text-slate-900 text-xs group-hover:text-blue-600 transition-colors truncate">
                    {s.nome}
                  </span>
                  <span className="block text-[10px] text-slate-400 truncate">
                    {s.aziendaRagioneSociale}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        )}
        <VediTutti href={`/spazio/${codice}/scenari`} testo="Tutti gli scenari" />
      </Card>
    </div>
  );
}
