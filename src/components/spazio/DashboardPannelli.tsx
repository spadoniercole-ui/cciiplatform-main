'use client';

import Link from 'next/link';
import { Building2, UserCog, FolderOpen, FileText, Printer } from 'lucide-react';
import { stampaTesto } from '@/lib/stampaTesto';
import type { UltimoScreeningSpazio } from '@/app/actions/screeningAzienda';

export interface RigaAzienda {
  id: number;
  ragioneSociale: string;
  partitaIva: string | null;
  codiceFiscale: string | null;
  attiva: boolean;
}
export interface RigaUtente {
  nome: string;
  cognome: string;
  username: string | null;
  email: string | null;
}
export interface RigaScenario {
  id: number;
  nome: string;
  aziendaRagioneSociale: string;
}

interface Props {
  codice: string;
  aziende: RigaAzienda[];
  totaleAziendeAttive: number | '—';
  utenti: RigaUtente[];
  totaleUtenti: number | '—';
  scenari: RigaScenario[];
  totaleScenari: number | '—';
  report: UltimoScreeningSpazio[];
}

const fmtData = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('it-IT', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

const MAX = 4;

/** Intestazione comune delle card: icona, etichetta e conteggio. */
function Intestazione({
  icon: Icon,
  colore,
  label,
  totale,
}: {
  icon: typeof Building2;
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

export function DashboardPannelli({
  codice,
  aziende,
  totaleAziendeAttive,
  utenti,
  totaleUtenti,
  scenari,
  totaleScenari,
  report,
}: Props) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Aziende */}
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <Intestazione
          icon={Building2}
          colore="text-blue-600 bg-blue-50"
          label="Aziende Attive"
          totale={totaleAziendeAttive}
        />
        {aziende.length === 0 ? (
          <Vuoto testo="Nessuna azienda registrata." />
        ) : (
          <div className="divide-y divide-slate-100">
            {aziende.slice(0, MAX).map((a) => {
              const rif = a.partitaIva
                ? `P.IVA ${a.partitaIva}`
                : a.codiceFiscale
                  ? `C.F. ${a.codiceFiscale}`
                  : null;
              return (
                <Link
                  key={a.id}
                  href={`/spazio/${codice}/aziende/${a.id}`}
                  className="flex items-center justify-between gap-3 py-2 group"
                >
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5">
                      <span
                        className={`w-1.5 h-1.5 rounded-full shrink-0 ${a.attiva ? 'bg-emerald-500' : 'bg-slate-300'}`}
                      />
                      <span className="font-bold text-slate-900 text-xs group-hover:text-blue-600 transition-colors truncate">
                        {a.ragioneSociale}
                      </span>
                    </span>
                    {rif && (
                      <span className="block text-[10px] text-slate-400 font-mono ml-3 mt-0.5">
                        {rif}
                      </span>
                    )}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
        <VediTutti href={`/spazio/${codice}/aziende`} testo="Tutte le aziende" />
      </div>

      {/* Utenti / Admin */}
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <Intestazione
          icon={UserCog}
          colore="text-emerald-600 bg-emerald-50"
          label="Utenti / Admin"
          totale={totaleUtenti}
        />
        {utenti.length === 0 ? (
          <Vuoto testo="Nessun utente." />
        ) : (
          <div className="divide-y divide-slate-100">
            {utenti.slice(0, MAX).map((u, i) => {
              const nomeCompleto = `${u.nome} ${u.cognome}`.trim() || u.username || u.email || '—';
              const secondario = u.username || u.email || null;
              return (
                <div key={i} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0">
                    <span className="block font-bold text-slate-900 text-xs truncate">
                      {nomeCompleto}
                    </span>
                    {secondario && (
                      <span className="block text-[10px] text-slate-400 font-mono truncate">
                        {secondario}
                      </span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        )}
        <VediTutti href={`/spazio/${codice}/utenti`} testo="Tutti gli utenti" />
      </div>

      {/* Scenari */}
      <div className="bg-white border border-slate-200 rounded-xl p-4">
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
      </div>

      {/* Ultimi Report */}
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <Intestazione
          icon={FileText}
          colore="text-blue-600 bg-blue-50"
          label="Ultimi Report"
          totale={report.length}
        />
        {report.length === 0 ? (
          <Vuoto testo="Nessun report di Screening generato." />
        ) : (
          <div className="divide-y divide-slate-100">
            {report.slice(0, MAX).map((s) => (
              <div key={s.aziendaId} className="flex items-center justify-between gap-2 py-2">
                <Link
                  href={`/spazio/${codice}/aziende/${s.aziendaId}/screening`}
                  className="min-w-0 group"
                >
                  <span className="block font-bold text-slate-900 text-xs group-hover:text-blue-600 transition-colors truncate">
                    {s.ragioneSociale}
                  </span>
                  <span className="block text-[10px] text-slate-400">{fmtData(s.generatoIl)}</span>
                </Link>
                {s.relazioneTesto ? (
                  <button
                    type="button"
                    onClick={() =>
                      stampaTesto(
                        `Screening — ${s.ragioneSociale}`,
                        s.relazioneTesto!,
                        s.generatoIl
                      )
                    }
                    className="flex items-center gap-1 px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[9px] uppercase rounded transition-colors whitespace-nowrap shrink-0"
                    title="Apre la stampa dell'ultimo screening — da lì puoi salvare come PDF"
                  >
                    <Printer className="w-3 h-3" /> PDF
                  </button>
                ) : (
                  <span className="text-[9px] text-slate-300 uppercase font-bold px-2 py-1 shrink-0">
                    no PDF
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
        <VediTutti href={`/spazio/${codice}/aziende`} testo="Tutti i report" />
      </div>
    </div>
  );
}
