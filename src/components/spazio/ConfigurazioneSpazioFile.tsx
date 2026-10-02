'use client';

// Salva / ricarica la configurazione dello spazio. Il salvataggio scarica un
// file JSON; il ripristino legge il file, mostra cosa contiene e — dopo
// conferma — sostituisce la configurazione in una sola transazione.

import React, { useRef, useState } from 'react';
import { Download, Upload, RefreshCw } from 'lucide-react';
import {
  esportaConfigurazioneSpazioAction,
  ripristinaConfigurazioneSpazioAction,
} from '@/app/actions/configurazioneSpazio';
import { confermaApp } from '@/components/FinestreApp';

export function ConfigurazioneSpazioFile({ nomeSchema }: { nomeSchema: string }) {
  const [inCorso, setInCorso] = useState<'esporta' | 'ripristina' | null>(null);
  const [messaggio, setMessaggio] = useState<{
    ok: boolean;
    testo: string;
    dettaglio?: string[];
  } | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const esporta = async () => {
    setInCorso('esporta');
    setMessaggio(null);
    const r = await esportaConfigurazioneSpazioAction(nomeSchema);
    setInCorso(null);
    if (!r.success || !r.contenuto) {
      setMessaggio({ ok: false, testo: r.error ?? 'Esportazione non riuscita.' });
      return;
    }
    const blob = new Blob([r.contenuto], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = r.nomeFile ?? 'configurazione.json';
    a.click();
    URL.revokeObjectURL(url);
    setMessaggio({
      ok: true,
      testo: `Configurazione salvata nel file «${r.nomeFile}». Conservalo: si ricarica da qui.`,
    });
  };

  const ripristina = async (file: File) => {
    setMessaggio(null);
    const contenuto = await file.text();
    let riepilogo = '';
    try {
      const f = JSON.parse(contenuto);
      const tabelle = Object.entries(f.tabelle ?? {}) as [string, { righe: unknown[] }][];
      riepilogo = `File dello spazio ${f.spazio?.codice ?? '—'} (${f.spazio?.tipoSpazio ?? 'tipo non indicato'}), esportato il ${
        f.esportatoIl ? new Date(f.esportatoIl).toLocaleString('it-IT') : '—'
      } con la versione ${f.appVersion ?? '—'}: ${tabelle.length} sezioni, ${tabelle.reduce(
        (a, [, t]) => a + (t.righe?.length ?? 0),
        0
      )} righe.`;
    } catch {
      setMessaggio({ ok: false, testo: 'Il file non è un JSON leggibile.' });
      return;
    }
    const ok = await confermaApp(
      `${riepilogo}\n\nLa configurazione attuale di questo spazio verrà SOSTITUITA da quella del file (parametri, direttrici, titoli e materie, mappature V.E.R.A., stampa). Aziende, scenari e utenti non vengono toccati.`,
      {
        titolo: 'Ricaricare la configurazione?',
        etichettaConferma: 'Sostituisci',
        distruttiva: true,
      }
    );
    if (!ok) return;
    setInCorso('ripristina');
    let r = await ripristinaConfigurazioneSpazioAction(nomeSchema, contenuto);
    if (!r.success && r.tipoDiverso) {
      const ancora = await confermaApp(
        `Il file viene da uno spazio di tipo ${r.tipoDiverso.file}, questo è di tipo ${r.tipoDiverso.spazio}. Alcuni parametri potrebbero non avere senso qui. Procedere comunque?`,
        { titolo: 'Spazio di tipo diverso', etichettaConferma: 'Procedi', distruttiva: true }
      );
      if (!ancora) {
        setInCorso(null);
        return;
      }
      r = await ripristinaConfigurazioneSpazioAction(nomeSchema, contenuto, {
        accettaTipoDiverso: true,
      });
    }
    setInCorso(null);
    if (!r.success || !r.esito) {
      setMessaggio({ ok: false, testo: r.error ?? 'Ripristino non riuscito.' });
      return;
    }
    const e = r.esito;
    setMessaggio({
      ok: true,
      testo: `Configurazione ricaricata: ${e.tabelle.length} sezioni.`,
      dettaglio: [
        ...e.tabelle.map((t) => `${t.descrizione}: ${t.righe} righe`),
        ...(e.colonneIgnorate.length
          ? [
              `Campi del file non presenti in questa versione, ignorati: ${e.colonneIgnorate.join(', ')}`,
            ]
          : []),
        ...(e.tabelleIgnorate.length ? [`Sezioni ignorate: ${e.tabelleIgnorate.join(', ')}`] : []),
      ],
    });
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
      <h2 className="font-bold text-slate-900 text-sm">Salva e ricarica la configurazione</h2>
      <p className="text-xs text-slate-500 leading-relaxed">
        Un file con tutta la configurazione di questo spazio: le pagine qui sotto, le direttrici,
        titoli e materie dell’ente, le etichette dell’Anagrafica Ente, le mappature del V.E.R.A., le
        strutture dei prospetti, la stampa con il logo. Serve a ricaricarla dopo un azzeramento del
        database. Non contiene aziende, scenari, utenti né licenze.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={esporta}
          disabled={inCorso !== null}
          className="flex items-center gap-1.5 px-3 py-2 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white font-bold text-[10px] uppercase rounded-lg"
        >
          {inCorso === 'esporta' ? (
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Download className="w-3.5 h-3.5" />
          )}
          Salva la configurazione
        </button>
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={inCorso !== null}
          className="flex items-center gap-1.5 px-3 py-2 border border-slate-300 bg-white hover:bg-slate-50 disabled:text-slate-400 text-slate-700 font-bold text-[10px] uppercase rounded-lg"
        >
          {inCorso === 'ripristina' ? (
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Upload className="w-3.5 h-3.5" />
          )}
          Ricarica da file
        </button>
        <input
          ref={input}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void ripristina(f);
          }}
        />
      </div>
      {messaggio && (
        <div
          className={`text-[11px] rounded-lg p-3 border ${
            messaggio.ok
              ? 'text-emerald-800 bg-emerald-50 border-emerald-200'
              : 'text-red-700 bg-red-50 border-red-200'
          }`}
        >
          <p>{messaggio.testo}</p>
          {messaggio.dettaglio && messaggio.dettaglio.length > 0 && (
            <ul className="mt-1 space-y-0.5">
              {messaggio.dettaglio.map((d, i) => (
                <li key={i}>— {d}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
