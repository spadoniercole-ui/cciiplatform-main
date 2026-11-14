'use client';

// IL FLUSSO CHE L'ENTE RICEVE — parametri dello spazio.
//
// Ogni ente riceve dall'azienda qualcosa di diverso e con un calendario
// diverso: l'INPS denunce mensili e deleghe F24, l'INAIL un'autoliquidazione
// annuale che si paga in quattro rate, l'Agenzia delle Entrate dichiarazioni
// annuali e liquidazioni IVA periodiche. Qui si dice che cosa riceve questo
// ente, ogni quanto e entro quale giorno: da questi valori il motore ricava i
// periodi attesi e i ritardi.
//
// I profili arrivano già compilati con i valori più diffusi. Sono un punto di
// partenza modificabile: la piattaforma dichiara il calendario che usa, non lo
// fa passare per una fonte di legge.

import React, { useEffect, useState } from 'react';
import { CalendarClock, Check, Loader2, Plus, Trash2 } from 'lucide-react';
import {
  eliminaProfiloFlusso,
  ottieniProfiliFlusso,
  salvaProfiloFlusso,
} from '@/app/actions/flussiEnte';
import {
  PERIODICITA,
  TIPI_FLUSSO,
  ULTIMO_GIORNO,
  type ProfiloFlusso,
} from '@/lib/flussiEnte/profilo';

const CLASSE_CAMPO =
  'w-full p-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900';
const CLASSE_ETICHETTA = 'block text-[9px] font-bold text-slate-400 uppercase mb-1';

const VUOTO: Omit<ProfiloFlusso, 'id'> & { id: number } = {
  id: 0,
  tipo: 'ALTRO',
  flusso: '',
  etichettaDenuncia: 'denunce',
  etichettaPagamento: 'pagamenti',
  periodicita: 'MENSILE',
  periodiPerAnno: 12,
  scadenzaDenunciaGiorno: ULTIMO_GIORNO,
  scadenzaDenunciaMesiDopo: 1,
  scadenzaPagamentoGiorno: 15,
  scadenzaPagamentoMesiDopo: 1,
  rate: 1,
  attivo: true,
};

const giorno = (g: number) => (g === ULTIMO_GIORNO ? 'ultimo del mese' : `giorno ${g}`);

