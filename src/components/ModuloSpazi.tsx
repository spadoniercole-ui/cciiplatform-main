'use client';

import React, { useState } from 'react';
import {
  Building2,
  Sliders,
  ShieldCheck,
  Database,
  Plus,
  CheckCircle2,
  HardDriveDownload,
  RefreshCw,
  Layers,
  FileKey,
  FolderTree,
} from 'lucide-react';

export const GestioneArchitettura = () => {
  const [activeTab, setActiveTab] = useState<
    'PARAMETRI' | 'INDICI' | 'ADMIN' | 'STORAGE' | 'BACKUP'
  >('PARAMETRI');

  // Parametri di configurazione contrattuale (Sola lettura per evitare manomissioni dell'admin di spazio)
  const parametriLicenza = [
    {
      chiave: 'CCII_SOGLIA_PATRIMONIALE',
      valore: '500000',
      descrizione: 'Soglia PN minima di allerta codice crisi',
    },
    {
      chiave: 'CCII_SOGLIA_FATTURATO',
      valore: '2000000',
      descrizione: 'Soglia ricavi delle vendite e delle prestazioni',
    },
    {
      chiave: 'FREQUENZA_CALCOLO_DIZIONARIO',
      valore: 'TRIMESTRALE',
      descrizione: 'Cadenza obbligatoria calcolo indici master',
    },
  ];

  // Stato per la configurazione dei percorsi fisici dello spazio (Tab Storage)
  const [storageConfig, setStorageConfig] = useState({
    pathDatabase: '/var/data/cciiplatform/wp-2026-01/db/',
    pathBackup: '/var/data/cciiplatform/wp-2026-01/backups/',
    maxSizeGb: '50',
  });

  // Storico snapshot database
  const [backups, setBackups] = useState([
    {
      id: 'BK-20260707-01',
      data: '2026-07-07 04:00:12',
      dimensione: '42.8 MB',
      tipo: 'AUTOMATICO (SCHEDULATO)',
    },
    {
      id: 'BK-20260706-01',
      data: '2026-07-06 04:00:09',
      dimensione: '42.5 MB',
      tipo: 'AUTOMATICO (SCHEDULATO)',
    },
  ]);

  const handleForzaBackup = () => {
    const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const nuovoBackup = {
      id: `BK-${Date.now().toString().substring(6)}`,
      data: timestamp,
      dimensione: '43.1 MB',
      tipo: 'MANUALE (FORZATO LOCAL)',
    };
    setBackups([nuovoBackup, ...backups]);
  };

  const handleSalvaStorage = (e: React.FormEvent) => {
    e.preventDefault();
    alert(`Percorsi fisici di memorizzazione allocati per lo spazio corrente.`);
  };

  return (
    <div className="p-6 bg-slate-50 min-h-screen font-mono text-xs text-slate-800">
      {/* INTESTAZIONE INFRALIVE */}
      <div className="mb-6">
        <h1 className="text-lg font-black tracking-tight text-slate-950 uppercase">
          Gestione Architettura Spazi di Lavoro
        </h1>
        <p className="text-slate-500 text-[11px]">
          Provisioning dei tenant isolati, importazione dizionari master e risoluzione contratti
          licenza
        </p>
      </div>

      {/* SEZIONE SUPERIORE: PROVISIONING */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <div className="text-[10px] font-bold text-blue-600 uppercase mb-3 flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5" /> Inizializza Nuovo Spazio
          </div>
          <label className="block text-[9px] text-slate-400 font-bold uppercase mb-1">
            Ragione Sociale / Descrizione Gruppo
          </label>
          <input
            type="text"
            placeholder="Es. Gruppo Holding S.p.A. - Sud"
            className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg outline-none text-xs font-sans mb-3 text-slate-400 cursor-not-allowed"
            disabled
          />
          <button
            type="button"
            className="w-full py-2.5 bg-slate-900 text-white font-bold uppercase tracking-wider rounded-lg text-[10px] opacity-90 cursor-not-allowed"
            disabled
          >
            Crea Spazio (WP-2026-02)
          </button>
        </div>

        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <div className="text-[10px] font-bold text-slate-500 uppercase mb-3">
            Tenant Attivi a Sistema (1) – Selezione Rapida
          </div>
          <div className="border-2 border-blue-500 bg-blue-50/10 rounded-xl p-3 flex justify-between items-center">
            <div>
              <div className="font-black text-slate-900">WP-2026-01</div>
              <div className="text-[11px] text-slate-600 font-sans">
                Holding Industriale Siracusana - Comparto Sud
              </div>
            </div>
            <span className="px-2 py-1 bg-emerald-100 text-emerald-800 rounded font-bold text-[9px] tracking-wide flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> ATTIVO
            </span>
          </div>
        </div>
      </div>

      {/* BANNER TENANT ATTIVO */}
      <div className="bg-slate-950 text-white rounded-t-xl px-4 py-3 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
        <div>
          <div className="text-[9px] uppercase tracking-widest text-blue-400 font-bold">
            Configurazione Tenant Attivo
          </div>
          <div className="text-xs font-black tracking-wide uppercase">
            WP-2026-01 – Holding Industriale Siracusana - Comparto Sud
          </div>
        </div>
        <div className="text-[10px] bg-slate-900 border border-slate-800 px-3 py-1 rounded-lg">
          Licenza Attiva: <span className="text-amber-400 font-bold font-sans">LIC-9982-SR</span>
        </div>
      </div>

      {/* NAVBAR NAVIGAZIONE A 5 TAB */}
      <div className="bg-white border-x border-b border-slate-200 p-1.5 flex flex-wrap gap-1 shadow-xs">
        <button
          type="button"
          onClick={() => setActiveTab('PARAMETRI')}
          className={`px-3 py-2 rounded-lg font-bold uppercase text-[10px] transition-all flex items-center gap-1.5 ${activeTab === 'PARAMETRI' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'}`}
        >
          <Sliders className="w-3.5 h-3.5" /> 1. Parametri Spazio (NON MODIFICABILI)
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('INDICI')}
          className={`px-3 py-2 rounded-lg font-bold uppercase text-[10px] transition-all flex items-center gap-1.5 ${activeTab === 'INDICI' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'}`}
        >
          <Layers className="w-3.5 h-3.5" /> 2. Dizionario Indici Master (21/21)
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('ADMIN')}
          className={`px-3 py-2 rounded-lg font-bold uppercase text-[10px] transition-all flex items-center gap-1.5 ${activeTab === 'ADMIN' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'}`}
        >
          <Building2 className="w-3.5 h-3.5" /> 3. Anagrafica Admin (EDITABILE)
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('STORAGE')}
          className={`px-3 py-2 rounded-lg font-bold uppercase text-[10px] transition-all flex items-center gap-1.5 ${activeTab === 'STORAGE' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'}`}
        >
          <FolderTree className="w-3.5 h-3.5" /> 4. Configurazione Storage
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('BACKUP')}
          className={`px-3 py-2 rounded-lg font-bold uppercase text-[10px] transition-all flex items-center gap-1.5 ${activeTab === 'BACKUP' ? 'bg-amber-600 text-white shadow-sm' : 'text-amber-700 bg-amber-50 hover:bg-amber-100/70'}`}
        >
          <Database className="w-3.5 h-3.5" /> 5. Gestione Backup DB
        </button>
      </div>

      {/* BLOCCO CONTENUTO CONTINGENTE */}
      <div className="bg-white border-x border-b border-slate-200 rounded-b-xl p-5 shadow-xs min-h-[350px]">
        {/* TAB 1: PARAMETRI (BLOCCATI) */}
        {activeTab === 'PARAMETRI' && (
          <div className="space-y-6">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div className="space-y-1">
                <div className="text-[10px] font-bold text-slate-900 uppercase flex items-center gap-1.5">
                  <FileKey className="w-4 h-4 text-slate-400" /> Caricamento Codice Contratto
                  Licenza
                </div>
                <p className="text-slate-500 text-[10px] font-sans max-w-2xl">
                  L&apos;inserimento del codice interroga i contratti abilitati e importa le
                  restrizioni strutturali.
                </p>
              </div>
              <div className="flex gap-2 w-full md:w-auto">
                <input
                  type="text"
                  value="LIC-9982-SR"
                  className="p-2 bg-slate-100 text-slate-400 border border-slate-200 font-bold text-center cursor-not-allowed w-40"
                  readOnly
                />
                <button
                  type="button"
                  className="px-4 py-2 bg-slate-200 text-slate-400 font-bold uppercase rounded-lg text-[10px] cursor-not-allowed"
                  disabled
                >
                  Carica
                </button>
              </div>
            </div>

            <div>
              <table className="w-full text-left border-collapse border border-slate-200 rounded-xl overflow-hidden">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 text-[10px] uppercase font-bold">
                    <th className="p-3">Chiave Parametro</th>
                    <th className="p-3">Valore Corrente (INIBITO ALLA MODIFICA)</th>
                    <th className="p-3">Descrizione Logica</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {parametriLicenza.map((param) => (
                    <tr key={param.chiave}>
                      <td className="p-3 font-bold text-slate-700">
                        {param.chiave}
                        <span className="block text-[8px] text-slate-400 font-normal mt-0.5">
                          SISTEMA
                        </span>
                      </td>
                      <td className="p-3">
                        <input
                          type="text"
                          value={param.valore}
                          className="p-2 bg-slate-100 text-slate-400 border border-slate-200 rounded font-bold w-48 cursor-not-allowed outline-none"
                          readOnly
                        />
                      </td>
                      <td className="p-3 text-slate-500 font-sans">{param.descrizione}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 2: DIZIONARIO INDICI COMPLETO (21/21) */}
        {activeTab === 'INDICI' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 uppercase">
                  Sincronizzazione Dizionario Crisi
                </h3>
                <p className="text-slate-400 text-[10px] font-sans">
                  Tutti gli indici di piattaforma sono nativamente importati nel database.
                </p>
              </div>
              <div className="bg-emerald-50 text-emerald-800 border border-emerald-200 px-4 py-2 rounded-xl font-bold text-center">
                Indici Strutturati: <span className="text-sm font-black">21</span> / 21 Caricati a
                Sistema
              </div>
            </div>
            <div className="bg-slate-50 p-4 border border-slate-200 rounded-xl space-y-2">
              <div className="text-slate-800 font-bold uppercase text-[10px]">
                Criterio di allocazione:
              </div>
              <p className="text-slate-600 font-sans leading-relaxed">
                Il dizionario master contiene l&apos;albero completo dei 21 indicatori CCII
                (patrimoniali, economici, finanziari e DSCR). L&apos;importazione è globale per
                salvaguardare le stored procedure di calcolo. L&apos;abilitazione, la visibilità o
                l&apos;esclusione di specifici indici saranno regolate direttamente all&apos;interno
                della configurazione di ciascuna azienda dello spazio di lavoro.
              </p>
            </div>
          </div>
        )}

        {/* TAB 3: ANAGRAFICA ADMIN */}
        {activeTab === 'ADMIN' && (
          <div className="space-y-4">
            <h3 className="font-bold text-slate-900 uppercase border-b border-slate-100 pb-3">
              Amministratore Master del Tenant
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] text-slate-400 font-bold uppercase mb-1">
                  Nominativo di Riferimento
                </label>
                <input
                  type="text"
                  defaultValue="Dott. Salvatore Mancuso"
                  className="w-full p-2 bg-white border border-slate-200 rounded-lg outline-none focus:border-slate-900 text-slate-900 font-bold"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 font-bold uppercase mb-1">
                  Email di Login
                </label>
                <input
                  type="email"
                  defaultValue="s.mancuso@holding-siracusana.it"
                  className="w-full p-2 bg-white border border-slate-200 rounded-lg outline-none focus:border-slate-900 text-slate-900 font-bold"
                />
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: CONFIGURAZIONE STORAGE FISICO (NUOVA RICHIESTA) */}
        {activeTab === 'STORAGE' && (
          <form onSubmit={handleSalvaStorage} className="space-y-4">
            <div className="border-b border-slate-100 pb-3 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-slate-900 uppercase">
                  Mappatura Risorse Hardware e File System
                </h3>
                <p className="text-slate-400 text-[10px] font-sans">
                  Definisci la posizione fisica delle directory isolate per questa specifica
                  installazione.
                </p>
              </div>
              <button
                type="submit"
                className="px-4 py-2 bg-slate-900 text-white font-bold text-[10px] uppercase rounded-lg tracking-wider"
              >
                Consolida Percorsi
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4 max-w-3xl">
              <div>
                <label className="block text-[10px] text-slate-500 font-bold uppercase mb-1">
                  Cartella Assoluta File Database (.sqlite / cluster node)
                </label>
                <input
                  type="text"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-slate-900 text-slate-900 font-mono text-xs"
                  value={storageConfig.pathDatabase}
                  onChange={(e) =>
                    setStorageConfig({ ...storageConfig, pathDatabase: e.target.value })
                  }
                  required
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-500 font-bold uppercase mb-1">
                  Directory di Atterraggio Dump & Backup Locali
                </label>
                <input
                  type="text"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-slate-900 text-slate-900 font-mono text-xs"
                  value={storageConfig.pathBackup}
                  onChange={(e) =>
                    setStorageConfig({ ...storageConfig, pathBackup: e.target.value })
                  }
                  required
                />
              </div>
              <div className="w-48">
                <label className="block text-[10px] text-slate-500 font-bold uppercase mb-1">
                  Quota Spazio Disco Max (GB)
                </label>
                <input
                  type="number"
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-slate-900 text-slate-900 font-bold"
                  value={storageConfig.maxSizeGb}
                  onChange={(e) =>
                    setStorageConfig({ ...storageConfig, maxSizeGb: e.target.value })
                  }
                />
              </div>
            </div>
          </form>
        )}

        {/* TAB 5: GESTIONE BACKUP DATABASE */}
        {activeTab === 'BACKUP' && (
          <div className="space-y-5">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 uppercase">
                  Snapshot e Manutenzione Database
                </h3>
                <p className="text-slate-400 text-[10px] font-sans">
                  Esegui copie di sicurezza o ripristina lo stato dei dati sovrascrivendo la
                  cartella fisica impostata.
                </p>
              </div>
              <button
                type="button"
                onClick={handleForzaBackup}
                className="flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white font-bold text-[10px] uppercase rounded-lg transition-colors"
              >
                <HardDriveDownload className="w-3.5 h-3.5" /> Genera Snapshot a Caldo
              </button>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 text-[9px] uppercase font-bold">
                    <th className="p-3">ID Backup</th>
                    <th className="p-3">Data Esecuzione</th>
                    <th className="p-3">Dimensione</th>
                    <th className="p-3">Tipo Innesco</th>
                    <th className="p-3 text-right">Azione</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-[11px] bg-white">
                  {backups.map((bk) => (
                    <tr key={bk.id} className="hover:bg-slate-50/50">
                      <td className="p-3 font-bold text-slate-900">{bk.id}</td>
                      <td className="p-3 text-slate-600">{bk.data}</td>
                      <td className="p-3 text-slate-600 font-sans">{bk.dimensione}</td>
                      <td className="p-3 text-slate-500 text-[10px]">{bk.tipo}</td>
                      <td className="p-3 text-right">
                        <button
                          type="button"
                          onClick={() =>
                            alert(`Rollback database avviato per il file in cartella storage.`)
                          }
                          className="px-2.5 py-1 bg-slate-50 hover:bg-rose-50 text-slate-700 hover:text-rose-700 border border-slate-200 hover:border-rose-200 font-bold uppercase text-[9px] rounded-md transition-all"
                        >
                          Ripristina
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
