import { redirect } from 'next/navigation';
import { ottieniContestoAccessoSpazio } from '@/app/actions/spazi';
import { ottieniScenarioPerId } from '@/app/actions/scenari';
import { PropostaScenario } from '@/components/spazio/PropostaScenario';
import { ottieniFunzioniPlusSpazio } from '@/app/actions/funzioniPlus';
import { LavorazioneRedigente } from '@/components/spazio/LavorazioneRedigente';
import { ottieniStoricoXbrlAzienda } from '@/app/actions/xbrlAzienda';
import { ottienePosizioneAggiornata } from '@/app/actions/posizioneAggiornata';
import { ottieniRisposteChecklist } from '@/app/actions/checklist';
import { ottieniTestPraticoAzienda } from '@/app/actions/testPraticoAzienda';
import {
  aggiornaDatiSettoreSeNecessarioAction,
  ottieniDatiSettore,
} from '@/app/actions/datiSettore';
import { MODELLO_MINISTERIALE } from '@/lib/checklist/costanti';
import { CHECKLIST_MINISTERIALE } from '@/lib/checklist/ministeriale';
import { calcolaQuadroQualitativo, type RispostaPerCalcolo } from '@/lib/checklist/scoring';
import { crescitaAzienda, crescitaDaSerie } from '@/lib/piano/automatico';

// L'analisi dei documenti della proposta (Ricevente) è l'operazione AI più
// pesante di questo flusso — due chiamate in parallelo su più PDF. Senza un
// tetto esplicito la funzione serverless usa il default (breve) e viene uccisa
// a metà (spinner infinito). Le altre pagine AI (brogliaccio 180, relazione
// 120) hanno già il proprio; qui mancava.
export const maxDuration = 300;

