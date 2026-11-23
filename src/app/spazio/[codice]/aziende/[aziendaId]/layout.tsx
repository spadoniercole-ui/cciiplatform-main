import { redirect } from 'next/navigation';
import { CruscottoAzienda } from '@/components/spazio/CruscottoAzienda';
import { UscitaSchedaAzienda } from '@/components/spazio/UscitaSchedaAzienda';
import Link from 'next/link';
import { Camera, Users } from 'lucide-react';
import { ottieniContestoAccessoSpazio } from '@/app/actions/spazi';
import { ottieniAziendaPerId } from '@/app/actions/aziende';
import { leggiIdentificativiEnte } from '@/lib/anagraficaEnte/identificativi';
import { IdentificativiEnte } from '@/components/spazio/IdentificativiEnte';
import { RiferimentoAziendaStampa } from '@/components/spazio/RiferimentoAziendaStampa';
import { DemoAziendaScope } from '@/components/spazio/DemoUploadProvider';

// L'ANAGRAFICA NON È UNA VERIFICA (0.255.13).
//
// Questa scheda si apriva con la barra delle tre verifiche — amministrativa,
// contabile, aziendale — e la stessa barra stava anche dentro la verifica
// aziendale. Chi arrivava dall'esito amministrativo («Scheda azienda») finiva
// così in due posti diversi che si chiamavano allo stesso modo e producevano
// documenti diversi.
//
// Ora il binario è uno: da qui si va nella verifica aziendale, che è la
// fotografia delle due letture e il documento che si rilascia, e da lì si
// aprono l'esito amministrativo e la contabile. Questa pagina resta quello che
// è: i dati dell'azienda, da leggere e correggere.

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

  // Identificativi presso l'ente: in testata, in evidenza, appena salvati.
  const identificativi = isEnte
    ? await leggiIdentificativiEnte(contesto.nomeSchema, aziendaNum).catch(() => [])
    : [];

  const base = `/spazio/${codice}/aziende/${aziendaId}`;

  return (
    <DemoAziendaScope azienda={azienda.ragioneSociale}>
      <div className="max-w-5xl space-y-4">
        {/* L'uscita torna dove si è entrati — l'elenco Aziende o la griglia
            delle iconografie, secondo il `?ritorno` con cui si è aperta la
            scheda — e ripiega sull'elenco quando quell'origine manca. */}
        <UscitaSchedaAzienda codice={codice} />

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
            <div className="flex items-center gap-2">
              <span
                className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase ${
                  azienda.attiva ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                }`}
              >
                {azienda.attiva ? 'Attiva' : 'Disabilitata'}
              </span>
            </div>
          </div>
        </div>

        {/* Cruscotto di sintesi: rinfresca la memoria a chi torna sulla
          posizione dopo settimane, o a chi ne lavora molte. Sta in testata e
          non nella sola Anagrafica perché chi torna non entra sempre da lì.
          Se non c'è mai stata una verifica non si mostra nulla. */}
        <CruscottoAzienda nomeSchema={contesto.nomeSchema} aziendaId={aziendaNum} codice={codice} />

        {/* Una sola porta verso l'analisi: la verifica aziendale. Da lì si
          aprono l'esito amministrativo e la verifica contabile, quindi questa
          pagina non ripete quei due pulsanti. Operatori resta separato, perché
          non è un passo dell'analisi. */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <Link
            href={`/spazio/${codice}/verifica-azienda/${aziendaId}`}
            className="shrink-0 inline-flex items-center gap-1 px-3 py-2 rounded-lg text-[11px] font-bold whitespace-nowrap border border-blue-200 bg-blue-50 text-blue-800 hover:border-blue-400 transition-colors"
          >
            <Camera className="w-3.5 h-3.5" /> Verifica aziendale
          </Link>

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
