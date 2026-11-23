import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Eye, FileDown } from 'lucide-react';
import { ottieniContestoAccessoSpazio } from '@/app/actions/spazi';
import { statoVerificaContabileAction } from '@/app/actions/verificaContabile';
import { ottieniStoricoVerificheAction } from '@/app/actions/aziendaInVerifica';
import { statoDirettrici, type Stadio } from '@/lib/verificaAzienda/direttrici';
import { conRitorno } from '@/lib/navigazione/ritorno';

// LE ICONOGRAFIE — l'ultima lettura del percorso, prima degli scenari.
//
// Le tre verifiche accertano; l'iconografia mette insieme ciò che è stato
// accertato; gli scenari, che vengono dopo, rappresentano il futuro. La voce
// sta quindi in chiusura del percorso, e ogni riga dice a che punto sono le
// tre attività: chi le ha chiuse apre l'iconografia completa, chi no trova
// scritto che cosa resta, con il link per andarci, e può leggerla parziale —
// il riquadro «Che cosa l'iconografia non dice» dichiara le lacune.
// Ogni riga porta anche il report: un foglio A4 con tabelle e grafici, che
// non ricalcola nulla e riduce la stessa lettura.
// Come la pagina dell'iconografia, questa non salva niente: legge le fonti a
// ogni apertura.
export const dynamic = 'force-dynamic';

const ETICHETTE_STADIO: Record<Stadio, string> = {
  COMPLETO: 'Fatta',
  PARZIALE: 'In corso',
  MANCANTE: 'Da fare',
  NON_DISPONIBILE: 'Non leggibile',
};

function classeStadio(stadio: Stadio): string {
  if (stadio === 'COMPLETO') return 'bg-emerald-50 text-emerald-700';
  if (stadio === 'PARZIALE') return 'bg-amber-50 text-amber-800';
  return 'bg-slate-100 text-slate-500';
}

