'use client';

// Check List — separata da Screening apposta: Screening genera il
// questionario (upload documenti, generazione AI), questa scheda è
// dove l'utente risponde. Sempre presente nel menu Azienda, non
// nascosta dentro il flusso di generazione — è lo spazio che si
// "illumina" quando ci sono domande in attesa.

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ListChecks, CheckCircle2, Sparkles, Wand2, Pencil, Check, X } from 'lucide-react';
import {
  ottieniScreeningAzienda,
  salvaRispostaScreeningAction,
  correggiPolaritaScreeningAction,
  aggiornaTestoDomandaScreeningAction,
  type StatoScreeningAzienda,
} from '@/app/actions/screeningAzienda';

interface Props {
  nomeSchema: string;
  aziendaId: number;
  codice: string;
}

export function CheckListAziendaScenario({ nomeSchema, aziendaId, codice }: Props) {
  const router = useRouter();
  const [stato, setStato] = useState<StatoScreeningAzienda | null>(null);
  const [caricamento, setCaricamento] = useState(true);
  const [correzioneInCorso, setCorrezioneInCorso] = useState(false);
  const [esitoCorrezione, setEsitoCorrezione] = useState<string | null>(null);
  // Modifica inline del testo di una domanda (icona matita)
  const [domandaInModifica, setDomandaInModifica] = useState<string | null>(null);
  const [testoModifica, setTestoModifica] = useState('');
  const [salvataggioTesto, setSalvataggioTesto] = useState(false);

  const carica = async () => {
    setCaricamento(true);
    const risultato = await ottieniScreeningAzienda(nomeSchema, aziendaId);
    if (risultato.success) setStato(risultato.stato);
    setCaricamento(false);
  };

  useEffect(() => {
    carica();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nomeSchema, aziendaId]);

  const handleCorreggiPolarita = async () => {
    const conferma = window.confirm(
      'Rilegge tutte le domande e riformula quelle con polarità sbagliata (dove Sì non è la risposta favorevole). Le risposte già date a una domanda riformulata vengono invertite di conseguenza, per rappresentare lo stesso fatto. Procedere?'
    );
    if (!conferma) return;
    setCorrezioneInCorso(true);
    setEsitoCorrezione(null);
    const risultato = await correggiPolaritaScreeningAction(nomeSchema, aziendaId);
    if (risultato.success) {
      setEsitoCorrezione(
        risultato.domandeCorrette === 0
          ? 'Nessuna domanda aveva la polarità sbagliata — già tutto corretto.'
          : `${risultato.domandeCorrette} domanda/e riformulata/e, ${risultato.risposteInvertite} risposta/e già data/e invertita/e di conseguenza.`
      );
      await carica();
    } else {
      setEsitoCorrezione(risultato.error || 'Impossibile completare la correzione.');
    }
    setCorrezioneInCorso(false);
  };

  const handleRispondi = async (domandaId: string, risposta: boolean) => {
    if (!stato) return;
    // Toggle-off: se si riclicca la risposta già selezionata, la si annulla
    // (torna a "nessuna risposta" = null), senza cancellare la riga.
    const corrente = stato.risposte.find((r) => r.domandaId === domandaId)?.risposta;
    const nuovoValore: boolean | null = corrente === risposta ? null : risposta;

    const nuoveRisposte = stato.risposte.filter((r) => r.domandaId !== domandaId);
    nuoveRisposte.push({ domandaId, risposta: nuovoValore, note: null });
    setStato({ ...stato, risposte: nuoveRisposte });
    await salvaRispostaScreeningAction(nomeSchema, aziendaId, domandaId, nuovoValore, null);
    const screeningRis = await ottieniScreeningAzienda(nomeSchema, aziendaId);
    if (screeningRis.success) setStato(screeningRis.stato);
    // Aggiorna il semaforo dei passi nel layout (Server Component): il badge
    // delle domande residue deve scalare a ogni risposta e la Check List
    // diventare verde appena il contatore arriva a zero, senza ricaricare.
    router.refresh();
  };

  const avviaModificaDomanda = (domandaId: string, testoCorrente: string) => {
    setDomandaInModifica(domandaId);
    setTestoModifica(testoCorrente);
  };

  const salvaModificaDomanda = async () => {
    if (!domandaInModifica || !testoModifica.trim()) return;
    setSalvataggioTesto(true);
    const risultato = await aggiornaTestoDomandaScreeningAction(
      nomeSchema,
      aziendaId,
      domandaInModifica,
      testoModifica.trim()
    );
    if (risultato.success) {
      setDomandaInModifica(null);
      setTestoModifica('');
      await carica();
    }
    setSalvataggioTesto(false);
  };

  if (caricamento) return <p className="text-xs text-slate-400">Caricamento...</p>;

  if (!stato?.esiste || stato.sezioni.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="font-bold text-slate-900 uppercase text-xs tracking-wider">Check List</h2>
          <p className="text-[11px] text-slate-500 mt-1">
            Le domande generate dallo Screening, mirate alle direttrici di questo ente per questa
            azienda specifica — non l&apos;ennesima versione della Ministeriale.
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center space-y-3">
          <ListChecks className="w-8 h-8 text-slate-300 mx-auto" />
          <p className="text-xs text-slate-500">
            Nessun questionario ancora generato per questa azienda.
          </p>
          <Link
            href={`/spazio/${codice}/aziende/${aziendaId}/screening`}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold uppercase tracking-wider rounded-lg text-xs transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5" /> Vai a Screening per generarlo
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-bold text-slate-900 uppercase text-xs tracking-wider">Check List</h2>
          <p className="text-[11px] text-slate-500 mt-1">
            Le domande generate dallo Screening, mirate alle direttrici di questo ente per questa
            azienda specifica. Un &quot;Sì&quot; è sempre una buona notizia per l&apos;azienda, un
            &quot;No&quot; sempre una criticità — nessuna eccezione, per costruzione.
          </p>
        </div>
        <button
          type="button"
          onClick={handleCorreggiPolarita}
          disabled={correzioneInCorso}
          className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 font-bold text-[10px] uppercase rounded-lg transition-colors shrink-0"
          title="Per le domande generate prima che la regola Sì=favorevole fosse imposta"
        >
          <Wand2 className="w-3.5 h-3.5" />
          {correzioneInCorso ? 'Correzione...' : 'Correggi polarità domande esistenti'}
        </button>
      </div>

      {esitoCorrezione && (
        <div className="text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-3">
          {esitoCorrezione}
        </div>
      )}

      {stato.quadro && (
        <div
          className={`border rounded-xl p-4 ${
            stato.quadro.coloreEtichetta === 'verde'
              ? 'bg-emerald-50 border-emerald-200'
              : stato.quadro.coloreEtichetta === 'giallo'
                ? 'bg-amber-50 border-amber-200'
                : 'bg-red-50 border-red-200'
          }`}
        >
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
            Esito
          </span>
          <span className="text-sm font-bold text-slate-900">
            {stato.quadro.etichetta}
            {stato.quadro.punteggio !== null && (
              <span className="font-normal text-slate-500">
                {' '}
                — punteggio {stato.quadro.punteggio > 0 ? '+' : ''}
                {stato.quadro.punteggio.toFixed(1)}
              </span>
            )}
          </span>
          <p className="text-[10px] text-slate-400 mt-1">
            Somma dei pesi delle domande con No, meno la somma dei pesi di quelle con Sì — 0 o
            negativo è un quadro solido, più sale più pesano le criticità.
          </p>
        </div>
      )}

      <div className="space-y-4">
        {stato.sezioni.map((sez) => (
          <div key={sez.numero} className="bg-white border border-slate-200 rounded-xl p-5">
            <h4 className="font-bold text-slate-900 text-xs mb-3">{sez.titolo}</h4>
            <div className="space-y-3">
              {sez.domande.map((d) => {
                const risposta = stato.risposte.find((r) => r.domandaId === d.id)?.risposta;
                return (
                  <div
                    key={d.id}
                    className="flex items-center justify-between gap-3 border-b border-slate-50 pb-2 last:border-0"
                  >
                    {domandaInModifica === d.id ? (
                      <div className="flex-1 flex items-center gap-1.5">
                        <input
                          type="text"
                          value={testoModifica}
                          onChange={(e) => setTestoModifica(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') salvaModificaDomanda();
                            if (e.key === 'Escape') setDomandaInModifica(null);
                          }}
                          autoFocus
                          className="flex-1 text-xs px-2 py-1 border border-blue-300 rounded text-slate-900 outline-none focus:border-blue-500"
                        />
                        <button
                          type="button"
                          onClick={salvaModificaDomanda}
                          disabled={salvataggioTesto || !testoModifica.trim()}
                          className="p-1 text-emerald-600 hover:text-emerald-800 disabled:opacity-40"
                          title="Salva"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDomandaInModifica(null)}
                          className="p-1 text-slate-400 hover:text-slate-600"
                          title="Annulla"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-700 flex-1 flex items-center gap-1.5 group">
                        {d.domanda}
                        <button
                          type="button"
                          onClick={() => avviaModificaDomanda(d.id, d.domanda)}
                          className="text-slate-300 hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                          title="Modifica il testo della domanda"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                      </span>
                    )}
                    <div className="flex gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleRispondi(d.id, true)}
                        className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase transition-colors ${
                          risposta === true
                            ? 'bg-emerald-600 text-white'
                            : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                        }`}
                      >
                        Sì
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRispondi(d.id, false)}
                        className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase transition-colors ${
                          risposta === false
                            ? 'bg-red-600 text-white'
                            : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                        }`}
                      >
                        No
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        {stato.quadro && (
          <p className="flex items-center gap-1.5 text-[11px] text-emerald-700">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Tutte le domande hanno una risposta — esito calcolato.
          </p>
        )}
      </div>
    </div>
  );
}
