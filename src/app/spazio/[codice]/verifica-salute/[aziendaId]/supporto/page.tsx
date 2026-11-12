import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, Building2, FileText } from 'lucide-react';
import { ottieniContestoAccessoSpazio } from '@/app/actions/spazi';
import { ottieniAziendaPerId } from '@/app/actions/aziende';
import { ottieniAttenzioneScreeningAction } from '@/app/actions/attenzioneScreening';
import { ottieniStoricoVerificheAction } from '@/app/actions/aziendaInVerifica';
import { ottieniRaccomandazioneAction } from '@/app/actions/raccomandazioneVerifica';
import { debitoEnteMemorizzatoAction } from '@/app/actions/debitiEnteMemorizzati';
import { StampaDocumento } from '@/components/spazio/StampaDocumento';
import { valutaValidita } from '@/lib/screening/validitaVerifica';

// IL REPORT DELLA VERIFICA AMMINISTRATIVA (0.211.0, ridisegnato nella 0.214.0).
//
// Non è la pagina mandata in stampa: è un documento. Frontespizio, sintesi in
// quattro numeri, esito con i fatti accertati e quelli da accertare, debito
// dell'ente come dato certo, lettura, percorsi distinti con i loro esiti,
// elementi letti, limiti, piede. Le classi `print:` disegnano la carta, non lo
// schermo: filetti al posto delle schede, sezioni numerate, nessun bordo
// arrotondato. Il guscio dell'applicazione resta fuori perché il layout lo
// nasconde in stampa e il contenitore scorrevole torna alto quanto il
// documento.
//
// Regole: nessun dato nuovo (stesse fonti della pagina, stesse azioni) e
// nessun consiglio. Il documento accosta i fatti alle strade possibili e
// dichiara che la decisione non dipende dalla piattaforma.

export const dynamic = 'force-dynamic';

const STILE: Record<
  string,
  { testo: string; sfondo: string; bordo: string; accento: string; etichetta: string }
> = {
  ROSSO: {
    testo: 'text-red-900',
    sfondo: 'bg-red-50',
    bordo: 'border-red-300',
    accento: 'bg-red-500',
    etichetta: 'Criticità',
  },
  GIALLO: {
    testo: 'text-amber-900',
    sfondo: 'bg-amber-50',
    bordo: 'border-amber-300',
    accento: 'bg-amber-400',
    etichetta: 'Attenzione',
  },
  ATTENZIONE_MINIMA: {
    testo: 'text-emerald-900',
    sfondo: 'bg-emerald-50',
    bordo: 'border-emerald-300',
    accento: 'bg-emerald-500',
    etichetta: 'Attenzione minima',
  },
};

const euro = (valore: number) =>
  `${valore.toLocaleString('it-IT', { maximumFractionDigits: 0 })} €`;

const dataBreve = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('it-IT') : null;

function Sezione({
  numero,
  titolo,
  children,
}: {
  numero: string;
  titolo: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2 print:break-inside-avoid">
      <div className="flex items-baseline gap-2 border-b border-slate-300 pb-1">
        <span className="text-[10px] font-bold tabular-nums text-slate-400">{numero}</span>
        <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-800">
          {titolo}
        </h2>
      </div>
      {children}
    </section>
  );
}

function Numero({ etichetta, valore, nota }: { etichetta: string; valore: string; nota?: string }) {
  return (
    <div className="border border-slate-300 bg-white p-3 print:bg-white">
      <p className="text-[8px] font-bold uppercase tracking-[0.14em] text-slate-500">{etichetta}</p>
      <p className="mt-1 text-[15px] font-bold leading-tight text-slate-900">{valore}</p>
      {nota && <p className="mt-0.5 text-[9px] leading-snug text-slate-500">{nota}</p>}
    </div>
  );
}

