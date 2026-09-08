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
import { upload } from '@vercel/blob/client';
import { toast } from 'sonner';
import { generaDumpDatiAction } from '@/app/actions/dumpDati';
import { azzeraDatabaseCompletoAction } from '@/app/actions/azzeraDatabase';
import { generaBackupCompletoAction, type RisultatoBackup } from '@/app/actions/backupDatabase';
import {
  provaRipristinoAction,
  ripristinaDatabaseAction,
  type RisultatoRipristino,
} from '@/app/actions/ripristinaDatabase';

export function ModuloParametri() {
  const [dumpInCorso, setDumpInCorso] = useState(false);
  const [backupInCorso, setBackupInCorso] = useState(false);
  const [passphraseBackup, setPassphraseBackup] = useState('');
  const [passphraseConferma, setPassphraseConferma] = useState('');
  const [esitoBackup, setEsitoBackup] = useState<RisultatoBackup | null>(null);
  // Ripristino. `provaOk` è la guardia: il pulsante definitivo resta spento
  // finché il file non ha superato l'esecuzione su un database temporaneo.
  const [fileRipristino, setFileRipristino] = useState<{
    nome: string;
    contenuto: string;
    file: File;
    grande: boolean;
  } | null>(null);
  const [caricamentoInCorso, setCaricamentoInCorso] = useState(false);
  const [passphraseRipristino, setPassphraseRipristino] = useState('');
  const [provaOk, setProvaOk] = useState(false);
  const [provaInCorso, setProvaInCorso] = useState(false);
  const [ripristinoInCorso, setRipristinoInCorso] = useState(false);
  const [confermaRipristino, setConfermaRipristino] = useState('');
  const [esitoRipristino, setEsitoRipristino] = useState<RisultatoRipristino | null>(null);
  const [azzeramentoInCorso, setAzzeramentoInCorso] = useState(false);
  const [confermaAzzeramento, setConfermaAzzeramento] = useState('');

  const FRASE_CONFERMA = 'AZZERA TUTTO';
  const FRASE_RIPRISTINO = 'RIPRISTINA E SOVRASCRIVI';

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
        // Il file cifrato viene salvato come TESTO base64, non come byte
        // grezzi.
        //
        // Prima veniva decodificato con atob() e scritto in binario; al
        // ripristino il file veniva riletto con f.text(), cioè decodificato
        // come UTF-8. I due passaggi non sono l'inverso l'uno dell'altro:
        // ogni byte non valido in UTF-8 diventa un carattere di
        // sostituzione, e il contenuto torna indietro irrecuperabile —
        // misurato: metà dei byte perduti. Il server riceveva rumore e non
        // riconosceva più il file come un backup.
        //
        // Tenendolo in base64 il giro si chiude: quel che si scarica è
        // esattamente quel che si ricarica.
        const blob = new Blob([r.contenuto], {
          type: r.cifrato ? 'text/plain' : 'application/sql',
        });
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

  const scaricaTesto = (nome: string, contenuto: string) => {
    const url = URL.createObjectURL(new Blob([contenuto], { type: 'application/sql' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = nome;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Il file viaggia come argomento di una Server Action, che ha un tetto di
  // dimensione (bodySizeLimit, 25MB). Oltre quella soglia la chiamata viene
  // rifiutata dall'infrastruttura PRIMA di arrivare al codice, e il browser
  // mostra un errore generico che non dice nulla della causa. Meglio
  // fermarsi qui e spiegarlo.
  // Vercel impone un limite FISSO di circa 4,5 MB al corpo delle richieste
  // verso le funzioni serverless. Non è il `bodySizeLimit` di Next (25 MB):
  // quello è un limite applicativo, questo è dell'infrastruttura, e agisce
  // PRIMA che la richiesta raggiunga il codice. Un file più grande viene
  // rifiutato dalla piattaforma, la funzione non viene nemmeno invocata, e
  // nei log del server non compare nulla: il browser mostra soltanto
  // "An unexpected response was received from the server".
  //
  // Fermarsi qui, con un messaggio comprensibile, è meglio che mandare una
  // richiesta destinata a essere respinta senza spiegazioni.
  // Oltre questa dimensione il contenuto non viaggia dentro una Server
  // Action — Vercel respinge il corpo delle richieste sopra i ~4,5 MB, prima
  // ancora di invocare la funzione — e si passa al caricamento diretto sullo
  // storage. Il valore è prudenziale: al contenuto si somma la codifica del
  // protocollo delle Server Action.
  const LIMITE_INVIO_DIRETTO = 3_000_000;

  const handleFileRipristino = async (f: File | null) => {
    setProvaOk(false);
    setEsitoRipristino(null);
    setConfermaRipristino('');
    if (!f) {
      setFileRipristino(null);
      return;
    }

    // Lettura tollerante ai file prodotti dalle versioni 0.109.34-0.109.38,
    // che salvavano i backup cifrati in BINARIO anziché in base64. Si legge
    // sempre l'array di byte e si decide dal CONTENUTO, non dal nome.
    const byte = new Uint8Array(await f.arrayBuffer());
    const stampabile = byte.every((b) => (b >= 32 && b < 127) || b === 10 || b === 13 || b === 9);
    let contenuto: string;
    if (stampabile) {
      contenuto = new TextDecoder('utf-8').decode(byte);
    } else {
      let binario = '';
      for (let i = 0; i < byte.length; i += 8192) {
        binario += String.fromCharCode(...byte.subarray(i, i + 8192));
      }
      contenuto = btoa(binario);
    }

    // Sopra la soglia il contenuto non può viaggiare dentro una Server
    // Action: la piattaforma respinge la richiesta prima di invocare la
    // funzione. In quel caso il file verrà caricato direttamente sullo
    // storage e al server passerà solo l'indirizzo.
    const grande = contenuto.length > LIMITE_INVIO_DIRETTO;
    setFileRipristino({ nome: f.name, contenuto, file: f, grande });
  };

  /** Restituisce ciò che va passato alle action: il contenuto, o un indirizzo. */
  const riferimentoDelFile = async (): Promise<string> => {
    if (!fileRipristino) throw new Error('Nessun file selezionato.');
    if (!fileRipristino.grande) return fileRipristino.contenuto;

    setCaricamentoInCorso(true);
    try {
      const blob = await upload(`backup-ripristino-${Date.now()}.txt`, fileRipristino.contenuto, {
        access: 'public',
        handleUploadUrl: '/api/backup-upload',
        contentType: 'text/plain',
      });
      return blob.url;
    } finally {
      setCaricamentoInCorso(false);
    }
  };

  const handleProva = async () => {
    if (!fileRipristino) return;
    setProvaInCorso(true);
    setEsitoRipristino(null);
    try {
      const r = await provaRipristinoAction(
        await riferimentoDelFile(),
        passphraseRipristino || undefined
      );
      setEsitoRipristino(r);
      setProvaOk(r.success);
    } catch (e) {
      setEsitoRipristino({
        success: false,
        fase: 'prova',
        databaseIntatto: true,
        problemi: [String(e)],
      });
      setProvaOk(false);
    } finally {
      setProvaInCorso(false);
    }
  };

  const handleRipristina = async () => {
    if (!fileRipristino || !provaOk || confermaRipristino !== FRASE_RIPRISTINO) return;
    setRipristinoInCorso(true);
    try {
      const r = await ripristinaDatabaseAction(
        await riferimentoDelFile(),
        passphraseRipristino || undefined
      );
      setEsitoRipristino(r);
      // Il backup dello stato precedente viene scaricato SUBITO e da solo:
      // è l'unica via di ritorno se il ripristino è andato storto, e in quel
      // momento nessuno ha la lucidità di ricordarsi di premere un pulsante.
      if (r.backupSicurezza) {
        scaricaTesto(r.backupSicurezza.nomeFile, r.backupSicurezza.contenuto);
      }
      setConfermaRipristino('');
      setProvaOk(false);
    } catch (e) {
      setEsitoRipristino({
        success: false,
        fase: 'esecuzione',
        databaseIntatto: false,
        problemi: [String(e)],
      });
    } finally {
      setRipristinoInCorso(false);
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
            Dump portabile, backup, ripristino ed azzeramento del database.
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
                className="w-full px-3 py-2 border border-gray-200 rounded-xl font-mono text-xs text-gray-900 bg-white"
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
                className="w-full px-3 py-2 border border-gray-200 rounded-xl font-mono text-xs text-gray-900 bg-white"
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

        <div className="space-y-3 pt-4 border-t border-gray-100">
          <span className="text-xs font-mono font-bold text-gray-400 uppercase block">
            Ripristino da Backup
          </span>
          <p className="text-xs font-mono text-gray-500">
            Ricostruisce l&apos;intero database dal file di backup. Il contenuto attuale viene
            cancellato e sostituito.
          </p>
          <p className="text-xs font-mono text-gray-500 bg-gray-50 border border-gray-200 rounded-lg p-3">
            L&apos;ordine dei passi è pensato per rendere reversibile un errore: il file viene prima
            validato ed <span className="font-bold">eseguito su un database temporaneo</span>; se
            non funziona lì, ci si ferma senza aver toccato nulla. Solo dopo viene salvato lo stato
            corrente — scaricato automaticamente — e infine si sostituisce.
          </p>

          <div>
            <label className="text-[10px] font-mono font-bold text-gray-400 uppercase block mb-1">
              File di backup (.sql o .sql.enc)
            </label>
            <input
              type="file"
              accept=".sql,.enc,.txt"
              onChange={(e) => void handleFileRipristino(e.target.files?.[0] ?? null)}
              className="w-full text-xs font-mono text-gray-900 file:mr-3 file:px-3 file:py-2 file:rounded-lg file:border-0 file:bg-gray-900 file:text-white file:font-bold file:uppercase file:text-[10px]"
            />
          </div>

          <div>
            <label className="text-[10px] font-mono font-bold text-gray-400 uppercase block mb-1">
              Passphrase (solo se il file è cifrato)
            </label>
            <input
              type="password"
              value={passphraseRipristino}
              onChange={(e) => {
                setPassphraseRipristino(e.target.value);
                setProvaOk(false);
              }}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl font-mono text-xs text-gray-900 bg-white"
            />
          </div>

          <button
            onClick={() => void handleProva()}
            disabled={!fileRipristino || provaInCorso || caricamentoInCorso}
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-mono text-xs font-bold uppercase rounded-xl transition-all"
          >
            {provaInCorso ? 'Verifica in corso...' : '1. Verifica il file'}
          </button>

          {fileRipristino?.grande && !provaInCorso && (
            <p className="text-[11px] font-mono text-gray-500">
              File di {(fileRipristino.file.size / (1024 * 1024)).toFixed(1)} MB: verrà caricato
              direttamente sullo storage, perché sopra i ~4,5 MB il server non può riceverlo in una
              richiesta diretta. Viene eliminato subito dopo l&apos;elaborazione.
            </p>
          )}

          {caricamentoInCorso && (
            <p className="text-[11px] font-mono text-gray-500">Caricamento del file in corso...</p>
          )}

          {provaInCorso && (
            <p className="text-[11px] font-mono text-gray-500">
              La verifica esegue l&apos;intero ripristino dentro una transazione che verrà poi
              annullata: su un database di dimensioni reali può richiedere qualche decina di
              secondi. Non chiudere la pagina.
            </p>
          )}

          {esitoRipristino && (
            <div
              className={`text-[11px] font-mono space-y-1 border rounded-xl p-3 ${
                esitoRipristino.success
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : 'border-red-200 bg-red-50 text-red-800'
              }`}
            >
              {esitoRipristino.intestazione && (
                <p>
                  Backup della versione {esitoRipristino.intestazione.versioneApp ?? '?'}, generato
                  il {esitoRipristino.intestazione.generatoIl?.slice(0, 10) ?? '?'} —{' '}
                  {esitoRipristino.intestazione.tabelle ?? '?'} tabelle,{' '}
                  {esitoRipristino.intestazione.righe?.toLocaleString('it-IT') ?? '?'} righe.
                </p>
              )}
              {esitoRipristino.fase === 'prova' && esitoRipristino.success && (
                <p className="font-bold">
                  Il file è valido ed è stato eseguito con successo su un database di prova. Il
                  database reale non è stato toccato.
                </p>
              )}
              {esitoRipristino.fase === 'completato' && (
                <p className="font-bold">
                  Ripristino completato: {esitoRipristino.tabelleRipristinate} tabelle. La sessione
                  corrente non è più valida — occorre rientrare.
                </p>
              )}
              {esitoRipristino.problemi?.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
              {!esitoRipristino.databaseIntatto && !esitoRipristino.success && (
                <p className="font-bold">
                  Il database NON è integro. Conservare il file scaricato automaticamente qui
                  accanto: contiene lo stato precedente al ripristino.
                </p>
              )}
            </div>
          )}

          {provaOk && (
            <div className="space-y-2 pt-2">
              <p className="text-xs font-mono text-red-600 font-bold">
                Confermando, il contenuto attuale del database viene cancellato.
              </p>
              <input
                type="text"
                value={confermaRipristino}
                onChange={(e) => setConfermaRipristino(e.target.value)}
                placeholder={`Scrivi "${FRASE_RIPRISTINO}" per abilitare`}
                className="w-full px-3 py-2 border border-red-200 rounded-xl font-mono text-xs text-gray-900 bg-white"
              />
              <button
                onClick={() => void handleRipristina()}
                disabled={confermaRipristino !== FRASE_RIPRISTINO || ripristinoInCorso}
                className="px-4 py-2.5 bg-red-600 hover:bg-red-700 disabled:bg-gray-300 text-white font-mono text-xs font-bold uppercase rounded-xl transition-all"
              >
                {ripristinoInCorso ? 'Ripristino in corso...' : '2. Ripristina ora'}
              </button>
            </div>
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
              className="flex-1 p-2.5 bg-gray-50 border border-red-200 rounded-xl font-mono text-xs text-gray-900 outline-none focus:bg-white focus:border-red-500 transition-all"
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
