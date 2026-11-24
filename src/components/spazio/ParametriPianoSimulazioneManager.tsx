'use client';

// PARAMETRI DELLA SIMULAZIONE DEL PIANO.
//
// L'AI del piano di sviluppo non calcola numeri: scrive le ipotesi delle
// manopole, e il motore calcola. Questi quattro valori dicono all'AI e al
// motore entro quali limiti muoversi: l'aliquota da cui parte il calcolo,
// l'ampiezza massima di una manopola, il tetto alla crescita di settore e
// l'orizzonte proposto. Erano fissi nel codice (27,9%, ±50%, 20%, 5 anni):
// qui diventano una decisione dell'ente, per il proprio spazio.
//
// Un valore assente vale il predefinito: il pulsante «Torna ai valori di
// sistema» cancella quelli dello spazio, non ne scrive di uguali.

import React, { useEffect, useState } from 'react';
import { Save, RotateCcw, SlidersHorizontal, Plus, Trash2, Globe } from 'lucide-react';
import {
  ottieniParametriContestoAction,
  ottieniParametriPianoSimulazioneAction,
  salvaParametriContestoAction,
  salvaParametriPianoSimulazioneAction,
} from '@/app/actions/parametriPianoSimulazione';
import {
  ETICHETTA_TIPO_CONTESTO,
  PARAMETRI_CONTESTO_ESEMPIO,
  TIPI_PARAMETRO_CONTESTO,
  type ParametroContesto,
} from '@/lib/piano/parametriContesto';
import {
  LIMITI_PARAMETRI_SIMULAZIONE,
  PARAMETRI_SIMULAZIONE_PREDEFINITI,
  type ParametriSimulazionePiano,
} from '@/lib/piano/parametriSimulazione';

const CAMPI = Object.keys(LIMITI_PARAMETRI_SIMULAZIONE) as (keyof ParametriSimulazionePiano)[];

/** Che cosa governa ciascun parametro, detto in una riga. */
const SPIEGAZIONE: Record<keyof ParametriSimulazionePiano, string> = {
  aliquotaImposteDefault:
    'Quando lo storico non rivela l’aliquota (imposte diviso utile ante imposte) e l’AI non la indica, il piano calcola le imposte con questa. Predefinito di sistema: 27,9% (IRES 24% + IRAP 3,9%).',
  variazioneMassimaPct:
    'Quanto può spostare una manopola, in aumento o in diminuzione. Un’ipotesi oltre questo limite viene scartata e dichiarata, non forzata entro il tetto. Predefinito: 50%.',
  limiteTassoCrescita:
    'Il tetto al tasso annuo del piano automatico di settore: oltre, la serie ISTAT non è un riferimento credibile per una singola impresa, e il piano automatico usa il tetto. Predefinito: 20%.',
  orizzonteDefault:
    'Gli anni proposti quando si apre un piano che non ne ha ancora uno salvato. Predefinito: 5 anni.',
  intensitaMinimaAttenzione:
    'Da quale intensità (0-100) una dimensione del riquadro «Dove si concentra l’attenzione» della verifica contabile entra nella simulazione come vincolo: struttura, dinamica, affidabilità, quadro procedurale. Predefinito: 50, la stessa soglia con cui la contabile sceglie i suoi determinanti.',
};

