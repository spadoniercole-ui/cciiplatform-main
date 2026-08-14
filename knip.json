'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  attivaLicenzaWorkspaceAction,
  salvaParametriSistemaAction,
  importaMatriceCNDCECAction,
  ParametroSistemaInput,
} from '@/app/actions/superadmin';

interface Workspace {
  id: number;
  nome: string;
  codiceFiscale: string;
  licenzaCodice: string;
  scadenza: string;
  attivo: boolean;
}

export default function SuperadminPage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [activeTab, setActiveTab] = useState<
    'licenze' | 'parametri' | 'indici' | 'spazi' | 'cndcec'
  >('licenze');

  const [messaggio, setMessaggio] = useState<{
    tipo: 'success' | 'error';
    testo: string;
  } | null>(null);

  const [workspaceIdSelezionato, setWorkspaceIdSelezionato] = useState<number>(1);
  const [codiceLicenza, setCodiceLicenza] = useState<string>('');

  const [spazi, setSpazi] = useState<Workspace[]>([
    {
      id: 1,
      nome: 'Azienda Alfa S.r.l.',
      codiceFiscale: '01234567890',
      licenzaCodice: 'GOLD-2026-X',
      scadenza: '2026-12-31',
      attivo: true,
    },
    {
      id: 2,
      nome: 'Beta Consulting S.n.c.',
      codiceFiscale: '09876543210',
      licenzaCodice: 'SCADUTA',
      scadenza: '2025-01-01',
      attivo: false,
    },
  ]);

  const [parametri, setParametri] = useState<ParametroSistemaInput[]>([
    {
      chiave: 'DSCR_SOGLIA_MINIMA',
      valore: '1.0',
      descrizione: 'Rapporto di copertura del debito minimo ammissibile',
    },
    {
      chiave: 'PATRIMONIO_NETTO_MINIMO',
      valore: '0',
      descrizione: 'Soglia limite patrimonio netto prima di allerta',
    },
    {
      chiave: 'ANNO_RIFERIMENTO_XBRL',
      valore: '2026',
      descrizione: 'Anno di default per analisi bilanci XBRL',
    },
  ]);

  const handleAttivaLicenza = (e: React.FormEvent) => {
    e.preventDefault();
    setMessaggio(null);

    if (!codiceLicenza.trim()) {
      setMessaggio({
        tipo: 'error',
        testo: 'Inserisci un codice licenza valido prima di inviare.',
      });
      return;
    }

    startTransition(async () => {
      const risultato = await attivaLicenzaWorkspaceAction({
        workspaceId: workspaceIdSelezionato,
        codiceLicenza: codiceLicenza.trim(),
      });

      if (risultato.success) {
        setMessaggio({
          tipo: 'success',
          testo: 'Licenza attivata con successo nel Database.',
        });

        setSpazi((prev) =>
          prev.map((s) =>
            s.id === workspaceIdSelezionato
              ? { ...s, attivo: true, licenzaCodice: codiceLicenza.trim() }
              : s
          )
        );

        setCodiceLicenza('');
        router.refresh();
      } else {
        setMessaggio({
          tipo: 'error',
          testo: risultato.error || 'Errore durante la registrazione della licenza.',
        });
      }
    });
  };

  const handleSalvaParametri = (e: React.FormEvent) => {
    e.preventDefault();
    setMessaggio(null);

    startTransition(async () => {
      const risultato = await salvaParametriSistemaAction(parametri);

      if (risultato.success) {
        setMessaggio({
          tipo: 'success',
          testo: 'Parametri di sistema salvati con successo.',
        });
        router.refresh();
      } else {
        setMessaggio({
          tipo: 'error',
          testo: risultato.error || 'Impossibile salvare i parametri.',
        });
      }
    });
  };

  const handleImportaCNDCEC = () => {
    setMessaggio(null);

    startTransition(async () => {
      const risultato = await importaMatriceCNDCECAction();

      if (risultato.success) {
        setMessaggio({
          tipo: 'success',
          testo: 'Matrice CNDCEC e Indici di Crisi aggiornati correttamente.',
        });
        router.refresh();
      } else {
        setMessaggio({
          tipo: 'error',
          testo: risultato.error || 'Errore durante la sincronizzazione.',
        });
      }
    });
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8 font-mono">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-6 border-b border-zinc-800">
        <div>
          <h1 className="text-2xl font-black text-white tracking-wider uppercase">
            Pannello di Controllo Superadmin
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Gestione tenant, licenze workspace, parametri CNDCEC e indici di crisi.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse"></span>
            SYSTEM SYNC ACTIVE
          </span>
        </div>
      </div>

      {messaggio && (
        <div
          className={`p-4 rounded-xl text-xs font-bold flex items-center justify-between border ${
            messaggio.tipo === 'success'
              ? 'bg-emerald-950/40 text-emerald-400 border-emerald-800'
              : 'bg-red-950/40 text-red-400 border-red-800'
          }`}
        >
          <span>{messaggio.testo}</span>
          <button
            onClick={() => setMessaggio(null)}
            className="text-zinc-500 hover:text-white font-bold px-2"
          >
            ✕
          </button>
        </div>
      )}

      <div className="flex overflow-x-auto gap-2 border-b border-zinc-800 pb-2">
        {[
          { id: 'licenze', label: '🔑 Licenze & Workspace' },
          { id: 'parametri', label: '⚙️ Parametri Sistema' },
          { id: 'indici', label: '📊 Dizionario Indici' },
          { id: 'spazi', label: '📁 Spazi di Lavoro' },
          { id: 'cndcec', label: '🏛️ Import CNDCEC' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => {
              setActiveTab(tab.id as any);
              setMessaggio(null);
            }}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all uppercase whitespace-nowrap ${
              activeTab === tab.id
                ? 'bg-blue-600 text-white shadow-lg'
                : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'licenze' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1 bg-zinc-900/50 border border-zinc-800 p-6 rounded-2xl space-y-6">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              Attiva / Rinnova Licenza
            </h2>
            <form onSubmit={handleAttivaLicenza} className="space-y-4">
              <div>
                <label className="block text-zinc-400 text-[11px] uppercase mb-2">
                  Seleziona Workspace
                </label>
                <select
                  value={workspaceIdSelezionato}
                  onChange={(e) => setWorkspaceIdSelezionato(Number(e.target.value))}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-blue-500"
                >
                  {spazi.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.nome} ({w.attivo ? 'Attivo' : 'Inattivo'})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-zinc-400 text-[11px] uppercase mb-2">
                  Codice Chiave Licenza
                </label>
                <input
                  type="text"
                  value={codiceLicenza}
                  onChange={(e) => setCodiceLicenza(e.target.value)}
                  placeholder="es. GOLD-2026-X"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-blue-500 font-mono uppercase"
                />
              </div>

              <button
                type="submit"
                disabled={isPending}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold p-3 rounded-xl text-xs uppercase tracking-wider transition-all disabled:opacity-50"
              >
                {isPending ? 'Scrittura su DB...' : 'Salva & Sblocca Sidebar'}
              </button>
            </form>
          </div>

          <div className="lg:col-span-2 bg-zinc-900/50 border border-zinc-800 p-6 rounded-2xl">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider mb-4">
              Stato Licenze Workspace Attivi
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-500 uppercase">
                    <th className="pb-3 font-medium">Workspace</th>
                    <th className="pb-3 font-medium">C.F. / P.IVA</th>
                    <th className="pb-3 font-medium">Codice Licenza</th>
                    <th className="pb-3 font-medium">Scadenza</th>
                    <th className="pb-3 font-medium">Stato</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/50">
                  {spazi.map((s) => (
                    <tr key={s.id} className="text-zinc-300">
                      <td className="py-3 font-bold">{s.nome}</td>
                      <td className="py-3 text-zinc-500">{s.codiceFiscale}</td>
                      <td className="py-3 font-mono">{s.licenzaCodice}</td>
                      <td className="py-3">{s.scadenza}</td>
                      <td className="py-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            s.attivo
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : 'bg-red-500/10 text-red-400 border border-red-500/20'
                          }`}
                        >
                          {s.attivo ? 'ATTIVA' : 'DISATTIVATA'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'parametri' && (
        <div className="bg-zinc-900/50 border border-zinc-800 p-6 rounded-2xl space-y-6">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider">
            Parametri Generali dell&apos;Applicazione
          </h2>
          <form onSubmit={handleSalvaParametri} className="space-y-4">
            {parametri.map((p, index) => (
              <div
                key={p.chiave}
                className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center bg-zinc-950 p-4 rounded-xl border border-zinc-800"
              >
                <div>
                  <span className="font-bold text-white block">{p.chiave}</span>
                  <span className="text-[10px] text-zinc-500">{p.descrizione}</span>
                </div>
                <div className="md:col-span-2">
                  <input
                    type="text"
                    value={p.valore}
                    onChange={(e) => {
                      const nuoviParametri = [...parametri];
                      nuoviParametri[index].valore = e.target.value;
                      setParametri(nuoviParametri);
                    }}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
            ))}
            <div className="flex justify-end pt-4">
              <button
                type="submit"
                disabled={isPending}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-6 py-3 rounded-xl text-xs uppercase tracking-wider transition-all disabled:opacity-50"
              >
                {isPending ? 'Aggiornamento DB...' : 'Salva Parametri'}
              </button>
            </div>
          </form>
        </div>
      )}

      {activeTab === 'indici' && (
        <div className="bg-zinc-900/50 border border-zinc-800 p-6 rounded-2xl space-y-4">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider">
            Dizionario Formule Indici CNDCEC
          </h2>
          <p className="text-xs text-zinc-400">
            Formule master registrate nel database per l&apos;elaborazione dei bilanci e
            l&apos;allerta precoce.
          </p>
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 font-mono text-xs text-zinc-300 space-y-2">
            <div>
              • <strong className="text-blue-400">DSCR 6 Mesi:</strong> Flussi di cassa operativi /
              Debiti a breve termine previsti
            </div>
            <div>
              • <strong className="text-blue-400">Patrimonio Netto:</strong> [A] Attivo - [D] Debiti
              - Riserve non distribuibili
            </div>
            <div>
              • <strong className="text-blue-400">Oneri Finanziari / Ricavi:</strong> Interessi
              passivi netti / Valore della Produzione %
            </div>
          </div>
        </div>
      )}

      {activeTab === 'spazi' && (
        <div className="bg-zinc-900/50 border border-zinc-800 p-6 rounded-2xl space-y-4">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider">
            Gestione Tenant / Spazi di Lavoro
          </h2>
          <p className="text-xs text-zinc-400">
            Configurazione dell&apos;isolamento dei dati per ciascun workspace registrato.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {spazi.map((spazio) => (
              <div
                key={spazio.id}
                className="bg-zinc-950 p-4 rounded-xl border border-zinc-800 space-y-2"
              >
                <div className="flex justify-between items-center">
                  <span className="font-bold text-white">{spazio.nome}</span>
                  <span className="text-[10px] text-zinc-500">ID: {spazio.id}</span>
                </div>
                <div className="text-[11px] text-zinc-400">C.F.: {spazio.codiceFiscale}</div>
                <div className="text-[11px] text-zinc-400">
                  Licenza: <code className="text-blue-400">{spazio.licenzaCodice}</code>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'cndcec' && (
        <div className="bg-zinc-900/50 border border-zinc-800 p-6 rounded-2xl space-y-6">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider">
            Importazione e Sincronizzazione Matrice CNDCEC
          </h2>
          <p className="text-xs text-zinc-400">
            Sincronizza il database con gli ultimi indici e le soglie di allerta definite dal
            Consiglio Nazionale dei Dottori Commercialisti.
          </p>
          <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800">
            <button
              onClick={handleImportaCNDCEC}
              disabled={isPending}
              className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-6 py-3 rounded-xl text-xs uppercase tracking-wider transition-all disabled:opacity-50"
            >
              {isPending ? 'Sincronizzazione in corso...' : 'Esegui Aggiornamento Matrice CNDCEC'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
