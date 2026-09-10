'use client';

// VERIFICA SALUTE AZIENDA — il triage prima dell'istruttoria.
//
// Si carica la visura camerale, si confermano i campi estratti, e si ottiene
// l'indicatore di attenzione. Solo se si decide di procedere la posizione
// diventa una pratica vera.
//
// Perché l'anagrafica viene comunque salvata, invece di calcolare tutto al
// volo senza scrivere nulla:
//
//  - se il funzionario guarda l'indicatore e decide di NON procedere, ha
//    preso una decisione amministrativa: senza traccia non resta memoria di
//    chi ha verificato cosa, e in un ente è la traccia che protegge chi
//    decide;
//  - i documenti caricati vengono sempre eliminati dopo l'elaborazione:
//    senza esito salvato, due funzionari sulla stessa azienda otterrebbero
//    report diversi e nessuno dei due sarebbe ricostruibile;
//  - un secondo percorso che ricalcola esposizione, soglie e indici
//    finirebbe per divergere da quello esistente. Una sola definizione di
//    ogni numero.
//
// Il costo che si voleva abbattere non era il salvataggio: erano i quindici
// campi da digitare. Quelli ora arrivano dalla visura.

import React, { useState } from 'react';
import { Stethoscope, Upload, Check, AlertTriangle, ArrowRight } from 'lucide-react';
import {
  estraiAnagraficaDaVisuraAction,
  type AnagraficaEstratta,
} from '@/app/actions/visuraEstrazione';
import {
  creaAziendaInVerificaAction,
  promuoviAziendaAction,
  registraEsitoVerificaAction,
} from '@/app/actions/aziendaInVerifica';
import { ottieniAttenzioneScreeningAction } from '@/app/actions/attenzioneScreening';
import { SemaforoAttenzione } from '@/components/spazio/SemaforoAttenzione';
import type { Attenzione } from '@/lib/screening/indicatore';

interface Props {
  nomeSchema: string;
  codice: string;
}

type Fase = 'caricamento' | 'conferma' | 'esito';

const CAMPI: { chiave: keyof AnagraficaEstratta; label: string; numerico?: boolean }[] = [
  { chiave: 'ragioneSociale', label: 'Ragione sociale' },
  { chiave: 'formaGiuridica', label: 'Forma giuridica' },
  { chiave: 'annoCostituzione', label: 'Anno di costituzione', numerico: true },
  { chiave: 'codiceFiscale', label: 'Codice fiscale' },
  { chiave: 'partitaIva', label: 'Partita IVA' },
  { chiave: 'codiceAteco', label: 'Codice ATECO' },
  { chiave: 'numeroRea', label: 'Numero REA' },
  { chiave: 'capitaleSociale', label: 'Capitale sociale', numerico: true },
  { chiave: 'indirizzoSedeLegale', label: 'Indirizzo sede legale' },
  { chiave: 'citta', label: 'Città' },
  { chiave: 'provincia', label: 'Provincia' },
  { chiave: 'cap', label: 'CAP' },
  { chiave: 'rappresentanteLegale', label: 'Rappresentante legale' },
  { chiave: 'ruoloRappresentanteLegale', label: 'Ruolo del rappresentante' },
  { chiave: 'pec', label: 'PEC' },
];

const CLASSE_CAMPO =
  'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-sky-500';