export function ParametriPianoSimulazioneManager({ nomeSchema }: { nomeSchema: string }) {
  const [valori, setValori] = useState<ParametriSimulazionePiano>(
    PARAMETRI_SIMULAZIONE_PREDEFINITI
  );
  const [personalizzati, setPersonalizzati] = useState(false);
  const [caricamento, setCaricamento] = useState(true);
  const [salvataggio, setSalvataggio] = useState(false);
  const [messaggio, setMessaggio] = useState<{ ok: boolean; testo: string } | null>(null);
  // IL CONTESTO ECONOMICO DEL PIANO (0.256.18): un elenco, non una riga unica.
  const [righe, setRighe] = useState<ParametroContesto[]>([]);
  const [messaggioContesto, setMessaggioContesto] = useState<{
    ok: boolean;
    testo: string;
  } | null>(null);
  const [salvataggioContesto, setSalvataggioContesto] = useState(false);

  const caricaContesto = async () => {
    const r = await ottieniParametriContestoAction(nomeSchema);
    if (r.success && r.righe) setRighe(r.righe);
    else setMessaggioContesto({ ok: false, testo: r.error ?? 'Contesto non leggibile.' });
  };

  const salvaContesto = async () => {
    setSalvataggioContesto(true);
    setMessaggioContesto(null);
    const r = await salvaParametriContestoAction(nomeSchema, righe);
    setMessaggioContesto(
      r.success
        ? {
            ok: true,
            testo:
              'Contesto salvato: entra nel presupposto di ogni piano sviluppato con l’AI, simulato o presentato dall’azienda.',
          }
        : { ok: false, testo: r.error ?? 'Salvataggio non riuscito.' }
    );
    if (r.success && r.righe) setRighe(r.righe);
    setSalvataggioContesto(false);
  };

  /** Gli esempi entrano senza valori: la cifra la scrive l'ente. */
  const caricaEsempi = () => {
    setRighe((prev) => {
      const presenti = new Set(prev.map((p) => p.descrizione.trim().toLowerCase()));
      const nuove = PARAMETRI_CONTESTO_ESEMPIO.filter(
        (e) => !presenti.has(e.descrizione.toLowerCase())
      ).map((e) => ({ ...e }));
      return [...prev, ...nuove];
    });
    setMessaggioContesto({
      ok: true,
      testo:
        'Esempi aggiunti con il valore vuoto: compila i valori che valgono per il tuo territorio e salva. Una voce senza valore non entra nel piano.',
    });
  };

  const carica = async () => {
    const r = await ottieniParametriPianoSimulazioneAction(nomeSchema);
    if (r.success && r.parametri) {
      setValori(r.parametri);
      setPersonalizzati(r.personalizzati === true);
    } else {
      setMessaggio({ ok: false, testo: r.error ?? 'Parametri non leggibili.' });
    }
    setCaricamento(false);
  };
  useEffect(() => {
    carica();
    caricaContesto();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nomeSchema]);

  const salva = async (sistema: boolean) => {
    setSalvataggio(true);
    setMessaggio(null);
    const r = await salvaParametriPianoSimulazioneAction(nomeSchema, sistema ? null : valori);
    setMessaggio(
      r.success
        ? {
            ok: true,
            testo: sistema
              ? 'Valori di sistema ripristinati: la simulazione torna a 27,9%, ±50%, 20% e 5 anni.'
              : 'Parametri salvati: valgono per la simulazione del piano di tutte le aziende dello spazio.',
          }
        : { ok: false, testo: r.error ?? 'Salvataggio non riuscito.' }
    );
    if (r.success && r.parametri) {
      setValori(r.parametri);
      setPersonalizzati(r.personalizzati === true);
    }
    setSalvataggio(false);
  };

  if (caricamento) return <p className="text-xs text-slate-400">Caricamento…</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2">
        <SlidersHorizontal className="w-4 h-4 text-blue-600 mt-0.5" />
        <div>
          <h2 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
            Piano e simulazione AI
          </h2>
          <p className="text-[11px] text-slate-600 mt-1 max-w-3xl leading-relaxed">
            Le leve che l’AI usa quando scrive le ipotesi del piano di sviluppo e che il motore
            applica nel calcolo. Non sono risultati: sono i limiti entro cui il piano si muove.
            Senza un valore impostato valgono quelli di sistema, indicati accanto a ogni campo.
          </p>
        </div>
      </div>

      {messaggio && (
        <p
          className={`text-xs rounded-lg p-2 border ${
            messaggio.ok
              ? 'text-emerald-800 bg-emerald-50 border-emerald-200'
              : 'text-red-800 bg-red-50 border-red-200'
          }`}
        >
          {messaggio.testo}
        </p>
      )}

      <div className="space-y-3">
        {CAMPI.map((campo) => {
          const limite = LIMITI_PARAMETRI_SIMULAZIONE[campo];
          return (
            <div
              key={campo}
              className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_140px] items-start rounded-lg border border-slate-200 p-3"
            >
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
                  {limite.etichetta}
                </p>
                <p className="text-[10px] text-slate-500 leading-relaxed mt-0.5">
                  {SPIEGAZIONE[campo]}
                </p>
              </div>
              <label className="text-[10px] text-slate-500">
                <span className="block text-right">
                  fra {limite.min} e {limite.max} {limite.unita}
                </span>
                <input
                  type="number"
                  min={limite.min}
                  max={limite.max}
                  step={campo === 'orizzonteDefault' ? 1 : 0.1}
                  value={valori[campo]}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    setValori((prev) => ({
                      ...prev,
                      [campo]: Number.isFinite(n) ? n : prev[campo],
                    }));
                  }}
                  className="mt-1 w-full p-2 text-sm text-right border border-slate-200 rounded-lg bg-white text-slate-900"
                />
                <span className="block text-right mt-0.5">
                  sistema: {PARAMETRI_SIMULAZIONE_PREDEFINITI[campo].toLocaleString('it-IT')}{' '}
                  {limite.unita}
                </span>
              </label>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => salva(false)}
          disabled={salvataggio}
          className="flex items-center gap-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-bold text-[10px] uppercase rounded-lg"
        >
          <Save className="w-3.5 h-3.5" /> Salva i parametri
        </button>
        {personalizzati && (
          <button
            type="button"
            onClick={() => salva(true)}
            disabled={salvataggio}
            className="flex items-center gap-1 px-3 py-2 bg-slate-100 hover:bg-slate-200 disabled:opacity-60 text-slate-700 font-bold text-[10px] uppercase rounded-lg"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Torna ai valori di sistema
          </button>
        )}
        <span className="text-[11px] text-slate-500">
          {personalizzati ? 'Parametri propri dello spazio.' : 'Valori di sistema.'}
        </span>
      </div>

      {/* IL CONTESTO ECONOMICO DEL PIANO (0.256.18). Non sono leve del
          motore: sono fatti del mondo che il piano deve tenere presenti. Stanno
          nei Parametri perché non variano per azienda, e valgono sia per il
          piano simulato sia per quello che l'azienda presenta. */}
      <div className="border-t border-slate-200 pt-4 space-y-2">
        <div className="flex items-start gap-2">
          <Globe className="w-4 h-4 text-blue-600 mt-0.5" />
          <div>
            <h2 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
              Contesto economico del piano
            </h2>
            <p className="text-[11px] text-slate-600 mt-1 max-w-3xl leading-relaxed">
              I fattori che possono influenzare lo sviluppo del piano aziendale — inflazione,
              spread, costo del carburante, incidenza di crisi internazionali e di instabilità
              politica, tecnologia. Sono il presupposto con cui l’AI sviluppa il piano, sia simulato
              sia presentato dall’azienda, e valgono per tutte le aziende dello spazio perché non
              variano da impresa a impresa.
            </p>
          </div>
        </div>

        {messaggioContesto && (
          <p
            className={`text-xs rounded-lg p-2 border ${
              messaggioContesto.ok
                ? 'text-emerald-800 bg-emerald-50 border-emerald-200'
                : 'text-red-800 bg-red-50 border-red-200'
            }`}
          >
            {messaggioContesto.testo}
          </p>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-slate-800">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-slate-500 text-left">
                <th className="p-1.5 font-bold">Descrizione</th>
                <th className="p-1.5 font-bold">Valore</th>
                <th className="p-1.5 font-bold">Forma del valore</th>
                <th className="p-1.5 font-bold w-10"> </th>
              </tr>
            </thead>
            <tbody>
              {righe.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-2 text-[11px] text-slate-500 leading-relaxed">
                    Nessun parametro del contesto. Aggiungi le voci che valgono per il tuo
                    territorio — o parti dagli esempi, che entrano senza valori.
                  </td>
                </tr>
              ) : (
                righe.map((r, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    <td className="p-1.5">
                      <input
                        type="text"
                        value={r.descrizione}
                        maxLength={120}
                        onChange={(e) =>
                          setRighe((prev) =>
                            prev.map((x, j) =>
                              j === i ? { ...x, descrizione: e.target.value } : x
                            )
                          )
                        }
                        placeholder="inflazione attesa"
                        className="w-full p-1.5 border border-slate-200 rounded-lg bg-white text-slate-900"
                      />
                    </td>
                    <td className="p-1.5">
                      <input
                        type="text"
                        value={r.valore}
                        maxLength={200}
                        onChange={(e) =>
                          setRighe((prev) =>
                            prev.map((x, j) => (j === i ? { ...x, valore: e.target.value } : x))
                          )
                        }
                        placeholder={r.tipo === 'TENDENZA' ? 'in aumento' : '2,1'}
                        className="w-full p-1.5 border border-slate-200 rounded-lg bg-white text-slate-900"
                      />
                    </td>
                    <td className="p-1.5">
                      <select
                        value={r.tipo}
                        onChange={(e) =>
                          setRighe((prev) =>
                            prev.map((x, j) =>
                              j === i
                                ? { ...x, tipo: e.target.value as ParametroContesto['tipo'] }
                                : x
                            )
                          )
                        }
                        className="w-full p-1.5 border border-slate-200 rounded-lg bg-white text-slate-900"
                      >
                        {TIPI_PARAMETRO_CONTESTO.map((t) => (
                          <option key={t} value={t}>
                            {ETICHETTA_TIPO_CONTESTO[t]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="p-1.5 text-right">
                      <button
                        type="button"
                        title="Elimina la riga"
                        onClick={() => setRighe((prev) => prev.filter((_, j) => j !== i))}
                        className="p-1.5 text-slate-400 hover:text-red-700"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() =>
              setRighe((prev) => [...prev, { descrizione: '', valore: '', tipo: 'PERCENTUALE' }])
            }
            className="flex items-center gap-1 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[10px] uppercase rounded-lg"
          >
            <Plus className="w-3.5 h-3.5" /> Aggiungi una riga
          </button>
          <button
            type="button"
            onClick={caricaEsempi}
            className="flex items-center gap-1 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[10px] uppercase rounded-lg"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Carica gli esempi
          </button>
          <button
            type="button"
            onClick={salvaContesto}
            disabled={salvataggioContesto}
            className="flex items-center gap-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-bold text-[10px] uppercase rounded-lg"
          >
            <Save className="w-3.5 h-3.5" /> Salva il contesto
          </button>
          <span className="text-[11px] text-slate-500">
            {righe.filter((r) => r.descrizione.trim()).length} voci,{' '}
            {righe.filter((r) => r.descrizione.trim() && r.valore.trim()).length} con un valore.
          </span>
        </div>
        <p className="text-[10px] text-slate-500 leading-relaxed">
          Una voce senza valore resta un fattore dichiarato ma non misurato: entra nel piano come
          «valore non indicato», non come zero. La tendina dice che cosa è il valore — un importo in
          euro, una percentuale, una previsione a tendere in parole.
        </p>
      </div>

      <p className="text-[10px] text-slate-500 leading-relaxed">
        Le soglie dei semafori del confronto con il piano di settore restano dove sono sempre state:
        Parametri › Confronto con il piano di settore.
      </p>
    </div>
  );
}
