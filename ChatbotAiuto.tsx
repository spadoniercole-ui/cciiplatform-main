'use client';

// Test pratico per la ragionevole perseguibilità del risanamento
// (art. 13, comma 2 CCII — Sezione I del documento guida ministeriale)
// a livello Azienda — solo Redigente. Premessa alla Check List
// Ministeriale (Sezione II): il rapporto debito da ristrutturare [A] /
// flussi annui a regime [B] colloca l'azienda in una fascia di
// gravità. Il calcolo è la funzione pura calcolaTestPratico (stessa dei
// test unitari), qui usata dal vivo mentre si digita; gli input vengono
// salvati con un piccolo ritardo (debounce), senza attendere ad ogni
// tasto.

import React, { useEffect, useRef, useState } from 'react';
import { Gauge, Info } from 'lucide-react';
import {
  ottieniTestPraticoAzienda,
  salvaTestPraticoAziendaAction,
} from '@/app/actions/testPraticoAzienda';
import {
  calcolaTestPratico,
  DATI_DEBITO_VUOTI,
  DATI_FLUSSI_VUOTI,
  type DatiDebitoRistrutturare,
  type DatiFlussiARegime,
  type FasciaTestPratico,
} from '@/lib/testPratico/calcolo';

interface Props {
  nomeSchema: string;
  aziendaId: number;
}

