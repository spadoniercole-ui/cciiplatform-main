'use client';

// Gestione dei modelli di Check List custom di questo spazio. Il flusso
// corretto (dopo un fraintendimento: prima costruivo un form per
// scrivere le domande in pagina — non era quello che era stato chiesto):
// si crea la "testata" del modello (nome, descrizione), e da quel
// momento è pronta per essere esportata in Excel (con le etichette di
// colonna configurate per questo spazio — vedi la sezione sopra),
// lavorata lì, e reimportata. Nessuna domanda si scrive in questa
// pagina.

import React, { useEffect, useState } from 'react';
import { Download, Upload, Plus, ListChecks, Ban, RotateCcw, X, Save } from 'lucide-react';
import {
  ottieniModelliChecklist,
  creaModelloChecklistAction,
  aggiornaModelloChecklistAction,
  impostaStatoModelloAction,
  type ModelloChecklist,
} from '@/app/actions/checklistModelli';
import {
  ottieniColonneChecklist,
  type EtichettaColonnaChecklist,
  type CampoExtraChecklist,
} from '@/app/actions/checklistColonneConfig';
import {
  CHECKLIST_MINISTERIALE,
  type SezioneChecklist,
  type PesoDomanda,
} from '@/lib/checklist/ministeriale';
import {
  esportaModelloChecklistExcel,
  importaModelloChecklistExcel,
} from '@/lib/checklist/excelModello';

interface Props {
  nomeSchema: string;
  /** Se presente, apre subito questo modello in modifica — usato dal link "Modello vuoto" nello Scenario, per non far cercare il modello a mano nell'elenco. */
  apriModelloId?: number;
}

