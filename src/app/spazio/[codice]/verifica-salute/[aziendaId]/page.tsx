import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, Building2, ShieldAlert } from 'lucide-react';
import { ottieniContestoAccessoSpazio } from '@/app/actions/spazi';
import { ottieniAziendaPerId } from '@/app/actions/aziende';
import { ottieniAttenzioneScreeningAction } from '@/app/actions/attenzioneScreening';
import { ottieniStoricoVerificheAction } from '@/app/actions/aziendaInVerifica';
import { PosizioneEnteScenario } from '@/components/spazio/PosizioneEnteScenario';
import { valutaValidita } from '@/lib/screening/validitaVerifica';

// L'ESITO DELLA VERIFICA AMMINISTRATIVA (0.194.0).
//
// La verifica amministrativa non finisce nella contabile: chiude con un esito
// che resta qui — indicatore di attenzione, certificazione dei debiti e soglie
// di segnalazione. Prima questi dati si aprivano nella scheda azienda, la cui
// freccia di ritorno parlava di verifica contabile: due verifiche diverse
// sembravano la stessa cosa.
//
// La contabile legge il dato storico dell'azienda (visura, parametri, XBRL,
// indici) e non ripete debito e soglie; la verifica azienda le legge da qui.

export const dynamic = 'force-dynamic';

const STILE = {
  ROSSO: {
    pallino: 'bg-red-500',
    testo: 'text-red-800',
    bordo: 'border-red-200',
    sfondo: 'bg-red-50',
  },
  GIALLO: {
    pallino: 'bg-amber-400',
    testo: 'text-amber-800',
    bordo: 'border-amber-200',
    sfondo: 'bg-amber-50',
  },
  ATTENZIONE_MINIMA: {
    pallino: 'bg-emerald-500',
    testo: 'text-emerald-800',
    bordo: 'border-emerald-200',
    sfondo: 'bg-emerald-50',
  },
} as const;

export default async function EsitoVerificaAmministrativaPage({
  params,
  searchParams,
}: {
  params: Promise<{ codice: string; aziendaId: string }>;
  searchParams: Promise<{ scheda?: string }>;
}) {
  const { codice, aziendaId } = await params;
  const { scheda } = await searchParams;

  const contesto = await ottieniContestoAccessoSpazio(codice);
  if (!contesto) redirect('/');
  if (contesto.modalita === 'OPERATORE') redirect(`/spazio/${codice}`);

  const id = Number(aziendaId);
  if (!Number.isInteger(id) || id <= 0) redirect(`/spazio/${codice}/verifica-salute`);

  const risultato = await ottieniAziendaPerId(contesto.nomeSchema, id);
  if (!risultato.success || !risultato.azienda) {
    redirect(`/spazio/${codice}/verifica-salute`);
  }

  const [attenzioneRis, storicoRis] = await Promise.all([
    ottieniAttenzioneScreeningAction(contesto.nomeSchema, id).catch(() => null),
    ottieniStoricoVerificheAction(contesto.nomeSchema).catch(() => null),
  ]);
  const attenzione = attenzioneRis?.success ? (attenzioneRis.attenzione ?? null) : null;
  const riga = storicoRis?.success ? storicoRis.righe?.find((v) => v.id === id) : undefined;
  const validita = valutaValidita(riga?.eseguitaIl ?? null);
  const stile = attenzione ? STILE[attenzione.esito as keyof typeof STILE] : null;

  // La certificazione dei debiti è la prima scheda: è il dato che la verifica
  // ha appena prodotto. Negli spazi senza ente creditore resta la sola soglia.
  const schedaIniziale =
    scheda === 'anagrafica' ? 'anagrafica' : scheda === 'soglie' ? 'soglie' : 'vera';

  return (
    <div className="max-w-5xl space-y-4">
      <Link
        href={`/spazio/${codice}/verifica-salute`}
        className="inline-flex items-center gap-1.5 text-[11px] text-slate-500 hover:text-blue-600 font-bold uppercase tracking-wider"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Torna alla verifica amministrativa
      </Link>

      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-blue-600" />
              Esito della verifica amministrativa — {risultato.azienda.ragioneSociale}
            </h1>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed max-w-3xl">
              Il risultato della verifica resta qui: indicatore di attenzione, certificazione dei
              debiti e soglie di segnalazione. La verifica contabile legge il dato storico
              dell’azienda e non ripete questi dati.
            </p>
          </div>
          <Link
            href={`/spazio/${codice}/aziende/${id}`}
            className="shrink-0 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-blue-700 hover:text-blue-800"
          >
            Scheda azienda
          </Link>
        </div>
      </div>

      {stile && attenzione && (
        <div className={`rounded-xl border p-5 space-y-3 ${stile.sfondo} ${stile.bordo}`}>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${stile.pallino}`} />
              <span className={`text-sm font-bold ${stile.testo}`}>{attenzione.etichetta}</span>
            </span>
            <span className="text-[11px] text-slate-600">{attenzione.fattoreDeterminante}</span>
            <span className="text-[11px] text-slate-500">
              Copertura {attenzione.copertura.determinate}/{attenzione.copertura.totali}
            </span>
            <span className="ml-auto text-[11px] text-slate-500">
              {riga?.eseguitaIl
                ? `Verificata il ${new Date(riga.eseguitaIl).toLocaleDateString('it-IT')} · ${validita.etichetta}`
                : 'Data della verifica non registrata'}
            </span>
          </div>

          {attenzione.accertato.length > 0 && (
            <div>
              <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
                Accertato
              </p>
              <ul className="mt-1 space-y-0.5">
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
              <ul className="mt-1 space-y-0.5">
                {attenzione.daAccertare.map((voce, i) => (
                  <li key={i} className="text-[11px] text-slate-600 leading-relaxed flex gap-1.5">
                    <span className="text-slate-400 shrink-0">—</span>
                    <span>{voce}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-[10px] text-slate-500 leading-relaxed flex items-start gap-1.5">
            <ShieldAlert className="w-3 h-3 mt-0.5 shrink-0 text-slate-400" />
            Indicatore di priorità di attenzione, non di probabilità di insolvenza. La scelta su
            come procedere resta al valutatore.
          </p>
        </div>
      )}

      {!attenzione && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
          L’indicatore non è leggibile per questa azienda: certificazione dei debiti e soglie
          restano comunque consultabili qui sotto.
        </p>
      )}

      <PosizioneEnteScenario
        nomeSchema={contesto.nomeSchema}
        aziendaId={id}
        nomeAzienda={risultato.azienda.ragioneSociale}
        tipoSpazio={contesto.tipoSpazio}
        schedaIniziale={schedaIniziale}
      />
    </div>
  );
}
