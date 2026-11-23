import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { ottieniContestoAccessoSpazio } from '@/app/actions/spazi';
import { ottieniAziendaPerId } from '@/app/actions/aziende';
import { AziendaConfigXbrl } from '@/components/spazio/AziendaConfigXbrl';
import { AziendaConfigIndici } from '@/components/spazio/AziendaConfigIndici';

// CONFIGURAZIONE DEL DATO CONTABILE: UNA SCHEDA, NON UN PERCORSO IN TRE.
//
// Prima erano tre schede in fila sotto «Analisi Bilancio» — Bilanci XBRL,
// Configurazione XBRL, Indici — e due di loro non avevano una porta: si
// aprivano solo da un vecchio segnalibro, dentro la scheda azienda, con
// un'uscita che non c'entrava. Il caricamento dei bilanci non è una
// configurazione: è la prima sezione della verifica contabile, e si carica lì.
// Le tab e gli indici sono invece la stessa decisione — che cosa del bilancio
// depositato si legge — e stanno qui, una sotto l'altra.
export default async function AziendaXbrlPage({
  params,
}: {
  params: Promise<{ codice: string; aziendaId: string }>;
}) {
  const { codice, aziendaId } = await params;
  const contesto = await ottieniContestoAccessoSpazio(codice);
  if (!contesto) redirect('/');
  if (contesto.modalita === 'OPERATORE') redirect(`/spazio/${codice}`);

  const risultato = await ottieniAziendaPerId(contesto.nomeSchema, Number(aziendaId));
  if (!risultato.success || !risultato.azienda) {
    redirect(`/spazio/${codice}/aziende`);
  }

  const verificaContabile = `/spazio/${codice}/verifica-contabile/${aziendaId}`;

  return (
    <div className="space-y-4">
      {/* L'uscita di una scheda di servizio è la verifica da cui si arriva,
          non l'elenco Aziende: qui si entra dal caricamento dei bilanci. */}
      <Link
        href={`${verificaContabile}#bilanci-xbrl`}
        className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft className="w-3 h-3" /> Verifica contabile
      </Link>
      <AziendaConfigXbrl
        nomeSchema={contesto.nomeSchema}
        aziendaId={Number(aziendaId)}
        hrefBilanci={`${verificaContabile}#bilanci-xbrl`}
      />
      <AziendaConfigIndici nomeSchema={contesto.nomeSchema} aziendaId={Number(aziendaId)} />
    </div>
  );
}
