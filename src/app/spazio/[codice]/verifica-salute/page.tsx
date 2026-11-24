import { redirect } from 'next/navigation';
import { ottieniContestoAccessoSpazio } from '@/app/actions/spazi';
import { ottieniObbligoVeraAction } from '@/app/actions/parametriTriage';
import { ottieniStoricoVerificheAction } from '@/app/actions/aziendaInVerifica';
import { CruscottoVerificheEnte } from '@/components/spazio/CruscottoVerificheEnte';
import { VerificaSaluteAzienda } from '@/components/spazio/VerificaSaluteAzienda';

// L'estrazione dalla visura è una chiamata al modello su un PDF: il tetto di
// durata predefinito non basta.
export const maxDuration = 180;

export default async function VerificaSalutePage({
  params,
  searchParams,
}: {
  params: Promise<{ codice: string }>;
  searchParams: Promise<{ azienda?: string }>;
}) {
  const { codice } = await params;
  const contesto = await ottieniContestoAccessoSpazio(codice);
  if (!contesto) redirect('/');
  if (contesto.modalita === 'OPERATORE') redirect(`/spazio/${codice}`);

  // `?azienda=<id>` RIAPRE una verifica già eseguita: è la via di ritorno a
  // una videata che prima esisteva solo nella scheda del browser. Un id che non
  // è un intero positivo non si interpreta: si torna alla verifica da zero.
  const { azienda } = await searchParams;
  const id = Number(azienda);
  const aziendaDaRiprendere = Number.isInteger(id) && id > 0 ? id : null;

  // La certificazione dei debiti è il presupposto del triage solo dove esiste per chi lo fa:
  // è un parametro dello spazio (obbligatorio di default per l'INPS,
  // facoltativo altrove). Se il parametro non si legge, la pagina non
  // allenta la regola: resta obbligatorio, e lo dichiara come prima.
  const obbligo = await ottieniObbligoVeraAction(contesto.nomeSchema);
  const veraObbligatorio = obbligo.success && obbligo.obbligo ? obbligo.obbligo.obbligatorio : true;

  // IL PORTAFOGLIO (0.242.0): le posizioni verificate, quante invecchiano e
  // quante sono rosse, lette dallo stesso storico che la pagina mostra.
  // LA CONTABILE NON SI LEGGE PIÙ QUI (0.256.3): il portafoglio dell'ente
  // conta posizioni, invecchiamento ed esiti delle verifiche amministrative. Il
  // grado di completezza della contabile è un numero della sua pagina, e
  // chiederlo a ogni caricamento di questa non lo rendeva più chiaro.
  const storicoRis = await ottieniStoricoVerificheAction(contesto.nomeSchema).catch(() => null);
  const righeCruscotto = (storicoRis?.success ? (storicoRis.righe ?? []) : []).map((r) => ({
    id: r.id,
    ragioneSociale: r.ragioneSociale,
    esito: r.esito,
    eseguitaIl: r.eseguitaIl,
  }));

  return (
    <main className="p-6 max-w-5xl mx-auto space-y-4">
      <CruscottoVerificheEnte codice={codice} righe={righeCruscotto} />
      <VerificaSaluteAzienda
        nomeSchema={contesto.nomeSchema}
        codice={codice}
        tipoSpazio={contesto.tipoSpazio}
        aziendaDaRiprendere={aziendaDaRiprendere}
        veraObbligatorio={veraObbligatorio}
      />
    </main>
  );
}
