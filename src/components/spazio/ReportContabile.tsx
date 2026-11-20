'use client';

// IL REPORT DELLA VERIFICA CONTABILE.
//
// Un documento, non una schermata di dati: le tre tabelle che raccontano i
// numeri — prospetto, differenziali, simulazione — con accanto, per ognuna, il
// posto dove il valutatore scrive che cosa quei numeri significano. Le note
// integrative del bilancio chiudono il documento: sono il testo con cui
// l'azienda spiega sé stessa, e senza di loro i numeri restano muti.
//
// Lo stesso componente rende il report unico e il report di una sola tabella:
// la pagina decide quante sezioni passare. Ciò che si stampa è ciò che si vede,
// tranne i campi di scrittura, che a carta non servono.

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Loader2, Save } from 'lucide-react';
import { StampaDocumento } from './StampaDocumento';
import { salvaSpiegazioneContabileAction } from '@/app/actions/verificaContabile';
import type { SpiegazioniContabili } from '@/app/actions/verificaContabile';
import type {
  ChiaveTabella,
  NotaReport,
  SchedaTabella,
  TabellaReport,
} from '@/lib/contabile/reportContabile';

export interface SezioneReport {
  scheda: SchedaTabella;
  tabella: TabellaReport;
}

interface Props {
  nomeSchema: string;
  codice: string;
  aziendaId: number;
  ragioneSociale: string;
  partitaIva: string | null;
  generatoIl: string;
  sezioni: SezioneReport[];
  /** Le note integrative dell'ultimo bilancio, già divise per sezione. */
  note: NotaReport[];
  noteTroncate: boolean;
  annoNota: number | null;
  spiegazioniIniziali: SpiegazioniContabili;
  /** Valorizzato quando il documento è il report di una sola tabella. */
  sola?: ChiaveTabella | null;
  /** Le note integrative entrano solo nel report unico. */
  conNote?: boolean;
}

const RIGHE_VUOTE = 5;