export function FlussoEnteManager({ nomeSchema }: { nomeSchema: string }) {
  const [profili, setProfili] = useState<ProfiloFlusso[]>([]);
  const [bozza, setBozza] = useState<(Omit<ProfiloFlusso, 'id'> & { id: number }) | null>(null);
  const [caricamento, setCaricamento] = useState(true);
  const [salvataggio, setSalvataggio] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  useEffect(() => {
    let attivo = true;
    void (async () => {
      const r = await ottieniProfiliFlusso(nomeSchema);
      if (!attivo) return;
      setProfili(r.profili);
      if (!r.success) setErrore(r.error ?? null);
      setCaricamento(false);
    })();
    return () => {
      attivo = false;
    };
  }, [nomeSchema]);

  const salva = async (profilo: Partial<ProfiloFlusso>) => {
    setSalvataggio(true);
    setErrore(null);
    const r = await salvaProfiloFlusso(nomeSchema, profilo);
    setSalvataggio(false);
    if (!r.success) {
      setErrore(r.error ?? 'Salvataggio non riuscito.');
      return;
    }
    setProfili(r.profili);
    setBozza(null);
  };

  const elimina = async (id: number) => {
    setErrore(null);
    const r = await eliminaProfiloFlusso(nomeSchema, id);
    if (!r.success) {
      setErrore(r.error ?? 'Eliminazione non riuscita.');
      return;
    }
    setProfili(r.profili);
  };

  const aggiorna = (patch: Partial<ProfiloFlusso>) => {
    setBozza((b) => (b ? { ...b, ...patch } : b));
  };

  if (caricamento) {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <Loader2 className="w-4 h-4 animate-spin" /> Carico i profili di flusso…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <CalendarClock className="w-4 h-4 text-blue-600" /> Flusso che l’ente riceve
        </h2>
        <p className="text-[11px] text-slate-600 leading-relaxed mt-1">
          Che cosa l’azienda trasmette a questo ente, ogni quanto e entro quale giorno. Questi
          valori non decidono nulla da soli: servono alla verifica amministrativa per contare i
          periodi attesi, riconoscere quelli mancanti e misurare il ritardo dalla scadenza. I valori
          proposti sono un punto di partenza da confermare, non una fonte normativa.
        </p>
      </div>

      {errore && (
        <p className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">
          {errore}
        </p>
      )}

      {profili.map((p) => (
        <div
          key={p.id}
          className={`border rounded-xl p-4 space-y-3 ${p.attivo ? 'border-slate-200 bg-white' : 'border-slate-200 bg-slate-50'}`}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold text-slate-900">
                {p.flusso || 'Senza nome'}{' '}
                <span className="text-[10px] font-normal text-slate-500">
                  · {TIPI_FLUSSO.find((t) => t.codice === p.tipo)?.etichetta ?? p.tipo} ·{' '}
                  {PERIODICITA.find((x) => x.codice === p.periodicita)?.etichetta ?? p.periodicita}
                </span>
              </p>
              <p className="text-[10px] text-slate-500">
                {p.periodiPerAnno} {p.periodiPerAnno === 1 ? 'periodo' : 'periodi'} l’anno ·
                denuncia {giorno(p.scadenzaDenunciaGiorno)} a {p.scadenzaDenunciaMesiDopo}{' '}
                {p.scadenzaDenunciaMesiDopo === 1 ? 'mese' : 'mesi'} dal periodo · pagamento{' '}
                {giorno(p.scadenzaPagamentoGiorno)} a {p.scadenzaPagamentoMesiDopo}{' '}
                {p.scadenzaPagamentoMesiDopo === 1 ? 'mese' : 'mesi'}
                {p.rate > 1 ? ` · ${p.rate} rate` : ''}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1 text-[10px] text-slate-600">
                <input
                  type="checkbox"
                  checked={p.attivo}
                  onChange={(e) => void salva({ ...p, attivo: e.target.checked })}
                />
                In uso
              </label>
              <button
                type="button"
                onClick={() => setBozza({ ...p })}
                className="text-[10px] font-bold uppercase text-blue-700 hover:underline"
              >
                Modifica
              </button>
              <button
                type="button"
                onClick={() => void elimina(p.id)}
                className="text-slate-400 hover:text-red-600"
                aria-label={`Elimina ${p.flusso}`}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {bozza?.id === p.id && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 border-t border-slate-200 pt-3">
              <div className="col-span-2">
                <label className={CLASSE_ETICHETTA}>Nome del flusso</label>
                <input
                  className={CLASSE_CAMPO}
                  value={bozza.flusso}
                  onChange={(e) => aggiorna({ flusso: e.target.value })}
                />
              </div>
              <div>
                <label className={CLASSE_ETICHETTA}>Ente</label>
                <select
                  className={CLASSE_CAMPO}
                  value={bozza.tipo}
                  onChange={(e) => aggiorna({ tipo: e.target.value as ProfiloFlusso['tipo'] })}
                >
                  {TIPI_FLUSSO.map((t) => (
                    <option key={t.codice} value={t.codice}>
                      {t.etichetta}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={CLASSE_ETICHETTA}>Periodicità</label>
                <select
                  className={CLASSE_CAMPO}
                  value={bozza.periodicita}
                  onChange={(e) =>
                    aggiorna({ periodicita: e.target.value as ProfiloFlusso['periodicita'] })
                  }
                >
                  {PERIODICITA.map((t) => (
                    <option key={t.codice} value={t.codice}>
                      {t.etichetta}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={CLASSE_ETICHETTA}>Periodi l’anno</label>
                <input
                  type="number"
                  min={1}
                  max={12}
                  className={CLASSE_CAMPO}
                  value={bozza.periodiPerAnno}
                  onChange={(e) => aggiorna({ periodiPerAnno: Number(e.target.value) })}
                />
              </div>
              <div>
                <label className={CLASSE_ETICHETTA}>Come si chiama la denuncia</label>
                <input
                  className={CLASSE_CAMPO}
                  value={bozza.etichettaDenuncia}
                  onChange={(e) => aggiorna({ etichettaDenuncia: e.target.value })}
                />
              </div>
              <div>
                <label className={CLASSE_ETICHETTA}>Come si chiama il pagamento</label>
                <input
                  className={CLASSE_CAMPO}
                  value={bozza.etichettaPagamento}
                  onChange={(e) => aggiorna({ etichettaPagamento: e.target.value })}
                />
              </div>
              <div>
                <label className={CLASSE_ETICHETTA}>Giorno scadenza denuncia (0 = ultimo)</label>
                <input
                  type="number"
                  min={0}
                  max={31}
                  className={CLASSE_CAMPO}
                  value={bozza.scadenzaDenunciaGiorno}
                  onChange={(e) => aggiorna({ scadenzaDenunciaGiorno: Number(e.target.value) })}
                />
              </div>
              <div>
                <label className={CLASSE_ETICHETTA}>Mesi dopo il periodo (denuncia)</label>
                <input
                  type="number"
                  min={0}
                  max={12}
                  className={CLASSE_CAMPO}
                  value={bozza.scadenzaDenunciaMesiDopo}
                  onChange={(e) => aggiorna({ scadenzaDenunciaMesiDopo: Number(e.target.value) })}
                />
              </div>
              <div>
                <label className={CLASSE_ETICHETTA}>Giorno scadenza pagamento (0 = ultimo)</label>
                <input
                  type="number"
                  min={0}
                  max={31}
                  className={CLASSE_CAMPO}
                  value={bozza.scadenzaPagamentoGiorno}
                  onChange={(e) => aggiorna({ scadenzaPagamentoGiorno: Number(e.target.value) })}
                />
              </div>
              <div>
                <label className={CLASSE_ETICHETTA}>Mesi dopo il periodo (pagamento)</label>
                <input
                  type="number"
                  min={0}
                  max={12}
                  className={CLASSE_CAMPO}
                  value={bozza.scadenzaPagamentoMesiDopo}
                  onChange={(e) => aggiorna({ scadenzaPagamentoMesiDopo: Number(e.target.value) })}
                />
              </div>
              <div>
                <label className={CLASSE_ETICHETTA}>Rate del pagamento</label>
                <input
                  type="number"
                  min={1}
                  max={4}
                  className={CLASSE_CAMPO}
                  value={bozza.rate}
                  onChange={(e) => aggiorna({ rate: Number(e.target.value) })}
                />
              </div>
              <div className="col-span-2 md:col-span-4 flex items-center gap-2">
                <button
                  type="button"
                  disabled={salvataggio || !bozza.flusso.trim()}
                  onClick={() => void salva({ ...bozza, id: bozza.id })}
                  className="flex items-center gap-1 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-bold text-[10px] uppercase rounded-lg"
                >
                  <Check className="w-3.5 h-3.5" /> Salva
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setBozza(null);
                    void ottieniProfiliFlusso(nomeSchema).then((r) => setProfili(r.profili));
                  }}
                  className="px-3 py-2 border border-slate-300 text-slate-600 font-bold text-[10px] uppercase rounded-lg"
                >
                  Annulla
                </button>
              </div>
            </div>
          )}
        </div>
      ))}

      {bozza && bozza.id === 0 ? (
        <div className="border border-blue-200 bg-blue-50/40 rounded-xl p-4 grid grid-cols-2 md:grid-cols-4 gap-2">
          <div className="col-span-2">
            <label className={CLASSE_ETICHETTA}>Nome del flusso</label>
            <input
              className={CLASSE_CAMPO}
              placeholder="es. Denunce mensili"
              value={bozza.flusso}
              onChange={(e) => aggiorna({ flusso: e.target.value })}
            />
          </div>
          <div>
            <label className={CLASSE_ETICHETTA}>Ente</label>
            <select
              className={CLASSE_CAMPO}
              value={bozza.tipo}
              onChange={(e) => aggiorna({ tipo: e.target.value as ProfiloFlusso['tipo'] })}
            >
              {TIPI_FLUSSO.map((t) => (
                <option key={t.codice} value={t.codice}>
                  {t.etichetta}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={CLASSE_ETICHETTA}>Periodicità</label>
            <select
              className={CLASSE_CAMPO}
              value={bozza.periodicita}
              onChange={(e) =>
                aggiorna({ periodicita: e.target.value as ProfiloFlusso['periodicita'] })
              }
            >
              {PERIODICITA.map((t) => (
                <option key={t.codice} value={t.codice}>
                  {t.etichetta}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={CLASSE_ETICHETTA}>Periodi l’anno</label>
            <input
              type="number"
              min={1}
              max={12}
              className={CLASSE_CAMPO}
              value={bozza.periodiPerAnno}
              onChange={(e) => aggiorna({ periodiPerAnno: Number(e.target.value) })}
            />
          </div>
          <div className="col-span-2 md:col-span-4 flex items-center gap-2">
            <button
              type="button"
              disabled={salvataggio || !bozza.flusso.trim()}
              onClick={() => void salva(bozza)}
              className="flex items-center gap-1 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-bold text-[10px] uppercase rounded-lg"
            >
              <Check className="w-3.5 h-3.5" /> Aggiungi il flusso
            </button>
            <button
              type="button"
              onClick={() => setBozza(null)}
              className="px-3 py-2 border border-slate-300 text-slate-600 font-bold text-[10px] uppercase rounded-lg"
            >
              Annulla
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setBozza({ ...VUOTO })}
          className="flex items-center gap-1 px-3 py-2 border border-slate-300 text-slate-700 font-bold text-[10px] uppercase rounded-lg hover:bg-slate-50"
        >
          <Plus className="w-3.5 h-3.5" /> Aggiungi un flusso
        </button>
      )}
    </div>
  );
}