export default async function PropostaScenarioPage({
  params,
}: {
  params: Promise<{ codice: string; scenarioId: string }>;
}) {
  const { codice, scenarioId } = await params;
  const contesto = await ottieniContestoAccessoSpazio(codice);
  if (!contesto) redirect('/');
  if (contesto.modalita === 'OPERATORE' && (contesto.permessi?.report || 'NESSUNO') === 'NESSUNO') {
    redirect(`/spazio/${codice}/scenari/${scenarioId}`);
  }

  const risultato = await ottieniScenarioPerId(contesto.nomeSchema, Number(scenarioId));
  if (!risultato.success || !risultato.scenario) {
    redirect(`/spazio/${codice}/scenari`);
  }
  const scenario = risultato.scenario!;
  const permesso = (m: string) =>
    contesto.modalita !== 'OPERATORE' ||
    ((contesto.permessi as Record<string, string> | undefined)?.[m] ?? 'NESSUNO') !== 'NESSUNO';
  const eAdminSpazio = contesto.modalita === 'ADMIN_SPAZIO' || contesto.modalita === 'SALVAGENTE';
  const identitaUtente =
    contesto.email || (contesto.modalita === 'SALVAGENTE' ? 'Superadmin (salvagente)' : null);

  // Percorso Redigente: la lavorazione della proposta è una pagina sola —
  // stato attuale, proposta, piano di sviluppo, documenti, Relazione.
  if (scenario.tipoProposta !== 'RICEVUTA') {
    const sid = Number(scenarioId);
    await aggiornaDatiSettoreSeNecessarioAction(contesto.nomeSchema, scenario.aziendaId).catch(
      () => undefined
    );
    const [plusR, storicoR, posizioneR, risposteR, testR, settoreR] = await Promise.all([
      ottieniFunzioniPlusSpazio(contesto.nomeSchema),
      ottieniStoricoXbrlAzienda(contesto.nomeSchema, scenario.aziendaId),
      ottienePosizioneAggiornata(contesto.nomeSchema, sid),
      ottieniRisposteChecklist(contesto.nomeSchema, sid, MODELLO_MINISTERIALE),
      ottieniTestPraticoAzienda(contesto.nomeSchema, scenario.aziendaId),
      ottieniDatiSettore(contesto.nomeSchema, scenario.aziendaId),
    ]);
    const anniBilancio = (storicoR.success ? storicoR.storico : [])
      .map((b) => b.annoBilancio)
      .filter((a): a is number => typeof a === 'number')
      .sort((a, b) => a - b);
    const risposte = risposteR.success ? risposteR.risposte : [];
    const mappa: Record<string, RispostaPerCalcolo> = {};
    for (const r of risposte) mappa[r.domandaId] = { domandaId: r.domandaId, risposta: r.risposta };
    const totaleDomande = CHECKLIST_MINISTERIALE.reduce((a, x) => a + x.domande.length, 0);
    const risposteDate = risposte.filter((r) => r.risposta !== null).length;
    const crescitaSet =
      settoreR.success && settoreR.punti.length ? crescitaDaSerie(settoreR.punti) : null;
    const crescitaAz = storicoR.success
      ? crescitaAzienda(
          storicoR.storico
            .filter((b) => b.annoBilancio)
            .map((b) => ({
              anno: b.annoBilancio as number,
              ricaviVendite: b.datiFinanziari.ricaviVendite,
            }))
            .sort((a, b) => b.anno - a.anno)
        )
      : null;
    return (
      <LavorazioneRedigente
        nomeSchema={contesto.nomeSchema}
        codice={codice}
        scenarioId={sid}
        aziendaId={scenario.aziendaId}
        tipoSpazio={contesto.tipoSpazio}
        nomeScenario={scenario.nome}
        rigaRilevanteBloccataIniziale={scenario.rigaRilevanteBloccata}
        stato={{
          anniBilancio,
          posizione:
            posizioneR.success && posizioneR.esiste
              ? { data: posizioneR.posizione.dataRiferimento }
              : null,
          checklist: {
            risposte: risposteDate,
            totale: totaleDomande,
            esito: risposteDate
              ? calcolaQuadroQualitativo(CHECKLIST_MINISTERIALE, mappa).etichetta
              : null,
          },
          testPratico:
            testR.success && testR.stato.compilato ? testR.stato.risultato.etichetta : null,
          settore:
            crescitaSet || crescitaAz
              ? {
                  gruppo: settoreR.success ? (settoreR.info?.gruppo ?? null) : null,
                  settore: crescitaSet ? crescitaSet.tasso : null,
                  azienda: crescitaAz ? crescitaAz.tasso : null,
                }
              : null,
        }}
        chiusura={{
          pianoDisponibile: plusR.funzioni.simulazione && permesso('simulazione'),
          relazioneDisponibile: plusR.funzioni.relazioneAi && permesso('relazione'),
          settoreDisponibile: plusR.funzioni.datiSettore,
          eAdminSpazio,
          identitaUtente,
          bloccatoIl: scenario.bloccatoIl,
        }}
      />
    );
  }

  // Percorso Ricevente: piano e Relazione si chiudono su questa stessa pagina.
  const plus =
    scenario.tipoProposta === 'RICEVUTA'
      ? await ottieniFunzioniPlusSpazio(contesto.nomeSchema)
      : null;
  const chiusura =
    scenario.tipoProposta === 'RICEVUTA' && plus
      ? {
          simulazioneAttiva: scenario.simulazioneAttiva,
          pianoDisponibile: plus.funzioni.simulazione && permesso('simulazione'),
          relazioneDisponibile: plus.funzioni.relazioneAi && permesso('relazione'),
          eAdminSpazio,
          identitaUtente,
          bloccatoIl: scenario.bloccatoIl,
        }
      : undefined;

  return (
    <div className="space-y-10">
      <PropostaScenario
        nomeSchema={contesto.nomeSchema}
        scenarioId={Number(scenarioId)}
        aziendaId={scenario.aziendaId}
        tipoProposta={scenario.tipoProposta}
        tipoSpazio={contesto.tipoSpazio}
        nomeScenario={scenario.nome}
        rigaRilevanteBloccataIniziale={scenario.rigaRilevanteBloccata}
        codice={codice}
        chiusura={chiusura}
      />
    </div>
  );
}