export function VerificaSaluteAzienda({ nomeSchema, codice }: Props) {
  const [fase, setFase] = useState<Fase>('caricamento');
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [nonTrovati, setNonTrovati] = useState<string[]>([]);
  const [dati, setDati] = useState<AnagraficaEstratta | null>(null);
  const [aziendaId, setAziendaId] = useState<number | null>(null);
  const [attenzione, setAttenzione] = useState<Attenzione | null>(null);

  const caricaVisura = async (f: File | null) => {
    if (!f) return;
    setInCorso(true);
    setErrore(null);
    try {
      const byte = new Uint8Array(await f.arrayBuffer());
      let binario = '';
      for (let i = 0; i < byte.length; i += 8192) {
        binario += String.fromCharCode(...byte.subarray(i, i + 8192));
      }
      const r = await estraiAnagraficaDaVisuraAction(btoa(binario));
      if (r.success && r.anagrafica) {
        setDati(r.anagrafica);
        setNonTrovati(r.nonTrovati ?? []);
        setFase('conferma');
      } else {
        // Anche senza estrazione si può proseguire: i campi si compilano a
        // mano. Meglio un percorso più lento che un vicolo cieco.
        setErrore(r.error ?? 'Estrazione non riuscita.');
        setDati({
          ragioneSociale: null,
          formaGiuridica: null,
          codiceFiscale: null,
          partitaIva: null,
          codiceAteco: null,
          numeroRea: null,
          capitaleSociale: null,
          indirizzoSedeLegale: null,
          citta: null,
          provincia: null,
          cap: null,
          rappresentanteLegale: null,
          ruoloRappresentanteLegale: null,
          pec: null,
          annoCostituzione: null,
        });
        setFase('conferma');
      }
    } catch (e) {
      setErrore(String(e));
    } finally {
      setInCorso(false);
    }
  };

  const confermaEValuta = async () => {
    if (!dati) return;
    setInCorso(true);
    setErrore(null);
    try {
      const c = await creaAziendaInVerificaAction(nomeSchema, dati);
      if (!c.success || !c.aziendaId) {
        setErrore(c.error ?? 'Creazione non riuscita.');
        return;
      }
      setAziendaId(c.aziendaId);
      const a = await ottieniAttenzioneScreeningAction(nomeSchema, c.aziendaId);
      if (a.success && a.attenzione) {
        setAttenzione(a.attenzione);
        await registraEsitoVerificaAction(nomeSchema, c.aziendaId, a.attenzione.esito);
      }
      setFase('esito');
    } catch (e) {
      setErrore(String(e));
    } finally {
      setInCorso(false);
    }
  };

  const procedi = async () => {
    if (!aziendaId) return;
    setInCorso(true);
    const r = await promuoviAziendaAction(nomeSchema, aziendaId);
    setInCorso(false);
    if (r.success) window.location.href = `/spazio/${codice}/aziende/${aziendaId}`;
    else setErrore(r.error ?? 'Operazione non riuscita.');
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="flex items-center gap-2 font-bold text-slate-900 uppercase text-xs tracking-wider">
          <Stethoscope className="w-4 h-4 text-slate-500" />
          Verifica salute azienda
        </h2>
        <p className="text-xs text-slate-500 mt-1 leading-relaxed">
          Il triage prima dell&apos;istruttoria: si carica la visura camerale, si confermano i dati
          e si ottiene l&apos;indicatore di attenzione. La posizione diventa una pratica solo se
          decidi di procedere — ma la verifica resta comunque registrata.
        </p>
      </div>

      {errore && (
        <div className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <p>{errore}</p>
        </div>
      )}

      {fase === 'caricamento' && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
            Visura camerale (PDF)
          </p>
          <input
            type="file"
            accept=".pdf"
            disabled={inCorso}
            onChange={(e) => void caricaVisura(e.target.files?.[0] ?? null)}
            className="w-full text-xs font-mono text-slate-900 file:mr-3 file:px-3 file:py-2 file:rounded-lg file:border-0 file:bg-slate-900 file:text-white file:font-bold file:uppercase file:text-[10px]"
          />
          <p className="text-[10px] text-slate-400 leading-relaxed">
            Da qui vengono letti i dati anagrafici. Il file non viene conservato: serve solo
            all&apos;estrazione, e i campi letti li confermi tu prima che vengano salvati.
          </p>
          {inCorso && (
            <p className="text-[11px] text-slate-500">
              <Upload className="w-3 h-3 inline mr-1" />
              Lettura della visura in corso...
            </p>
          )}
        </div>
      )}

      {fase === 'conferma' && dati && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
              Conferma i dati letti
            </h3>
            {nonTrovati.length > 0 && (
              <span className="text-[10px] text-amber-700">
                {nonTrovati.length} campi non trovati nella visura
              </span>
            )}
          </div>

          <p className="text-[11px] text-slate-500 leading-relaxed">
            Quanto letto viene <span className="font-bold">proposto</span>, non ancora salvato: su
            un&apos;anagrafica un errore non resta isolato, si trascina in tutto ciò che viene dopo
            — a partire dalla soglia dell&apos;Agente della Riscossione, che dipende dalla forma
            giuridica.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {CAMPI.map(({ chiave, label, numerico }) => {
              const valore = dati[chiave];
              const mancante = valore === null;
              return (
                <div key={chiave}>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                    {label}
                    {mancante && <span className="ml-1 text-amber-600">— non trovato</span>}
                  </label>
                  <input
                    type={numerico ? 'number' : 'text'}
                    value={valore === null ? '' : String(valore)}
                    onChange={(e) =>
                      setDati({
                        ...dati,
                        [chiave]: numerico
                          ? e.target.value === ''
                            ? null
                            : Number(e.target.value)
                          : e.target.value === ''
                            ? null
                            : e.target.value,
                      })
                    }
                    className={`${CLASSE_CAMPO} ${mancante ? 'border-amber-300' : ''}`}
                  />
                </div>
              );
            })}
          </div>

          <button
            onClick={() => void confermaEValuta()}
            disabled={inCorso || !dati.ragioneSociale}
            className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-slate-800 disabled:bg-slate-300"
          >
            <Check className="w-3.5 h-3.5" />
            {inCorso ? 'Valutazione in corso...' : 'Conferma e valuta'}
          </button>
        </div>
      )}

      {fase === 'esito' && (
        <div className="space-y-4">
          {attenzione ? (
            <SemaforoAttenzione attenzione={attenzione} />
          ) : (
            <p className="text-xs text-slate-500">
              Indicatore non calcolabile con i dati inseriti.
            </p>
          )}

          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <h3 className="font-bold text-slate-900 uppercase text-xs tracking-wider">E adesso?</h3>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              La verifica è registrata: resta consultabile anche se decidi di non proseguire, ed è
              la traccia di chi ha guardato questa posizione e quando. Procedendo, l&apos;azienda
              entra fra quelle in lavorazione e potrai completarne i dati e aprire uno scenario.
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => void procedi()}
                disabled={inCorso || !aziendaId}
                className="flex items-center gap-2 bg-sky-600 text-white px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-sky-700 disabled:bg-slate-300"
              >
                <ArrowRight className="w-3.5 h-3.5" />
                Procedi con questa azienda
              </button>
              <button
                onClick={() => {
                  setFase('caricamento');
                  setDati(null);
                  setAttenzione(null);
                  setAziendaId(null);
                  setNonTrovati([]);
                }}
                className="px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider border border-slate-300 text-slate-700 hover:bg-slate-50"
              >
                Verifica un&apos;altra azienda
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
