import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, FileText } from 'lucide-react';
import { ottieniContestoAccessoSpazio } from '@/app/actions/spazi';
import { ottieniAziendaPerId } from '@/app/actions/aziende';
import { ottieniAttenzioneScreeningAction } from '@/app/actions/attenzioneScreening';
import { ottieniStoricoVerificheAction } from '@/app/actions/aziendaInVerifica';
import { debitoEnteMemorizzatoAction } from '@/app/actions/debitiEnteMemorizzati';
import { statoVerificaContabileAction } from '@/app/actions/verificaContabile';
import { leggiChecklistProdottiAzienda } from '@/lib/prodotti/checklistAzienda';
import { leggiPercentualeCriticitaPesata } from '@/lib/checklist/pesataMinisteriale';
import {
  coloreQualitativoSommario,
  dettaglioOrientamentoSommario,
} from '@/lib/checklist/pesoProdotti';
import { leggiDatiSoglieAzienda } from '@/lib/soglie25novies/datiAzienda';
import { leggiSnapshotDebito } from '@/lib/debitiEnte/memorizzaDebitoEnte';
import { leggiVerificaAzienda } from '@/lib/verificaAzienda/letturaVerifica';
import { congruenzaAzienda } from '@/lib/flussiEnte/leggiCongruenza';
import { valutaValidita } from '@/lib/screening/validitaVerifica';
import { leggiDecisioniPratica } from '@/lib/posizionePratica/registroDecisioni';
import { ETICHETTE_REGISTRATE, GLOSSARIO } from '@/lib/posizionePratica/glossario';
import { quadraturaCredito, type VoceQuadratura } from '@/lib/posizionePratica/quadratura';
import { valutaProntezza } from '@/lib/posizionePratica/prontezza';
import { valutaInvecchiamento } from '@/lib/posizionePratica/invecchiamento';
import { confrontoLetture, indiciDaAccertato } from '@/lib/posizionePratica/divergenze';
import { richiesteDa, testoRichiesta } from '@/lib/posizionePratica/richieste';
import { breakEvenAccordo } from '@/lib/posizionePratica/breakEven';
import { pianoInEssere } from '@/lib/posizionePratica/pianoInEssere';
import { DecisioniPratica } from '@/components/spazio/DecisioniPratica';
import { StampaPosizione } from '@/components/spazio/StampaPosizione';

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

