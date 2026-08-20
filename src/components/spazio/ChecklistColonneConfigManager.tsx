'use client';

import React, { useEffect, useState } from 'react';
import { Columns3, Plus, X } from 'lucide-react';
import {
  ottieniColonneChecklist,
  aggiornaColonnaChecklistAction,
  aggiornaPesoDefaultChecklistAction,
  aggiungiCampoExtraChecklistAction,
  eliminaCampoExtraChecklistAction,
  type EtichettaColonnaChecklist,
  type CampoExtraChecklist,
} from '@/app/actions/checklistColonneConfig';
import type { PesoDomanda } from '@/lib/checklist/ministeriale';

interface Props {
  nomeSchema: string;
}

const PESI: PesoDomanda[] = ['STRUTTURALE', 'RILEVANTE', 'DOCUMENTALE'];

export function ChecklistColonneConfigManager({ nomeSchema }: Props) {
  const [colonne, setColonne] = useState<EtichettaColonnaChecklist[]>([]);
  const [campiExtra, setCampiExtra] = useState<CampoExtraChecklist[]>([]);
  const [pesoDefault, setPesoDefault] = useState<PesoDomanda>('RILEVANTE');
  const [nuovoCampoExtra, setNuovoCampoExtra] = useState('');
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);

  const carica = async () => {
    setCaricamento(true);
    const risultato = await ottieniColonneChecklist(nomeSchema);
    if (risultato.success) {
      setColonne(risultato.colonne);
      setCampiExtra(risultato.campiExtra);
      setPesoDefault(risultato.pesoDefault);
    } else {
      setErrore(risultato.error || 'Impossibile caricare le colonne.');
    }
    setCaricamento(false);
  };

  useEffect(() => {
    carica();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nomeSchema]);

  const handleCambiaEtichetta = async (
    campo: EtichettaColonnaChecklist['campo'],
    etichetta: string
  ) => {
    setColonne((prev) => prev.map((c) => (c.campo === campo ? { ...c, etichetta } : c)));
    await aggiornaColonnaChecklistAction(nomeSchema, campo, { etichetta: etichetta || campo });
  };

  const handleToggleAttivo = async (campo: EtichettaColonnaChecklist['campo'], attivo: boolean) => {
    if (campo === 'sezioneNumero' || campo === 'sezioneTitolo') {
      setColonne((prev) =>
        prev.map((c) =>
          c.campo === 'sezioneNumero' || c.campo === 'sezioneTitolo' ? { ...c, attivo } : c
        )
      );
    } else {
      setColonne((prev) => prev.map((c) => (c.campo === campo ? { ...c, attivo } : c)));
    }
    await aggiornaColonnaChecklistAction(nomeSchema, campo, { attivo });
  };

  const handleCambiaPesoDefault = async (peso: PesoDomanda) => {
    setPesoDefault(peso);
    await aggiornaPesoDefaultChecklistAction(nomeSchema, peso);
  };

  const handleAggiungiCampoExtra = async () => {
    if (!nuovoCampoExtra.trim()) return;
    const risultato = await aggiungiCampoExtraChecklistAction(nomeSchema, nuovoCampoExtra);
    if (risultato.success) {
      setNuovoCampoExtra('');
      await carica();
    } else {
      setErrore(risultato.error || 'Impossibile aggiungere il campo.');
    }
  };

  const handleEliminaCampoExtra = async (id: number) => {
    setCampiExtra((prev) => prev.filter((c) => c.id !== id));
    await eliminaCampoExtraChecklistAction(nomeSchema, id);
  };

  if (caricamento) return <p className="text-xs text-slate-400">Caricamento...</p>;

  const colonnaPeso = colonne.find((c) => c.campo === 'peso');
  const altreColonne = colonne.filter((c) => c.campo !== 'peso');

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Columns3 className="w-4 h-4 text-blue-600" />
        <h2 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
          Check List — colonne dei modelli custom
        </h2>
      </div>
      <p className="text-[11px] text-slate-500">
        Ogni colonna è disattivabile e rietichettabile — tranne &quot;Domanda&quot;, senza la quale
        non c&apos;è nulla da rispondere. Se disattivi una colonna, il sistema applica un ripiego
        automatico all&apos;importazione (sezione unica, ID progressivo, peso di default) invece di
        bloccarsi. Puoi anche aggiungere campi tuoi, puramente informativi. Vale per ogni modello
        custom di questo spazio, da questo momento in poi.
      </p>

      {errore && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          {errore}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
        {altreColonne.map((c) => {
          const nonDisattivabile = c.campo === 'domanda';
          return (
            <div key={c.campo} className="flex items-center gap-3">
              <label
                className="flex items-center gap-1.5 shrink-0"
                title={nonDisattivabile ? 'Sempre attiva' : 'Attiva/disattiva'}
              >
                <input
                  type="checkbox"
                  checked={c.attivo}
                  disabled={nonDisattivabile}
                  onChange={(ev) => handleToggleAttivo(c.campo, ev.target.checked)}
                />
              </label>
              <span className="text-[10px] font-bold text-slate-400 uppercase w-24 shrink-0">
                {c.campo}
              </span>
              <input
                type="text"
                value={c.etichetta}
                disabled={!c.attivo}
                onChange={(ev) => handleCambiaEtichetta(c.campo, ev.target.value)}
                className="flex-1 p-2 text-xs border border-slate-200 rounded-lg text-slate-900 bg-white disabled:bg-slate-50 disabled:text-slate-400"
              />
            </div>
          );
        })}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
        <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
          Campi tuoi (fino a 3, puramente informativi)
        </h3>
        {campiExtra.map((c) => (
          <div key={c.id} className="flex items-center gap-2">
            <span className="flex-1 text-xs text-slate-700 p-2 bg-slate-50 border border-slate-200 rounded-lg">
              {c.etichetta}
            </span>
            <button
              type="button"
              onClick={() => handleEliminaCampoExtra(c.id)}
              className="text-slate-400 hover:text-red-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        {campiExtra.length < 3 && (
          <div className="flex gap-2">
            <input
              type="text"
              value={nuovoCampoExtra}
              onChange={(ev) => setNuovoCampoExtra(ev.target.value)}
              placeholder="Es. Riferimento normativo..."
              className="flex-1 p-2 text-xs bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-blue-500 text-slate-900"
            />
            <button
              type="button"
              onClick={handleAggiungiCampoExtra}
              disabled={!nuovoCampoExtra.trim()}
              className="flex items-center gap-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-bold text-[10px] uppercase rounded-lg transition-colors"
            >
              <Plus className="w-3 h-3" /> Aggiungi
            </button>
          </div>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 shrink-0">
            <input
              type="checkbox"
              checked={colonnaPeso?.attivo ?? true}
              onChange={(ev) => handleToggleAttivo('peso', ev.target.checked)}
            />
          </label>
          <span className="text-[10px] font-bold text-slate-400 uppercase w-24 shrink-0">peso</span>
          <input
            type="text"
            value={colonnaPeso?.etichetta || 'Peso'}
            disabled={!(colonnaPeso?.attivo ?? true)}
            onChange={(ev) => handleCambiaEtichetta('peso', ev.target.value)}
            className="flex-1 p-2 text-xs border border-slate-200 rounded-lg text-slate-900 bg-white disabled:bg-slate-50 disabled:text-slate-400"
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
            Peso di default, se la colonna sopra è disattivata
          </label>
          <select
            value={pesoDefault}
            onChange={(ev) => handleCambiaPesoDefault(ev.target.value as PesoDomanda)}
            disabled={colonnaPeso?.attivo ?? true}
            className="w-full sm:w-64 p-2 text-xs bg-white border border-slate-200 rounded-lg text-slate-900 disabled:bg-slate-50 disabled:text-slate-400"
          >
            {PESI.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <p className="text-[10px] text-slate-400 mt-1">
            Applicato a ogni domanda importata quando la colonna Peso è disattivata — il punteggio
            resta calcolabile, solo meno granulare.
          </p>
        </div>
      </div>
    </div>
  );
}
