import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, FileText } from 'lucide-react';
import { ottieniContestoAccessoSpazio } from '@/app/actions/spazi';
import { formattaEuro } from '@/lib/formato/numeri';
import { componiPosizione, improntaPosizione } from '@/lib/posizionePratica/composizione';
import { ETICHETTE_REGISTRATE, GLOSSARIO } from '@/lib/posizionePratica/glossario';
import { leggiPosizioneAzienda } from '@/lib/posizionePratica/letturaPosizione';
import { DecisioniPratica } from '@/components/spazio/DecisioniPratica';
import { StampaPosizione } from '@/components/spazio/StampaPosizione';
import { PassoProcedura } from '@/components/spazio/PassoProcedura';
import { ProcedureComunicazioniUo } from '@/components/spazio/ProcedureComunicazioniUo';

export const dynamic = 'force-dynamic';
export const maxDuration = 180;

// LA POSIZIONE, IN UN DOCUMENTO SOLO (0.242.0).
//
// Le quattro verifiche dicono ciascuna se stessa; questa pagina dice la sola
// cosa che serve a chi decide: che cosa si sa, che cosa manca, che cosa
// divergere, che cosa si è deciso. È anche il documento unico della posizione
// — si stampa così com'è — e non ricalcola nulla per conto suo: la fotografia
// viene dalla stessa lettura della verifica azienda, il credito dallo stesso
// debito memorizzato, l'indicatore dallo stesso motore.

const STILE_GRADO = {
  PRONTA: {
    bordo: 'border-emerald-200',
    sfondo: 'bg-emerald-50',
    testo: 'text-emerald-800',
    pallino: 'bg-emerald-500',
  },
  QUASI: {
    bordo: 'border-amber-200',
    sfondo: 'bg-amber-50',
    testo: 'text-amber-800',
    pallino: 'bg-amber-400',
  },
  BLOCCATA: {
    bordo: 'border-red-200',
    sfondo: 'bg-red-50',
    testo: 'text-red-800',
    pallino: 'bg-red-500',
  },
} as const;

