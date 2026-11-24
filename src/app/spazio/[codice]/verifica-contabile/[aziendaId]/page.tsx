import { redirect } from 'next/navigation';
import { ottieniContestoAccessoSpazio } from '@/app/actions/spazi';
import { ottieniAziendaPerId } from '@/app/actions/aziende';
import { ottieniVisuraTriageAction } from '@/app/actions/visuraTriage';
import { ottieniAnagraficaEnte } from '@/app/actions/anagraficaEnte';
import { ottieniStoricoXbrlAzienda } from '@/app/actions/xbrlAzienda';
import { ottieniIndiciSpazio } from '@/app/actions/parametriSpazio';
import { ottieniEsitoVerificaAction } from '@/app/actions/esitoVerifica';
import { VerificaContabileAzienda } from '@/components/spazio/VerificaContabileAzienda';
import { EsitoVerifica } from '@/components/spazio/EsitoVerifica';
import { RelazioneInquadramento } from '@/components/spazio/RelazioneInquadramento';
import { IstruttoriePrecedenti } from '@/components/spazio/IstruttoriePrecedenti';

export const dynamic = 'force-dynamic';

// LA VERIFICA CONTABILE DI UN'AZIENDA — una sola procedura.
//
// Documenti (visura storica, parametri dell'ente, bilanci XBRL) → prospetto a
// scalare, indici e proiezione → esito → relazione di inquadramento e
// questionario → documento stampabile.
//
// Prima erano due pagine e due procedure: questa e la «Valutazione completa»
// sotto /aziende/[id]/screening, con un secondo caricamento degli stessi
// documenti e due giudizi diversi sulla stessa posizione. La seconda non c'è
// più: la sua parte scritta è qui, e il suo giudizio è quello di questa pagina.
export default async function VerificaContabileAziendaPage({
  params,
  searchParams,
}: {
  params: Promise<{ codice: string; aziendaId: string }>;
  searchParams: Promise<{ ritorno?: string }>;
}) {
  const { codice, aziendaId } = await params;
  const { ritorno } = await searchParams;
  const contesto = await ottieniContestoAccessoSpazio(codice);
  if (!contesto) redirect('/');
  if (contesto.modalita === 'OPERATORE') redirect(`/spazio/${codice}`);

  const id = Number(aziendaId);
  if (!Number.isInteger(id) || id <= 0) redirect(`/spazio/${codice}/verifica-contabile`);

  const risultato = await ottieniAziendaPerId(contesto.nomeSchema, id);
  if (!risultato.success || !risultato.azienda) {
    redirect(`/spazio/${codice}/verifica-contabile`);
  }

  const [visuraRis, parametriRis, storicoRis, indiciRis, esitoRis] = await Promise.all([
    ottieniVisuraTriageAction(contesto.nomeSchema, id),
    ottieniAnagraficaEnte(contesto.nomeSchema, id),
    ottieniStoricoXbrlAzienda(contesto.nomeSchema, id),
    // Gli indici abilitati nello spazio: il prospetto mostra questi.
    ottieniIndiciSpazio(contesto.nomeSchema).catch(() => null),
    // L'esito si legge dai dati: non è memorizzato, quindi non può invecchiare.
    ottieniEsitoVerificaAction(contesto.nomeSchema, id, contesto.tipoSpazio).catch(() => null),
  ]);

  const visura = visuraRis.success && visuraRis.visura ? visuraRis.visura : null;
  const esito = esitoRis?.success && esitoRis.esito ? esitoRis.esito : null;

  return (
    <div className="space-y-6">
      <VerificaContabileAzienda
        nomeSchema={contesto.nomeSchema}
        codice={codice}
        aziendaId={id}
        ragioneSociale={risultato.azienda.ragioneSociale}
        visuraIniziale={
          visura ? { nome: visura.nome, caricataIl: visura.caricataIl.slice(0, 10) } : null
        }
        parametriIniziali={parametriRis.success ? parametriRis.dati : ({} as never)}
        anniXbrl={
          storicoRis.success ? storicoRis.storico.filter((b) => b.annoBilancio !== null).length : 0
        }
        indiciAbilitati={
          indiciRis?.success ? indiciRis.indici.filter((i) => i.abilitato).map((i) => i.codice) : []
        }
        ritorno={ritorno ?? null}
      />

      {esito ? (
        <EsitoVerifica
          esito={esito}
          debitoInBilancio={esitoRis?.debitoInBilancio ?? null}
          iconografia={esitoRis?.iconografia ?? null}
        />
      ) : (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
          L’esito non è calcolabile con i dati disponibili: completa visura, parametri e bilanci qui
          sopra. L’esito si compone dai dati, non dal testo della relazione.
        </p>
      )}

      <RelazioneInquadramento
        nomeSchema={contesto.nomeSchema}
        aziendaId={id}
        codice={codice}
        tipoSpazio={contesto.tipoSpazio}
        esito={esito}
        debitoInBilancio={esitoRis?.debitoInBilancio ?? null}
        indiciAbilitati={
          indiciRis?.success ? indiciRis.indici.filter((i) => i.abilitato).map((i) => i.codice) : []
        }
      />

      <IstruttoriePrecedenti nomeSchema={contesto.nomeSchema} aziendaId={id} />
    </div>
  );
}
