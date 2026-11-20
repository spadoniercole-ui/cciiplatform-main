import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, FileText } from 'lucide-react';
import { ottieniContestoAccessoSpazio } from '@/app/actions/spazi';
import { ottieniAziendaPerId } from '@/app/actions/aziende';
import { ottieniAttenzioneScreeningAction } from '@/app/actions/attenzioneScreening';
import { debitoEnteMemorizzatoAction } from '@/app/actions/debitiEnteMemorizzati';
import { leggiFotografiaComplessiva } from '@/lib/verificaAzienda/fotografiaComplessiva';
import type { LetturaAmministrativa } from '@/lib/verificaAzienda/interpolazione';
import { FotografiaComplessivaView } from '@/components/spazio/FotografiaComplessiva';
import { StampaDocumento } from '@/components/spazio/StampaDocumento';

export const dynamic = 'force-dynamic';

// LA FOTOGRAFIA COMPLESSIVA — il documento che si rilascia all'ente.
//
// Non è il report dell'azienda (quello porta gli atti e la proposta): è la
// fotografia della posizione, con le due verifiche incrociate. Dice ciò che
// l'ente vanta, ciò che dicono i numeri, che cosa l'azienda può rispondere, dove
// le due letture divergono e ciò che manca. Si stampa così com'è, e la scheda
// della verifica aziendale ne mostra lo stesso contenuto: una sola lettura.
export default async function FotografiaComplessivaPage({
  params,
}: {
  params: Promise<{ codice: string; aziendaId: string }>;
}) {
  const { codice, aziendaId } = await params;
  const contesto = await ottieniContestoAccessoSpazio(codice);
  if (!contesto) redirect('/');
  if (contesto.modalita === 'OPERATORE') redirect(`/spazio/${codice}`);

  const id = Number(aziendaId);
  if (!Number.isInteger(id) || id <= 0) redirect(`/spazio/${codice}/verifica-azienda`);

  const risultato = await ottieniAziendaPerId(contesto.nomeSchema, id);
  if (!risultato.success || !risultato.azienda) {
    redirect(`/spazio/${codice}/verifica-azienda`);
  }

  const [attenzioneRis, debitoRis] = await Promise.all([
    ottieniAttenzioneScreeningAction(contesto.nomeSchema, id).catch(() => null),
    debitoEnteMemorizzatoAction(contesto.nomeSchema, id).catch(() => null),
  ]);
  const attenzione = attenzioneRis?.success ? (attenzioneRis.attenzione ?? null) : null;

  const letturaAmministrativa: LetturaAmministrativa | null = attenzione
    ? {
        esito: attenzione.esito,
        etichetta: attenzione.etichetta,
        fattore: attenzione.fattoreDeterminante,
        copertura: attenzione.copertura,
        credito: debitoRis?.debito?.totale ?? null,
        debitoIl: debitoRis?.memorizzatoIl ?? null,
        accertato: attenzione.accertato ?? [],
        daAccertare: attenzione.daAccertare ?? [],
      }
    : null;

  const complessiva = await leggiFotografiaComplessiva(
    contesto.nomeSchema,
    id,
    letturaAmministrativa
  )
    .then((r) => r.complessiva)
    .catch(() => null);

  const generatoIl = new Date().toLocaleDateString('it-IT');

  return (
    <div className="max-w-4xl space-y-4">
      <div className="flex items-center justify-between gap-3 print:hidden">
        <Link
          href={`/spazio/${codice}/verifica-azienda/${id}`}
          className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500 hover:text-blue-600"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Torna alla verifica azienda
        </Link>
        <StampaDocumento etichetta="Stampa la fotografia complessiva" />
      </div>

      <header className="bg-white border border-slate-200 rounded-xl p-6 space-y-2">
        <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">
          Verifica aziendale · fotografia complessiva
        </p>
        <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
          <FileText className="w-5 h-5 text-blue-600" /> {risultato.azienda.ragioneSociale}
        </h1>
        <p className="text-[11px] text-slate-500">
          {risultato.azienda.partitaIva ? `P. IVA ${risultato.azienda.partitaIva} · ` : ''}
          fotografia al {generatoIl}, composta incrociando la verifica amministrativa con la
          verifica contabile. Documento generato dalla piattaforma: nessun valore è ricalcolato a
          mano.
        </p>
      </header>

      <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
          1. Che cosa dice la posizione
        </h2>
        {complessiva ? (
          <FotografiaComplessivaView complessiva={complessiva} />
        ) : (
          <p className="text-[11px] text-slate-500">
            La fotografia non si compone: mancano o il credito accertato o il prospetto contabile.
          </p>
        )}
      </section>

      <p className="text-[10px] text-slate-400 leading-relaxed">
        La fotografia incrocia ciò che le due verifiche hanno accertato e dichiarato. Le divergenze
        fra le letture sono riportate con la loro spiegazione: non si compensano e non producono un
        giudizio nuovo. Nessuna conclusione giuridica: la scelta su come procedere resta al
        valutatore dell’ente.
      </p>
    </div>
  );
}