export default async function RitrattiPage({ params }: { params: Promise<{ codice: string }> }) {
  const { codice } = await params;
  const contesto = await ottieniContestoAccessoSpazio(codice);
  if (!contesto) redirect('/');
  if (contesto.modalita === 'OPERATORE') redirect(`/spazio/${codice}`);

  const [statoContabile, storico] = await Promise.all([
    statoVerificaContabileAction(contesto.nomeSchema).catch(() => null),
    ottieniStoricoVerificheAction(contesto.nomeSchema).catch(() => null),
  ]);

  const aziende = (statoContabile?.success ? statoContabile.aziende : []).map((a) => {
    const direttrici = statoDirettrici({
      amministrativaLetta: Boolean(
        storico?.success && storico.righe?.some((v) => v.id === a.aziendaId)
      ),
      contabile: {
        completa: a.completa,
        anniXbrl: a.anniXbrl,
        visuraPresente: a.visuraPresente,
      },
      baseAziendaleSalvata: a.baseAziendaleSalvata,
    });
    const passi = [
      {
        label: 'la verifica amministrativa',
        href: `/spazio/${codice}/verifica-salute?azienda=${a.aziendaId}`,
        stadio: direttrici.amministrativa,
      },
      {
        label: 'la verifica contabile',
        href: `/spazio/${codice}/verifica-contabile/${a.aziendaId}`,
        stadio: direttrici.contabile,
      },
      {
        label: 'la verifica aziendale',
        href: `/spazio/${codice}/verifica-azienda/${a.aziendaId}`,
        stadio: direttrici.aziendale,
      },
    ];
    return {
      aziendaId: a.aziendaId,
      ragioneSociale: a.ragioneSociale,
      direttrici,
      passi: passi.filter((p) => p.stadio !== 'COMPLETO'),
      pronto: passi.every((p) => p.stadio === 'COMPLETO'),
    };
  });

  const pronte = aziende.filter((a) => a.pronto).length;

  return (
    <div className="max-w-4xl space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Iconografie</h1>
        <p className="text-xs text-slate-500 mt-1 leading-relaxed max-w-2xl">
          L’iconografia è l’ultima lettura del percorso: arriva dopo la verifica amministrativa,
          quella contabile e quella aziendale, e prima degli scenari, che proiettano nel futuro ciò
          che qui è già stato accertato. Si legge a percorso chiuso; finché qualche verifica è
          aperta, l’iconografia è parziale e dichiara da sé che cosa non dice. Da ogni posizione si
          scarica il report: un solo foglio A4, con le tabelle e i grafici della stessa lettura.
        </p>
      </div>

      {!statoContabile?.success && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          {statoContabile?.error ?? 'Impossibile leggere lo stato delle verifiche.'}
        </p>
      )}

      {statoContabile?.success && aziende.length === 0 && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
          Nessuna azienda attiva: nascono dalla verifica amministrativa.
        </p>
      )}

      {aziende.length > 0 && (
        <p className="text-[11px] text-slate-500">
          {pronte} su {aziende.length} con tutte e tre le verifiche chiuse: l’iconografia è
          completa. Per le altre, prima c’è ancora un’attività da chiudere.
        </p>
      )}

      <div className="space-y-2">
        {aziende.map((a) => (
          <div
            key={a.aziendaId}
            className="flex items-start justify-between gap-3 bg-white border border-slate-200 rounded-xl p-4"
          >
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-900">{a.ragioneSociale}</p>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {[
                  ['Amministrativa', a.direttrici.amministrativa],
                  ['Contabile', a.direttrici.contabile],
                  ['Aziendale', a.direttrici.aziendale],
                ].map(([label, stadio]) => (
                  <span
                    key={label}
                    className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${classeStadio(
                      stadio as Stadio
                    )}`}
                  >
                    {label} · {ETICHETTE_STADIO[stadio as Stadio]}
                  </span>
                ))}
              </div>
              {!a.pronto && (
                <p className="text-[11px] text-slate-500 mt-2">
                  Prima:{' '}
                  {a.passi.map((p, i) => (
                    <span key={p.href}>
                      {i > 0 ? ', ' : ''}
                      <Link href={p.href} className="font-bold text-slate-600 hover:text-blue-600">
                        {p.label}
                      </Link>
                    </span>
                  ))}
                  .
                </p>
              )}
            </div>
            <div className="shrink-0 flex flex-col items-stretch gap-1">
              {a.pronto ? (
                <Link
                  href={conRitorno(
                    `/spazio/${codice}/aziende/${a.aziendaId}/ritratto`,
                    `/spazio/${codice}/ritratti`
                  )}
                  className="inline-flex items-center justify-center gap-1 px-2.5 py-1 rounded bg-slate-900 text-white text-[9px] font-bold uppercase tracking-wider hover:bg-blue-700 transition-colors"
                >
                  <Eye className="w-3 h-3" /> Apri l’iconografia
                </Link>
              ) : (
                <Link
                  href={conRitorno(
                    `/spazio/${codice}/aziende/${a.aziendaId}/ritratto`,
                    `/spazio/${codice}/ritratti`
                  )}
                  className="inline-flex items-center justify-center gap-1 px-2.5 py-1 rounded border border-slate-200 bg-white text-slate-500 text-[9px] font-bold uppercase tracking-wider hover:border-blue-300 hover:text-blue-600 transition-colors"
                >
                  <Eye className="w-3 h-3" /> Iconografia parziale
                </Link>
              )}
              <Link
                href={`/report/iconografia/${codice}/${a.aziendaId}?stampa=1`}
                className="inline-flex items-center justify-center gap-1 px-2.5 py-1 rounded border border-slate-200 bg-white text-slate-500 text-[9px] font-bold uppercase tracking-wider hover:border-blue-300 hover:text-blue-600 transition-colors"
              >
                <FileDown className="w-3 h-3" /> Report PDF
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
