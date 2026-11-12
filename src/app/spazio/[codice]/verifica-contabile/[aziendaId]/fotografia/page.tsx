import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, FileText } from 'lucide-react';
import { ottieniContestoAccessoSpazio } from '@/app/actions/spazi';
import { ottieniAziendaPerId } from '@/app/actions/aziende';
import { ottieniStoricoXbrlAzienda } from '@/app/actions/xbrlAzienda';
import { ottieniIndiciSpazio } from '@/app/actions/parametriSpazio';
import { statoVerificaContabileAction } from '@/app/actions/verificaContabile';
import { debitoEnteMemorizzatoAction } from '@/app/actions/debitiEnteMemorizzati';
import { componiFotografia, VOCI_FOTOGRAFIA } from '@/lib/contabile/fotografia';
import { StampaDocumento } from '@/components/spazio/StampaDocumento';

// LA FOTOGRAFIA CONTABILE (0.207.0).
//
// Il documento schematico che il valutatore porta con sé: i documenti in
// possesso, il prospetto a scalare, TUTTI gli indici abilitati nei parametri
// dello spazio su ogni annualità, gli indicatori del CCII che il bilancio non
// basta a calcolare (dichiarati), e la diagnosi — quanti indici oltre soglia,
// come cambiano, patrimonio netto e posizione finanziaria netta.
//
// Non ricalcola nulla: legge il dato salvato dal motore XBRL. Non conclude
// nulla: gli strumenti di diagnosi sono operativi, la scelta resta all'ente.
// La composizione sta in src/lib/contabile/fotografia.ts, pura e testata.

export const dynamic = 'force-dynamic';

const euro = (n: number | null | undefined) =>
  typeof n === 'number' && Number.isFinite(n) ? `${Math.round(n).toLocaleString('it-IT')} €` : '—';

const num = (n: number | null | undefined) =>
  typeof n === 'number' && Number.isFinite(n) ? n.toLocaleString('it-IT') : 'n/d';

