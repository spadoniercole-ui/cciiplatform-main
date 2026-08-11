'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { Save, RefreshCw, AlertTriangle, Lightbulb, CheckCircle2 } from 'lucide-react';
import {
  ottieniInputRedigente,
  salvaLeveRedigenteAction,
  type LeveRedigente,
  type FotografiaInizialeRedigente,
} from '@/app/actions/simulazioneRedigente';
import {
  calcolaRedigente,
  type CategoriaPersonale,
  type RisultatoRedigente,
  type InputRedigente,
} from '@/lib/simulazione/calcoloRedigente';
import { calcolaRaccomandazioniRedigente } from '@/lib/simulazione/raccomandazioniRedigente';
import { useDichiaraContestoAssistente } from '@/components/ContestoAssistenteContext';

interface Props {
  nomeSchema: string;
  scenarioId: number;
}

const ETICHETTA_CATEGORIA: Record<CategoriaPersonale, string> = {
  operai: 'Operai',
  impiegati: 'Impiegati',
  quadri: 'Quadri',
  dirigenti: 'Dirigenti',
};
const CATEGORIE: CategoriaPersonale[] = ['operai', 'impiegati', 'quadri', 'dirigenti'];

function formatEuro(v: number): string {
  return v.toLocaleString('it-IT', { maximumFractionDigits: 0 });
}

function Semaforo({
  ok,
  etichetta,
  valore,
}: {
  ok: boolean | null;
  etichetta: string;
  valore: string;
}) {
  const colore = ok === null ? 'bg-slate-300' : ok ? 'bg-emerald-500' : 'bg-red-500';
  return (
    <div className="flex-1 min-w-[100px]">
      <span className="text-[10px] text-slate-400 uppercase font-bold block">{etichetta}</span>
      <span className="text-sm font-bold text-slate-900 block">{valore}</span>
      <div className={`h-1.5 rounded-full mt-1 ${colore}`} />
    </div>
  );
}

/**
 * Barra trascinabile + valore numerico preciso a fianco (uno slider da
 * solo non basta per inserire "2500,50" al volo) + un piccolo semaforo
 * sotto che riflette la viabilità GLOBALE corrente — dato che il
 * ricalcolo è istantaneo (useMemo nel componente padre), il semaforo si
 * aggiorna in tempo reale mentre si trascina, esattamente come chiesto:
 * feedback immediato dove si sta interagendo, non da andare a cercare
 * in un pannello separato in cima alla pagina.
 */
function CampoSlider({
  etichetta,
  valore,
  min,
  max,
  step = 1,
  onChange,
  viabile,
  suffisso = '',
}: {
  etichetta: string;
  valore: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  viabile: boolean | null;
  suffisso?: string;
}) {
  const colore = viabile === null ? 'bg-slate-300' : viabile ? 'bg-emerald-500' : 'bg-red-500';
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-[10px] text-slate-400 uppercase font-bold">{etichetta}</label>
        <input
          type="number"
          step={step}
          value={valore}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-24 p-1 text-xs text-right border border-slate-200 rounded text-slate-900 bg-white"
        />
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={valore}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-slate-900"
      />
      <div className="flex items-center justify-between mt-0.5">
        <div className={`h-1 flex-1 rounded-full ${colore}`} />
        <span className="text-[9px] text-slate-400 ml-2 shrink-0">
          {valore}
          {suffisso}
        </span>
      </div>
    </div>
  );
}