const EURO = (n: number) =>
  `€ ${n.toLocaleString('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const COLORI_FASCIA: Record<FasciaTestPratico, string> = {
  DIFFICOLTA_CONTENUTE: 'bg-emerald-50 border-emerald-200 text-emerald-800',
  DIPENDE_DA_INIZIATIVE: 'bg-amber-50 border-amber-200 text-amber-800',
  RICHIEDE_CESSIONE_PROBABILE: 'bg-orange-50 border-orange-200 text-orange-800',
  CESSIONE_NECESSARIA: 'bg-red-50 border-red-200 text-red-800',
  DISEQUILIBRIO_A_REGIME: 'bg-red-50 border-red-200 text-red-800',
};

// Voci del debito da ristrutturare [A]. `segno` indica come la voce
// entra nel totale (le negative si sottraggono) — solo informativo per
// l'utente, il calcolo vero resta in calcolaTestPratico.
const VOCI_DEBITO: {
  chiave: keyof DatiDebitoRistrutturare;
  etichetta: string;
  segno: '+' | '−';
  diCui?: boolean;
}[] = [
  { chiave: 'debitoScaduto', etichetta: 'Debito scaduto', segno: '+' },
  {
    chiave: 'diCuiIscrizioniARuolo',
    etichetta: 'di cui iscrizioni a ruolo',
    segno: '+',
    diCui: true,
  },
  {
    chiave: 'debitoRiscadenziatoOMoratorie',
    etichetta: 'Debito riscadenziato o oggetto di moratorie',
    segno: '+',
  },
  {
    chiave: 'lineeCreditoNonRinnovabili',
    etichetta: 'Linee di credito autoliquidanti non rinnovabili',
    segno: '+',
  },
  {
    chiave: 'rateFinanziamentiScadenza2Anni',
    etichetta: 'Rate di finanziamenti in scadenza nei due anni',
    segno: '+',
  },
  {
    chiave: 'investimentiIniziativeIndustriali',
    etichetta: 'Investimenti per le iniziative industriali previste',
    segno: '+',
  },
  {
    chiave: 'dismissioniCespitiORami',
    etichetta: 'Dismissioni di cespiti o rami non strategici',
    segno: '−',
  },
  {
    chiave: 'nuoviConferimentiEFinanziamenti',
    etichetta: 'Nuovi conferimenti e finanziamenti dei soci/terzi',
    segno: '−',
  },
  {
    chiave: 'molNettoNegativoPrimoAnno',
    etichetta: 'MOL netto negativo del primo anno (se presente)',
    segno: '−',
  },
  {
    chiave: 'stralcioRitenutoRagionevole',
    etichetta: 'Stralcio del debito ritenuto ragionevole',
    segno: '−',
  },
];

const VOCI_FLUSSI: {
  chiave: keyof Omit<DatiFlussiARegime, 'inEquilibrioDalSecondoAnno'>;
  etichetta: string;
  segno: '+' | '−';
}[] = [
  {
    chiave: 'molProspetticoNormalizzato',
    etichetta: 'MOL prospettico normalizzato a regime',
    segno: '+',
  },
  {
    chiave: 'investimentiMantenimentoAnnui',
    etichetta: 'Investimenti di mantenimento annui',
    segno: '−',
  },
  { chiave: 'imposteRedditoAnnue', etichetta: 'Imposte sul reddito annue', segno: '−' },
];

export function TestPraticoAziendaScenario({ nomeSchema, aziendaId }: Props) {
  const [debito, setDebito] = useState<DatiDebitoRistrutturare>({ ...DATI_DEBITO_VUOTI });
  const [flussi, setFlussi] = useState<DatiFlussiARegime>({ ...DATI_FLUSSI_VUOTI });
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);
  const [salvataggio, setSalvataggio] = useState(false);

  // Non salvare durante il primo caricamento (il set iniziale non è una
  // modifica dell'utente) e sfasa i salvataggi con un debounce.
  const timerSalvataggio = useRef<ReturnType<typeof setTimeout> | null>(null);
  const primoCaricamentoFatto = useRef(false);

  useEffect(() => {
    (async () => {
      setCaricamento(true);
      const risultato = await ottieniTestPraticoAzienda(nomeSchema, aziendaId);
      if (risultato.success) {
        setDebito(risultato.stato.debito);
        setFlussi(risultato.stato.flussi);
      } else {
        setErrore(risultato.error || 'Impossibile caricare il Test pratico.');
      }
      setCaricamento(false);
      primoCaricamentoFatto.current = true;
    })();
    return () => {
      if (timerSalvataggio.current) clearTimeout(timerSalvataggio.current);
    };
  }, [nomeSchema, aziendaId]);

  const programmaSalvataggio = (
    nuovoDebito: DatiDebitoRistrutturare,
    nuoviFlussi: DatiFlussiARegime
  ) => {
    if (!primoCaricamentoFatto.current) return;
    if (timerSalvataggio.current) clearTimeout(timerSalvataggio.current);
    timerSalvataggio.current = setTimeout(async () => {
      setSalvataggio(true);
      const esito = await salvaTestPraticoAziendaAction(
        nomeSchema,
        aziendaId,
        nuovoDebito,
        nuoviFlussi
      );
      if (!esito.success) setErrore(esito.error || 'Salvataggio non riuscito.');
      else setErrore(null);
      setSalvataggio(false);
    }, 700);
  };

  const aggiornaDebito = (chiave: keyof DatiDebitoRistrutturare, valore: number) => {
    const nuovo = { ...debito, [chiave]: valore };
    setDebito(nuovo);
    programmaSalvataggio(nuovo, flussi);
  };

  const aggiornaFlussi = (chiave: keyof DatiFlussiARegime, valore: number | boolean) => {
    const nuovo = { ...flussi, [chiave]: valore } as DatiFlussiARegime;
    setFlussi(nuovo);
    programmaSalvataggio(debito, nuovo);
  };

  if (caricamento) return <p className="text-xs text-slate-400">Caricamento del Test pratico...</p>;

  const risultato = calcolaTestPratico(debito, flussi);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-bold text-slate-900 uppercase text-xs tracking-wider flex items-center gap-2">
          <Gauge className="w-4 h-4 text-blue-600" /> Test pratico — ragionevole perseguibilità
        </h2>
        <p className="text-[11px] text-slate-500 mt-1">
          Sezione I del documento guida ministeriale (art. 13, comma 2 CCII). Misura il rapporto tra
          il debito da ristrutturare e i flussi annui a regime — colloca l&apos;azienda in una
          fascia di gravità che dice quanto sarà centrale il piano d&apos;impresa nella Check List
          qui sotto.
        </p>
      </div>

      {errore && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2.5">
          {errore}
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        {/* [A] Debito da ristrutturare */}
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <h3 className="text-xs font-bold text-slate-900 mb-3">
            <span className="text-blue-600">[A]</span> Debito da ristrutturare
          </h3>
          <div className="space-y-2">
            {VOCI_DEBITO.map((voce) => (
              <label
                key={voce.chiave}
                className={`flex items-center gap-2 ${voce.diCui ? 'pl-4' : ''}`}
              >
                <span
                  className={`w-4 shrink-0 text-center text-[11px] font-bold ${
                    voce.segno === '−' ? 'text-red-500' : 'text-slate-400'
                  }`}
                >
                  {voce.segno}
                </span>
                <span
                  className={`flex-1 text-[11px] ${voce.diCui ? 'text-slate-400 italic' : 'text-slate-600'}`}
                >
                  {voce.etichetta}
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  value={debito[voce.chiave] === 0 ? '' : debito[voce.chiave]}
                  onChange={(e) =>
                    aggiornaDebito(voce.chiave, e.target.value === '' ? 0 : Number(e.target.value))
                  }
                  placeholder="0"
                  className="w-28 shrink-0 text-right text-xs px-2 py-1 border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
              </label>
            ))}
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-700">Totale [A]</span>
            <span className="text-sm font-bold text-slate-900">{EURO(risultato.totaleA)}</span>
          </div>
          <p className="text-[10px] text-slate-400 mt-1">
            La riga &laquo;di cui iscrizioni a ruolo&raquo; è un dettaglio informativo del debito
            scaduto e non si somma di nuovo nel totale.
          </p>
        </div>

        {/* [B] Flussi annui a regime */}
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <h3 className="text-xs font-bold text-slate-900 mb-3">
            <span className="text-blue-600">[B]</span> Flussi annui a regime
          </h3>
          <div className="space-y-2">
            {VOCI_FLUSSI.map((voce) => (
              <label key={voce.chiave} className="flex items-center gap-2">
                <span
                  className={`w-4 shrink-0 text-center text-[11px] font-bold ${
                    voce.segno === '−' ? 'text-red-500' : 'text-slate-400'
                  }`}
                >
                  {voce.segno}
                </span>
                <span className="flex-1 text-[11px] text-slate-600">{voce.etichetta}</span>
                <input
                  type="number"
                  inputMode="decimal"
                  value={flussi[voce.chiave] === 0 ? '' : flussi[voce.chiave]}
                  onChange={(e) =>
                    aggiornaFlussi(voce.chiave, e.target.value === '' ? 0 : Number(e.target.value))
                  }
                  placeholder="0"
                  className="w-28 shrink-0 text-right text-xs px-2 py-1 border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
              </label>
            ))}
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-700">Totale [B] (annuo)</span>
            <span className="text-sm font-bold text-slate-900">{EURO(risultato.totaleB)}</span>
          </div>
          <label className="mt-3 flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={flussi.inEquilibrioDalSecondoAnno}
              onChange={(e) => aggiornaFlussi('inEquilibrioDalSecondoAnno', e.target.checked)}
              className="mt-0.5 w-3.5 h-3.5 accent-blue-600"
            />
            <span className="text-[11px] text-slate-600">
              L&apos;impresa presenta flussi annui positivi e stabili dal secondo anno in poi. Senza
              questa condizione il rapporto A/B non è applicabile nella sua forma base.
            </span>
          </label>
        </div>
      </div>

      {/* Esito */}
      <div className={`border rounded-xl p-4 ${COLORI_FASCIA[risultato.fascia]}`}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider opacity-70">Esito</span>
            <span className="text-sm font-bold">{risultato.etichetta}</span>
          </div>
          <div className="flex items-center gap-4 text-[11px] font-bold">
            <span>
              Rapporto A/B:{' '}
              {risultato.rapporto === null
                ? 'n/d'
                : risultato.rapporto.toFixed(2).replace('.', ',')}
            </span>
            <span className="opacity-70">→ {risultato.puntoSuccessivo}</span>
          </div>
        </div>
        <p className="text-[11px] mt-2 leading-relaxed text-slate-700">{risultato.descrizione}</p>
        {salvataggio && <p className="text-[10px] mt-2 opacity-60">Salvataggio in corso…</p>}
      </div>

      <div className="flex items-start gap-2 text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-3">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-slate-400" />
        <span>
          Il Test pratico (Sezione I) precede la Check List Ministeriale (Sezione II): più il
          rapporto A/B è alto, più il piano d&apos;impresa — e quindi la Check List qui sotto —
          diventa centrale per dimostrare la perseguibilità del risanamento.
        </span>
      </div>
    </div>
  );
}
