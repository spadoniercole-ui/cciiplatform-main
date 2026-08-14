'use client';

// L'unico assistente — sempre nello stesso posto, in basso a destra, su
// ogni pagina dello spazio. Non è più "l'assistente dotto" separato dalle
// quattro chat guidate nascoste dentro ogni funzione: è la stessa cosa,
// che legge dal contesto (ContestoAssistenteContext) su quale funzione
// si trova l'utente e si comporta di conseguenza — se è su una pagina
// compilabile in conversazione lo fa davvero (stesse azioni server di
// prima), altrimenti risponde come assistente di cultura generale.

import React, { useEffect, useRef, useState } from 'react';
import { MessageCircleQuestion, X, Send, Loader2 } from 'lucide-react';
import {
  chiediAssistenteContestuale,
  type RisultatoAssistenteContestuale,
} from '@/app/actions/assistenteContestuale';
import { useContestoAssistente } from '@/components/ContestoAssistenteContext';

interface Messaggio {
  ruolo: 'utente' | 'assistente';
  testo: string;
}

const SALUTI: Record<string, string> = {
  'anagrafica-ente':
    "Ciao! Ti aiuto a compilare l'anagrafica di questo ente. Dimmi pure con calma quello che sai — anche un solo dato va bene, non serve tutto insieme. Da dove iniziamo?",
  'debitoria-ente':
    "Ciao! Ti aiuto a registrare la Situazione Debitoria — le voci che l'ente dichiara di avere verso questa azienda. Dettami una voce alla volta.",
  'checklist-ente':
    'Ciao! Ti aiuto a compilare questa check list, una domanda alla volta — anche solo qualcuna va bene.',
  'checklist-generale':
    'Ciao! Ti aiuto a compilare questa check list, una domanda alla volta — anche solo qualcuna va bene.',
  proposta:
    'Ciao! Ti aiuto a registrare le righe della Proposta — dettamele una alla volta (creditore, importo, percentuale offerta, modalità).',
  xbrl: 'Ciao! Se sei in difficoltà con il caricamento del bilancio XBRL, chiedimi pure — non posso caricarlo al posto tuo, ma ti guido passo per passo.',
  simulazione:
    'Ciao! Chiedimi pure come funzionano gli scenari o il DSCR — il calcolo lo fa la pagina, io ti aiuto a interpretarlo.',
  parametri:
    'Ciao! Sei in Parametri di Spazio — chiedimi pure a cosa serve questa sezione o come si usa.',
};

const SALUTO_GENERICO =
  'Chiedimi qualcosa — un concetto ("a cosa serve l\'indice EBIT?") o come si fa una cosa in piattaforma ("come carico la situazione debitoria dell\'ente?"). Se sei già su una funzione compilabile (Anagrafica, Check List, Situazione Debitoria, Proposta), posso anche aiutarti a compilarla parlandone.';

export function ChatbotAiuto() {
  const contesto = useContestoAssistente();
  const [aperto, setAperto] = useState(false);
  const [messaggi, setMessaggi] = useState<Messaggio[]>([]);
  const [bozza, setBozza] = useState('');
  const [inviando, setInviando] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const fineListaRef = useRef<HTMLDivElement>(null);
  const ultimaPagina = useRef<string | null>(null);

  useEffect(() => {
    fineListaRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messaggi, aperto]);

  useEffect(() => {
    const paginaAttuale = contesto?.pagina || null;
    if (paginaAttuale !== ultimaPagina.current) {
      ultimaPagina.current = paginaAttuale;
      setMessaggi([]);
      setErrore(null);
    }
  }, [contesto?.pagina]);

  const handleInvia = async () => {
    const domanda = bozza.trim();
    if (!domanda || inviando) return;

    const cronologiaAttuale = messaggi;
    setMessaggi((prev) => [...prev, { ruolo: 'utente', testo: domanda }]);
    setBozza('');
    setErrore(null);
    setInviando(true);

    const risultato: RisultatoAssistenteContestuale = await chiediAssistenteContestuale(
      contesto,
      cronologiaAttuale,
      domanda
    );
    if (risultato.success && risultato.risposta) {
      setMessaggi((prev) => [...prev, { ruolo: 'assistente', testo: risultato.risposta! }]);
      if (risultato.datiAggiornati) {
        window.dispatchEvent(new CustomEvent('assistente:dati-aggiornati'));
      }
    } else {
      setErrore(risultato.error || 'Impossibile ottenere una risposta.');
    }
    setInviando(false);
  };

  const handleTastiera = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleInvia();
    }
  };

  const saluto = (contesto?.pagina && SALUTI[contesto.pagina]) || SALUTO_GENERICO;

  if (!aperto) {
    return (
      <button
        type="button"
        onClick={() => setAperto(true)}
        title="Chiedi all'assistente"
        className="fixed bottom-5 right-5 z-40 flex items-center justify-center w-12 h-12 rounded-full bg-brand-analisi text-white shadow-lg hover:scale-105 transition-transform"
      >
        <MessageCircleQuestion className="w-5 h-5" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-5 right-5 z-40 w-[340px] max-w-[calc(100vw-2.5rem)] h-[440px] max-h-[calc(100vh-6rem)] bg-white border border-slate-200 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-brand-notte text-white shrink-0">
        <div className="flex items-center gap-2">
          <MessageCircleQuestion className="w-4 h-4 text-brand-analisi" />
          <span className="font-bold text-xs uppercase tracking-wider">Assistente</span>
        </div>
        <button
          type="button"
          onClick={() => setAperto(false)}
          className="text-slate-400 hover:text-white"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messaggi.length === 0 && (
          <div className="bg-slate-100 text-slate-800 text-[12px] leading-relaxed rounded-xl px-3 py-2 max-w-[90%]">
            {saluto}
          </div>
        )}
        {messaggi.map((m, i) => (
          <div
            key={i}
            className={`text-[12px] leading-relaxed rounded-xl px-3 py-2 max-w-[85%] ${
              m.ruolo === 'utente'
                ? 'bg-brand-analisi text-white ml-auto'
                : 'bg-slate-100 text-slate-800'
            }`}
          >
            {m.testo}
          </div>
        ))}
        {inviando && (
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <Loader2 className="w-3 h-3 animate-spin" /> Sto pensando...
          </div>
        )}
        {errore && (
          <p className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">
            {errore}
          </p>
        )}
        <div ref={fineListaRef} />
      </div>

      <div className="border-t border-slate-100 p-2.5 flex items-end gap-2 shrink-0">
        <textarea
          value={bozza}
          onChange={(e) => setBozza(e.target.value)}
          onKeyDown={handleTastiera}
          placeholder="Scrivi qui..."
          rows={1}
          className="flex-1 resize-none text-xs p-2 border border-slate-200 rounded-lg text-slate-900 outline-none focus:border-brand-analisi"
        />
        <button
          type="button"
          onClick={handleInvia}
          disabled={inviando || !bozza.trim()}
          className="flex items-center justify-center w-8 h-8 rounded-lg bg-brand-analisi text-white disabled:opacity-40 shrink-0"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
