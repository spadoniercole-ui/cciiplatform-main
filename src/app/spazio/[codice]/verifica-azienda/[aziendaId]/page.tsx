import { redirect } from 'next/navigation';
import { ottieniContestoAccessoSpazio } from '@/app/actions/spazi';
import { ottieniAziendaPerId } from '@/app/actions/aziende';
import { ottieniConfigVerificaAziendaAction } from '@/app/actions/verificaAzienda';
import { statoVerificaContabileAction } from '@/app/actions/verificaContabile';
import { ottieniAttenzioneScreeningAction } from '@/app/actions/attenzioneScreening';
import { debitoEnteMemorizzatoAction } from '@/app/actions/debitiEnteMemorizzati';
import { ottieniStoricoVerificheAction } from '@/app/actions/aziendaInVerifica';
import { VerificaAziendaScheda } from '@/components/spazio/VerificaAziendaScheda';

export const dynamic = 'force-dynamic';

export default async function VerificaAziendaSchedaPage({
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

  // Le due verifiche si leggono dalle loro fonti: l'esito amministrativo e lo
  // stato della contabile. La scheda non le ricalcola, le mette in due box.
  const [config, statoContabile, attenzioneRis, debitoRis, storicoRis] = await Promise.all([
    ottieniConfigVerificaAziendaAction(contesto.nomeSchema),
    statoVerificaContabileAction(contesto.nomeSchema),
    ottieniAttenzioneScreeningAction(contesto.nomeSchema, id).catch(() => null),
    debitoEnteMemorizzatoAction(contesto.nomeSchema, id).catch(() => null),
    ottieniStoricoVerificheAction(contesto.nomeSchema).catch(() => null),
  ]);

  const rigaContabile = statoContabile.success
    ? statoContabile.aziende.find((a) => a.aziendaId === id)
    : undefined;
  const attenzione = attenzioneRis?.success ? (attenzioneRis.attenzione ?? null) : null;
  const verificataIl = storicoRis?.success
    ? (storicoRis.righe?.find((v) => v.id === id)?.eseguitaIl ?? null)
    : null;

  return (
    <VerificaAziendaScheda
      nomeSchema={contesto.nomeSchema}
      aziendaId={id}
      ragioneSociale={risultato.azienda.ragioneSociale}
      annualitaIniziale={config.success ? config.annualita : 3}
      codice={codice}
      simulazioneAttivaIniziale={config.success ? config.simulazioneAttiva : false}
      amministrativa={
        attenzione
          ? {
              etichetta: attenzione.etichetta,
              esito: attenzione.esito,
              copertura: `${attenzione.copertura.determinate}/${attenzione.copertura.totali}`,
              verificataIl,
              debitoTotale: debitoRis?.debito?.totale ?? null,
              debitoFonte: debitoRis?.debito?.fonte ?? null,
              debitoIl: debitoRis?.memorizzatoIl ?? null,
            }
          : null
      }
      contabile={
        rigaContabile
          ? {
              anniXbrl: rigaContabile.anniXbrl,
              visuraIl: rigaContabile.visuraIl,
              parametriPresenti: rigaContabile.parametriPresenti,
              completa: rigaContabile.completa,
            }
          : null
      }
    />
  );
}
