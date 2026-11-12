import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, Building2, FileText } from 'lucide-react';
import { ottieniContestoAccessoSpazio } from '@/app/actions/spazi';
import { ottieniAziendaPerId } from '@/app/actions/aziende';
import { ottieniAttenzioneScreeningAction } from '@/app/actions/attenzioneScreening';
import { ottieniStoricoVerificheAction } from '@/app/actions/aziendaInVerifica';
import { ottieniRaccomandazioneAction } from '@/app/actions/raccomandazioneVerifica';
import { StampaDocumento } from '@/components/spazio/StampaDocumento';
import { valutaValidita } from '@/lib/screening/validitaVerifica';

// IL REPORT DELLA VERIFICA AMMINISTRATIVA (0.211.0).
//
// Quello che la pagina mostra, qui diventa un documento: intestazione, esito
// con i fatti accertati e quelli da accertare, i tre percorsi distinti con i
// loro esiti, i motivi e i limiti. Si legge, si stampa, si condivide — e non
// richiede di dare a nessuno le mani nel sistema per correggere quattro righe.
//
// Regole: nessun dato nuovo (legge le stesse fonti della pagina, con le stesse
// azioni) e nessun consiglio. Il documento accosta i fatti alle strade
// possibili e dichiara che la decisione non dipende dalla piattaforma.

export const dynamic = 'force-dynamic';

const STILE: Record<string, { testo: string; sfondo: string; bordo: string }> = {
  ROSSO: { testo: 'text-red-800', sfondo: 'bg-red-50', bordo: 'border-red-200' },
  GIALLO: { testo: 'text-amber-800', sfondo: 'bg-amber-50', bordo: 'border-amber-200' },
  ATTENZIONE_MINIMA: {
    testo: 'text-emerald-800',
    sfondo: 'bg-emerald-50',
    bordo: 'border-emerald-200',
  },
};

