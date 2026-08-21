import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Check, Lock, Users } from 'lucide-react';
import { ottieniContestoAccessoSpazio } from '@/app/actions/spazi';
import { ottieniAziendaPerId } from '@/app/actions/aziende';
import { ottieniConteggioScreeningPendente } from '@/app/actions/screeningAzienda';
import { ottieniAnagraficaEnte } from '@/app/actions/anagraficaEnte';
import { ottieniDebitiEnte } from '@/app/actions/debitiEnte';
import { ottieniStoricoXbrlAzienda } from '@/app/actions/xbrlAzienda';
import { anagraficaAziendaCompleta } from '@/lib/anagraficaAzienda';

type StatoStep = 'bloccato' | 'attivo' | 'completo';

interface Step {
  id: string; // segmento URL ('' = anagrafica root)
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

  // Segnali di completamento, tutti in parallelo. La Posizione Ente esiste
  // solo per gli spazi ENTE.
  const [pendenteScreening, anagraficaEnteRis, debitiRis, xbrlRis] = await Promise.all([
    ottieniConteggioScreeningPendente(contesto.nomeSchema, aziendaNum),
    isEnte ? ottieniAnagraficaEnte(contesto.nomeSchema, aziendaNum) : Promise.resolve(null),
    isEnte ? ottieniDebitiEnte(contesto.nomeSchema, aziendaNum) : Promise.resolve(null),
    ottieniStoricoXbrlAzienda(contesto.nomeSchema, aziendaNum),
  ]);
  const domandeMancanti = pendenteScreening.totali - pendenteScreening.risposte;

  // Completamento dei passi (unica fonte del semaforo).
  const anagraficaCompleta = anagraficaAziendaCompleta(
    azienda as unknown as Record<string, unknown>
  );
  const posizioneEnteCompleta =
    !!anagraficaEnteRis?.dati?.idEnte && (debitiRis?.righe?.length ?? 0) > 0;
  const analisiBilancioCompleta = (xbrlRis?.storico?.length ?? 0) > 0;
  const screeningGenerato = pendenteScreening.esiste;
  const checklistCompleta =
    screeningGenerato && pendenteScreening.totali > 0 && domandeMancanti === 0;

  // Prerequisiti di attivazione (semaforo/gating richiesti da INPS):
  //  - Screening si attiva solo se Anagrafica, Posizione Ente e Analisi
  //    Bilancio sono verdi (per il Redigente non c'è Posizione Ente).
  //  - Check List è bloccata finché lo Screening non è stato generato.
  const passi123Verdi =
    anagraficaCompleta && (!isEnte || posizioneEnteCompleta) && analisiBilancioCompleta;

  const base = `/spazio/${codice}/aziende/${aziendaId}`;

  // Sequenza dei passi di analisi (Operatori è a parte, spinto a destra).
  const steps: Step[] = [];
  steps.push({
    id: '',
    label: 'Anagrafica',
    stato: anagraficaCompleta ? 'completo' : 'attivo',
  });
  if (isEnte) {
    steps.push({
      id: 'posizione-ente',
      label: 'Posizione Ente',
      stato: !anagraficaCompleta ? 'bloccato' : posizioneEnteCompleta ? 'completo' : 'attivo',
      motivo: "Completa prima l'Anagrafica azienda.",
    });
  }
  steps.push({
    id: 'xbrl',
    label: 'Analisi Bilancio',
    stato: !anagraficaCompleta ? 'bloccato' : analisiBilancioCompleta ? 'completo' : 'attivo',
    motivo: "Completa prima l'Anagrafica azienda.",
  });
  steps.push({
    id: 'screening',
    label: 'Screening',
    stato: !passi123Verdi ? 'bloccato' : screeningGenerato ? 'completo' : 'attivo',
    motivo: isEnte
      ? 'Completa prima Anagrafica, Posizione Ente e Analisi Bilancio.'
      : 'Completa prima Anagrafica e Analisi Bilancio.',
  });
  steps.push({
    id: 'checklist',
    label: 'Check List',
    stato: !screeningGenerato ? 'bloccato' : checklistCompleta ? 'completo' : 'attivo',
    motivo: 'Genera prima lo Screening.',
    badge: screeningGenerato && domandeMancanti > 0 ? domandeMancanti : undefined,
  });

  const classePerStato = (stato: StatoStep): string => {
    if (stato === 'completo')
      return 'bg-emerald-50 border-emerald-300 text-emerald-700 hover:border-emerald-400';
    if (stato === 'attivo')
      return 'bg-amber-50 border-amber-300 text-amber-800 hover:border-amber-400';
    // bloccato
    return 'bg-slate-50 border-slate-200 text-slate-300 cursor-not-allowed';
  };

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

      {/* Barra dei passi: sequenza logica dell'analisi a sinistra, Operatori a
          destra. Semaforo: grigio = bloccato, arancione = da fare, verde = fatto. */}
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
            <Link key={step.id} href={step.id ? `${base}/${step.id}` : base} className={classi}>
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
  );
}