export default async function ReportSupportoPage({
  params,
  searchParams,
}: {
  params: Promise<{ codice: string; aziendaId: string }>;
  searchParams: Promise<{ stampa?: string }>;
}) {
  const { codice, aziendaId } = await params;
  const { stampa } = await searchParams;
  const contesto = await ottieniContestoAccessoSpazio(codice);
  if (!contesto) redirect('/');
  if (contesto.modalita === 'OPERATORE') redirect(`/spazio/${codice}`);

  const id = Number(aziendaId);
  if (!Number.isInteger(id) || id <= 0) redirect(`/spazio/${codice}/verifica-salute`);

  const azienda = await ottieniAziendaPerId(contesto.nomeSchema, id);
  if (!azienda.success || !azienda.azienda) redirect(`/spazio/${codice}/verifica-salute`);

  const [attenzioneRis, storicoRis, raccomandazioneRis, debitoRis] = await Promise.all([
    ottieniAttenzioneScreeningAction(contesto.nomeSchema, id).catch(() => null),
    ottieniStoricoVerificheAction(contesto.nomeSchema).catch(() => null),
    ottieniRaccomandazioneAction(contesto.nomeSchema, id).catch(() => null),
    debitoEnteMemorizzatoAction(contesto.nomeSchema, id).catch(() => null),
  ]);
  const attenzione = attenzioneRis?.success ? (attenzioneRis.attenzione ?? null) : null;
  const raccomandazione = raccomandazioneRis?.success
    ? (raccomandazioneRis.raccomandazione ?? null)
    : null;
  const debito = debitoRis?.success ? (debitoRis.debito ?? null) : null;
  const debitoIl = dataBreve(debitoRis?.memorizzatoIl ?? null);
  const riga = storicoRis?.success ? storicoRis.righe?.find((v) => v.id === id) : undefined;
  const validita = valutaValidita(riga?.eseguitaIl ?? null);
  const stile = attenzione ? STILE[attenzione.esito] : null;
  const generatoIl = new Date().toLocaleDateString('it-IT');
  const oggetto = raccomandazione
    ? raccomandazione.percorsi.find((p) => p.codice === raccomandazione.percorsoConsigliato)
    : null;

  return (
    <div className="mx-auto max-w-[210mm] bg-white text-slate-900">
      {/* BARRA DI SERVIZIO — non entra nel documento */}
      <div className="mb-4 flex items-center justify-between gap-3 print:hidden">
        <Link
          href={`/spazio/${codice}/verifica-salute/${id}`}
          className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500 hover:text-blue-600"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Torna all’esito
        </Link>
        <StampaDocumento etichetta="Stampa il report" auto={stampa === '1'} />
      </div>

      <article className="space-y-6 print:space-y-5">
        {/* FRONTESPIZIO */}
        <header className="space-y-3">
          <div className="flex items-stretch justify-between gap-4 bg-slate-900 px-5 py-4 text-white print:px-0 print:py-3 print:text-slate-900 print:bg-transparent print:border-b-2 print:border-slate-900">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-slate-300 print:text-slate-500">
                CCII · verifica amministrativa
              </p>
              <p className="mt-1 text-[17px] font-bold leading-tight">Report di supporto</p>
            </div>
            <div className="text-right text-[9px] leading-relaxed text-slate-300 print:text-slate-500">
              <p>Documento generato il {generatoIl}</p>
              <p>Spazio {contesto.codice}</p>
              {debitoIl && <p>Debito verificato il {debitoIl}</p>}
            </div>
          </div>

          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                Azienda verificata
              </p>
              <h1 className="mt-0.5 flex items-center gap-2 text-[22px] font-bold leading-tight text-slate-900">
                <Building2 className="w-5 h-5 text-slate-400 print:hidden" />
                {azienda.azienda.ragioneSociale}
              </h1>
              <p className="mt-1 text-[10px] text-slate-600">
                {azienda.azienda.partitaIva
                  ? `P. IVA ${azienda.azienda.partitaIva}`
                  : 'P. IVA non registrata'}
                {azienda.azienda.codiceFiscale &&
                azienda.azienda.codiceFiscale !== azienda.azienda.partitaIva
                  ? ` · C.F. ${azienda.azienda.codiceFiscale}`
                  : ''}
                {azienda.azienda.codiceAteco ? ` · ATECO ${azienda.azienda.codiceAteco}` : ''}
              </p>
            </div>
            {stile && attenzione && (
              <div
                className={`flex items-center gap-2 border px-3 py-2 ${stile.sfondo} ${stile.bordo}`}
              >
                <span className={`h-6 w-1.5 ${stile.accento}`} />
                <span>
                  <span
                    className={`block text-[8px] font-bold uppercase tracking-[0.16em] ${stile.testo}`}
                  >
                    {stile.etichetta}
                  </span>
                  <span className={`block text-[12px] font-bold ${stile.testo}`}>
                    {attenzione.etichetta}
                  </span>
                </span>
              </div>
            )}
          </div>

          <p className="border-l-2 border-slate-900 pl-3 text-[10px] leading-relaxed text-slate-600">
            Il documento riporta i fatti accertati della verifica amministrativa e le strade
            possibili che da quei fatti discendono. Non contiene valutazioni dell’applicativo e non
            sostituisce la decisione dell’ente: la piattaforma è uno strumento di supporto.
          </p>
        </header>

        {/* SINTESI */}
        <Sezione numero="§" titolo="Sintesi">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <Numero
              etichetta="Esito"
              valore={attenzione ? (stile?.etichetta ?? attenzione.etichetta) : 'non leggibile'}
              nota={attenzione?.fattoreDeterminante}
            />
            <Numero
              etichetta="Copertura"
              valore={
                attenzione
                  ? `${attenzione.copertura.determinate}/${attenzione.copertura.totali}`
                  : '—'
              }
              nota="elementi determinati sul totale"
            />
            <Numero
              etichetta="Verificata il"
              valore={dataBreve(riga?.eseguitaIl) ?? 'non registrata'}
              nota={validita.etichetta}
            />
            <Numero
              etichetta="Debito dell’ente"
              valore={debito ? euro(debito.totale) : 'non memorizzato'}
              nota={debito ? debito.fonte : 'verifica amministrativa non ancora chiusa'}
            />
          </div>
        </Sezione>

        {/* 1 · ESITO */}
        <Sezione numero="1" titolo="Esito della verifica">
          {attenzione && stile ? (
            <div className="space-y-2">
              {attenzione.accertato.length > 0 && (
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500">
                    Accertato
                  </p>
                  <ul className="mt-1 space-y-1">
                    {attenzione.accertato.map((voce, i) => (
                      <li key={i} className="flex gap-2 text-[10px] leading-relaxed text-slate-700">
                        <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-slate-900" />
                        <span>{voce}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {attenzione.daAccertare.length > 0 && (
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500">
                    Da accertare
                  </p>
                  <ul className="mt-1 space-y-1">
                    {attenzione.daAccertare.map((voce, i) => (
                      <li key={i} className="flex gap-2 text-[10px] leading-relaxed text-slate-600">
                        <span className="mt-1 h-1 w-1 shrink-0 rounded-full border border-slate-400" />
                        <span>{voce}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="text-[9px] leading-relaxed text-slate-500">
                Indicatore di priorità di attenzione, non di probabilità di insolvenza. La scelta su
                come procedere resta al valutatore.
              </p>
            </div>
          ) : (
            <p className="text-[10px] leading-relaxed text-amber-900">
              L’indicatore di attenzione non è leggibile per questa azienda: il documento riporta
              solo le strade possibili, senza l’esito della verifica.
            </p>
          )}
        </Sezione>

        {/* 2 · DEBITO */}
        <Sezione numero="2" titolo="Debito dell’ente — dato certo">
          {debito ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2 border border-slate-300 bg-slate-50 px-3 py-2 print:bg-transparent">
                <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-600">
                  Debito verificato
                </span>
                <span className="text-[15px] font-bold tabular-nums text-slate-900">
                  {euro(debito.totale)}
                </span>
              </div>
              <table className="w-full text-[10px]">
                <tbody className="divide-y divide-slate-200">
                  <tr>
                    <td className="py-1 text-slate-600">Contabilizzato</td>
                    <td className="py-1 text-right tabular-nums text-slate-900">
                      {euro(debito.contabilizzato)}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1 text-slate-600">Da contabilizzare</td>
                    <td className="py-1 text-right tabular-nums text-slate-900">
                      {euro(debito.daContabilizzare)}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1 text-slate-600">Contributi previdenziali</td>
                    <td className="py-1 text-right tabular-nums text-slate-900">
                      {euro(debito.contributi)}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1 text-slate-600">
                      Sanzioni e interessi
                      {debito.sanzioniNonDistinte ? ' (non distinti)' : ''}
                    </td>
                    <td className="py-1 text-right tabular-nums text-slate-900">
                      {euro(debito.sanzioni)}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1 text-slate-600">Voci considerate</td>
                    <td className="py-1 text-right tabular-nums text-slate-900">{debito.righe}</td>
                  </tr>
                </tbody>
              </table>
              <p className="text-[9px] leading-relaxed text-slate-500">
                Fonte: {debito.fonte}
                {debitoIl ? ` · memorizzato il ${debitoIl}` : ''}. È il debito accertato nella
                verifica amministrativa: la simulazione lo usa come dato, non lo stima.
              </p>
            </div>
          ) : (
            <p className="text-[10px] leading-relaxed text-slate-600">
              Nessun debito memorizzato: la verifica amministrativa non è ancora stata chiusa. Il
              documento non contiene quindi una cifra certificata.
            </p>
          )}
        </Sezione>

        {raccomandazione && (
          <>
            {/* 3 · LETTURA */}
            <Sezione numero="3" titolo="Lettura dei dati">
              <p className="text-[13px] font-bold leading-snug text-slate-900">
                {raccomandazione.titolo}
              </p>
              <p className="text-[10px] leading-relaxed text-slate-700">
                {raccomandazione.sintesi}
              </p>
              {oggetto && (
                <p className="text-[10px] leading-relaxed text-slate-600">
                  <span className="font-bold">Primo confronto: </span>
                  {oggetto.etichetta} — decide {oggetto.chiDecide.toLowerCase()}.
                </p>
              )}
            </Sezione>

            {/* 4 · PERCORSI */}
            <Sezione numero="4" titolo="I percorsi, distinti">
              <div className="space-y-3">
                {raccomandazione.percorsi.map((p) => (
                  <div
                    key={p.codice}
                    className={`border-l-2 pl-3 ${
                      p.codice === raccomandazione.percorsoConsigliato
                        ? 'border-slate-900'
                        : 'border-slate-300'
                    }`}
                  >
                    <p className="text-[11px] font-bold text-slate-900">
                      {p.etichetta}
                      {p.codice === raccomandazione.percorsoConsigliato && (
                        <span className="ml-2 border border-slate-400 px-1 py-px text-[8px] font-bold uppercase tracking-[0.12em] text-slate-600">
                          primo confronto
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-[10px] leading-relaxed text-slate-700">{p.natura}</p>
                    <p className="mt-0.5 text-[10px] leading-relaxed text-slate-600">
                      <span className="font-bold">Decide:</span> {p.chiDecide}.
                    </p>
                    <ul className="mt-1 space-y-0.5">
                      {p.presupposti.map((voce, i) => (
                        <li key={i} className="text-[10px] leading-relaxed text-slate-600">
                          — {voce}
                        </li>
                      ))}
                    </ul>
                    {p.esiti && (
                      <div className="mt-1.5 border-t border-dashed border-slate-300 pt-1.5">
                        <p className="text-[8px] font-bold uppercase tracking-[0.14em] text-slate-500">
                          Esiti possibili della proposta
                        </p>
                        <ul className="mt-1 space-y-1">
                          {p.esiti.map((e) => (
                            <li
                              key={e.codice}
                              className="text-[10px] leading-relaxed text-slate-700"
                            >
                              <span className="font-bold">{e.etichetta}</span> — decide{' '}
                              {e.chiDecide}. {e.descrizione}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <p className="mt-1 text-[9px] italic leading-relaxed text-slate-500">
                      {p.limiti.join(' ')}
                    </p>
                  </div>
                ))}
              </div>
              <p className="border-l-2 border-amber-400 pl-2 text-[9px] leading-relaxed text-slate-600">
                {raccomandazione.nonEquiparabili}
              </p>
            </Sezione>

            {/* 5 · ELEMENTI LETTI */}
            <Sezione numero="5" titolo="Elementi letti">
              <table className="w-full text-[10px]">
                <tbody className="divide-y divide-slate-200">
                  {raccomandazione.motivi.map((m, i) => (
                    <tr key={i}>
                      <td className="w-6 py-1 align-top text-slate-400 tabular-nums">{i + 1}</td>
                      <td className="py-1 leading-relaxed text-slate-700">{m}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Sezione>

            {/* 6 · LIMITI */}
            <Sezione numero="6" titolo="Limiti della lettura">
              <ul className="space-y-0.5">
                {raccomandazione.limiti.map((l, i) => (
                  <li key={i} className="text-[9px] leading-relaxed text-slate-600">
                    — {l}
                  </li>
                ))}
              </ul>
            </Sezione>
          </>
        )}

        {/* PIEDE */}
        <footer className="mt-2 border-t border-slate-900 pt-2 text-[9px] leading-relaxed text-slate-500">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="flex items-center gap-1.5">
              <FileText className="w-3 h-3 print:hidden" />
              Documento redatto dalla piattaforma sui dati della verifica amministrativa · spazio{' '}
              {contesto.codice} · {generatoIl}
            </p>
            <p className="uppercase tracking-[0.14em]">Strumento di supporto</p>
          </div>
          <p className="mt-1">
            Le strade possibili sono accostate, non scelte: la decisione resta all’ente. Il
            documento non sostituisce la valutazione del caso concreto né gli atti che ne
            discendono.
          </p>
        </footer>
      </article>
    </div>
  );
}