function Tabella({ tabella }: { tabella: TabellaReport }) {
  if (tabella.vuota) {
    return (
      <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
        {tabella.vuota}
      </p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="text-[9px] uppercase text-slate-400 border-b border-slate-200">
            <th className="text-left py-1.5 pr-2">Voce</th>
            {tabella.colonne.map((c, i) => (
              <th key={`${c.etichetta}-${i}`} className="text-right py-1.5 px-1 whitespace-nowrap">
                {c.etichetta}
                {c.sotto && (
                  <span className="block text-[8px] font-normal normal-case text-slate-400">
                    {c.sotto}
                  </span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {tabella.righe.map((riga) => (
            <tr key={riga.etichetta} className={riga.forte ? 'font-bold' : undefined}>
              <td className="py-1 pr-2 text-slate-700">
                {riga.etichetta}
                {riga.qualifica && (
                  <span className="ml-1.5 text-[9px] font-normal uppercase tracking-wider text-slate-400">
                    ({riga.qualifica})
                  </span>
                )}
              </td>
              {riga.celle.map((cella, i) => (
                <td
                  key={`${riga.etichetta}-${i}`}
                  className="py-1 px-1 text-right tabular-nums text-slate-900 whitespace-nowrap"
                >
                  {cella.principale}
                  {cella.dettaglio && (
                    <span className="block text-[9px] font-normal text-slate-400">
                      {cella.dettaglio}
                    </span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Lo spazio della spiegazione: testo salvato, campi di scrittura, righe per la carta. */
function Spiegazione({
  scheda,
  salvata,
  onSalva,
}: {
  scheda: SchedaTabella;
  salvata: { testo: string; aggiornataIl: string | null };
  onSalva: (testo: string) => Promise<boolean>;
}) {
  const [testo, setTesto] = useState(salvata.testo);
  const [salvataggio, setSalvataggio] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [conferma, setConferma] = useState<string | null>(null);

  const sporco = testo.trim() !== salvata.testo.trim();

  const salva = async () => {
    setSalvataggio(true);
    setErrore(null);
    setConferma(null);
    const ok = await onSalva(testo);
    setSalvataggio(false);
    if (!ok) {
      setErrore('Spiegazione non salvata: riprova.');
      return;
    }
    setConferma('Spiegazione salvata.');
  };

  return (
    <div className="mt-3 border-t border-slate-100 pt-3 space-y-2">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
        Spiegazione dei valori
      </p>
      {salvata.testo.trim().length > 0 && (
        <div className="text-[11px] text-slate-800 leading-relaxed whitespace-pre-line">
          {salvata.testo}
          {salvata.aggiornataIl && (
            <span className="ml-2 text-[9px] text-slate-400 print:hidden">
              ({salvata.aggiornataIl.split('-').reverse().join('/')})
            </span>
          )}
        </div>
      )}
      {salvata.testo.trim().length === 0 && (
        // Sulla carta la spiegazione mancante è spazio per scriverla, non un
        // silenzio: chi firma il documento vede che quella riga è ancora da dire.
        <div className="hidden print:block space-y-4" aria-hidden>
          {Array.from({ length: RIGHE_VUOTE }).map((_, i) => (
            <div key={i} className="border-b border-slate-300 h-4" />
          ))}
        </div>
      )}
      <ul className="text-[10px] text-slate-500 space-y-0.5 print:hidden">
        {scheda.domande.map((d) => (
          <li key={d}>— {d}</li>
        ))}
      </ul>
      <textarea
        value={testo}
        onChange={(e) => setTesto(e.target.value)}
        rows={4}
        placeholder="Che cosa spiegano questi valori? La spiegazione entra nel report stampato."
        className="w-full p-2 text-[11px] bg-slate-50 border border-slate-200 rounded-lg text-slate-900 outline-none focus:border-blue-500 print:hidden"
      />
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <button
          type="button"
          onClick={salva}
          disabled={salvataggio || !sporco}
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white hover:bg-blue-800 disabled:opacity-40"
        >
          {salvataggio ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Save className="w-3 h-3" />
          )}
          Salva la spiegazione
        </button>
        {conferma && !sporco && (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700">
            <CheckCircle2 className="w-3 h-3" /> {conferma}
          </span>
        )}
        {errore && <span className="text-[10px] text-red-700">{errore}</span>}
      </div>
    </div>
  );
}

export function ReportContabile({
  nomeSchema,
  codice,
  aziendaId,
  ragioneSociale,
  partitaIva,
  generatoIl,
  sezioni,
  note,
  noteTroncate,
  annoNota,
  spiegazioniIniziali,
  sola = null,
  conNote = true,
}: Props) {
  const [spiegazioni, setSpiegazioni] = useState<SpiegazioniContabili>(spiegazioniIniziali);

  const base = `/spazio/${codice}/verifica-contabile/${aziendaId}/report`;

  const intestazione = useMemo(() => `Verifica contabile — ${ragioneSociale}`, [ragioneSociale]);

  const salva = async (chiave: ChiaveTabella, testo: string) => {
    const r = await salvaSpiegazioneContabileAction(nomeSchema, aziendaId, chiave, testo);
    if (!r.success) return false;
    setSpiegazioni((p) => {
      const copia = { ...p };
      if (testo.trim().length === 0) delete copia[chiave];
      else copia[chiave] = { testo: testo.trim(), aggiornataIl: r.aggiornataIl ?? null };
      return copia;
    });
    return true;
  };

  return (
    <div className="max-w-4xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          href={`/spazio/${codice}/verifica-contabile/${aziendaId}`}
          className="text-[11px] font-bold uppercase tracking-wider text-slate-500 hover:text-blue-600"
        >
          ← Torna alla verifica contabile
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          {sola ? (
            <Link
              href={base}
              className="text-[10px] font-bold uppercase tracking-wider text-blue-700 hover:text-blue-800"
            >
              Report contabile completo →
            </Link>
          ) : (
            <span className="flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Solo una tabella:
              {sezioniLink().map((s) => (
                <Link
                  key={s.chiave}
                  href={`${base}/${s.slug}`}
                  className="text-blue-700 hover:text-blue-800"
                >
                  {s.breve}
                </Link>
              ))}
            </span>
          )}
          <StampaDocumento
            etichetta={sola ? 'Stampa il report della tabella' : 'Stampa il report contabile'}
          />
        </div>
      </div>

      <header className="bg-white border border-slate-200 rounded-xl p-6 space-y-2">
        <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">
          Verifica contabile · {sola ? 'report della tabella' : 'report contabile'}
        </p>
        <h1 className="text-xl font-bold text-slate-900">{intestazione}</h1>
        <p className="text-[11px] text-slate-500">
          {partitaIva ? `P. IVA ${partitaIva} · ` : ''}documento generato il {generatoIl} sui
          documenti e sui calcoli della verifica contabile. Nessun valore è ricalcolato a mano.
        </p>
        {!sola && (
          <p className="text-[11px] text-slate-600 leading-relaxed">
            Tre tabelle e le note integrative: il prospetto depositato, i differenziali che ne
            leggono la serie e la simulazione fino all’anno della verifica. Ogni tabella ha accanto
            la spiegazione dei suoi valori.
          </p>
        )}
      </header>

      {sezioni.map((sezione, indice) => {
        const chiave = sezione.scheda.chiave;
        const salvata = spiegazioni[chiave] ?? { testo: '', aggiornataIl: null };
        return (
          <section
            key={chiave}
            className="bg-white border border-slate-200 rounded-xl p-5 space-y-2 break-inside-avoid"
          >
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
              {indice + 1}. {sezione.scheda.titolo}
            </h2>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              {sezione.scheda.introduzione}
            </p>
            <Tabella tabella={sezione.tabella} />
            {sezione.tabella.nota && (
              <p className="text-[10px] text-slate-500 leading-relaxed">{sezione.tabella.nota}</p>
            )}
            <Spiegazione
              scheda={sezione.scheda}
              salvata={salvata}
              onSalva={(testo) => salva(chiave, testo)}
            />
          </section>
        );
      })}

      {conNote && (
        <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
          <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
            {sezioni.length + 1}. Note integrative{annoNota ? ` — bilancio ${annoNota}` : ''}
          </h2>
          {note.length === 0 ? (
            <p className="text-[11px] text-slate-500">
              Nessuna nota integrativa leggibile nel bilancio in archivio: il documento resta sui
              numeri e lo dichiara, invece di riassumere una nota che non c’è.
            </p>
          ) : (
            <>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                Il testo con cui l’azienda spiega i propri numeri, letto dall’istanza XBRL. Non è
                una sintesi e non è un tasso: è il documento.
              </p>
              <div className="space-y-3">
                {note.map((n) => (
                  <div key={n.sezione}>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      {n.titolo}
                    </p>
                    <p className="text-[11px] text-slate-700 leading-relaxed whitespace-pre-line">
                      {n.testo}
                    </p>
                  </div>
                ))}
              </div>
            </>
          )}
          {noteTroncate && (
            <p className="text-[10px] text-amber-800 leading-relaxed">
              Le note sono state ridotte ai passaggi rilevanti: il bilancio ne porta altre, e il
              taglio è dichiarato qui perché si sappia.
            </p>
          )}
        </section>
      )}

      <p className="text-[10px] text-slate-400 leading-relaxed">
        Piano, differenziali e simulazione sono calcoli dichiarati, non previsioni: le voci segnate
        «ferma» non hanno una serie utilizzabile e restano all’ultimo dato. Il documento non formula
        conclusioni giuridiche: la scelta su come procedere resta al valutatore.
      </p>
    </div>
  );
}

/** Le tre tabelle come link: la stessa carta si apre da sola. */
function sezioniLink() {
  return [
    { chiave: 'PROSPETTO', slug: 'prospetto', breve: 'Prospetto' },
    { chiave: 'DIFFERENZIALI', slug: 'differenziali', breve: 'Differenziali' },
    { chiave: 'SIMULAZIONE', slug: 'simulazione', breve: 'Simulazione' },
  ];
}
