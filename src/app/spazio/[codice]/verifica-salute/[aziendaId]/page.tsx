import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, Building2, FileDown, ShieldAlert } from 'lucide-react';
import { ottieniContestoAccessoSpazio } from '@/app/actions/spazi';
import { ottieniAziendaPerId } from '@/app/actions/aziende';
import { ottieniAttenzioneScreeningAction } from '@/app/actions/attenzioneScreening';
import { ottieniStoricoVerificheAction } from '@/app/actions/aziendaInVerifica';
import { ottieniRaccomandazioneAction } from '@/app/actions/raccomandazioneVerifica';
import { leggiChecklistProdottiAzienda } from '@/lib/prodotti/checklistAzienda';
import {
  checklistProdottiCompleta,
  dettaglioOrientamentoSommario,
} from '@/lib/checklist/pesoProdotti';
import { leggiPercentualeCriticitaPesata } from '@/lib/checklist/pesataMinisteriale';
import { PosizioneEnteScenario } from '@/components/spazio/PosizioneEnteScenario';
import { ChecklistProdottiEsito } from '@/components/spazio/ChecklistProdottiEsito';
import { DebitoMemorizzatoEnte } from '@/components/spazio/DebitoMemorizzatoEnte';
import { FlussiEnteAzienda } from '@/components/spazio/FlussiEnteAzienda';
import { PassoProcedura } from '@/components/spazio/PassoProcedura';
import { valutaValidita } from '@/lib/screening/validitaVerifica';

// L'ESITO DELLA VERIFICA AMMINISTRATIVA (0.194.0).
//
// La verifica amministrativa non finisce nella contabile: chiude con un esito
// che resta qui — indicatore di attenzione, certificazione dei debiti e soglie
// di segnalazione. Prima questi dati si aprivano nella scheda azienda, la cui
// freccia di ritorno parlava di verifica contabile: due verifiche diverse
// sembravano la stessa cosa.
//
// La contabile legge il dato storico dell'azienda (visura, parametri, XBRL,
// indici) e non ripete debito e soglie; la verifica azienda le legge da qui.

export const dynamic = 'force-dynamic';

const STILE = {
  ROSSO: {
    pallino: 'bg-red-500',
    testo: 'text-red-800',
    bordo: 'border-red-200',
    sfondo: 'bg-red-50',
  },
  GIALLO: {
    pallino: 'bg-amber-400',
    testo: 'text-amber-800',
    bordo: 'border-amber-200',
    sfondo: 'bg-amber-50',
  },
  ATTENZIONE_MINIMA: {
    pallino: 'bg-emerald-500',
    testo: 'text-emerald-800',
    bordo: 'border-emerald-200',
    sfondo: 'bg-emerald-50',
  },
} as const;