export default async function ReportSupportoPage({
  params,
}: {
  params: Promise<{ codice: string; aziendaId: string }>;
}) {
  const { codice, aziendaId } = await params;
  const contesto = await ottieniContestoAccessoSpazio(codice);
  if (!contesto) redirect('/');
  if (contesto.modalita === 'OPERATORE') redirect(`/spazio/${codice}`);

  const id = Number(aziendaId);
  if (!Number.isInteger(id) || id <= 0) redirect(`/spazio/${codice}/verifica-salute`);

  const azienda = await ottieniAziendaPerId(contesto.nomeSchema, id);
  if (!azienda.success || !azienda.azienda) redirect(`/spazio/${codice}/verifica-salute`);

  const [attenzioneRis, storicoRis, raccomandazioneRis] = await Promise.all([
    ottieniAttenzioneScreeningAction(contesto.nomeSchema, id).catch(() => null),
    ottieniStoricoVerificheAction(contesto.nomeSchema).catch(() => null),
    ottieniRaccomandazioneAction(contesto.nomeSchema, id).catch(() => null),
  ]);
  const attenzione = attenzioneRis?.success ? (attenzioneRis.attenzione ?? null) : null;
  const raccomandazione = raccomandazioneRis?.success
    ? (raccomandazioneRis.raccomandazione ?? null)
    : null;
  const riga = storicoRis?.success ? storicoRis.righe?.find((v) => v.id === id) : undefined;
  const validita = valutaValidita(riga?.eseguitaIl ?? null);
  const stile = attenzione ? STILE[attenzione.esito] : null;
  const generatoIl = new Date().toLocaleDateString('it-IT');

  return (
    <div className="max-w-3xl space-y-4 print:max-w-none print:space-y-3">
      <div className="flex items-center justify-between gap-3 print:hidden">
        <Link
          href={`/spazio/${codice}/verifica-salute/${id}`}
          className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500 hover:text-blue-600"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Torna all’esito
        </Link>
        <StampaDocumento etichetta="Stampa il report" />
      </div>

      {/* INTESTAZIONE DEL DOCUMENTO */}
      <header className="rounded-xl border border-slate-300 bg-white p-6 print:rounded-none print:border-0 print:border-b print:border-slate-300 print:p-0 print:pb-4">
        <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-400">
          Verifica amministrativa · report di supporto
        </p>
        <h1 className="mt-1 flex items-center gap-2 text-xl font-bold text-slate-900">
          <Building2 className="w-5 h-5 text-blue-600 print:hidden" />
          {azienda.azienda.ragioneSociale}
        </h1>
        <p className="mt-1 text-[11px] text-slate-500">
          {azienda.azienda.partitaIva ? `P. IVA ${azienda.azienda.partitaIva} · ` : ''}
          {azienda.azienda.codiceFiscale &&
          azienda.azienda.codiceFiscale !== azienda.azienda.partitaIva
            ? `C.F. ${azienda.azienda.codiceFiscale} · `
            : ''}
          documento generato il {generatoIl} · spazio {contesto.codice}
        </p>
        <p className="mt-2 text-[10px] text-slate-500 leading-relaxed">
          Il documento riporta i fatti accertati della verifica amministrativa e le strade possibili
          che da quei fatti discendono. Non contiene valutazioni dell’applicativo e non sostituisce
          la decisione dell’ente: la piattaforma è uno strumento di supporto.
        </p>
      </header>

      {/* ESITO */}
      {attenzione && stile ? (
        <section
          className={`rounded-xl border p-5 space-y-2 break-inside-avoid print:rounded-none print:border-0 print:border-l-2 ${stile.bordo} ${stile.sfondo} print:p-0 print:pl-3`}
        >
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className={`text-sm font-bold ${stile.testo}`}>{attenzione.etichetta}</span>
            <span className="text-[11px] text-slate-600">{attenzione.fattoreDeterminante}</span>
            <span className="text-[11px] text-slate-500">
              Copertura {attenzione.copertura.determinate}/{attenzione.copertura.totali}
            </span>
            {riga?.eseguitaIl && (
              <span className="text-[11px] text-slate-500">
                Verificata il {new Date(riga.eseguitaIl).toLocaleDateString('it-IT')} ·{' '}
                {validita.etichetta}
              </span>
            )}
          </div>

          {attenzione.accertato.length > 0 && (
            <div>
              <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
                Accertato
              </p>
              <ul className="mt-1 space-y-1">
                {attenzione.accertato.map((voce, i) => (
                  <li key={i} className="text-[11px] text-slate-700 leading-relaxed flex gap-1.5">
                    <span className="text-slate-400 shrink-0">—</span>
                    <span>{voce}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {attenzione.daAccertare.length > 0 && (
            <div>
              <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
                Da accertare
              </p>
              <ul className="mt-1 space-y-1">
                {attenzione.daAccertare.map((voce, i) => (
                  <li key={i} className="text-[11px] text-slate-600 leading-relaxed flex gap-1.5">
                    <span className="text-slate-400 shrink-0">—</span>
                    <span>{voce}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      ) : (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-5">
          <p className="text-xs text-amber-900">
            L’indicatore di attenzione non è leggibile per questa azienda: il documento riporta solo
            le strade possibili, senza l’esito della verifica.
          </p>
        </section>
      )}

      {raccomandazione && (
        <>
          {/* LETTURA */}
          <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-2 break-inside-avoid print:rounded-none print:border-0 print:border-t print:pt-4 print:px-0">
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
              Lettura dei dati
            </h2>
            <p className="text-sm font-bold text-slate-900">{raccomandazione.titolo}</p>
            <p className="text-[11px] text-slate-700 leading-relaxed">{raccomandazione.sintesi}</p>
          </section>

          {/* I PERCORSI, DISTINTI */}
          <section className="space-y-2 break-inside-avoid">
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
              I percorsi, distinti
            </h2>
            {raccomandazione.percorsi.map((p) => (
              <div
                key={p.codice}
                className={`rounded-xl border bg-white p-4 space-y-1.5 ${
                  p.codice === raccomandazione.percorsoConsigliato
                    ? 'border-slate-400'
                    : 'border-slate-200'
                } print:rounded-none print:border-0 print:border-l-2 print:border-slate-300 print:p-0 print:pl-3`}
              >
                <p className="text-[11px] font-bold text-slate-900">
                  {p.etichetta}
                  {p.codice === raccomandazione.percorsoConsigliato && (
                    <span className="ml-1.5 text-[9px] font-bold uppercase tracking-wider text-slate-500">
                      primo confronto
                    </span>
                  )}
                </p>
                <p className="text-[10px] text-slate-600 leading-relaxed">{p.natura}</p>
                <p className="text-[10px] text-slate-500 leading-relaxed">
                  <strong className="text-slate-600">Decide:</strong> {p.chiDecide}.
                </p>
                <ul className="space-y-0.5">
                  {p.presupposti.map((voce, i) => (
                    <li key={i} className="text-[10px] text-slate-600 leading-relaxed">
                      — {voce}
                    </li>
                  ))}
                </ul>
                {p.esiti && (
                  <div className="mt-1 rounded-md border border-slate-200 bg-slate-50 p-2 print:bg-transparent print:border-0 print:p-0">
                    <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
                      Esiti possibili della proposta
                    </p>
                    <ul className="mt-1 space-y-1">
                      {p.esiti.map((e) => (
                        <li key={e.codice} className="text-[10px] text-slate-700 leading-relaxed">
                          <strong>{e.etichetta}</strong> — decide {e.chiDecide}. {e.descrizione}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <p className="text-[10px] text-slate-500 italic leading-relaxed">
                  {p.limiti.join(' ')}
                </p>
              </div>
            ))}
            <p className="border-l-2 border-amber-300 pl-2 text-[10px] text-slate-600 leading-relaxed">
              {raccomandazione.nonEquiparabili}
            </p>
          </section>

          {/* MOTIVI */}
          <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-2 break-inside-avoid print:rounded-none print:border-0 print:border-t print:pt-4 print:px-0">
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
              Elementi letti
            </h2>
            <ul className="space-y-0.5">
              {raccomandazione.motivi.map((m, i) => (
                <li key={i} className="text-[11px] text-slate-700 leading-relaxed">
                  — {m}
                </li>
              ))}
            </ul>
          </section>

          {/* LIMITI */}
          <section className="rounded-xl border border-slate-200 bg-slate-50 p-5 space-y-1 break-inside-avoid print:rounded-none print:border-0 print:border-t print:pt-4 print:px-0">
            <h2 className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Limiti della lettura
            </h2>
            <ul className="space-y-0.5">
              {raccomandazione.limiti.map((l, i) => (
                <li key={i} className="text-[10px] text-slate-600 leading-relaxed">
                  — {l}
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      <footer className="flex items-center gap-2 text-[9px] text-slate-400 print:block">
        <FileText className="w-3 h-3 print:hidden" />
        Documento redatto dalla piattaforma sui dati della verifica amministrativa. Le strade
        possibili sono accostate, non scelte: la decisione resta all’ente.
      </footer>
    </div>
  );
}
