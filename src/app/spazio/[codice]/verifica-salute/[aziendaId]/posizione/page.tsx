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

  const {
    validita,
    prontezza,
    quadratura,
    invecchiamento,
    confronto,
    breakEven,
    piano,
    richieste,
    cronologia,
  } = posizione;
  const testoDellaRichiesta = posizione.testoRichiesta;
  // Chi firma le decisioni è la sessione: la stessa regola che l'azione
  // applica quando scrive, mostrata prima del clic invece che dopo.
  const autoreDecisione = lettura.autoreSessione;
  const stile = STILE_GRADO[prontezza.grado];

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
            Posizione ente — la pratica dell’azienda presso l’ente
          </p>
          <h1 className="text-xl font-bold text-slate-900">{String(azienda.ragioneSociale)}</h1>
          <p className="text-[11px] text-slate-500">
            Data di riferimento:{' '}
            {eseguitaIl
              ? new Date(eseguitaIl).toLocaleDateString('it-IT')
              : 'verifica non eseguita'}
            {' · '}
            Copertura: {posizione.coperturaTesto ?? '—'}
            {posizione.coperturaMancante.length > 0 && (
              <> · fuori: {posizione.coperturaMancante.join(', ')}</>
            )}
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
          ['letture', 'Letture'],
          ['accordo', 'Accordo'],
          ['documenti', 'Documenti'],
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
          titolo="Stato della posizione"
          obiettivo="Sapere subito se la pratica è pronta, quasi pronta o bloccata — e da che cosa, prima di leggere i numeri."
        />
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${stile.pallino}`} />
          <p className={`text-[11px] font-bold uppercase tracking-wider ${stile.testo}`}>
            Stato: {prontezza.grado}
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
            <strong>Prossimo atto:</strong> {prontezza.prossimoAtto.testo}
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
              le fonti si leggono come coerenti; sopra, il credito va allineato prima di usarlo
              negli scenari.
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
        {invecchiamento.voci.some((v) => v.cosa === 'debito riaccertato') && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-1.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-amber-900">
              Che cosa vuol dire «debito riaccertato»
            </p>
            <p className="text-[10px] text-amber-900 leading-relaxed">
              Il credito dell’ente è stato ricalcolato — per una nuova certificazione, una rettifica
              o una decisione sulla posizione — in una data successiva alla verifica. La cifra a cui
              si guarda non è quella che la verifica aveva fissato, e per questo la quadratura può
              non tornare: si ricalcola la posizione, oppure si riapre la verifica amministrativa se
              il nuovo dato cambia l’esito.
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

      {/* 4. LETTURE A CONFRONTO */}
      <section id="letture" className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
        <PassoProcedura
          numero={4}
          titolo="Le letture a confronto"
          obiettivo="Vedere dove le verifiche dicono cose diverse, con il perché e l’errore che quella divergenza evita."
        />
        <div className="grid gap-2 sm:grid-cols-2">
          {confronto.letture.map((l) => (
            <div key={l.nome} className="rounded-lg border border-slate-200 p-3">
              <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                {l.nome} · {l.natura.toLowerCase()}
              </p>
              <p className="text-[12px] font-bold text-slate-900">{l.esito}</p>
              <p className="text-[10px] text-slate-600 leading-relaxed">{l.dettaglio}</p>
            </div>
          ))}
        </div>
        {confronto.divergenze.length > 0 && (
          <div className="space-y-2">
            {confronto.divergenze.map((d) => (
              <div
                key={d.tema}
                className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-1"
              >
                <p className="text-[11px] font-bold text-amber-900">{d.tema}</p>
                <ul className="list-disc pl-4">
                  {d.letture.map((x) => (
                    <li key={x} className="text-[10px] text-slate-700">
                      {x}
                    </li>
                  ))}
                </ul>
                <p className="text-[10px] text-slate-700 leading-relaxed">
                  <strong>Perché:</strong> {d.perche}
                </p>
                <p className="text-[10px] text-slate-700 leading-relaxed">
                  <strong>L’errore che evita:</strong> {d.rischio}
                </p>
              </div>
            ))}
          </div>
        )}
        <p className="text-[10px] text-slate-500 leading-relaxed">{confronto.nota}</p>
      </section>

      {/* 5. ACCORDO E PROCEDURE */}
      <section id="accordo" className="rounded-xl border border-slate-200 bg-white p-5 space-y-2">
        <PassoProcedura
          numero={5}
          titolo="Accordo, procedure e piano in essere"
          obiettivo="Sapere quale recupero del credito si può chiedere all’azienda e quanto l’ente incasserebbe in liquidazione o in cram down."
        />
        <p className="text-[12px] text-slate-800 leading-relaxed">{breakEven.dettaglio}</p>
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
              Recupero minimo
            </p>
            <p className="text-[13px] font-bold tabular-nums text-slate-900">
              {formattaEuro(breakEven.recuperoMinimo)}
            </p>
            <p className="text-[9px] text-slate-500">
              {breakEven.proceduraConfronto ?? 'nessuna procedura calcolabile'}
            </p>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
              Scoperto di cassa
            </p>
            <p className="text-[13px] font-bold tabular-nums text-slate-900">
              {formattaEuro(breakEven.scoperto)}
            </p>
            <p className="text-[9px] text-slate-500">
              {breakEven.sostenibile === null
                ? 'non calcolabile'
                : breakEven.sostenibile
                  ? 'cassa e flusso coprono il credito'
                  : 'cassa e flusso non coprono il credito'}
            </p>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
              Piano in essere
            </p>
            <p className="text-[13px] font-bold text-slate-900">{piano.stato}</p>
            <p className="text-[9px] text-slate-500">{piano.dettaglio}</p>
          </div>
        </div>
        {breakEven.mancanti.length > 0 && (
          <p className="text-[10px] text-amber-800 leading-relaxed">
            <strong>Perché un conto manca:</strong> {breakEven.mancanti.join(', ')}.
          </p>
        )}
        {piano.avvertenza && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-900 leading-relaxed">
            {piano.avvertenza}
          </p>
        )}
      </section>

      {/* 6. DOCUMENTI DA CHIEDERE */}
      <section id="documenti" className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
        <PassoProcedura
          numero={6}
          titolo="Documenti da chiedere"
          obiettivo="Chiudere le lacune con una richiesta sola: che cosa manca, da chi e quale verifica chiude ogni documento."
        />
        {richieste.length === 0 ? (
          <p className="text-[11px] text-slate-600">
            Non risultano documenti mancanti: le lacune delle quattro verifiche sono chiuse.
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

      {/* 9. GLOSSARIO */}
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
