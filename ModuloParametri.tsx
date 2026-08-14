'use client';

// Gestione Aziende dello spazio: elenco, creazione rapida,
// disabilitazione/riattivazione (soft). La modifica dell'anagrafica non
// vive più qui in un form inline separato: un solo punto di accesso per
// azienda ("Apri") porta alla sua scheda di dettaglio
// (/aziende/[aziendaId]), dove Anagrafica è una delle tab insieme a
// Configurazione XBRL e Indici — niente due schermate diverse per la
// stessa cosa.

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Building2, ArrowRight, Ban, RotateCcw, X } from 'lucide-react';
import {
  ottieniAziende,
  creaAziendaAction,
  disabilitaAziendaAction,
  riattivaAziendaAction,
  type Azienda,
} from '@/app/actions/aziende';

interface Props {
  nomeSchema: string;
  codice: string;
}

interface FormAzienda {
  ragioneSociale: string;
  codiceFiscale: string;
  partitaIva: string;
  codiceAteco: string;
}

const FORM_VUOTO: FormAzienda = {
  ragioneSociale: '',
  codiceFiscale: '',
  partitaIva: '',
  codiceAteco: '',
};

export function AziendeManager({ nomeSchema, codice }: Props) {
  const [aziende, setAziende] = useState<Azienda[]>([]);
  const [caricamento, setCaricamento] = useState(true);
  const [erroreLista, setErroreLista] = useState<string | null>(null);

  const [mostraForm, setMostraForm] = useState(false);
  const [form, setForm] = useState<FormAzienda>(FORM_VUOTO);
  const [salvataggio, setSalvataggio] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  const carica = async () => {
    setCaricamento(true);
    setErroreLista(null);
    try {
      const risultato = await ottieniAziende(nomeSchema);
      if (!risultato.success) {
        setErroreLista(risultato.error || 'Impossibile caricare le aziende.');
      }
      setAziende(risultato.aziende);
    } catch (err: any) {
      setErroreLista(`Impossibile caricare le aziende: ${err.message || err}`);
    } finally {
      setCaricamento(false);
    }
  };

  useEffect(() => {
    carica();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nomeSchema]);

  const apriCreazione = () => {
    setForm(FORM_VUOTO);
    setErrore(null);
    setMostraForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSalvataggio(true);
    setErrore(null);

    try {
      const risultato = await creaAziendaAction(nomeSchema, form);
      if (!risultato.success) {
        setErrore(risultato.error || "Errore durante la creazione dell'azienda.");
        return;
      }
      setMostraForm(false);
      await carica();
    } catch (err: any) {
      setErrore(`Impossibile completare la richiesta: ${err.message || err}`);
    } finally {
      setSalvataggio(false);
    }
  };

  const handleToggleStato = async (azienda: Azienda) => {
    const azione = azienda.attiva ? disabilitaAziendaAction : riattivaAziendaAction;
    const risultato = await azione(nomeSchema, azienda.id);
    if (!risultato.success) {
      alert(risultato.error || 'Operazione fallita.');
    }
    await carica();
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Aziende</h1>
          <p className="text-slate-500 text-xs mt-1">
            Le analisi (check list, indici, XBRL) saranno sempre riferite a una specifica azienda.
          </p>
        </div>
        <button
          type="button"
          onClick={apriCreazione}
          className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-[11px] uppercase tracking-wider rounded-lg transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> Nuova Azienda
        </button>
      </div>

      {mostraForm && (
        <form
          onSubmit={handleSubmit}
          className="bg-white border border-slate-200 rounded-xl p-6 space-y-4"
        >
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
              Nuova Azienda
            </h2>
            <button
              type="button"
              onClick={() => setMostraForm(false)}
              className="text-slate-400 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {errore && (
            <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
              {errore}
            </div>
          )}

          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">
              Ragione Sociale
            </label>
            <input
              type="text"
              value={form.ragioneSociale}
              onChange={(e) => setForm({ ...form, ragioneSociale: e.target.value })}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-blue-500 text-slate-900"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">
                Codice Fiscale
              </label>
              <input
                type="text"
                value={form.codiceFiscale}
                onChange={(e) => setForm({ ...form, codiceFiscale: e.target.value })}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-blue-500 text-slate-900 font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">
                Partita IVA
              </label>
              <input
                type="text"
                value={form.partitaIva}
                onChange={(e) => setForm({ ...form, partitaIva: e.target.value })}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-blue-500 text-slate-900 font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">
              Codice ATECO
            </label>
            <input
              type="text"
              value={form.codiceAteco}
              onChange={(e) => setForm({ ...form, codiceAteco: e.target.value })}
              placeholder="Es. 52.25.09"
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-blue-500 text-slate-900 font-mono"
            />
            <p className="text-[10px] text-amber-600 mt-1">
              Non obbligatorio, ma senza questo i Dati di Settore (confronto ISTAT con il tuo
              settore) non si caricano in automatico — potrai aggiungerlo più tardi.
            </p>
          </div>

          <p className="text-[10px] text-slate-400">
            Il logo aziendale non è ancora gestito: verrà aggiunto insieme al modulo Report.
          </p>

          <button
            type="submit"
            disabled={salvataggio}
            className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white font-bold uppercase tracking-wider rounded-lg text-xs transition-colors"
          >
            {salvataggio ? 'Salvataggio...' : 'Crea Azienda'}
          </button>
        </form>
      )}

      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3 mb-4">
          <Building2 className="w-4 h-4 text-slate-500" />
          <h2 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
            Aziende esistenti ({aziende.length})
          </h2>
        </div>

        {erroreLista && (
          <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 mb-3">
            {erroreLista}
          </div>
        )}
        {caricamento && <p className="text-xs text-slate-400">Caricamento...</p>}
        {!caricamento && !erroreLista && aziende.length === 0 && (
          <p className="text-xs text-slate-400">Nessuna azienda creata finora.</p>
        )}

        <div className="space-y-2">
          {aziende.map((azienda) => (
            <div
              key={azienda.id}
              className={`border rounded-lg p-3 flex flex-wrap justify-between items-center gap-3 ${
                azienda.attiva ? 'border-slate-200' : 'border-slate-200 bg-slate-50 opacity-70'
              }`}
            >
              <Link
                href={`/spazio/${codice}/aziende/${azienda.id}`}
                className="flex-1 min-w-0 group"
              >
                <div className="font-bold text-slate-900 text-xs group-hover:text-blue-600 transition-colors">
                  {azienda.ragioneSociale}
                </div>
                <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                  {azienda.codiceFiscale || 'CF N/D'} · {azienda.partitaIva || 'P.IVA N/D'} · ATECO{' '}
                  {azienda.codiceAteco || 'N/D'}
                </div>
              </Link>

              <div className="flex items-center gap-2">
                <span
                  className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                    azienda.attiva
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {azienda.attiva ? 'Attiva' : 'Disabilitata'}
                </span>
                <button
                  type="button"
                  onClick={() => handleToggleStato(azienda)}
                  className="p-1.5 text-slate-400 hover:text-red-600"
                  title={azienda.attiva ? 'Disabilita' : 'Riattiva'}
                >
                  {azienda.attiva ? (
                    <Ban className="w-3.5 h-3.5" />
                  ) : (
                    <RotateCcw className="w-3.5 h-3.5" />
                  )}
                </button>
                <Link
                  href={`/spazio/${codice}/aziende/${azienda.id}`}
                  className="flex items-center gap-1 p-1.5 text-slate-400 hover:text-blue-600"
                  title="Apri scheda azienda"
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
