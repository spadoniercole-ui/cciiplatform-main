import { redirect } from 'next/navigation';
import { CruscottoAzienda } from '@/components/spazio/CruscottoAzienda';
import Link from 'next/link';
import { ArrowLeft, Check, Lock, Users } from 'lucide-react';
import { ottieniContestoAccessoSpazio } from '@/app/actions/spazi';
import { ottieniAziendaPerId } from '@/app/actions/aziende';
import { ottieniStoricoXbrlAzienda } from '@/app/actions/xbrlAzienda';
import { ottieniStoricoVerificheAction } from '@/app/actions/aziendaInVerifica';
import { debitoEnteMemorizzatoAction } from '@/app/actions/debitiEnteMemorizzati';
import { leggiIdentificativiEnte } from '@/lib/anagraficaEnte/identificativi';
import { IdentificativiEnte } from '@/components/spazio/IdentificativiEnte';
import { RiferimentoAziendaStampa } from '@/components/spazio/RiferimentoAziendaStampa';
import { DemoAziendaScope } from '@/components/spazio/DemoUploadProvider';

type StatoStep = 'bloccato' | 'attivo' | 'completo';

interface Step {
  id: string; // segmento URL ('' = anagrafica root)
  /** Destinazione quando non è una sotto-pagina di questa scheda. */
  href?: string;
  label: string;
  stato: StatoStep;
  motivo?: string; // perché è bloccato (tooltip)
  badge?: number; // es. domande residue
}

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

  const aziendaNum = Number(aziendaId);
  const isEnte = contesto.tipoSpazio === 'ENTE';

  // Segnali di completamento delle tre verifiche, tutti in parallelo.
  const [storicoVerifiche, xbrlRis, debitoRis] = await Promise.all([
    ottieniStoricoVerificheAction(contesto.nomeSchema).catch(() => null),
    ottieniStoricoXbrlAzienda(contesto.nomeSchema, aziendaNum),
    debitoEnteMemorizzatoAction(contesto.nomeSchema, aziendaNum).catch(() => null),
  ]);
  // Identificativi presso l'ente: in testata, in evidenza, appena salvati.
  const identificativi = isEnte
    ? await leggiIdentificativiEnte(contesto.nomeSchema, aziendaNum).catch(() => [])
    : [];

  const amministrativaFatta = Boolean(
    storicoVerifiche?.success && storicoVerifiche.righe?.some((v) => v.id === aziendaNum)
  );
  const contabileFatta = (xbrlRis?.storico?.length ?? 0) > 0;
  const aziendaleFatta = (debitoRis?.debito?.totale ?? null) !== null;

  const base = `/spazio/${codice}/aziende/${aziendaId}`;

  // TRE VERIFICHE, NON LE TAB DELLO SCREENING. La barra di questa scheda
  // portava «Anagrafica → Analisi Bilancio → Verifica contabile → Check List»:
  // era il percorso del vecchio screening, e chi entrava da qui mescolava
  // verifica amministrativa e contabile. Ora la scheda è l'Anagrafica
  // dell'azienda, e da qui si aprono le tre direttrici del prodotto:
  // amministrativa (il triage), contabile (il dato XBRL) e aziendale (le due
  // lette insieme). Le vecchie sotto-pagine restano raggiungibili dal loro URL
  // (XBRL, indici, bilanci) finché non si ripuliscono, ma non sono più
  // una tappa da attraversare.
  const steps: Step[] = [
    {
      id: 'amministrativa',
      href: `/spazio/${codice}/verifica-salute?azienda=${aziendaId}`,
      label: 'Verifica amministrativa',
      stato: amministrativaFatta ? 'completo' : 'attivo',
    },
    {
      id: 'contabile',
      href: `/spazio/${codice}/verifica-contabile/${aziendaId}`,
      label: 'Verifica contabile',
      stato: contabileFatta ? 'completo' : 'attivo',
    },
    {
      id: 'aziendale',
      href: `/spazio/${codice}/verifica-azienda/${aziendaId}`,
      label: 'Verifica aziendale',
      stato: aziendaleFatta ? 'completo' : 'attivo',
    },
  ];

  const classePerStato = (stato: StatoStep): string => {
    if (stato === 'completo')
      return 'bg-emerald-50 border-emerald-300 text-emerald-700 hover:border-emerald-400';
    if (stato === 'attivo')
      return 'bg-amber-50 border-amber-300 text-amber-800 hover:border-amber-400';
    // bloccato
    return 'bg-slate-50 border-slate-200 text-slate-300 cursor-not-allowed';
  };

  return (
    <DemoAziendaScope azienda={azienda.ragioneSociale}>
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
                <IdentificativiEnte
                  identificativi={identificativi}
                  partitaIva={azienda.partitaIva}
                  codiceFiscale={azienda.codiceFiscale}
                />
              </p>
              <RiferimentoAziendaStampa
                azienda={azienda.ragioneSociale}
                identificativi={identificativi}
                partitaIva={azienda.partitaIva ?? null}
                codiceFiscale={azienda.codiceFiscale ?? null}
              />
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

        {/* Cruscotto di sintesi: rinfresca la memoria a chi torna sulla
          posizione dopo settimane, o a chi ne lavora molte. Sta in testata e
          non nella sola Anagrafica perché chi torna non entra sempre da lì.
          Se non c'è mai stata una verifica non si mostra nulla. */}
        <CruscottoAzienda nomeSchema={contesto.nomeSchema} aziendaId={aziendaNum} codice={codice} />

        {/* Barra delle direttrici: le tre verifiche a sinistra, Operatori a
          destra. Semaforo: arancione = da fare, verde = fatto. */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {steps.map((step) => {
            const contenuto = (
              <span className="inline-flex items-center gap-1">
                {step.stato === 'completo' && <Check className="w-3 h-3 shrink-0" />}
                {step.stato === 'bloccato' && <Lock className="w-3 h-3 shrink-0" />}
                {step.label}
              </span>
            );
            const classi = `relative px-3 py-2 rounded-lg text-[11px] font-bold whitespace-nowrap border transition-colors shrink-0 ${classePerStato(step.stato)}`;
            const badge =
              step.badge !== undefined ? (
                <span
                  className="absolute -top-1.5 -right-1.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 bg-amber-500 text-white text-[9px] font-black rounded-full"
                  title={`${step.badge} domande dello screening in attesa di risposta`}
                >
                  {step.badge}
                </span>
              ) : null;

            if (step.stato === 'bloccato') {
              return (
                <span key={step.id} className={classi} title={step.motivo} aria-disabled="true">
                  {contenuto}
                </span>
              );
            }
            return (
              <Link
                key={step.id}
                href={step.href ?? (step.id ? `${base}/${step.id}` : base)}
                className={classi}
              >
                {contenuto}
                {badge}
              </Link>
            );
          })}

          {/* Operatori — separato dal flusso di analisi, spinto all'estremità
            opposta: sopra restano solo i passi utili all'analisi aziendale. */}
          <Link
            href={`${base}/operatori`}
            className="ml-auto shrink-0 inline-flex items-center gap-1 px-3 py-2 rounded-lg text-[11px] font-bold whitespace-nowrap border border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:text-blue-600 transition-colors"
          >
            <Users className="w-3.5 h-3.5" /> Operatori
          </Link>
        </div>

        {children}
      </div>
    </DemoAziendaScope>
  );
}
