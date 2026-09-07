'use client';

// Prima aveva 3 schede: Localizzazione e Stampa, Percorso di Backup,
// Dati e Manutenzione. Le prime due leggevano da public.parametri_sistema
// — una tabella che nessuna interfaccia ha mai scritto (stessa causa
// radice già trovata e ripulita per "Soglie Normative CCII" tempo fa:
// quella scheda era sfuggita alla stessa pulizia). Mostravano sempre
// "nessun dato caricato" o "impossibile trovare il parametro" — non un
// bug intermittente, un residuo morto fin dall'inizio. Restano solo le
// due funzioni reali: Dump e Azzeramento.

import React, { useState } from 'react';
import { toast } from 'sonner';
import { generaDumpDatiAction } from '@/app/actions/dumpDati';
import { azzeraDatabaseCompletoAction } from '@/app/actions/azzeraDatabase';
import { generaBackupCompletoAction, type RisultatoBackup } from '@/app/actions/backupDatabase';

export function ModuloParametri() {
  const [dumpInCorso, setDumpInCorso] = useState(false);
  const [backupInCorso, setBackupInCorso] = useState(false);
  const [passphraseBackup, setPassphraseBackup] = useState('');
  const [passphraseConferma, setPassphraseConferma] = useState('');
  const [esitoBackup, setEsitoBackup] = useState<RisultatoBackup | null>(null);
  const [azzeramentoInCorso, setAzzeramentoInCorso] = useState(false);
  const [confermaAzzeramento, setConfermaAzzeramento] = useState('');

  const FRASE_CONFERMA = 'AZZERA TUTTO';

  const handleScaricaDump = async () => {
    setDumpInCorso(true);
    try {
      const risultato = await generaDumpDatiAction();
      if (!risultato.success || !risultato.sql) {
        toast.error(risultato.error || 'Impossibile generare il dump.');
        return;
      }
      const blob = new Blob([risultato.sql], { type: 'application/sql' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cciiweb_dump_dati_${new Date().toISOString().slice(0, 10)}.sql`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(
        `Dump scaricato: ${risultato.numeroTabelle} tabelle, ${risultato.numeroRighe} righe.`
      );
    } catch (error) {
      console.error(error);
      toast.error('Errore durante la generazione del dump.');
    } finally {
      setDumpInCorso(false);
    }
  };

  const handleBackup = async () => {
    if (passphraseBackup !== passphraseConferma) return;
    setBackupInCorso(true);
    setEsitoBackup(null);
    try {
      const r = await generaBackupCompletoAction(passphraseBackup || undefined);
      setEsitoBackup(r);
      if (r.success && r.contenuto && r.nomeFile) {
        // Scaricamento sul PC di chi sta operando: e' l'unico "locale" che
        // esista nell'edizione cloud, dove il filesystem del server e'
        // effimero. Nel portable il file viene ANCHE scritto su disco, e il
        // percorso torna in `percorsoLocale`.
        const blob = r.cifrato
          ? new Blob([Uint8Array.from(atob(r.contenuto), (c) => c.charCodeAt(0))], {
              type: 'application/octet-stream',
            })
          : new Blob([r.contenuto], { type: 'application/sql' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = r.nomeFile;
        a.click();
        URL.revokeObjectURL(url);
        setPassphraseBackup('');
        setPassphraseConferma('');
      }
    } catch (e) {
      setEsitoBackup({ success: false, error: String(e) });
    } finally {
      setBackupInCorso(false);
    }
  };

  const handleAzzeraDatabase = async () => {
    if (confermaAzzeramento !== FRASE_CONFERMA) return;
    setAzzeramentoInCorso(true);
    try {
      const risultato = await azzeraDatabaseCompletoAction();
      if (risultato.success) {
        toast.success(
          `Database azzerato: ${risultato.schemiEliminati} spazi eliminati, ${risultato.tabelleSvuotate} tabelle svuotate.`,
          { duration: 5000 }
        );
        setConfermaAzzeramento('');
      } else {
        toast.error(risultato.error || 'Impossibile azzerare il database.');
      }
    } catch (error) {
      console.error(error);
      toast.error("Errore durante l'azzeramento.");
    } finally {
      setAzzeramentoInCorso(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
        <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
          <svg
            className="h-6 w-6"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
          </svg>
        </div>
        <div>
          <h2 className="text-sm font-black text-gray-900 uppercase font-mono tracking-tight">
            Dati e Manutenzione
          </h2>
          <p className="text-[11px] text-gray-400 font-mono">
            Dump portabile, backup completo ed azzeramento del database.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm space-y-6">
        <div className="space-y-3">
          <span className="text-xs font-mono font-bold text-gray-400 uppercase block">
            Dump Dati Portabile
          </span>
          <p className="text-xs font-mono text-gray-500">
            Esporta tutti i dati (non lo schema) di ogni spazio in un file .sql scaricabile —
            pensato per una futura migrazione, non come backup di sicurezza (per quello, Railway).
          </p>
          <button
            onClick={handleScaricaDump}
            disabled={dumpInCorso}
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-mono text-xs font-bold uppercase rounded-xl transition-all"
          >
            {dumpInCorso ? 'Generazione in corso...' : 'Scarica dump dati'}
          </button>
        </div>

        <div className="space-y-3 pt-4 border-t border-gray-100">
          <span className="text-xs font-mono font-bold text-gray-400 uppercase block">
            Backup Completo del Database
          </span>
          <p className="text-xs font-mono text-gray-500">
            Backup vero: schema, dati, vincoli, indici e valori correnti delle sequenze —
            sufficiente a ricostruire il database da zero senza il codice applicativo. Diverso dal
            dump qui sopra, che contiene i soli dati.
          </p>
          <p className="text-xs font-mono text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
            Il file contiene le credenziali: hash delle password, segreti TOTP, hash dei PIN e
            sessioni. È una copia dell&apos;autenticazione a tre fattori. Va custodito come si
            custodisce una password — o cifrato qui sotto.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-mono font-bold text-gray-400 uppercase block mb-1">
                Passphrase di cifratura
              </label>
              <input
                type="password"
                value={passphraseBackup}
                onChange={(e) => setPassphraseBackup(e.target.value)}
                placeholder="vuota = file in chiaro"
                className="w-full px-3 py-2 border border-gray-200 rounded-xl font-mono text-xs"
              />
            </div>
            <div>
              <label className="text-[10px] font-mono font-bold text-gray-400 uppercase block mb-1">
                Ripeti la passphrase
              </label>
              <input
                type="password"
                value={passphraseConferma}
                onChange={(e) => setPassphraseConferma(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl font-mono text-xs"
              />
            </div>
          </div>
          {passphraseBackup !== passphraseConferma && (
            <p className="text-[11px] font-mono text-red-600">Le due passphrase non coincidono.</p>
          )}
          {passphraseBackup.length > 0 && (
            <p className="text-[11px] font-mono text-gray-500">
              AES-256-GCM. Senza questa passphrase il backup è irrecuperabile: non esiste alcun modo
              di rileggerlo, nemmeno da parte nostra.
            </p>
          )}

          <button
            onClick={handleBackup}
            disabled={backupInCorso || passphraseBackup !== passphraseConferma}
            className="px-4 py-2.5 bg-gray-900 hover:bg-gray-800 disabled:bg-gray-300 text-white font-mono text-xs font-bold uppercase rounded-xl transition-all"
          >
            {backupInCorso ? 'Generazione in corso...' : 'Genera e scarica backup'}
          </button>

          {esitoBackup && esitoBackup.success && (
            <div className="text-[11px] font-mono space-y-1 border border-gray-200 rounded-xl p-3">
              <p className="text-gray-700">
                {esitoBackup.schemi} schemi · {esitoBackup.tabelle} tabelle ·{' '}
                {esitoBackup.righe?.toLocaleString('it-IT')} righe ·{' '}
                {Math.round((esitoBackup.byte ?? 0) / 1024).toLocaleString('it-IT')} KB
                {esitoBackup.cifrato ? ' · cifrato' : ' · in chiaro'}
              </p>
              {esitoBackup.integrita?.integro ? (
                <p className="text-emerald-700">
                  Controllo d&apos;integrità superato: ogni tabella del catalogo è presente e con
                  tutte le sue righe.
                </p>
              ) : (
                <div className="text-red-700 space-y-1">
                  <p className="font-bold">
                    Controllo d&apos;integrità NON superato — non considerare valido questo file.
                  </p>
                  {esitoBackup.integrita?.tabelleMancanti.map((t) => (
                    <p key={t}>Tabella assente: {t}</p>
                  ))}
                  {esitoBackup.integrita?.righeIncoerenti.map((r) => (
                    <p key={r.tabella}>
                      {r.tabella}: attese {r.attese} righe, scritte {r.scritte}
                    </p>
                  ))}
                </div>
              )}
              {esitoBackup.percorsoLocale && (
                <p className="text-gray-500">
                  Scritto anche su disco: {esitoBackup.percorsoLocale}
                </p>
              )}
            </div>
          )}
          {esitoBackup && !esitoBackup.success && (
            <p className="text-[11px] font-mono text-red-700">{esitoBackup.error}</p>
          )}
        </div>

        <div className="space-y-3 pt-4 border-t border-red-100">
          <span className="text-xs font-mono font-bold text-red-500 uppercase block">
            Azzeramento Completo del Database
          </span>
          <p className="text-xs font-mono text-gray-500">
            Elimina ogni spazio e svuota tutte le tabelle globali. <strong>Irreversibile.</strong>{' '}
            Pensato per un solo uso, subito prima di consegnare un ambiente pulito su una versione
            definitiva già stabile — fare un dump prima, se serve conservare qualcosa. Le mappature
            dei tag XBRL si ripopolano da sole subito dopo, nella stessa operazione.
          </p>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={confermaAzzeramento}
              onChange={(e) => setConfermaAzzeramento(e.target.value)}
              placeholder={`Scrivi "${FRASE_CONFERMA}" per abilitare`}
              className="flex-1 p-2.5 bg-gray-50 border border-red-200 rounded-xl font-mono text-xs outline-none focus:bg-white focus:border-red-500 transition-all"
            />
            <button
              onClick={handleAzzeraDatabase}
              disabled={confermaAzzeramento !== FRASE_CONFERMA || azzeramentoInCorso}
              className="px-4 py-2.5 bg-red-600 hover:bg-red-700 disabled:bg-gray-300 text-white font-mono text-xs font-bold uppercase rounded-xl transition-all whitespace-nowrap"
            >
              {azzeramentoInCorso ? 'Azzeramento...' : 'Azzera tutto'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ModuloParametri;