export function SimulazioneRedigenteScenario({ nomeSchema, scenarioId }: Props) {
  const [leve, setLeve] = useState<LeveRedigente | null>(null);
  const [fotografia, setFotografia] = useState<FotografiaInizialeRedigente | null>(null);
  const [caricamento, setCaricamento] = useState(true);
  const [salvataggio, setSalvataggio] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  useDichiaraContestoAssistente({ pagina: 'simulazione', nomeSchema, scenarioId });

  useEffect(() => {
    (async () => {
      setCaricamento(true);
      const risultatoRis = await ottieniInputRedigente(nomeSchema, scenarioId);
      setLeve(risultatoRis.leve);
      setFotografia(risultatoRis.fotografia);
      if (!risultatoRis.success) setErrore(risultatoRis.error || null);
      setCaricamento(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nomeSchema, scenarioId]);

  const input: InputRedigente | null = useMemo(() => {
    if (!leve || !fotografia) return null;
    return {
      valoreProduzione: fotografia.valoreProduzione,
      costiProduzioneAltri: leve.costiProduzioneAltri,
      ammortamenti: fotografia.ammortamenti,
      personale: leve.personale,
      aliquotePersonale: leve.aliquotePersonale,
      giorniMediIncassoClienti: leve.giorniMediIncassoClienti,
      giorniMediPagamentoFornitori: leve.giorniMediPagamentoFornitori,
      giorniBaseline: leve.giorniBaseline,
      aliquotaImposteSulReddito: leve.aliquotaImposteSulReddito,
      aliquotaIrap: leve.aliquotaIrap,
      totaleDebitiProposta: fotografia.totaleDebitiProposta,
      numeroRateMedie: leve.numeroRateMedie,
      totaleDebiti: fotografia.totaleDebiti,
      patrimonioNetto: fotografia.patrimonioNetto,
    };
  }, [leve, fotografia]);

  const risultato: RisultatoRedigente | null = useMemo(
    () => (input ? calcolaRedigente(input) : null),
    [input]
  );

  // Raccomandazioni azionabili — ricalcolate dal vivo a ogni movimento
  // di leva, come il resto della Simulazione: quali parametri muovere
  // (e verso quale valore) per riportare il DSCR a 1 quando non regge.
  const raccomandazioni = useMemo(
    () => (input && risultato ? calcolaRaccomandazioniRedigente(input, risultato) : null),
    [input, risultato]
  );

  const handleSalva = async () => {
    if (!leve) return;
    setSalvataggio(true);
    const esito = await salvaLeveRedigenteAction(nomeSchema, scenarioId, leve);
    if (!esito.success) setErrore(esito.error || 'Impossibile salvare.');
    setSalvataggio(false);
  };

  if (caricamento) return <p className="text-xs text-slate-400">Caricamento...</p>;

  if (!leve || !fotografia) {
    return (
      <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
        <p>{errore || 'Impossibile caricare la Simulazione.'}</p>
      </div>
    );
  }

  const aggiornaPersonale = (
    cat: CategoriaPersonale,
    campo: 'numero' | 'retribuzioneLordaMensileMedia',
    valore: number
  ) => {
    setLeve({
      ...leve,
      personale: { ...leve.personale, [cat]: { ...leve.personale[cat], [campo]: valore } },
    });
  };

  const aggiornaAliquota = (
    cat: CategoriaPersonale,
    campo: 'previdenziale' | 'inail',
    valore: number
  ) => {
    setLeve({
      ...leve,
      aliquotePersonale: {
        ...leve.aliquotePersonale,
        [cat]: { ...leve.aliquotePersonale[cat], [campo]: valore },
      },
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
          Simulazione — Redigente
        </h2>
        <p className="text-[11px] text-slate-500 mt-1">
          Un solo stato, non tre scenari — aggiusta le leve finché gli indici sotto non tornano in
          equilibrio. Ricalcolo istantaneo, nulla si perde finché non premi Salva.
        </p>
      </div>

      {errore && (
        <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <p>{errore}</p>
        </div>
      )}

      {risultato && (
        <div
          className={`border rounded-xl p-4 ${
            risultato.viabile ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Indici a regime
            </span>
            <span
              className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded ${
                risultato.viabile ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
              }`}
            >
              {risultato.viabile ? 'Viabile' : 'Non viabile'}
            </span>
          </div>
          <div className="flex flex-wrap gap-4">
            <Semaforo
              ok={risultato.ebit >= 0}
              etichetta="EBIT"
              valore={`€ ${formatEuro(risultato.ebit)}`}
            />
            <Semaforo
              ok={risultato.ebitda >= 0}
              etichetta="EBITDA"
              valore={`€ ${formatEuro(risultato.ebitda)}`}
            />
            <Semaforo
              ok={risultato.dscr !== null && risultato.dscr >= 1}
              etichetta="DSCR"
              valore={risultato.dscr !== null ? risultato.dscr.toFixed(2) : '—'}
            />
            <Semaforo
              ok={risultato.indiceDebitiCapitale === null || risultato.indiceDebitiCapitale <= 3}
              etichetta="Debiti / Capitale"
              valore={
                risultato.indiceDebitiCapitale !== null
                  ? risultato.indiceDebitiCapitale.toFixed(2)
                  : '—'
              }
            />
          </div>
          <p className="text-[10px] text-slate-500 mt-3">
            Flusso disponibile € {formatEuro(risultato.flussoDisponibile)} — rata annua €{' '}
            {formatEuro(risultato.rataAnnua)} — imposte € {formatEuro(risultato.imposte)} —
            variazione capitale circolante {risultato.variazioneCapitaleCircolante >= 0 ? '+' : ''}€{' '}
            {formatEuro(risultato.variazioneCapitaleCircolante)}
          </p>
        </div>
      )}

      {/* Raccomandazioni azionabili — cosa muovere per rendere il piano
          sostenibile (DSCR ≥ 1), calcolate dal vivo dalle stesse formule. */}
      {raccomandazioni &&
        !raccomandazioni.viabile &&
        raccomandazioni.raccomandazioni.length > 0 && (
          <div className="bg-white border border-blue-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Lightbulb className="w-4 h-4 text-blue-600" />
              <h3 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
                Come rendere il piano sostenibile
              </h3>
            </div>
            <p className="text-[10px] text-slate-500 mb-3">
              Scoperto annuo da colmare € {formatEuro(raccomandazioni.gapFlusso)}. Ogni leva è
              calcolata da sola, tenendo ferme le altre — sono alternative, oppure combinabili tra
              loro.
            </p>
            <div className="space-y-2">
              {raccomandazioni.raccomandazioni.map((r) => (
                <div
                  key={r.leva}
                  className={`rounded-lg border p-3 ${
                    r.realizzabileDaSola
                      ? 'bg-blue-50/50 border-blue-100'
                      : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-3 flex-wrap">
                    <span className="text-[11px] font-bold text-slate-800">{r.titolo}</span>
                    <span className="text-[11px] font-bold text-slate-900 shrink-0">
                      {r.valoreAttuale}
                      {r.valoreObiettivo ? (
                        <>
                          {' '}
                          <span className="text-slate-400">→</span>{' '}
                          <span className="text-blue-700">{r.valoreObiettivo}</span>
                        </>
                      ) : (
                        <span className="text-slate-400"> · da sola non basta</span>
                      )}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">{r.descrizione}</p>
                </div>
              ))}
            </div>
          </div>
        )}

      {raccomandazioni?.viabile && (
        <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          Piano sostenibile con le leve attuali (DSCR{' '}
          {raccomandazioni.dscr === null ? 'n/d' : raccomandazioni.dscr.toFixed(2)}): il flusso
          disponibile copre la rata annua, nessuna correzione necessaria.
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <h3 className="font-bold text-slate-900 uppercase text-xs tracking-wider mb-3">
          Fotografia di partenza
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs mb-4">
          <div>
            <span className="text-[10px] text-slate-400 uppercase block">Valore produzione</span>
            <span className="font-bold text-slate-900">
              € {formatEuro(fotografia.valoreProduzione)}
            </span>
          </div>
          <div>
            <span className="text-[10px] text-slate-400 uppercase block">
              Costi produzione (storico totale)
            </span>
            <span className="font-bold text-slate-900">
              € {formatEuro(fotografia.costiProduzioneStorico)}
            </span>
          </div>
          <div>
            <span className="text-[10px] text-slate-400 uppercase block">Patrimonio netto</span>
            <span className="font-bold text-slate-900">
              € {formatEuro(fotografia.patrimonioNetto)}
            </span>
          </div>
          <div>
            <span className="text-[10px] text-slate-400 uppercase block">
              Totale debiti (Proposta)
            </span>
            <span className="font-bold text-slate-900">
              € {formatEuro(fotografia.totaleDebitiProposta)}
            </span>
          </div>
        </div>
        <div>
          <CampoSlider
            etichetta="Costi di produzione — esclusi personale (correggi il valore storico qui sopra)"
            valore={leve.costiProduzioneAltri}
            min={0}
            max={Math.max(fotografia.costiProduzioneStorico * 2, 100000)}
            step={Math.max(Math.round(fotografia.costiProduzioneStorico / 1000), 1)}
            onChange={(v) => setLeve({ ...leve, costiProduzioneAltri: v })}
            viabile={risultato?.viabile ?? null}
          />
          <p className="text-[10px] text-slate-400 mt-1">
            Precompilato col totale storico — il personale si ricalcola dalle 4 categorie qui sotto,
            non va incluso qui o verrebbe contato due volte.
          </p>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <h3 className="font-bold text-slate-900 uppercase text-xs tracking-wider mb-3">
          Personale
        </h3>
        <div className="space-y-4">
          {CATEGORIE.map((cat) => (
            <div
              key={cat}
              className="grid grid-cols-2 sm:grid-cols-4 gap-3 border-b border-slate-100 pb-3 last:border-0"
            >
              <span className="text-xs font-bold text-slate-700 sm:col-span-4">
                {ETICHETTA_CATEGORIA[cat]}
              </span>
              <CampoSlider
                etichetta="Numero"
                valore={leve.personale[cat].numero}
                min={0}
                max={100}
                onChange={(v) => aggiornaPersonale(cat, 'numero', v)}
                viabile={risultato?.viabile ?? null}
              />
              <CampoSlider
                etichetta="Retribuzione lorda mensile media"
                valore={leve.personale[cat].retribuzioneLordaMensileMedia}
                min={0}
                max={15000}
                step={50}
                onChange={(v) => aggiornaPersonale(cat, 'retribuzioneLordaMensileMedia', v)}
                viabile={risultato?.viabile ?? null}
                suffisso="€"
              />
              <CampoSlider
                etichetta="Previdenziale %"
                valore={leve.aliquotePersonale[cat].previdenziale}
                min={0}
                max={60}
                step={0.1}
                onChange={(v) => aggiornaAliquota(cat, 'previdenziale', v)}
                viabile={risultato?.viabile ?? null}
                suffisso="%"
              />
              <CampoSlider
                etichetta="INAIL %"
                valore={leve.aliquotePersonale[cat].inail}
                min={0}
                max={15}
                step={0.01}
                onChange={(v) => aggiornaAliquota(cat, 'inail', v)}
                viabile={risultato?.viabile ?? null}
                suffisso="%"
              />
            </div>
          ))}
        </div>
        {risultato && (
          <p className="text-[11px] text-slate-500 mt-3">
            Costo azienda totale personale:{' '}
            <strong>€ {formatEuro(risultato.costoPersonaleTotale)}</strong>
          </p>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <h3 className="font-bold text-slate-900 uppercase text-xs tracking-wider mb-3">
          Capitale circolante
        </h3>
        <p className="text-[11px] text-slate-500 mb-3">
          Rispetto alla base convenzionale di {leve.giorniBaseline} giorni: incassare più tardi
          assorbe cassa, pagare più tardi ne libera.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <CampoSlider
            etichetta="Giorni medi incasso clienti"
            valore={leve.giorniMediIncassoClienti}
            min={0}
            max={180}
            onChange={(v) => setLeve({ ...leve, giorniMediIncassoClienti: v })}
            viabile={risultato?.viabile ?? null}
            suffisso="gg"
          />
          <CampoSlider
            etichetta="Giorni medi pagamento fornitori"
            valore={leve.giorniMediPagamentoFornitori}
            min={0}
            max={180}
            onChange={(v) => setLeve({ ...leve, giorniMediPagamentoFornitori: v })}
            viabile={risultato?.viabile ?? null}
            suffisso="gg"
          />
          <CampoSlider
            etichetta="Base di confronto (giorni)"
            valore={leve.giorniBaseline}
            min={1}
            max={90}
            onChange={(v) => setLeve({ ...leve, giorniBaseline: v })}
            viabile={risultato?.viabile ?? null}
            suffisso="gg"
          />
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <h3 className="font-bold text-slate-900 uppercase text-xs tracking-wider mb-3">
          Imposte e rata del piano
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <CampoSlider
            etichetta="Aliquota imposte sul reddito % (43 IRPEF / 24 IRES)"
            valore={leve.aliquotaImposteSulReddito}
            min={0}
            max={50}
            step={0.1}
            onChange={(v) => setLeve({ ...leve, aliquotaImposteSulReddito: v })}
            viabile={risultato?.viabile ?? null}
            suffisso="%"
          />
          <CampoSlider
            etichetta="Aliquota IRAP %"
            valore={leve.aliquotaIrap}
            min={0}
            max={10}
            step={0.1}
            onChange={(v) => setLeve({ ...leve, aliquotaIrap: v })}
            viabile={risultato?.viabile ?? null}
            suffisso="%"
          />
          <CampoSlider
            etichetta="Numero rate medie (INPS 60 / Agenzia 72 / INAIL 120)"
            valore={leve.numeroRateMedie}
            min={12}
            max={180}
            onChange={(v) => setLeve({ ...leve, numeroRateMedie: v })}
            viabile={risultato?.viabile ?? null}
          />
        </div>
      </div>

      <button
        type="button"
        onClick={handleSalva}
        disabled={salvataggio}
        className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white font-bold uppercase tracking-wider rounded-lg text-xs transition-colors"
      >
        {salvataggio ? (
          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Save className="w-3.5 h-3.5" />
        )}
        {salvataggio ? 'Salvataggio...' : 'Salva'}
      </button>
    </div>
  );
}