export default async function EsitoVerificaAmministrativaPage({
  params,
  searchParams,
}: {
  params: Promise<{ codice: string; aziendaId: string }>;
  searchParams: Promise<{ scheda?: string; ritorno?: string }>;
}) {
  const { codice, aziendaId } = await params;
  const { scheda, ritorno } = await searchParams;
  // Il rientro: chi arriva dalla verifica azienda torna lì — con i dati
  // riletti, perché questa pagina è force-dynamic — invece che al triage.
  const ritornoValido = ritorno && ritorno.startsWith(`/spazio/${codice}/`) ? ritorno : null;

  const contesto = await ottieniContestoAccessoSpazio(codice);
  if (!contesto) redirect('/');
  if (contesto.modalita === 'OPERATORE') redirect(`/spazio/${codice}`);

  const id = Number(aziendaId);
  if (!Number.isInteger(id) || id <= 0) redirect(`/spazio/${codice}/verifica-salute`);

  const risultato = await ottieniAziendaPerId(contesto.nomeSchema, id);
  if (!risultato.success || !risultato.azienda) {
    redirect(`/spazio/${codice}/verifica-salute`);
  }

  const [attenzioneRis, storicoRis, raccomandazioneRis, checklistRis, pesataMinisteriale] =
    await Promise.all([
      ottieniAttenzioneScreeningAction(contesto.nomeSchema, id).catch(() => null),
      ottieniStoricoVerificheAction(contesto.nomeSchema).catch(() => null),
      ottieniRaccomandazioneAction(contesto.nomeSchema, id).catch(() => null),
      leggiChecklistProdottiAzienda(contesto.nomeSchema, id).catch(() => null),
      leggiPercentualeCriticitaPesata(contesto.nomeSchema, id).catch(() => null),
    ]);
  const raccomandazione = raccomandazioneRis?.success
    ? (raccomandazioneRis.raccomandazione ?? null)
    : null;
  const attenzione = attenzioneRis?.success ? (attenzioneRis.attenzione ?? null) : null;

  // LA CHECK LIST CHE QUALIFICA È QUELLA DEI PRODOTTI, e ha un peso, non un
  // permesso: il supporto decisionale resta leggibile sempre — è la lettura dei
  // dati e delle strade, e nasconderla non protegge nessuno — mentre il quadro
  // qualitativo entra nell'indicatore solo quando la check list è completa. Se
  // non lo è, il blocco lo dice con quante risposte mancano e dove si compila.
  const sintesiProdotti = checklistRis;
  const prodottiCompleti = checklistProdottiCompleta(sintesiProdotti);
  // Con zero domande in check list la check list non è «incompleta a metà»:
  // non c'è nulla da chiedere, e scrivere «0/0 risposte» sembra un guasto.
  const prodottiChiesti = (sintesiProdotti?.totale ?? 0) > 0;
  const riga = storicoRis?.success ? storicoRis.righe?.find((v) => v.id === id) : undefined;
  const validita = valutaValidita(riga?.eseguitaIl ?? null);
  const stile = attenzione ? STILE[attenzione.esito as keyof typeof STILE] : null;

  // La certificazione dei debiti è la prima scheda: è il dato che la verifica
  // ha appena prodotto. Negli spazi senza ente creditore resta la sola soglia.
  const schedaIniziale =
    scheda === 'anagrafica' ? 'anagrafica' : scheda === 'soglie' ? 'soglie' : 'vera';

  return (
    <div className="max-w-5xl space-y-4">
      <Link
        href={ritornoValido ?? `/spazio/${codice}/verifica-salute`}
        className="inline-flex items-center gap-1.5 text-[11px] text-slate-500 hover:text-blue-600 font-bold uppercase tracking-wider"
      >
        <ArrowLeft className="w-3.5 h-3.5" />{' '}
        {ritornoValido ? 'Torna alla verifica azienda' : 'Torna alla verifica amministrativa'}
      </Link>

      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-blue-600" />
              Esito della verifica amministrativa — {risultato.azienda.ragioneSociale}
            </h1>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed max-w-3xl">
              Il risultato della verifica resta qui: indicatore di attenzione, certificazione dei
              debiti e soglie di segnalazione. La verifica contabile legge il dato storico
              dell’azienda e non ripete questi dati.
            </p>
          </div>
          <div className="shrink-0 flex items-center gap-3">
            {/* Il report in PDF si lancia da qui: apre il documento stampabile
                con l'impaginazione per la carta e la finestra di stampa già
                aperta (Stampa → Salva come PDF). */}
            <Link
              href={`/report/verifica-amministrativa/${codice}/${id}?stampa=1`}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-white hover:bg-slate-800"
            >
              <FileDown className="w-3.5 h-3.5" /> Report PDF
            </Link>
            <Link
              href={`/spazio/${codice}/verifica-salute/${id}/posizione`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-blue-800 hover:bg-blue-100"
            >
              <ShieldAlert className="w-3.5 h-3.5" /> Posizione ente
            </Link>
            {/* UN BINARIO SOLO (0.255.13). Questa voce portava all'anagrafica
                dell'azienda, che si apriva con una propria barra delle tre
                verifiche: due pagine diverse chiamate «verifica aziendale» e
                due report diversi. La voce porta ora alla verifica aziendale,
                che è il documento che si rilascia e da cui si aprono le due
                letture. L'anagrafica resta raggiungibile dall'elenco Aziende,
                dove si modificano i dati. */}
          </div>
        </div>
      </div>

      {/* I PASSI DELL'ESITO, NUMERATI (0.256.0). La verifica amministrativa non
          si legge come un elenco di riquadri: è una sequenza, e ogni passo dice
          che cosa aggiunge alla lettura — la check list il quadro qualitativo, la
          certificazione il credito, la posizione i riferimenti dell'ente, i
          flussi gli adempimenti. */}
      <div className="px-1">
        <PassoProcedura
          numero={1}
          titolo="Indicatore di attenzione"
          obiettivo="Leggere il risultato del triage: che cosa è accertato, che cosa manca, e su quale fattore si concentra l’attenzione."
        />
      </div>

      {stile && attenzione && (
        <div className={`rounded-xl border p-5 space-y-3 ${stile.sfondo} ${stile.bordo}`}>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${stile.pallino}`} />
              <span className={`text-sm font-bold ${stile.testo}`}>{attenzione.etichetta}</span>
            </span>
            <span className="text-[11px] text-slate-600">{attenzione.fattoreDeterminante}</span>
            <span className="text-[11px] text-slate-500">
              Copertura {attenzione.copertura.determinate}/{attenzione.copertura.totali}
            </span>
            <span className="ml-auto text-[11px] text-slate-500">
              {riga?.eseguitaIl
                ? `Verificata il ${new Date(riga.eseguitaIl).toLocaleDateString('it-IT')} · ${validita.etichetta}`
                : 'Data della verifica non registrata'}
            </span>
          </div>

          {attenzione.accertato.length > 0 && (
            <div>
              <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
                Accertato
              </p>
              <ul className="mt-1 space-y-0.5">
                {attenzione.accertato.map((voce, i) => (
                  <li key={i} className="text-[11px] text-slate-700 leading-relaxed flex gap-1.5">
                    <span className="text-slate-400 shrink-0">—</span>
                    <span>{voce}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {attenzione.daAccertare.length > 0 && (
            <div>
              <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
                Da accertare
              </p>
              <ul className="mt-1 space-y-0.5">
                {attenzione.daAccertare.map((voce, i) => (
                  <li key={i} className="text-[11px] text-slate-600 leading-relaxed flex gap-1.5">
                    <span className="text-slate-400 shrink-0">—</span>
                    <span>{voce}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-[10px] text-slate-500 leading-relaxed flex items-start gap-1.5">
            <ShieldAlert className="w-3 h-3 mt-0.5 shrink-0 text-slate-400" />
            Indicatore di priorità di attenzione, non di probabilità di insolvenza. La scelta su
            come procedere resta al valutatore.
          </p>
        </div>
      )}

      {!attenzione && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
          L’indicatore non è leggibile per questa azienda: certificazione dei debiti e soglie
          restano comunque consultabili qui sotto.
        </p>
      )}

      {/* LA CHECK LIST DEI PRODOTTI STA FRA L'ESITO E IL DEBITO (0.223.0).
          Non è una formalità del triage: è uno degli oggetti dell'analisi,
          insieme alla visura e ai prospetti. Prima il debito e prima — a
          maggior ragione — delle soglie, perché è da qui che la storia
          dell'azienda prende forma; e si compila dove la verifica si legge. */}
      <div className="px-1">
        <PassoProcedura
          numero={2}
          titolo="Check list dei prodotti"
          obiettivo="Dare al giudizio il quadro qualitativo: le risposte alle domande dei prodotti, che entrano nella valutazione solo quando sono complete."
        />
      </div>
      <ChecklistProdottiEsito nomeSchema={contesto.nomeSchema} aziendaId={id} />

      <div className="px-1">
        <PassoProcedura
          numero={3}
          titolo="Certificazione dei debiti"
          obiettivo="Accertare quanto l’azienda deve all’ente: è il credito che entra nelle soglie e nella posizione."
        />
      </div>
      <DebitoMemorizzatoEnte nomeSchema={contesto.nomeSchema} aziendaId={id} />

      <div className="px-1">
        <PassoProcedura
          numero={4}
          titolo="Posizione ente"
          obiettivo="Collocare l’azienda nell’anagrafica dell’ente e leggerne la posizione: riferimenti, soglie di segnalazione e documenti da richiedere."
        />
      </div>
      <PosizioneEnteScenario
        nomeSchema={contesto.nomeSchema}
        aziendaId={id}
        nomeAzienda={risultato.azienda.ragioneSociale}
        tipoSpazio={contesto.tipoSpazio}
        schedaIniziale={schedaIniziale}
      />

      {/* I FLUSSI DELL'ENTE CHIUDONO LA FOTOGRAFIA (0.227.0).
          Dopo il debito e la posizione: il rapporto con l'ente non è solo
          quanto si deve, è anche che cosa l'azienda ha trasmesso e quando.
          Qui si vedono i periodi attesi, quelli arrivati, quelli mancanti con
          il ritardo dalla scadenza e i mesi di matricola sospesa. */}
      <div className="px-1">
        <PassoProcedura
          numero={5}
          titolo="Adempimenti verso l’ente"
          obiettivo="Verificare che cosa l’azienda doveva trasmettere e quando: la tabella dice data, fonte, scadenza di legge e ritardo di ogni posizione."
        />
      </div>
      <FlussiEnteAzienda nomeSchema={contesto.nomeSchema} aziendaId={id} />

      {/* IL SUPPORTO DECISIONALE VA IN FONDO, DOPO TUTTO (0.223.0).
          Dare il riscontro della lettura prima delle soglie non avrebbe senso,
          né logico né pratico: il supporto arriva quando i materiali ci sono —
          visura, prospetti, check list dei prodotti — e dopo che le soglie
          hanno misurato il debito. Resta chiuso dietro il suo link: è una
          lettura, non un verdetto. */}
      {raccomandazione && (
        <details className="group bg-white border border-slate-200 rounded-xl">
          <summary className="flex cursor-pointer list-none items-start justify-between gap-3 p-5">
            <span>
              <PassoProcedura
                numero={6}
                titolo="Supporto decisionale"
                obiettivo="Leggere i dati, i percorsi possibili e i loro esiti: è un supporto alla scelta, non un consiglio."
              />
              <span className="mt-1 block text-[10px] text-slate-500 leading-relaxed">
                La lettura dei dati, i percorsi e i loro esiti. Si apre su richiesta: non è un
                consiglio.{' '}
                {prodottiCompleti && sintesiProdotti
                  ? `${dettaglioOrientamentoSommario(sintesiProdotti, pesataMinisteriale)} Entra nella valutazione insieme al prospetto dell’ente e alle soglie dell’art. 25-novies.`
                  : prodottiChiesti
                    ? `La check list dei prodotti non è completa (${sintesiProdotti?.risposte ?? 0}/${sintesiProdotti?.totale ?? 0} risposte): il quadro qualitativo resta fuori dalla valutazione finché non lo è.`
                    : `Nessun prodotto è in check list, quindi non ci sono domande da porre: il quadro qualitativo non entra nella valutazione.`}
              </span>
            </span>
            <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-blue-700 group-open:hidden">
              Apri
            </span>
            <span className="hidden shrink-0 text-[10px] font-bold uppercase tracking-wider text-slate-500 group-open:inline">
              Chiudi
            </span>
          </summary>
          <div className="border-t border-slate-200 p-5 space-y-3">
            <p className="text-[10px] text-slate-600 leading-relaxed">
              <strong className="text-slate-700">Materiali dell’analisi:</strong> visura camerale,
              prospetti contabili,{' '}
              {prodottiCompleti && sintesiProdotti
                ? `check list dei prodotti (${sintesiProdotti.etichetta.toLowerCase()}, ${sintesiProdotti.risposte}/${sintesiProdotti.totale} risposte${sintesiProdotti.percentualeNegative !== null ? `, ${sintesiProdotti.percentualeNegative}% negative sulle chiuse` : ''}).`
                : prodottiChiesti
                  ? `check list dei prodotti non completa (${sintesiProdotti?.risposte ?? 0}/${sintesiProdotti?.totale ?? 0} risposte): non entra nella valutazione.`
                  : 'check list dei prodotti senza domande: non entra nella valutazione.'}
            </p>
            {!prodottiCompleti &&
              (prodottiChiesti ? (
                <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3 text-[10px] text-slate-600 leading-relaxed">
                  Il quadro qualitativo non pesa nell’indicatore finché la check list dei prodotti
                  non è completa ({sintesiProdotti?.risposte ?? 0}/{sintesiProdotti?.totale ?? 0}{' '}
                  risposte). Si compila nel triage, prima dell’esito, non nella fase redigente:{' '}
                  <Link
                    href={`/spazio/${codice}/verifica-salute?azienda=${id}`}
                    className="font-bold text-blue-700 hover:text-blue-800"
                  >
                    riapri il triage di questa azienda →
                  </Link>
                </p>
              ) : (
                <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3 text-[10px] text-slate-600 leading-relaxed">
                  Nessun prodotto ha il flag «in check list»: le domande si scrivono sui prodotti,
                  non qui. Finché non ce n’è almeno uno il quadro qualitativo non entra nella
                  valutazione, e non c’è nulla da compilare:{' '}
                  <Link
                    href={`/spazio/${codice}/parametri/prodotti`}
                    className="font-bold text-blue-700 hover:text-blue-800"
                  >
                    Parametri di spazio → Prodotti →
                  </Link>
                </p>
              ))}
            {/* LA CHECK LIST SENZA PESI LO DICE, E MANDA A CHI I PESI LI
                IMPOSTA (0.256.0). Dire «la valutazione pesata non è ancora
                compilata» senza una via lasciava l’utente davanti a un dato
                mancante che non poteva colmare. */}
            {pesataMinisteriale === null && (
              <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3 text-[10px] text-slate-600 leading-relaxed">
                La Check List non ha ancora una valutazione pesata: finché i pesi non sono impostati
                vale la sola quota delle risposte, e il quadro qualitativo è più povero. I pesi si
                gestiscono dai parametri dello spazio:{' '}
                <Link
                  href={`/spazio/${codice}/parametri/checklist`}
                  className="font-bold text-blue-700 hover:text-blue-800"
                >
                  Gestisci i pesi della Check List →
                </Link>{' '}
                — se il tuo profilo non li può modificare, la richiesta va all’amministratore dello
                spazio.
              </p>
            )}
            {raccomandazione && (
              <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-5 space-y-3">
                <p className="text-[9px] font-bold uppercase tracking-wider text-blue-800">
                  Supporto decisionale
                </p>
                <p className="text-sm font-bold text-slate-900">{raccomandazione.titolo}</p>
                <p className="text-[11px] text-slate-700 leading-relaxed">
                  {raccomandazione.sintesi}
                </p>
                <div className="space-y-2">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
                    I percorsi, distinti
                  </p>
                  <div className="grid gap-2">
                    {raccomandazione.percorsi.map((p) => (
                      <div
                        key={p.codice}
                        className={`rounded-lg border p-3 ${
                          p.codice === raccomandazione.percorsoConsigliato
                            ? 'border-blue-300 bg-white'
                            : 'border-slate-200 bg-white/60'
                        }`}
                      >
                        <p className="text-[11px] font-bold text-slate-900">
                          {p.etichetta}
                          {p.codice === raccomandazione.percorsoConsigliato && (
                            <span className="ml-1.5 text-[9px] font-bold uppercase tracking-wider text-blue-700">
                              primo confronto
                            </span>
                          )}
                        </p>
                        <p className="text-[10px] text-slate-600 leading-relaxed mt-0.5">
                          {p.natura}
                        </p>
                        <p className="text-[10px] text-slate-500 leading-relaxed mt-0.5">
                          <strong className="text-slate-600">Decide:</strong> {p.chiDecide}.
                        </p>
                        <ul className="mt-1 space-y-0.5">
                          {p.presupposti.map((voce, i) => (
                            <li
                              key={i}
                              className="text-[10px] text-slate-600 leading-relaxed flex gap-1.5"
                            >
                              <span className="text-slate-400 shrink-0">—</span>
                              <span>{voce}</span>
                            </li>
                          ))}
                        </ul>
                        {p.esiti && (
                          <div className="mt-1.5 rounded-md bg-slate-50 border border-slate-200 p-2">
                            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
                              Esiti possibili della proposta
                            </p>
                            <ul className="mt-1 space-y-1">
                              {p.esiti.map((e) => (
                                <li
                                  key={e.codice}
                                  className="text-[10px] text-slate-700 leading-relaxed"
                                >
                                  <strong>{e.etichetta}</strong> — decide {e.chiDecide}.{' '}
                                  {e.descrizione}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        <p className="text-[10px] text-slate-500 leading-relaxed mt-1 italic">
                          {p.limiti.join(' ')}
                        </p>
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-slate-600 leading-relaxed border-l-2 border-amber-300 pl-2">
                    {raccomandazione.nonEquiparabili}
                  </p>
                </div>
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
                    Motivi
                  </p>
                  <ul className="mt-1 space-y-0.5">
                    {raccomandazione.motivi.map((m, i) => (
                      <li
                        key={i}
                        className="text-[11px] text-slate-700 leading-relaxed flex gap-1.5"
                      >
                        <span className="text-slate-400 shrink-0">—</span>
                        <span>{m}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
                    Passi che ne discendono
                  </p>
                  <ul className="mt-1 space-y-0.5">
                    {raccomandazione.azioni.map((a, i) => (
                      <li key={i} className="text-[11px] text-slate-700 leading-relaxed">
                        <strong>{a.etichetta}.</strong> {a.descrizione}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
                    Limiti della lettura
                  </p>
                  <ul className="mt-1 space-y-0.5">
                    {raccomandazione.limiti.map((l, i) => (
                      <li
                        key={i}
                        className="text-[10px] text-slate-500 leading-relaxed flex gap-1.5"
                      >
                        <span className="text-slate-400 shrink-0">—</span>
                        <span>{l}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
        </details>
      )}
    </div>
  );
}
