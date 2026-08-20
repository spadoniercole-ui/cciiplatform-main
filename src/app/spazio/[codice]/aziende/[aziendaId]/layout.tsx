import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { ottieniContestoAccessoSpazio } from '@/app/actions/spazi';
import { ottieniAziendaPerId } from '@/app/actions/aziende';
import { ottieniConteggioScreeningPendente } from '@/app/actions/screeningAzienda';

const SOTTO_NAV = [
  { id: '', label: 'Anagrafica' },
  { id: 'xbrl', label: 'Configurazione XBRL' },
  { id: 'indici', label: 'Indici' },
  { id: 'operatori', label: 'Operatori' },
] as const;

/** Solo per spazi ENTE — un redigente non ha un ente che dichiara nulla su di sé. */
const VOCE_POSIZIONE_ENTE = { id: 'posizione-ente', label: 'Posizione Ente' } as const;
/** Per entrambi i tipi di spazio — genera un questionario libero dalle direttrici per il Ricevente, prova a pre-compilare la Check List Ministeriale per il Redigente. */
const VOCE_SCREENING = { id: 'screening', label: 'Screening' } as const;
/** Separata da Screening apposta: Screening genera/pre-compila, qui si risponde — sempre presente, non nascosta dentro il flusso di generazione. */
const VOCE_CHECKLIST = { id: 'checklist', label: 'Check List' } as const;

export default async function AziendaLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ codice: string; aziendaId: string }>;
}) {
  const { codice, aziendaId } = await params;
  const contesto = await ottieniContestoAccessoSpazio(codice);
  if (!contesto) redirect('/');
  // Gestione delle Aziende: mai a un Operatore/Consultatore, stessa regola
  // già applicata in /spazio/[codice]/aziende.
  if (contesto.modalita === 'OPERATORE') redirect(`/spazio/${codice}`);

  const risultato = await ottieniAziendaPerId(contesto.nomeSchema, Number(aziendaId));
  if (!risultato.success || !risultato.azienda) {
    redirect(`/spazio/${codice}/aziende`);
  }
  const azienda = risultato.azienda;

  const pendenteScreening = await ottieniConteggioScreeningPendente(
    contesto.nomeSchema,
    Number(aziendaId)
  );
  const domandeMancanti = pendenteScreening.totali - pendenteScreening.risposte;

  const base = `/spazio/${codice}/aziende/${aziendaId}`;

  return (
    <div className="max-w-5xl space-y-4">
      <Link
        href={`/spazio/${codice}/aziende`}
        className="inline-flex items-center gap-1.5 text-[11px] text-slate-500 hover:text-blue-600 font-bold uppercase tracking-wider"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Torna alle aziende
      </Link>

      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex items-start justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-lg font-bold text-slate-900">
              {azienda.ragioneSociale}
              {azienda.formaGiuridica ? (
                <span className="text-slate-400 font-normal"> — {azienda.formaGiuridica}</span>
              ) : null}
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              {azienda.partitaIva ? `P.IVA ${azienda.partitaIva}` : ''}
              {azienda.partitaIva && azienda.codiceFiscale ? ' · ' : ''}
              {azienda.codiceFiscale ? `C.F. ${azienda.codiceFiscale}` : ''}
            </p>
            {(azienda.rappresentanteLegale || azienda.citta) && (
              <p className="text-[11px] text-slate-400 mt-0.5">
                {azienda.rappresentanteLegale
                  ? `${azienda.ruoloRappresentanteLegale || 'Rapp. Legale'}: ${azienda.rappresentanteLegale}`
                  : ''}
                {azienda.rappresentanteLegale && azienda.citta ? ' · ' : ''}
                {azienda.citta
                  ? `${azienda.citta}${azienda.provincia ? ` (${azienda.provincia})` : ''}`
                  : ''}
              </p>
            )}
          </div>
          <span
            className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase ${
              azienda.attiva ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
            }`}
          >
            {azienda.attiva ? 'Attiva' : 'Disabilitata'}
          </span>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {[
          ...SOTTO_NAV,
          ...(contesto.tipoSpazio === 'ENTE' ? [VOCE_POSIZIONE_ENTE] : []),
          VOCE_SCREENING,
          VOCE_CHECKLIST,
        ].map((voce) => (
          <Link
            key={voce.id}
            href={voce.id ? `${base}/${voce.id}` : base}
            className="relative px-3 py-2 rounded-lg text-[11px] font-bold whitespace-nowrap bg-white border border-slate-200 text-slate-600 hover:border-blue-300 hover:text-blue-600 transition-colors shrink-0"
          >
            {voce.label}
            {voce.id === 'checklist' && domandeMancanti > 0 && (
              <span
                className="absolute -top-1.5 -right-1.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 bg-amber-500 text-white text-[9px] font-black rounded-full"
                title={`${domandeMancanti} domande dello screening in attesa di risposta`}
              >
                {domandeMancanti}
              </span>
            )}
          </Link>
        ))}
      </div>

      {children}
    </div>
  );
}