export default async function FotografiaContabilePage({
  params,
}: {
  params: Promise<{ codice: string; aziendaId: string }>;
}) {
  const { codice, aziendaId } = await params;
  const contesto = await ottieniContestoAccessoSpazio(codice);
  if (!contesto) redirect('/');
  if (contesto.modalita === 'OPERATORE') redirect(`/spazio/${codice}`);

  const id = Number(aziendaId);
  if (!Number.isInteger(id) || id <= 0) redirect(`/spazio/${codice}/verifica-contabile`);

  const azienda = await ottieniAziendaPerId(contesto.nomeSchema, id);
  if (!azienda.success || !azienda.azienda) {
    redirect(`/spazio/${codice}/verifica-contabile`);
  }

  const [storicoRis, indiciRis, statoRis, debitoRis] = await Promise.all([
    ottieniStoricoXbrlAzienda(contesto.nomeSchema, id).catch(() => null),
    ottieniIndiciSpazio(contesto.nomeSchema).catch(() => null),
    statoVerificaContabileAction(contesto.nomeSchema).catch(() => null),
    debitoEnteMemorizzatoAction(contesto.nomeSchema, id).catch(() => null),
  ]);

  const bilanci = (storicoRis?.success ? storicoRis.storico : [])
    .filter((b) => b.annoBilancio !== null)
    .map((b) => ({
      anno: b.annoBilancio as number,
      dati: b.datiFinanziari,
      indici: b.indici ?? [],
      altriIndici: b.altriIndici ?? [],
      nomeFile: b.nomeFile,
    }));

  const fotografia = componiFotografia({
    bilanci,
    codiciAbilitati:
      indiciRis?.success && indiciRis.indici.length > 0
        ? indiciRis.indici.filter((i) => i.abilitato).map((i) => i.codice)
        : [],
  });

  const rigaStato = statoRis?.success
    ? statoRis.aziende.find((a) => a.aziendaId === id)
    : undefined;
  const debito = debitoRis?.debito ?? null;
  const generatoIl = new Date().toLocaleDateString('it-IT');

  return (
    <div className="max-w-4xl space-y-4">
      <div className="flex items-center justify-between gap-3 print:hidden">
        <Link
          href={`/spazio/${codice}/verifica-contabile/${id}`}
          className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500 hover:text-blue-600"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Torna alla verifica contabile
        </Link>
        <StampaDocumento etichetta="Stampa la fotografia" />
      </div>

      <header className="bg-white border border-slate-200 rounded-xl p-6 space-y-2">
        <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">
          Verifica contabile · fotografia contabile
        </p>
        <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
          <FileText className="w-5 h-5 text-blue-600" /> {azienda.azienda.ragioneSociale}
        </h1>
        <p className="text-[11px] text-slate-500">
          {azienda.azienda.partitaIva ? `P. IVA ${azienda.azienda.partitaIva} · ` : ''}
          fotografia al {generatoIl} sui documenti in possesso dell’ente. Documento generato dalla
          piattaforma: nessun valore è ricalcolato a mano.
        </p>
      </header>

      <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
          Documenti in possesso
        </h2>
        <ul className="text-[11px] text-slate-700 space-y-1">
          <li>
            <strong>Visura storica:</strong>{' '}
            {rigaStato?.visuraIl ? `acquisita il ${rigaStato.visuraIl}` : 'da acquisire'}
          </li>
          <li>
            <strong>Parametri dell’ente:</strong>{' '}
            {rigaStato?.parametriPresenti ? 'compilati' : 'da compilare'}
          </li>
          <li>
            <strong>Bilanci XBRL:</strong>{' '}
            {bilanci.length === 0
              ? 'nessuno in archivio'
              : bilanci.map((b) => `${b.anno}${b.nomeFile ? ` (${b.nomeFile})` : ''}`).join(' · ')}
          </li>
          <li>
            <strong>Debito dell’ente (verifica amministrativa):</strong>{' '}
            {debito ? (
              <>
                {euro(debito.totale)} — {debito.fonte}
                {debitoRis?.memorizzatoIl ? `, memorizzato il ${debitoRis.memorizzatoIl}` : ''}
              </>
            ) : (
              'nessun debito memorizzato'
            )}
          </li>
        </ul>
      </section>

      {fotografia.anni.length === 0 ? (
        <section className="bg-amber-50 border border-amber-200 rounded-xl p-5">
          <p className="text-xs text-amber-900">{fotografia.avvertenze[0]}</p>
        </section>
      ) : (
        <>
          <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
              Prospetto a scalare
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="text-[9px] uppercase text-slate-400 border-b border-slate-200">
                    <th className="text-left py-1.5 pr-2">Voce</th>
                    {fotografia.anni.map((anno) => (
                      <th key={anno} className="text-right py-1.5 px-1">
                        {anno}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {VOCI_FOTOGRAFIA.map((v) => (
                    <tr key={v.chiave}>
                      <td className="py-1 pr-2 text-slate-600">{v.etichetta}</td>
                      {bilanci.map((b) => (
                        <td
                          key={b.anno}
                          className="py-1 px-1 text-right tabular-nums text-slate-900"
                        >
                          {euro(b.dati[v.chiave] as number | undefined)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
              Indici dei parametri, per annualità
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="text-[9px] uppercase text-slate-400 border-b border-slate-200">
                    <th className="text-left py-1.5 pr-2">Indice</th>
                    <th className="text-right py-1.5 px-1">Soglia</th>
                    {fotografia.anni.map((anno) => (
                      <th key={anno} className="text-right py-1.5 px-1">
                        {anno}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {fotografia.indici.map((ind) => (
                    <tr key={ind.codice}>
                      <td className="py-1 pr-2 text-slate-700">
                        <span className="font-mono text-[9px] text-slate-400 mr-1">
                          {ind.codice}
                        </span>
                        {ind.nome.replace(new RegExp(`^${ind.codice}\\s*[—-]\\s*`), '')}
                      </td>
                      <td className="py-1 px-1 text-right text-slate-500 text-[10px]">
                        {ind.soglia}
                      </td>
                      {ind.valori.map((valore, i) => (
                        <td
                          key={`${ind.codice}-${fotografia.anni[i]}`}
                          className={`py-1 px-1 text-right tabular-nums ${
                            ind.esiti[i] === 'VIOLATO'
                              ? 'text-red-700 font-bold'
                              : ind.esiti[i] === 'OK'
                                ? 'text-emerald-700'
                                : 'text-slate-400'
                          }`}
                        >
                          {num(valore)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[10px] text-slate-400 leading-relaxed">
              In rosso i valori oltre la soglia. Gli indici sono quelli abilitati in Parametri di
              Spazio → Indici.
            </p>
          </section>

          <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
              Indicatori del CCII non calcolabili dal bilancio
            </h2>
            <ul className="space-y-1">
              {fotografia.indicatoriDichiarati.map((ind) => (
                <li key={ind.codice} className="text-[11px] text-slate-700 leading-relaxed">
                  <span className="font-mono text-[9px] text-slate-400 mr-1">{ind.codice}</span>
                  <strong>{ind.nome}</strong> — n/d. {ind.motivoNonCalcolabile}
                </li>
              ))}
            </ul>
          </section>

          {/* LE ASSUNZIONI. Il documento dice anche come i fact XBRL sono
              diventati questi schemi: un numero senza la sua assunzione è un
              numero che non si può discutere. */}
          <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
              Assunzioni della traduzione (XBRL → schemi)
            </h2>
            <ul className="space-y-1.5">
              {fotografia.assunzioni.map((a) => (
                <li key={a.voce} className="text-[11px] text-slate-700 leading-relaxed">
                  <strong>{a.voce}</strong>
                  <span className="ml-1.5 text-[9px] uppercase tracking-wider text-slate-400">
                    {a.origine === 'MAPPATURA'
                      ? 'dal bilancio'
                      : a.origine === 'RISERVA'
                        ? 'valore di riserva'
                        : 'fuori bilancio'}
                  </span>{' '}
                  — {a.assunzione}
                </li>
              ))}
            </ul>
            <p className="text-[10px] text-slate-400 leading-relaxed">
              Sono le scelte con cui il bilancio diventa prospetto e indici: nessuna è una stima, e
              dove il dato manca il documento lo dice invece di colmarlo.
            </p>
          </section>

          <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
              Diagnosi
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="text-[9px] uppercase text-slate-400 border-b border-slate-200">
                    <th className="text-left py-1.5 pr-2">Annualità</th>
                    <th className="text-right py-1.5 px-1">Indici oltre soglia</th>
                    <th className="text-right py-1.5 px-1">Patrimonio netto</th>
                    <th className="text-right py-1.5 px-1">Debiti / ricavi</th>
                    <th className="text-right py-1.5 px-1">PFN</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {fotografia.diagnosi.map((d) => (
                    <tr key={d.anno}>
                      <td className="py-1 pr-2 text-slate-700">{d.anno}</td>
                      <td className="py-1 px-1 text-right tabular-nums text-slate-900">
                        {d.indiciOltreSoglia} su {d.indiciCalcolabili}
                      </td>
                      <td
                        className={`py-1 px-1 text-right tabular-nums ${
                          d.patrimonioNetto < 0 ? 'text-red-700 font-bold' : 'text-slate-900'
                        }`}
                      >
                        {euro(d.patrimonioNetto)}
                      </td>
                      <td className="py-1 px-1 text-right tabular-nums text-slate-900">
                        {num(d.debitiSuRicavi)}
                      </td>
                      <td className="py-1 px-1 text-right tabular-nums text-slate-900">
                        {euro(d.posizioneFinanziariaNetta)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-slate-700 leading-relaxed font-bold">
              {fotografia.tendenza}
            </p>
          </section>

          <section className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-1">
            <h2 className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Limiti della lettura
            </h2>
            <ul className="space-y-0.5">
              {fotografia.avvertenze.map((a, i) => (
                <li key={i} className="text-[10px] text-slate-600 leading-relaxed">
                  — {a}
                </li>
              ))}
              <li className="text-[10px] text-slate-600 leading-relaxed">
                — La fotografia descrive dati depositati: non contiene valutazioni e non formula
                conclusioni giuridiche. La scelta su come procedere resta all’ente.
              </li>
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