const euro = (n: number | null | undefined) =>
  typeof n === 'number' && Number.isFinite(n) ? `${Math.round(n).toLocaleString('it-IT')} €` : '—';

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

  const risultato = await ottieniAziendaPerId(contesto.nomeSchema, id);
  if (!risultato.success || !risultato.azienda) redirect(`/spazio/${codice}/verifica-salute`);

  const [
    attenzioneRis,
    storicoRis,
    checklist,
    pesata,
    debitoRis,
    soglie,
    contabileRis,
    letturaVerifica,
    congruenza,
    decisioni,
    snapshot,
  ] = await Promise.all([
    ottieniAttenzioneScreeningAction(contesto.nomeSchema, id).catch(() => null),
    ottieniStoricoVerificheAction(contesto.nomeSchema).catch(() => null),
    leggiChecklistProdottiAzienda(contesto.nomeSchema, id).catch(() => null),
    leggiPercentualeCriticitaPesata(contesto.nomeSchema, id).catch(() => null),
    debitoEnteMemorizzatoAction(contesto.nomeSchema, id).catch(() => null),
    leggiDatiSoglieAzienda(contesto.nomeSchema, id).catch(() => null),
    statoVerificaContabileAction(contesto.nomeSchema).catch(() => null),
    leggiVerificaAzienda(contesto.nomeSchema, id).catch(() => null),
    congruenzaAzienda(contesto.nomeSchema, id).catch(() => null),
    leggiDecisioniPratica(contesto.nomeSchema, id).catch(() => []),
    leggiSnapshotDebito(contesto.nomeSchema, id).catch(() => null),
  ]);

  const attenzione = attenzioneRis?.success ? (attenzioneRis.attenzione ?? null) : null;
  const riga = storicoRis?.success ? storicoRis.righe?.find((v) => v.id === id) : undefined;
  const eseguitaIl = riga?.eseguitaIl ?? null;
  const validita = valutaValidita(eseguitaIl);
  const debito = debitoRis?.success ? (debitoRis.debito ?? null) : null;
  const fotografia = letturaVerifica?.fotografia ?? null;
  const scenari = fotografia?.scenari ?? [];
  const netto = (codiceScenario: string) =>
    scenari.find((s) => s.codice === codiceScenario)?.recupero ?? null;

  // ---- Credito e quadratura ------------------------------------------------
  const vociCredito: VoceQuadratura[] = [
    {
      fonte: 'amministrativa',
      etichetta: 'Debito accertato (verifica amministrativa)',
      valore: debito?.totale ?? null,
      nota: debito
        ? `Fonte ${debito.fonte}${debitoRis?.memorizzatoIl ? `, ${new Date(debitoRis.memorizzatoIl).toLocaleDateString('it-IT')}` : ''}.`
        : 'La verifica amministrativa non ha ancora chiuso il debito.',
    },
    {
      fonte: 'certificazione',
      etichetta: 'Certificazione dei debiti',
      valore: snapshot?.certificazione?.totale ?? null,
      nota: 'La fonte a monte: il debito certo dell’ultima certificazione letta.',
    },
    {
      fonte: 'soglie',
      etichetta: 'Esposizione contributiva (soglie)',
      valore: soglie?.esposizione ?? null,
      confrontabile: false,
      nota: 'Solo contributi, al netto di sanzioni e crediti già a ruolo: è un sottoinsieme del debito.',
    },
  ];
  const quadratura = quadraturaCredito(vociCredito);

  // ---- Check list e letture ------------------------------------------------
  const qualitativo = {
    colore: coloreQualitativoSommario({
      qualificazione: checklist?.qualificazione,
      percentualeCriticitaPesata: pesata,
    }),
    dettaglio: checklist ? dettaglioOrientamentoSommario(checklist, pesata) : null,
  };

  const confronto = confrontoLetture({
    amministrativa: attenzione
      ? {
          esito: attenzione.esito,
          etichetta: attenzione.etichetta,
          fattore: attenzione.fattoreDeterminante,
          copertura: attenzione.copertura,
        }
      : null,
    qualitativo,
    indiciViolati: indiciDaAccertato(attenzione?.accertato),
    fotografia: fotografia
      ? {
          capacita: fotografia.capacita.esito,
          coperturaPct: fotografia.capacita.coperturaPct,
          dettaglio: fotografia.capacita.dettaglio,
        }
      : null,
    scenari: {
      calcolabili: scenari.filter((s) => s.calcolabile).length,
      totali: scenari.length,
      liquidazione: netto('LIQUIDAZIONE'),
      cramDown: netto('CRAM_DOWN'),
      credito: fotografia?.credito ?? debito?.totale ?? null,
    },
  });

  // ---- Richieste -----------------------------------------------------------
  const richieste = richiesteDa({
    daAccertare: attenzione?.daAccertare ?? [],
    dimensioniScoperte: (attenzione?.dimensioniScoperte ?? []).map((d) => ({
      nome: d.nome,
      motivo: d.portante
        ? 'dimensione portante: senza di essa il perimetro non è circoscrivibile'
        : null,
    })),
    mancanzeChecklist: (checklist?.mancanze ?? []).map(String),
    flussi: congruenza
      ? {
          senzaDenuncia: congruenza.esiti.reduce((n, e) => n + e.senzaDenuncia.length, 0),
          senzaDelega: congruenza.esiti.reduce((n, e) => n + e.senzaDelega.length, 0),
        }
      : null,
  });
  const testoDellaRichiesta = testoRichiesta({
    ragioneSociale: String(risultato.azienda.ragioneSociale),
    richieste,
  });

  // ---- Prontezza -----------------------------------------------------------
  const rigaContabile = contabileRis?.success
    ? contabileRis.aziende.find((a) => a.aziendaId === id)
    : undefined;
  const mancantiContabile = rigaContabile
    ? [
        !rigaContabile.visuraPresente ? 'la visura camerale' : null,
        !rigaContabile.parametriPresenti ? 'l’anagrafica ente' : null,
        rigaContabile.anniXbrl === 0 ? 'almeno un bilancio XBRL' : null,
      ].filter((x): x is string => x !== null)
    : ['lo stato della contabile'];

  const prontezza = valutaProntezza({
    amministrativa: {
      eseguita: Boolean(eseguitaIl),
      esito: attenzione?.esito ?? null,
      copertura: attenzione?.copertura ?? null,
    },
    contabile: {
      completa: Boolean(rigaContabile?.completa),
      mancanti: mancantiContabile,
    },
    azienda: {
      fotografata: Boolean(fotografia && fotografia.anni.length > 0),
      motivo:
        fotografia?.motivo ?? (letturaVerifica ? null : 'la fotografia non si è potuta leggere'),
    },
    scenari: {
      calcolabili: scenari.filter((s) => s.calcolabile).length,
      totali: scenari.length,
    },
    quadratura: quadratura.esito,
    validita: { stato: validita.stato, etichetta: validita.etichetta },
    richiesteAperte: richieste.length,
  });

  // ---- Date e invecchiamento ----------------------------------------------
  const invecchiamento = valutaInvecchiamento({
    verifica: { fonte: 'amministrativa', data: eseguitaIl, cosa: 'verifica amministrativa' },
    dati: [
      { fonte: 'debito', data: debitoRis?.memorizzatoIl ?? null, cosa: 'debito riaccertato' },
      {
        fonte: 'visura',
        data: rigaContabile?.visuraIl ?? null,
        cosa: 'visura camerale ricaricata',
      },
    ],
  });

  // ---- Accordo e procedure -------------------------------------------------
  const breakEven = breakEvenAccordo({
    credito: fotografia?.credito ?? debito?.totale ?? null,
    disponibilita: fotografia?.capacita.disponibilita ?? null,
    flusso: fotografia?.capacita.flusso ?? null,
    liquidazioneNetta: netto('LIQUIDAZIONE'),
    cramDownNetto: netto('CRAM_DOWN'),
  });
  const piano = pianoInEssere({
    esiti: (congruenza?.esiti ?? []).map((e) => ({
      ente: e.ente,
      flusso: e.flusso,
      attesi: e.attesi,
      senzaDenuncia: e.senzaDenuncia.length,
      senzaDelega: e.senzaDelega.length,
      sospesi: e.sospesi.length,
      completo: e.completo,
    })),
  });

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
            Posizione della pratica
          </p>
          <h1 className="text-xl font-bold text-slate-900">
            {String(risultato.azienda.ragioneSociale)}
          </h1>
          <p className="text-[11px] text-slate-500">
            Data di riferimento:{' '}
            {eseguitaIl
              ? new Date(eseguitaIl).toLocaleDateString('it-IT')
              : 'verifica non eseguita'}
            {' · '}
            Copertura:{' '}
            {attenzione
              ? `${attenzione.copertura.determinate}/${attenzione.copertura.totali}`
              : '—'}
            {' · '}
            Validità: {validita.etichetta}
          </p>
        </div>
        <StampaPosizione />
      </header>

      {/* 1. STATO */}
      <section className={`rounded-xl border p-5 space-y-3 ${stile.bordo} ${stile.sfondo}`}>
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
      <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
          Il credito e la sua quadratura
        </p>
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
                    {euro(v.valore)}
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
      </section>

      {/* 3. DATE */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-2">
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
          Date e aggiornamento
        </p>
        <p
          className={`text-[12px] leading-relaxed ${invecchiamento.esito === 'DA_RICALCOLARE' ? 'font-bold text-amber-900' : 'text-slate-700'}`}
        >
          {invecchiamento.dettaglio}
        </p>
        <ul className="grid gap-1 sm:grid-cols-2">
          {invecchiamento.voci.map((v) => (
            <li key={`${v.fonte}-${v.cosa}`} className="text-[10px] text-slate-500">
              {v.cosa}: {v.data ? new Date(v.data).toLocaleDateString('it-IT') : 'senza data'}
            </li>
          ))}
        </ul>
      </section>

      {/* 4. LETTURE A CONFRONTO */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
          Le letture a confronto
        </p>
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
      <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-2">
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
          Accordo, procedure e piano in essere
        </p>
        <p className="text-[12px] text-slate-800 leading-relaxed">{breakEven.dettaglio}</p>
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
              Recupero minimo
            </p>
            <p className="text-[13px] font-bold tabular-nums text-slate-900">
              {euro(breakEven.recuperoMinimo)}
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
              {euro(breakEven.scoperto)}
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
        {piano.avvertenza && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-900 leading-relaxed">
            {piano.avvertenza}
          </p>
        )}
      </section>

      {/* 6. DOCUMENTI DA CHIEDERE */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
          Documenti da chiedere
        </p>
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
      <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
        <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-700">
          <FileText className="w-3.5 h-3.5" /> Decisioni sulla posizione
        </p>
        <p className="text-[10px] text-slate-500 leading-relaxed">
          La verifica si ricalcola sempre; la decisione resta scritta con i numeri del giorno.
        </p>
        <DecisioniPratica
          nomeSchema={contesto.nomeSchema}
          aziendaId={id}
          decisioni={decisioni}
          credito={fotografia?.credito ?? debito?.totale ?? null}
          copertura={
            attenzione ? `${attenzione.copertura.determinate}/${attenzione.copertura.totali}` : null
          }
        />
      </section>

      {/* 8. GLOSSARIO */}
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
