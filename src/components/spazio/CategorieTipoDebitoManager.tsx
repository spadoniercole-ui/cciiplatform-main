'use client';

// Gestione delle CATEGORIE tipo debito parametriche di spazio (default
// Debito/AVA/Neutro). Sono le scelte con cui i tracciati classificano i
// debiti dell'ente. Aggiungibili, rinominabili, disattivabili — i codici
// legacy (CLE/CEN/CEC/CEA) non stanno qui e restano validi per i dati vecchi.

import React, { useEffect, useState } from 'react';
import { Plus, Save, Eye, EyeOff, Scale } from 'lucide-react';
import {
  ottieniCategorieTipoDebito,
  creaCategoriaTipoDebitoAction,
  aggiornaCategoriaTipoDebitoAction,
  impostaAttivoCategoriaTipoDebitoAction,
  type CategoriaTipoDebito,
} from '@/app/actions/categorieTipoDebito';

interface Props {
  nomeSchema: string;
}

export function CategorieTipoDebitoManager({ nomeSchema }: Props) {
  const [categorie, setCategorie] = useState<CategoriaTipoDebito[]>([]);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);
  const [nuovaEtichetta, setNuovaEtichetta] = useState('');
  const [nuovaDescrizione, setNuovaDescrizione] = useState('');
  const [inCorso, setInCorso] = useState(false);
  const [bozze, setBozze] = useState<Record<string, { etichetta: string; descrizione: string }>>(
    {}
  );

  const carica = async () => {
    setCaricamento(true);
    const r = await ottieniCategorieTipoDebito(nomeSchema);
    if (r.success) {
      setCategorie(r.categorie);
      setBozze(
        Object.fromEntries(
          r.categorie.map((c) => [
            c.codice,
            { etichetta: c.etichetta, descrizione: c.descrizione || '' },
          ])
        )
      );
    } else setErrore(r.error || 'Impossibile caricare le categorie.');
    setCaricamento(false);
  };

  useEffect(() => {
    carica();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nomeSchema]);

  const handleCrea = async () => {
    if (!nuovaEtichetta.trim()) {
      setErrore("Inserisci l'etichetta della nuova categoria.");
      return;
    }
    setInCorso(true);
    setErrore(null);
    const r = await creaCategoriaTipoDebitoAction(nomeSchema, nuovaEtichetta, nuovaDescrizione);
    if (!r.success) setErrore(r.error || 'Impossibile creare la categoria.');
    else {
      setNuovaEtichetta('');
      setNuovaDescrizione('');
      await carica();
    }
    setInCorso(false);
  };

  const handleSalva = async (codice: string) => {
    const b = bozze[codice];
    if (!b || !b.etichetta.trim()) {
      setErrore("L'etichetta non può essere vuota.");
      return;
    }
    setInCorso(true);
    setErrore(null);
    const r = await aggiornaCategoriaTipoDebitoAction(
      nomeSchema,
      codice,
      b.etichetta,
      b.descrizione
    );
    if (!r.success) setErrore(r.error || 'Impossibile salvare.');
    else await carica();
    setInCorso(false);
  };

  const handleToggle = async (c: CategoriaTipoDebito) => {
    setInCorso(true);
    const r = await impostaAttivoCategoriaTipoDebitoAction(nomeSchema, c.codice, !c.attivo);
    if (!r.success) setErrore(r.error || 'Impossibile aggiornare.');
    else await carica();
    setInCorso(false);
  };

  if (caricamento) return <p className="text-xs text-slate-400">Caricamento...</p>;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Scale className="w-4 h-4 text-slate-500" />
        <h2 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
          Categorie tipo debito
        </h2>
      </div>
      <p className="text-[11px] text-slate-500">
        Sono le categorie con cui i tracciati classificano i debiti dell&apos;ente. Di default:
        Debito, AVA, Neutro. Puoi aggiungerne, rinominarle o disattivarle (una categoria disattivata
        non è più proponibile nei nuovi caricamenti, ma i dati già classificati restano).
      </p>

      {errore && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          {errore}
        </div>
      )}

      <div className="space-y-2">
        {categorie.map((c) => (
          <div
            key={c.codice}
            className={`border rounded-lg p-3 ${c.attivo ? 'border-slate-200' : 'border-slate-200 bg-slate-50 opacity-70'}`}
          >
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-[10px] text-slate-400 uppercase min-w-[70px]">
                {c.codice}
              </span>
              <input
                type="text"
                value={bozze[c.codice]?.etichetta ?? ''}
                onChange={(e) =>
                  setBozze({
                    ...bozze,
                    [c.codice]: { ...bozze[c.codice], etichetta: e.target.value },
                  })
                }
                className="p-1.5 text-xs border border-slate-200 rounded-lg text-slate-900 bg-white w-32"
                placeholder="Etichetta"
              />
              <input
                type="text"
                value={bozze[c.codice]?.descrizione ?? ''}
                onChange={(e) =>
                  setBozze({
                    ...bozze,
                    [c.codice]: { ...bozze[c.codice], descrizione: e.target.value },
                  })
                }
                className="p-1.5 text-xs border border-slate-200 rounded-lg text-slate-900 bg-white flex-1 min-w-[140px]"
                placeholder="Descrizione (facoltativa)"
              />
              <button
                type="button"
                onClick={() => handleSalva(c.codice)}
                disabled={inCorso}
                className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white font-bold text-[10px] uppercase rounded-lg"
              >
                <Save className="w-3 h-3" /> Salva
              </button>
              <button
                type="button"
                onClick={() => handleToggle(c)}
                disabled={inCorso}
                title={c.attivo ? 'Disattiva' : 'Riattiva'}
                className="p-1.5 text-slate-400 hover:text-slate-700"
              >
                {c.attivo ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-slate-100 pt-4 space-y-2">
        <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
          Nuova categoria
        </h3>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="text"
            value={nuovaEtichetta}
            onChange={(e) => setNuovaEtichetta(e.target.value)}
            placeholder="Etichetta (es. Contenzioso)"
            className="p-2 text-xs border border-slate-200 rounded-lg text-slate-900 bg-white w-40"
          />
          <input
            type="text"
            value={nuovaDescrizione}
            onChange={(e) => setNuovaDescrizione(e.target.value)}
            placeholder="Descrizione (facoltativa)"
            className="p-2 text-xs border border-slate-200 rounded-lg text-slate-900 bg-white flex-1 min-w-[160px]"
          />
          <button
            type="button"
            onClick={handleCrea}
            disabled={inCorso}
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-bold text-[10px] uppercase rounded-lg"
          >
            <Plus className="w-3.5 h-3.5" /> Aggiungi
          </button>
        </div>
      </div>
    </div>
  );
}