export default async function PosizionePage({
  params,
}: {
  params: Promise<{ codice: string; aziendaId: string }>;
}) {
  const { codice, aziendaId } = await params;
  const contesto = await ottieniContestoAccessoSpazio(codice);
  if (!contesto) redirect('/');
  if (contesto.modalita === 'OPERATORE') redirect(`/spazio/${codice}`);

  const id = Number(aziendaId);
  if (!Number.isInteger(id) || id <= 0) redirect(`/spazio/${codice}/verifica-salute`);

  const lettura = await leggiPosizioneAzienda(contesto.nomeSchema, id);
  if (!lettura.azienda || !lettura.dati) redirect(`/spazio/${codice}/verifica-salute`);
  const azienda = lettura.azienda;

  const posizione = componiPosizione(lettura.dati);
  const { decisioni, aperturaContabile, aperturaAziendale } = lettura;
  const eseguitaIl = lettura.dati.eseguitaIl;

  const { validita, prontezza, quadratura, invecchiamento, piano, richieste, cronologia } =
    posizione;
  const testoDellaRichiesta = posizione.testoRichiesta;
  // Chi firma le decisioni è la sessione: la stessa regola che l'azione
  // applica quando scrive, mostrata prima del clic invece che dopo.
  const autoreDecisione = lettura.autoreSessione;
  const stile = STILE_GRADO[prontezza.grado];

  // LA CONTABILITÀ NON STA QUI (0.256.3). Questa pagina è la posizione
  // dell'ENTE: il credito, le sue fonti, le procedure per farlo contabilizzare.
  // La cassa e il flusso dell'azienda appartengono alla verifica contabile, che
  // li legge e li soglia per conto suo: portarli qui faceva sembrare che il
  // credito si misurasse con la liquidità dell'azienda, che è un'altra cosa.
  // GLI IMPORTI DALLE PERCENTUALI (0.256.4). La fotografia della verifica
  // azienda li porta già calcolati — accordo sulla media proposta, liquidazione
  // e cram down sul rango — con la stessa funzione che usa la verifica azienda.
  // Qui si mostrano e basta: ricalcolarli in pagina sarebbe il secondo motore
  // che la 0.240.0 ha chiuso.
  const importiPercentuali = lettura.dati.fotografia?.importiPercentuali ?? [];
  const accordoMedia = importiPercentuali.find((i) => i.codice === 'ACCORDO') ?? null;
  const procedure = importiPercentuali.filter((i) => i.codice !== 'ACCORDO');

  return (
    <div className="max-w-4xl space-y-4">
      <Link
        href={`/spazio/${codice}/verifica-salute/${id}`}
        className="inline-flex items-center gap-1.5 text-[11px] text-slate-500 hover:text-blue-600 font-bold uppercase tracking-wider"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Torna alla verifica amministrativa
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
            Posizione Ente — la pratica dell’azienda presso l’ente
          </p>
          <h1 className="text-xl font-bold text-slate-900">{String(azienda.ragioneSociale)}</h1>
          <p className="text-[11px] text-slate-500">
            Data di riferimento:{' '}
            {eseguitaIl
              ? new Date(eseguitaIl).toLocaleDateString('it-IT')
              : 'verifica non eseguita'}
            {' · '}
            Validità: {validita.etichetta}
            {aperturaAziendale?.autore && (
              <>
                {' '}
                · fotografia di {aperturaAziendale.autore}
                {aperturaAziendale.modalita === 'SALVAGENTE' ? ' (in ispezione)' : ''}
              </>
            )}
          </p>
        </div>
        <StampaPosizione />
      </header>

      {/* L'INDICE DELLE SEZIONI (0.243.0): un punto della posizione si cita in
          una mail con un link, invece di rispiegarlo a voce. */}
      <nav
        aria-label="Sezioni della posizione"
        className="flex flex-wrap gap-1.5 text-[9px] font-bold uppercase tracking-wider"
      >
        {[
          ['stato', 'Stato'],
          ['quadratura', 'Credito'],
          ['date', 'Date'],
          ['accordo', 'Accordo'],
          ['documenti', 'Documenti'],
          ['procedure', 'Procedure'],
          ['decisioni', 'Decisioni'],
          ['cronologia', 'Cronologia'],
        ].map(([ancora, testo]) => (
          <a
            key={ancora}
            href={`#${ancora}`}
            className="rounded-full border border-slate-200 px-2 py-1 text-slate-600 hover:border-blue-300 hover:text-blue-700"
          >
            {testo}
          </a>
        ))}
      </nav>

      {/* 1. STATO */}
      <section
        id="stato"
        className={`rounded-xl border p-5 space-y-3 ${stile.bordo} ${stile.sfondo}`}
      >
        <PassoProcedura
          numero={1}
          titolo="Situazione della posizione"
          obiettivo="Vedere a che punto è la lettura della pratica — che cosa è completo, che cosa conviene tenere presente — prima di entrare nei numeri."
        />
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${stile.pallino}`} />
          <p className={`text-[11px] font-bold uppercase tracking-wider ${stile.testo}`}>
            Situazione: {prontezza.grado}
          </p>
        </div>
        <p className="text-[12px] text-slate-800 leading-relaxed">{prontezza.dettaglio}</p>
        {prontezza.blocchi.length > 0 && (
          <ul className="space-y-1">
            {prontezza.blocchi.map((b) => (
              <li key={b} className="text-[11px] text-red-800 leading-relaxed">
                <strong>Blocco:</strong> {b}
              </li>
            ))}
          </ul>
        )}
        {prontezza.attenzioni.length > 0 && (
          <ul className="space-y-1">
            {prontezza.attenzioni.map((a) => (
              <li key={a} className="text-[11px] text-amber-900 leading-relaxed">
                <strong>Attenzione:</strong> {a}
              </li>
            ))}
          </ul>
        )}
        {prontezza.prossimoAtto && (
          <p className="text-[11px] text-slate-800">
            <strong>Se si prosegue:</strong> {prontezza.prossimoAtto.testo}
          </p>
        )}
      </section>

      {/* 2. CREDITO E QUADRATURA */}
      <section
        id="quadratura"
        className="rounded-xl border border-slate-200 bg-white p-5 space-y-3"
      >
        <PassoProcedura
          numero={2}
          titolo="Il credito dell’ente e la sua quadratura"
          obiettivo="Mettere a confronto le fonti del credito (debito memorizzato, certificazione, proposta) e capire se e perché divergono."
        />
        <div className="overflow-hidden rounded-lg border border-slate-200">
          <table className="w-full text-[11px]">
            <tbody>
              {quadratura.voci.map((v) => (
                <tr key={v.fonte} className="border-b border-slate-100 last:border-0">
                  <td className="p-2 align-top">
                    <span className="block font-bold text-slate-800">{v.etichetta}</span>
                    {v.nota && <span className="block text-[10px] text-slate-500">{v.nota}</span>}
                    {v.confrontabile === false && (
                      <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-400">
                        fuori dalla quadratura
                      </span>
                    )}
                  </td>
                  <td className="p-2 text-right align-top font-bold tabular-nums text-slate-900">
                    {formattaEuro(v.valore)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p
          className={`text-[11px] leading-relaxed ${
            quadratura.esito === 'DIVERGENTE'
              ? 'font-bold text-red-800'
              : quadratura.esito === 'COERENTE'
                ? 'text-emerald-800'
                : 'text-slate-600'
          }`}
        >
          {quadratura.dettaglio}
        </p>
        {quadratura.esito === 'DIVERGENTE' && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-1.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Perché le fonti non coincidono
            </p>
            <p className="text-[10px] text-slate-600 leading-relaxed">
              Le fonti non sono la stessa cosa letta due volte: il debito memorizzato è quello
              accertato nella verifica amministrativa alla sua data, la certificazione è il
              documento dell’azienda, la proposta porta le rate del piano. Fra loro cambiano il
              periodo di competenza, le partite già a ruolo e le sospensioni: lo scostamento è il
              punto da chiarire, non un errore di calcolo.
            </p>
            <p className="text-[10px] text-slate-600 leading-relaxed">
              Tolleranza applicata: {formattaEuro(quadratura.tolleranzaEuro)}. Sotto quella soglia
              le fonti si leggono come coerenti; sopra, la cifra va chiarita prima di usarla nella
              decisione sulla posizione.
            </p>
          </div>
        )}
      </section>

      {/* 3. DATE */}
      <section id="date" className="rounded-xl border border-slate-200 bg-white p-5 space-y-2">
        <PassoProcedura
          numero={3}
          titolo="Date e aggiornamento"
          obiettivo="Sapere a che data è ferma ogni fonte: un dato più vecchio di un atto successivo rende la posizione da rifare, non sbagliata."
        />
        <p
          className={`text-[12px] leading-relaxed ${invecchiamento.esito === 'DA_RICALCOLARE' ? 'font-bold text-amber-900' : 'text-slate-700'}`}
        >
          {invecchiamento.dettaglio}
        </p>
        {invecchiamento.voci.some((v) => v.cosa === 'debito verificato') && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-1.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-amber-900">
              Che cosa vuol dire «debito verificato»
            </p>
            <p className="text-[10px] text-amber-900 leading-relaxed">
              Il credito dell’ente è stato riletto — su una nuova certificazione, una rettifica o
              una decisione sulla posizione — in una data successiva alla verifica. Non è un nuovo
              accertamento: è la verifica, e la conferma, di un dato già analizzato, rimasto quello
              che era. Se la cifra non è cambiata la posizione resta la stessa; se è cambiata, si
              ricalcola la posizione o si riapre la verifica amministrativa.
            </p>
          </div>
        )}
        <ul className="grid gap-1 sm:grid-cols-2">
          {invecchiamento.voci.map((v) => (
            <li key={`${v.fonte}-${v.cosa}`} className="text-[10px] text-slate-500">
              {v.cosa}: {v.data ? new Date(v.data).toLocaleDateString('it-IT') : 'senza data'}
            </li>
          ))}
        </ul>
      </section>

      {/* 4. ACCORDO E PROCEDURE */}
      <section id="accordo" className="rounded-xl border border-slate-200 bg-white p-5 space-y-2">
        <PassoProcedura
          numero={4}
          titolo="Accordo e piano in essere"
          obiettivo="Sapere quanto deve valere un eventuale accordo alla soglia di riscontro configurata per l’ente e se un piano di versamenti è già in essere."
        />
        {accordoMedia && (
          <div className="rounded-lg border border-slate-200 p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                {accordoMedia.etichetta}
                {accordoMedia.percentuale !== null ? ` — ${accordoMedia.percentuale}%` : ''}
              </p>
              <p className="text-[15px] font-bold tabular-nums text-slate-900">
                {accordoMedia.calcolabile ? formattaEuro(accordoMedia.importo) : 'non calcolabile'}
              </p>
            </div>
            <p className="text-[10px] text-slate-500 leading-relaxed">
              {accordoMedia.calcolabile
                ? `Il debito per un eventuale accordo deve rispettare la ${accordoMedia.percentuale}% del credito: ${accordoMedia.fonte}. Cambiando quella soglia nei parametri, cambia questo importo.`
                : `L’importo non si calcola: ${accordoMedia.motivo}.`}
            </p>
          </div>
        )}
        <div className="rounded-lg bg-slate-50 p-3">
          <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
            Piano in essere
          </p>
          <p className="text-[13px] font-bold text-slate-900">{piano.stato}</p>
          <p className="text-[9px] text-slate-500">{piano.dettaglio}</p>
        </div>
        {piano.avvertenza && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-900 leading-relaxed">
            {piano.avvertenza}
          </p>
        )}
      </section>

      {/* 5. DOCUMENTI DA CHIEDERE */}
      <section id="documenti" className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
        <PassoProcedura
          numero={5}
          titolo="Documenti da chiedere"
          obiettivo="Chiudere le lacune con una richiesta sola: che cosa manca, da chi e quale verifica chiude ogni documento."
        />
        {richieste.length === 0 ? (
          <p className="text-[11px] text-slate-600">
            Non risultano documenti mancanti: le lacune della verifica amministrativa sono chiuse.
          </p>
        ) : (
          <>
            <ul className="space-y-2">
              {richieste.map((r) => (
                <li key={r.documento} className="rounded-lg border border-slate-200 p-3">
                  <p className="text-[11px] font-bold text-slate-900">
                    {r.documento}{' '}
                    <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                      {r.da === 'AZIENDA' ? 'azienda' : 'ente'}
                    </span>
                  </p>
                  <p className="text-[10px] text-slate-600 leading-relaxed">{r.chiude}</p>
                </li>
              ))}
            </ul>
            <details className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <summary className="cursor-pointer text-[10px] font-bold uppercase tracking-wider text-slate-600">
                Testo della richiesta (da copiare)
              </summary>
              <pre className="mt-2 whitespace-pre-wrap text-[10px] text-slate-700 leading-relaxed">
                {testoDellaRichiesta}
              </pre>
            </details>
          </>
        )}
      </section>

      {/* 6. PROCEDURE — LE COMUNICAZIONI ALLE UNITA' OPERATIVE */}
      <section id="procedure" className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
        <PassoProcedura
          numero={6}
          titolo="Procedure: le comunicazioni alle unità operative"
          obiettivo="Passare dalla posizione al lavoro degli uffici: quanto rendono liquidazione e cram down alle percentuali del rango, chi deve contabilizzare che cosa, con il testo pronto per ogni unità operativa."
        />
        {procedure.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[9px] uppercase tracking-wider text-slate-500">
                  <th className="p-2 text-left">Recupero</th>
                  <th className="p-2 text-right">Parametro</th>
                  <th className="p-2 text-right">Importo presunto</th>
                </tr>
              </thead>
              <tbody>
                {procedure.map((p) => (
                  <tr key={p.codice} className="border-b border-slate-100 last:border-0">
                    <td className="p-2 align-top">
                      <span className="block font-bold text-slate-800">{p.etichetta}</span>
                      <span className="block text-[9px] text-slate-500 leading-relaxed">
                        {p.calcolabile
                          ? `Dal debito amministrativo di ${formattaEuro(posizione.credito ?? 0)}: ${p.fonte}.`
                          : `Non si calcola: ${p.motivo}.`}
                      </span>
                    </td>
                    <td className="p-2 text-right align-top tabular-nums text-slate-600">
                      {p.percentuale !== null
                        ? `${p.percentuale}%`
                        : p.intervallo
                          ? `${p.intervallo.percentualeDa}–${p.intervallo.percentualeA}%`
                          : '—'}
                    </td>
                    <td className="p-2 text-right align-top font-bold tabular-nums text-slate-900">
                      {p.calcolabile
                        ? formattaEuro(p.importo)
                        : p.intervallo
                          ? `da ${formattaEuro(p.intervallo.importoDa)} a ${formattaEuro(p.intervallo.importoA)}`
                          : 'non calcolabile'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {/* I VALORI SONO PRESUNTI (0.256.11). La natura del credito e l’esito di
            una procedura non si conoscono a questa altezza del percorso: si
            prendono i parametri dello spazio — anche quelli che serviranno a un
            eventuale piano — e se ne ricava un ordine di grandezza, da cui
            partire per ragionare sul tipo di recupero possibile. Il dato di
            partenza è il debito amministrativo, non il credito dello scenario. */}
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-1.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
            Valori presunti e ipotetici
          </p>
          <p className="text-[10px] text-slate-700 leading-relaxed">
            Questi importi non sono un credito accertato né un esito: sono il debito amministrativo
            letto alle percentuali della tabella Scenari del triage, a mera indicazione di massima.
            A questa altezza non si conosce il tipo di credito — lo stesso ente può vantare crediti
            di categorie diverse — quindi il conto è grossolano: serve a dare un avvertimento, non a
            fissare un importo. Quando gli scenari dell’azienda arriveranno, quegli stessi numeri si
            rileggeranno sul rango vero.
          </p>
          <p className="text-[10px] text-slate-500 leading-relaxed">
            I parametri sono tutti in Parametri di Spazio: la soglia di riscontro della proposta per
            l’accordo, il tasso di realizzo e la percentuale di soddisfacimento per rango per
            liquidazione e cram down. Se il rango del credito è scelto nel triage, il conto è su
            quel rango; se non lo è, ma la certificazione separa contributi e sanzioni, ogni quota
            prende la percentuale del proprio rango — quindi l’importo è puntuale anche senza la
            scelta a mano. Solo quando nemmeno la classificazione basta l’importo si legge come
            intervallo fra la percentuale più bassa e la più alta della tabella; senza un parametro
            l’importo non si calcola, e la riga dice perché.
          </p>
        </div>
        {procedure.some((p) => (p.escluso ?? 0) > 0) && (
          <p className="text-[10px] text-amber-900 leading-relaxed">
            Fuori dai conti {formattaEuro(Math.max(...procedure.map((p) => p.escluso ?? 0)))}: è il
            credito che la classificazione non permette di collocare in un rango (posizioni non
            determinate, cartelle dell’Agente senza riparto, crediti a favore dell’azienda). Gli
            importi qui sopra sono calcolati sulla parte classificata.
          </p>
        )}
        <p className="text-[10px] text-slate-500 leading-relaxed">
          Le procedure sono un parametro dello spazio, non un passo della pratica: dicono che cosa
          va fatto per ogni tipologia di debito e a quale ufficio chiederlo, e valgono per tutte le
          aziende. Qui si vede che cosa ne discende per questa, posizione per posizione.
        </p>
        <ProcedureComunicazioniUo
          nomeSchema={contesto.nomeSchema}
          aziendaId={id}
          ragioneSociale={String(azienda.ragioneSociale)}
          dataVerifica={
            eseguitaIl
              ? new Date(eseguitaIl).toISOString().slice(0, 10)
              : new Date().toISOString().slice(0, 10)
          }
        />
      </section>

      {/* 7. DECISIONI */}
      <section id="decisioni" className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
        <PassoProcedura
          numero={7}
          titolo="Decisioni sulla posizione"
          icona={FileText}
          obiettivo="Scrivere la decisione con i numeri del giorno: la verifica si ricalcola, la scelta resta."
        />
        <p className="text-[10px] text-slate-500 leading-relaxed">
          La verifica si ricalcola sempre; la decisione resta scritta con i numeri del giorno.
        </p>
        <DecisioniPratica
          nomeSchema={contesto.nomeSchema}
          aziendaId={id}
          decisioni={decisioni}
          credito={posizione.credito}
          copertura={posizione.coperturaTesto}
          autore={autoreDecisione}
          impronta={improntaPosizione(posizione)}
          salvagente={contesto.modalita === 'SALVAGENTE'}
        />
      </section>

      {/* 8. CRONOLOGIA DEGLI ATTI */}
      <section
        id="cronologia"
        className="rounded-xl border border-slate-200 bg-white p-5 space-y-2"
      >
        <PassoProcedura
          numero={8}
          titolo="La cronologia degli atti"
          obiettivo="Ricostruire che cosa è successo prima e dopo: chi ha fatto cosa, e quando."
        />
        <p className="text-[10px] text-slate-500 leading-relaxed">
          Le stesse cose, in ordine di tempo: la pagina è ordinata per argomento, questa riga dice
          che cosa è successo prima e che cosa dopo.
        </p>
        {cronologia.length === 0 ? (
          <p className="text-[11px] text-slate-600">
            Nessun atto datato: la verifica amministrativa non è ancora stata eseguita.
          </p>
        ) : (
          <ol className="space-y-2">
            {cronologia.map((a) => (
              <li
                key={`${a.fonte}-${a.data}-${a.cosa}`}
                className="flex flex-wrap items-baseline gap-x-2 border-l-2 border-slate-200 pl-3"
              >
                <span className="text-[10px] font-bold tabular-nums text-slate-500">
                  {new Date(a.data).toLocaleDateString('it-IT')}
                </span>
                <span className="text-[11px] text-slate-800">{a.cosa}</span>
                <span className="text-[10px] text-slate-500">
                  {a.autore ?? 'autore non registrato'}
                  {a.ispezione ? ' · in ispezione' : ''}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* GLOSSARIO */}
      <details className="rounded-xl border border-slate-200 bg-white p-5">
        <summary className="cursor-pointer text-[11px] font-bold uppercase tracking-wider text-slate-700">
          Che cosa significano le parole usate qui ({ETICHETTE_REGISTRATE.length})
        </summary>
        <div className="mt-3 space-y-2">
          {GLOSSARIO.map((v) => (
            <div key={v.etichetta} className="rounded-lg border border-slate-100 p-3">
              <p className="text-[11px] font-bold text-slate-900">{v.etichetta}</p>
              <p className="text-[10px] text-slate-700 leading-relaxed">{v.significa}</p>
              <p className="text-[10px] text-slate-500 leading-relaxed">
                <strong>Non significa:</strong> {v.nonSignifica}
              </p>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