export function ChecklistModelliManager({ nomeSchema, apriModelloId }: Props) {
  const [modelli, setModelli] = useState<ModelloChecklist[]>([]);
  const [colonne, setColonne] = useState<EtichettaColonnaChecklist[]>([]);
  const [campiExtra, setCampiExtra] = useState<CampoExtraChecklist[]>([]);
  const [pesoDefault, setPesoDefault] = useState<PesoDomanda>('RILEVANTE');
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);

  const [mostraForm, setMostraForm] = useState(false);
  const [modificaId, setModificaId] = useState<number | null>(null);
  const [nome, setNome] = useState('');
  const [descrizione, setDescrizione] = useState('');
  const [sezioniCorrenti, setSezioniCorrenti] = useState<SezioneChecklist[]>([]);
  const [salvataggio, setSalvataggio] = useState(false);
  const [erroreForm, setErroreForm] = useState<string | null>(null);
  const [esitoImportazione, setEsitoImportazione] = useState<string | null>(null);

  const carica = async () => {
    setCaricamento(true);
    const [risultato, risultatoColonne] = await Promise.all([
      ottieniModelliChecklist(nomeSchema, true),
      ottieniColonneChecklist(nomeSchema),
    ]);
    if (risultato.success) setModelli(risultato.modelli);
    else setErrore(risultato.error || 'Impossibile caricare i modelli.');
    if (risultatoColonne.success) {
      setColonne(risultatoColonne.colonne);
      setCampiExtra(risultatoColonne.campiExtra);
      setPesoDefault(risultatoColonne.pesoDefault);
    }
    setCaricamento(false);
  };

  useEffect(() => {
    carica();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nomeSchema]);

  const apriNuovo = () => {
    setModificaId(null);
    setNome('');
    setDescrizione('');
    setSezioniCorrenti([]);
    setErroreForm(null);
    setEsitoImportazione(null);
    setMostraForm(true);
  };

  const apriModifica = (modello: ModelloChecklist) => {
    setModificaId(modello.id);
    setNome(modello.nome);
    setDescrizione(modello.descrizione || '');
    setSezioniCorrenti(modello.sezioni);
    setErroreForm(null);
    setEsitoImportazione(null);
    setMostraForm(true);
  };

  // Arrivo diretto da un link dello Scenario (modello vuoto, ancora da
  // popolare) — si apre subito in modifica invece di lasciar cercare il
  // modello a mano nell'elenco.
  useEffect(() => {
    if (apriModelloId && modelli.length > 0) {
      const modello = modelli.find((m) => m.id === apriModelloId);
      if (modello) apriModifica(modello);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apriModelloId, modelli]);

  const handleImporta = async (file: File) => {
    setErroreForm(null);
    try {
      const { sezioni, righeConErrore } = await importaModelloChecklistExcel(
        file,
        colonne,
        campiExtra,
        pesoDefault
      );
      if (sezioni.length === 0) {
        setErroreForm('Nessuna domanda riconosciuta nel file — controlla le colonne.');
        return;
      }
      setSezioniCorrenti(sezioni);
      const totaleDomande = sezioni.reduce((acc, s) => acc + s.domande.length, 0);
      setEsitoImportazione(
        `${totaleDomande} domande lette, in ${sezioni.length} sezioni.` +
          (righeConErrore.length > 0
            ? ` ${righeConErrore.length} righe scartate: ${righeConErrore
                .slice(0, 3)
                .map((r) => r.motivo)
                .join('; ')}${righeConErrore.length > 3 ? '…' : ''}`
            : '')
      );
    } catch (err: any) {
      setErroreForm(`Impossibile leggere il file: ${err.message || err}`);
    }
  };

  const handleSalva = async (e: React.FormEvent) => {
    e.preventDefault();
    setErroreForm(null);
    if (!nome.trim()) {
      setErroreForm('Il nome del modello è obbligatorio.');
      return;
    }

    setSalvataggio(true);
    try {
      const risultato = modificaId
        ? await aggiornaModelloChecklistAction(nomeSchema, modificaId, {
            nome,
            descrizione: descrizione || null,
            sezioni: sezioniCorrenti,
          })
        : await creaModelloChecklistAction(nomeSchema, nome, descrizione || null, sezioniCorrenti);

      if (!risultato.success) {
        setErroreForm(risultato.error || 'Impossibile salvare il modello.');
        return;
      }
      setMostraForm(false);
      await carica();
    } finally {
      setSalvataggio(false);
    }
  };

  const handleToggleStato = async (modello: ModelloChecklist) => {
    await impostaStatoModelloAction(nomeSchema, modello.id, !modello.attivo);
    await carica();
  };

  if (caricamento) return <p className="text-xs text-slate-400">Caricamento...</p>;

  const totaleDomande = sezioniCorrenti.reduce((acc, s) => acc + s.domande.length, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
            Check List aggiuntive
          </h2>
          <p className="text-slate-500 text-[11px] mt-1">
            Oltre alla Ministeriale: modelli propri per aree diverse (es. per un ente — Vigilanza
            Documentale, Gestione del Credito, Ufficio Legale). Si crea il modello (nome e
            descrizione), poi si esporta/lavora/reimporta in Excel — le domande si scrivono lì, non
            qui. Stesso motore di punteggio (i pesi e le soglie configurati sopra si applicano anche
            qui).
          </p>
        </div>
      </div>

      {errore && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          {errore}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() =>
            esportaModelloChecklistExcel(
              'scheletro-ministeriale',
              CHECKLIST_MINISTERIALE,
              colonne,
              campiExtra
            )
          }
          className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[10px] uppercase rounded-lg transition-colors"
        >
          <Download className="w-3.5 h-3.5" /> Esporta scheletro Ministeriale
        </button>
        <button
          type="button"
          onClick={apriNuovo}
          className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-[10px] uppercase rounded-lg transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> Nuovo modello
        </button>
      </div>

      {mostraForm && (
        <form
          onSubmit={handleSalva}
          className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
        >
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
              {modificaId ? 'Modifica modello' : 'Nuovo modello'}
            </h3>
            <button
              type="button"
              onClick={() => setMostraForm(false)}
              className="text-slate-400 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {erroreForm && (
            <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
              {erroreForm}
            </div>
          )}
          {esitoImportazione && (
            <div className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-2.5">
              {esitoImportazione}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                Nome del modello
              </label>
              <input
                type="text"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Es. INPS — Vigilanza Documentale"
                className="w-full p-2 text-sm border border-slate-200 rounded-lg text-slate-900"
                required
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                Descrizione (facoltativa)
              </label>
              <input
                type="text"
                value={descrizione}
                onChange={(e) => setDescrizione(e.target.value)}
                className="w-full p-2 text-sm border border-slate-200 rounded-lg text-slate-900"
              />
            </div>
          </div>

          <div className="border-t border-slate-100 pt-3">
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">
              Domande — via Excel
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  esportaModelloChecklistExcel(
                    nome || 'nuovo_modello',
                    sezioniCorrenti,
                    colonne,
                    campiExtra
                  )
                }
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[10px] uppercase rounded-lg transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                {sezioniCorrenti.length > 0
                  ? 'Esporta (con le domande attuali)'
                  : 'Scarica modello vuoto'}
              </button>
              <label className="flex items-center gap-1.5 px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-[10px] uppercase rounded-lg transition-colors cursor-pointer">
                <Upload className="w-3.5 h-3.5" /> Importa Excel compilato
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleImporta(file);
                    e.target.value = '';
                  }}
                />
              </label>
              <span className="text-[10px] text-slate-400 ml-auto">
                {totaleDomande} domande in {sezioniCorrenti.length} sezioni
              </span>
            </div>
          </div>

          <button
            type="submit"
            disabled={salvataggio}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-400 text-white font-bold uppercase tracking-wider rounded-lg text-xs transition-colors"
          >
            <Save className="w-3.5 h-3.5" />
            {salvataggio
              ? 'Salvataggio...'
              : modificaId
                ? 'Salva modifiche'
                : sezioniCorrenti.length > 0
                  ? 'Crea modello'
                  : 'Crea modello vuoto (da riempire dopo)'}
          </button>
        </form>
      )}

      <div className="space-y-2">
        {modelli.map((m) => (
          <div
            key={m.id}
            className={`border rounded-lg p-3 flex flex-wrap justify-between items-center gap-3 ${
              m.attivo ? 'border-slate-200' : 'border-slate-200 bg-slate-50 opacity-70'
            }`}
          >
            <div>
              <div className="flex items-center gap-2">
                <ListChecks className="w-3.5 h-3.5 text-blue-600" />
                <span className="font-bold text-slate-900 text-xs">{m.nome}</span>
                <span
                  className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                    m.attivo ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {m.attivo ? 'Attivo' : 'Disattivato'}
                </span>
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                {m.descrizione ? `${m.descrizione} — ` : ''}
                {m.sezioni.reduce((acc, s) => acc + s.domande.length, 0)} domande in{' '}
                {m.sezioni.length} sezioni
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => esportaModelloChecklistExcel(m.nome, m.sezioni, colonne, campiExtra)}
                className="p-1.5 text-slate-400 hover:text-blue-600"
                title="Esporta"
              >
                <Download className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => apriModifica(m)}
                className="p-1.5 text-slate-400 hover:text-blue-600 text-[10px] font-bold uppercase"
                title="Modifica (nome, descrizione, o reimporta un Excel aggiornato)"
              >
                Modifica
              </button>
              <button
                type="button"
                onClick={() => handleToggleStato(m)}
                className="p-1.5 text-slate-400 hover:text-red-600"
                title={m.attivo ? 'Disattiva' : 'Riattiva'}
              >
                {m.attivo ? <Ban className="w-3.5 h-3.5" /> : <RotateCcw className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        ))}
        {modelli.length === 0 && (
          <p className="text-xs text-slate-400">Nessun modello aggiuntivo creato finora.</p>
        )}
      </div>
    </div>
  );
}
