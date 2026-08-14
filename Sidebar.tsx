'use client';

// Proposta dello scenario: acquisizione della proposta (per categoria di
// creditore) e verifica automatica di ricevibilità contro i limiti di
// Parametri di Spazio. La generazione della Relazione AI è un passo a sé
// (vedi RelazioneAiScenario.tsx), sbloccato solo a flusso completo — non
// vive più qui insieme all'acquisizione.

import React, { useEffect, useState } from 'react';
import {
  Plus,
  Trash2,
  ShieldCheck,
  ShieldX,
  Download,
  Upload,
  FileText,
  Pencil,
  X,
  Scale,
  AlertTriangle,
} from 'lucide-react';
import { useDichiaraContestoAssistente } from '@/components/ContestoAssistenteContext';
import { ottieniDebitiEnte, type RigaDebitoEnte } from '@/app/actions/debitiEnte';
import { saldoRigaDebitoEnte } from '@/lib/debitiEnte/tipoDebito';
import { SimulazioneRiceventeScenario } from '@/components/spazio/SimulazioneRiceventeScenario';
import {
  ottieniPropostaScenario,
  aggiungiRigaPropostaAction,
  modificaRigaPropostaAction,
  eliminaRigaPropostaAction,
  eliminaTuttaPropostaAction,
  impostaRigaRilevanteAction,
  verificaRicevibilitaProposta,
  type RigaProposta,
  type EsitoRicevibilita,
  type ModalitaProposta,
} from '@/app/actions/propostaScenario';
import {
  ottieniLimitiRicevibilita,
  ottieniPercentualeMediaProposta,
  type LimiteRicevibilita,
} from '@/app/actions/parametriSpazio';
import { ottieniAziendaPerId, type Azienda } from '@/app/actions/aziende';
import { impostaBloccoRigaRilevanteAction } from '@/app/actions/scenari';
import type { TipoProposta } from '@/lib/origineProposta';
import { esportaPropostaExcel, importaPropostaExcel } from '@/lib/proposta/excelProposta';
import { generaDocumentoPropostaPdf } from '@/lib/proposta/pdfProposta';
import { RANGHI_LEGALI, etichettaRango, type RangoLegale } from '@/lib/proposta/rangoLegale';

interface Props {
  nomeSchema: string;
  scenarioId: number;
  aziendaId: number;
  tipoProposta: TipoProposta;
  tipoSpazio: 'ENTE' | 'NON_ENTE';
  nomeScenario: string;
  rigaRilevanteBloccataIniziale: boolean;
  codice: string;
}

const FORM_VUOTO = {
  categoriaCreditore: '',
  importoDovuto: 0,
  percentualeOfferta: 100,
  modalita: 'UNICA_SOLUZIONE' as ModalitaProposta,
  numeroRate: null as number | null,
  note: null as string | null,
  rangoLegale: null as RangoLegale | null,
};

/** Percentuale di partenza per una nuova riga — la media configurata
 * in Parametri di Spazio se disponibile (solo Redigente), altrimenti
 * il 100% di sempre. Resta modificabile riga per riga. */
function creaFormVuoto(percentualeMediaConfigurata: number | null) {
  return {
    ...FORM_VUOTO,
    percentualeOfferta: percentualeMediaConfigurata ?? FORM_VUOTO.percentualeOfferta,
  };
}

/**
 * Un <input type="number"> rifiuta la virgola come separatore decimale a
 * livello di browser, prima ancora di arrivare qui — il campo si svuota
 * e il valore diventa 0 in silenzio. Con un input testuale, accettiamo
 * sia la virgola (convenzione italiana) sia il punto.
 */
function parseNumeroItaliano(testo: string): number {
  const pulito = testo.trim().replace(',', '.');
  const numero = Number(pulito);
  return Number.isNaN(numero) ? 0 : numero;
}

export function PropostaScenario({
  nomeSchema,
  scenarioId,
  aziendaId,
  tipoProposta,
  tipoSpazio,
  nomeScenario,
  rigaRilevanteBloccataIniziale,
  codice,
}: Props) {
  const [righe, setRighe] = useState<RigaProposta[]>([]);
  const [debitiEnte, setDebitiEnte] = useState<RigaDebitoEnte[]>([]);
  const [categorie, setCategorie] = useState<LimiteRicevibilita[]>([]);
  const [esito, setEsito] = useState<EsitoRicevibilita | null>(null);
  const [azienda, setAzienda] = useState<Azienda | null>(null);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);
  const [form, setForm] = useState(FORM_VUOTO);
  // Solo Redigente — pre-compila la percentuale offerta di ogni nuova
  // riga con il valore medio configurato in Parametri di Spazio,
  // invece del fisso 100% di prima. Resta modificabile riga per riga.
  const [percentualeMediaConfigurata, setPercentualeMediaConfigurata] = useState<number | null>(
    null
  );
  const [rigaInModifica, setRigaInModifica] = useState<number | null>(null);

  // Il caricamento della percentuale media è asincrono e arriva dopo
  // il primo render — se il form è ancora quello iniziale (nessuna
  // categoria scritta, nessuna riga in modifica), lo si aggiorna col
  // valore giusto appena arriva. Non tocca un form che l'utente ha già
  // iniziato a compilare.
  useEffect(() => {
    if (percentualeMediaConfigurata === null) return;
    setForm((prev) =>
      prev.categoriaCreditore === '' && !rigaInModifica
        ? { ...prev, percentualeOfferta: percentualeMediaConfigurata }
        : prev
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [percentualeMediaConfigurata]);
  const [salvataggio, setSalvataggio] = useState(false);
  const [importazioneInCorso, setImportazioneInCorso] = useState(false);
  const [esitoImportazione, setEsitoImportazione] = useState<string | null>(null);
  const [righeSelezionate, setRigheSelezionate] = useState<Set<number>>(new Set());
  const [eliminazioneMultiplaInCorso, setEliminazioneMultiplaInCorso] = useState(false);

  const carica = async () => {
    setCaricamento(true);
    try {
      const [risultatoRighe, risultatoCategorie, risultatoAzienda, risultatoMedia] =
        await Promise.all([
          ottieniPropostaScenario(nomeSchema, scenarioId),
          ottieniLimitiRicevibilita(nomeSchema, tipoSpazio),
          ottieniAziendaPerId(nomeSchema, aziendaId),
          tipoSpazio === 'NON_ENTE'
            ? ottieniPercentualeMediaProposta(nomeSchema)
            : Promise.resolve({ success: true, percentuale: null }),
        ]);
      if (risultatoMedia.success && risultatoMedia.percentuale !== null) {
        setPercentualeMediaConfigurata(risultatoMedia.percentuale);
      }
      if (risultatoRighe.success) setRighe(risultatoRighe.righe);
      else setErrore(risultatoRighe.error || 'Impossibile caricare la proposta.');
      if (risultatoCategorie.success) setCategorie(risultatoCategorie.limiti);
      if (risultatoAzienda.success && risultatoAzienda.azienda)
        setAzienda(risultatoAzienda.azienda);

      // La ricevibilità è un concetto ESCLUSIVO del percorso Ricevente
      // (l'ente creditore che valuta una proposta ricevuta): è l'ente a
      // fissare le soglie e a giudicare. Nel percorso Redigente
      // (DA_DEFINIRE) non esiste — chi predispone la proposta non la
      // "verifica ricevibile" contro soglie proprie. Perciò la si calcola
      // solo per RICEVUTA.
      if (tipoProposta === 'RICEVUTA') {
        const risultatoEsito = await verificaRicevibilitaProposta(
          nomeSchema,
          scenarioId,
          tipoSpazio
        );
        if (risultatoEsito.success && risultatoEsito.esito) setEsito(risultatoEsito.esito);
      }

      // Il confronto con la Situazione Debitoria dell'ente ha senso solo
      // per le proposte Ricevute — un ente da valutare esiste solo lì.
      if (tipoProposta === 'RICEVUTA') {
        const risultatoDebiti = await ottieniDebitiEnte(nomeSchema, aziendaId);
        if (risultatoDebiti.success) setDebitiEnte(risultatoDebiti.righe);
      }
    } finally {
      setCaricamento(false);
    }
  };

  useEffect(() => {
    carica();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nomeSchema, scenarioId]);

  useDichiaraContestoAssistente({ pagina: 'proposta', nomeSchema, scenarioId, tipoProposta });

  useEffect(() => {
    const handler = () => carica();
    window.addEventListener('assistente:dati-aggiornati', handler);
    return () => window.removeEventListener('assistente:dati-aggiornati', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nomeSchema, scenarioId]);

  const handleAggiungi = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.categoriaCreditore.trim()) {
      setErrore('Seleziona o scrivi una categoria di creditore.');
      return;
    }
    setSalvataggio(true);
    setErrore(null);
    const risultato = rigaInModifica
      ? await modificaRigaPropostaAction(nomeSchema, rigaInModifica, form)
      : await aggiungiRigaPropostaAction(nomeSchema, scenarioId, form);
    if (!risultato.success) {
      setErrore(
        risultato.error || `Impossibile ${rigaInModifica ? 'modificare' : 'aggiungere'} la riga.`
      );
      setSalvataggio(false);
      return;
    }
    setForm(creaFormVuoto(percentualeMediaConfigurata));
    setRigaInModifica(null);
    setSalvataggio(false);
    await carica();
  };

  const apriModifica = (riga: RigaProposta) => {
    setForm({
      categoriaCreditore: riga.categoriaCreditore,
      importoDovuto: riga.importoDovuto,
      percentualeOfferta: riga.percentualeOfferta,
      modalita: riga.modalita,
      numeroRate: riga.numeroRate,
      note: riga.note,
      rangoLegale: riga.rangoLegale,
    });
    setRigaInModifica(riga.id);
    setErrore(null);
  };

  const handleAnnullaModifica = () => {
    setForm(creaFormVuoto(percentualeMediaConfigurata));
    setRigaInModifica(null);
    setErrore(null);
  };

  const handelimina = async (id: number) => {
    if (rigaInModifica === id) handleAnnullaModifica();
    await eliminaRigaPropostaAction(nomeSchema, id);
    await carica();
  };

  const toggleSelezione = (id: number) => {
    setRigheSelezionate((prev) => {
      const nuovo = new Set(prev);
      if (nuovo.has(id)) nuovo.delete(id);
      else nuovo.add(id);
      return nuovo;
    });
  };

  const toggleSelezionaTutte = () => {
    setRigheSelezionate((prev) =>
      prev.size === righe.length ? new Set() : new Set(righe.map((r) => r.id))
    );
  };

  const handleEliminaSelezionate = async () => {
    if (righeSelezionate.size === 0) return;
    const conferma = window.confirm(
      `Eliminare ${righeSelezionate.size} rig${righeSelezionate.size === 1 ? 'a' : 'he'} selezionat${righeSelezionate.size === 1 ? 'a' : 'e'}? L'operazione non è reversibile.`
    );
    if (!conferma) return;
    setEliminazioneMultiplaInCorso(true);
    try {
      for (const id of righeSelezionate) {
        await eliminaRigaPropostaAction(nomeSchema, id);
      }
      setRigheSelezionate(new Set());
      if (righeSelezionate.has(rigaInModifica ?? -1)) handleAnnullaModifica();
      await carica();
    } finally {
      setEliminazioneMultiplaInCorso(false);
    }
  };

  const handleEsporta = () => {
    esportaPropostaExcel(`scenario_${scenarioId}`, righe);
  };

  const handleGeneraDocumento = () => {
    if (!azienda) return;
    generaDocumentoPropostaPdf({
      azienda,
      nomeScenario,
      righe,
    });
  };

  const handleImporta = async (file: File) => {
    // Senza questo controllo, importare due volte lo stesso file
    // raddoppia ogni riga: l'import non aveva mai modo di sapere che
    // quei dati erano già presenti. Si chiede conferma e si sostituisce
    // tutto, non si prova a indovinare quali righe corrispondono a
    // quali (un creditore può avere più righe con ranghi diversi: un
    // confronto automatico rischierebbe di unire righe che invece
    // devono restare distinte).
    if (righe.length > 0) {
      const conferma = window.confirm(
        `Questo scenario ha già ${righe.length} rig${righe.length === 1 ? 'a' : 'he'} di proposta. Importando da questo file, le righe esistenti verranno eliminate e sostituite con quelle del file — non aggiunte. Continuare?`
      );
      if (!conferma) return;
    }

    setImportazioneInCorso(true);
    setEsitoImportazione(null);
    try {
      const { righe: righeImportate, righeConErrore } = await importaPropostaExcel(file);

      if (righe.length > 0) {
        const risultatoPulizia = await eliminaTuttaPropostaAction(nomeSchema, scenarioId);
        if (!risultatoPulizia.success) {
          setEsitoImportazione(
            risultatoPulizia.error || 'Impossibile eliminare le righe esistenti prima di importare.'
          );
          return;
        }
      }

      // Verifica il vero esito di ogni salvataggio: prima mostravamo
      // quante righe erano state LETTE dal file, non quante erano state
      // DAVVERO salvate — un salvataggio fallito spariva in silenzio,
      // dando l'impressione che l'import fosse riuscito senza che i dati
      // comparissero mai.
      let salvate = 0;
      const erroriSalvataggio: string[] = [];
      for (const riga of righeImportate) {
        const risultato = await aggiungiRigaPropostaAction(nomeSchema, scenarioId, riga);
        if (risultato.success) {
          salvate += 1;
        } else {
          erroriSalvataggio.push(
            `"${riga.categoriaCreditore}": ${risultato.error || 'errore sconosciuto'}`
          );
        }
      }
      await carica();

      const parti = [`${salvate} di ${righeImportate.length} righe lette sono state salvate.`];
      if (erroriSalvataggio.length > 0) {
        parti.push(
          `Non salvate: ${erroriSalvataggio.slice(0, 3).join('; ')}${erroriSalvataggio.length > 3 ? '…' : ''}`
        );
      }
      if (righeConErrore.length > 0) {
        parti.push(
          `${righeConErrore.length} righe scartate in lettura: ${righeConErrore
            .slice(0, 3)
            .map((r) => r.motivo)
            .join('; ')}${righeConErrore.length > 3 ? '…' : ''}`
        );
      }
      setEsitoImportazione(parti.join(' '));
    } catch (err: any) {
      setEsitoImportazione(`Impossibile leggere il file: ${err.message || err}`);
    } finally {
      setImportazioneInCorso(false);
    }
  };

  if (caricamento) return <p className="text-xs text-slate-400">Caricamento...</p>;

  return (
    <div className="space-y-6">
      {tipoProposta !== 'RICEVUTA' && (
        <>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h2 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
                Acquisizione della proposta
              </h2>
              <p className="text-slate-500 text-[11px] mt-1">
                Una riga per categoria di creditore. In difficoltà? L&apos;assistente in basso a
                destra può registrare le righe parlandone.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleEsporta}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[10px] uppercase rounded-lg transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              {righe.length > 0 ? 'Esporta modello (con righe attuali)' : 'Scarica modello vuoto'}
            </button>
            <label className="flex items-center gap-1.5 px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-[10px] uppercase rounded-lg transition-colors cursor-pointer">
              <Upload className="w-3.5 h-3.5" />
              {importazioneInCorso ? 'Importazione...' : 'Importa modello compilato'}
              <input
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                disabled={importazioneInCorso}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImporta(file);
                  e.target.value = '';
                }}
              />
            </label>
            {tipoProposta === 'DA_DEFINIRE' && (
              <button
                type="button"
                onClick={handleGeneraDocumento}
                disabled={!azienda || righe.length === 0}
                title={
                  righe.length === 0
                    ? 'Aggiungi almeno una riga alla proposta prima di generare il documento.'
                    : ''
                }
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white font-bold text-[10px] uppercase rounded-lg transition-colors"
              >
                <FileText className="w-3.5 h-3.5" /> Genera documento (PDF) da inviare
              </button>
            )}
          </div>
          {esitoImportazione && (
            <div className="text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-3">
              {esitoImportazione}
            </div>
          )}

          {errore && (
            <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
              {errore}
            </div>
          )}

          <form
            onSubmit={handleAggiungi}
            className="bg-white border border-slate-200 rounded-xl p-5 space-y-3"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                {rigaInModifica ? 'Modifica riga' : 'Nuova riga'}
              </h3>
              {rigaInModifica && (
                <button
                  type="button"
                  onClick={handleAnnullaModifica}
                  className="flex items-center gap-1 text-[10px] font-bold text-slate-400 hover:text-red-600 uppercase"
                >
                  <X className="w-3 h-3" /> Annulla modifica
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">
                  Categoria creditore
                </label>
                <input
                  list="categorie-creditore"
                  value={form.categoriaCreditore}
                  onChange={(e) => setForm({ ...form, categoriaCreditore: e.target.value })}
                  placeholder="Es. INPS"
                  className="w-full p-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
                />
                <datalist id="categorie-creditore">
                  {categorie.map((c) => (
                    <option key={c.id} value={c.categoriaCreditore} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">
                  Importo dovuto (€)
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={form.importoDovuto}
                  onChange={(e) =>
                    setForm({ ...form, importoDovuto: parseNumeroItaliano(e.target.value) })
                  }
                  className="w-full p-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
                />
              </div>
              <div>
                <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">
                  % offerta
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={form.percentualeOfferta}
                  onChange={(e) =>
                    setForm({ ...form, percentualeOfferta: parseNumeroItaliano(e.target.value) })
                  }
                  className="w-full p-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
                />
                <p className="text-[9px] text-slate-400 mt-1">
                  Numero intero da 0 a 100 (es. 6 per il 6%, non 0,06)
                </p>
              </div>
              <div>
                <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">
                  Modalità
                </label>
                <select
                  value={form.modalita}
                  onChange={(e) =>
                    setForm({ ...form, modalita: e.target.value as ModalitaProposta })
                  }
                  className="w-full p-2 text-xs bg-white border border-slate-200 rounded-lg text-slate-900"
                >
                  <option value="UNICA_SOLUZIONE">Unica soluzione</option>
                  <option value="RATEALE">Rateale</option>
                </select>
              </div>
              <div>
                <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">
                  Rango legale
                </label>
                <select
                  value={form.rangoLegale ?? ''}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      rangoLegale: (e.target.value || null) as RangoLegale | null,
                    })
                  }
                  className="w-full p-2 text-xs bg-white border border-slate-200 rounded-lg text-slate-900"
                >
                  <option value="">Non classificato</option>
                  {RANGHI_LEGALI.map((r) => (
                    <option key={r.valore} value={r.valore}>
                      {r.etichetta}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {form.modalita === 'RATEALE' && (
              <div className="w-32">
                <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">
                  Numero rate
                </label>
                <input
                  type="number"
                  min={1}
                  value={form.numeroRate ?? ''}
                  onChange={(e) =>
                    setForm({ ...form, numeroRate: e.target.value ? Number(e.target.value) : null })
                  }
                  className="w-full p-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
                />
              </div>
            )}
            <button
              type="submit"
              disabled={salvataggio}
              className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-bold text-[10px] uppercase rounded-lg transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              {salvataggio
                ? 'Salvataggio...'
                : rigaInModifica
                  ? 'Salva modifiche'
                  : 'Aggiungi riga'}
            </button>
          </form>

          {righeSelezionate.size > 0 && (
            <div className="flex items-center justify-between bg-red-50 border border-red-200 rounded-xl p-3">
              <span className="text-xs font-bold text-red-800">
                {righeSelezionate.size} rig
                {righeSelezionate.size === 1 ? 'a selezionata' : 'he selezionate'}
              </span>
              <button
                type="button"
                onClick={handleEliminaSelezionate}
                disabled={eliminazioneMultiplaInCorso}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 disabled:bg-slate-300 text-white font-bold text-[10px] uppercase rounded-lg transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {eliminazioneMultiplaInCorso ? 'Eliminazione...' : 'Elimina selezionate'}
              </button>
            </div>
          )}

          {righe.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase text-slate-500 font-bold">
                    <th className="p-3 w-8">
                      <input
                        type="checkbox"
                        checked={righe.length > 0 && righeSelezionate.size === righe.length}
                        onChange={toggleSelezionaTutte}
                        aria-label="Seleziona tutte le righe"
                      />
                    </th>
                    <th className="p-3">Creditore</th>
                    <th className="p-3">Dovuto</th>
                    <th className="p-3">Offerta</th>
                    <th className="p-3">Modalità</th>
                    <th className="p-3">Rango</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {righe.map((r) => {
                    return (
                      <tr key={r.id}>
                        <td className="p-3">
                          <input
                            type="checkbox"
                            checked={righeSelezionate.has(r.id)}
                            onChange={() => toggleSelezione(r.id)}
                            aria-label={`Seleziona riga ${r.categoriaCreditore}`}
                          />
                        </td>
                        <td className="p-3 font-bold text-slate-900">{r.categoriaCreditore}</td>
                        <td className="p-3 text-slate-700">
                          € {r.importoDovuto.toLocaleString('it-IT')}
                        </td>
                        <td className="p-3 text-slate-700">{r.percentualeOfferta}%</td>
                        <td className="p-3 text-slate-700">
                          {r.modalita === 'UNICA_SOLUZIONE'
                            ? 'Unica soluzione'
                            : `Rateale (${r.numeroRate || '?'} rate)`}
                        </td>
                        <td className="p-3 text-[11px] text-slate-600">
                          {r.rangoLegale ? etichettaRango(r.rangoLegale) : '—'}
                        </td>
                        <td className="p-3">
                          <button
                            type="button"
                            onClick={() => apriModifica(r)}
                            className="text-slate-400 hover:text-blue-600 mr-2"
                            title="Modifica"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handelimina(r.id)}
                            className="text-slate-400 hover:text-red-600"
                            title="Elimina"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {tipoProposta === 'RICEVUTA' && (
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3 mb-3">
            <Scale className="w-4 h-4 text-blue-600" />
            <h3 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
              Confronto con la Situazione Debitoria dell&apos;Ente
            </h3>
          </div>
          {(() => {
            const rigaEstratta = esito?.righe[0];
            // Il confronto con la proposta va fatto sul saldo residuo,
            // non sul debito lordo — una quota può già essere stata
            // versata (segnalato dall'utente: sommare il lordo dava un
            // numero sbagliato, gonfiato rispetto a quanto l'ente
            // incasserebbe davvero).
            const totaleLordoDebitiEnte = debitiEnte.reduce((acc, r) => acc + r.importo, 0);
            const totaleDebitiEnte = debitiEnte.reduce((acc, r) => acc + saldoRigaDebitoEnte(r), 0);
            if (!rigaEstratta || rigaEstratta.importoDovuto === 0) {
              const giaAnalizzatoSenzaValore = !!rigaEstratta?.motivazione;
              return (
                <div className="flex items-start gap-2 text-xs text-slate-500">
                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <p>
                    {giaAnalizzatoSenzaValore ? (
                      <>
                        L&apos;analisi è stata fatta, ma non ha trovato un importo chiaro per questo
                        ente: <span className="italic">{rigaEstratta!.motivazione}</span> — aggiungi
                        gli alias di questo ente in Parametri di Spazio se il documento lo chiama
                        con un nome diverso, poi rianalizza qui sotto.
                      </>
                    ) : (
                      <>
                        Carica e analizza la proposta di cram down qui sotto per vedere il confronto
                        — l&apos;importo offerto lo estrae l&apos;AI dal documento.
                      </>
                    )}
                  </p>
                </div>
              );
            }
            return (
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                  <span className="text-[10px] text-slate-500 uppercase font-bold block">
                    Offerto — estratto dal documento
                  </span>
                  <span className="text-sm font-bold text-slate-900">
                    € {rigaEstratta.importoDovuto.toLocaleString('it-IT')}
                  </span>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {rigaEstratta.percentualeOfferta}% — {rigaEstratta.modalita}
                  </p>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                  <span className="text-[10px] text-slate-500 uppercase font-bold block">
                    Soglia richiesta — Parametri di Spazio
                  </span>
                  {(() => {
                    const limiteEnte = categorie[0];
                    if (!limiteEnte) {
                      return (
                        <span className="text-[11px] text-slate-400">
                          Nessuna soglia configurata
                        </span>
                      );
                    }
                    return (
                      <>
                        <span className="text-sm font-bold text-slate-900">
                          {limiteEnte.valoreLiquidazioneStimato !== null &&
                          limiteEnte.valoreLiquidazioneStimato > 0
                            ? `€ ${limiteEnte.valoreLiquidazioneStimato.toLocaleString('it-IT')}`
                            : `${limiteEnte.percentualeMinima}%`}
                        </span>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          {limiteEnte.valoreLiquidazioneStimato !== null &&
                          limiteEnte.valoreLiquidazioneStimato > 0
                            ? 'valore di liquidazione stimato'
                            : 'percentuale minima'}
                        </p>
                      </>
                    );
                  })()}
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                  <span className="text-[10px] text-slate-500 uppercase font-bold block">
                    Dichiarato dall&apos;ente — saldo (Posizione Ente)
                  </span>
                  <span className="text-sm font-bold text-slate-900">
                    € {totaleDebitiEnte.toLocaleString('it-IT')}
                  </span>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {debitiEnte.length} voci
                    {totaleLordoDebitiEnte !== totaleDebitiEnte &&
                      ` — lordo € ${totaleLordoDebitiEnte.toLocaleString('it-IT')}`}
                  </p>
                </div>
                <div
                  className={`border rounded-lg p-3 ${
                    rigaEstratta.ricevibile
                      ? 'bg-emerald-50 border-emerald-200'
                      : 'bg-amber-50 border-amber-200'
                  }`}
                >
                  <span className="text-[10px] text-slate-500 uppercase font-bold block">
                    Esito ricevibilità
                  </span>
                  <span className="text-sm font-bold text-slate-900">
                    {rigaEstratta.ricevibile ? 'Ricevibile' : 'Non ricevibile'}
                  </span>
                  <p className="text-[10px] text-slate-500 mt-0.5">{rigaEstratta.motivazione}</p>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {tipoProposta === 'RICEVUTA' && (
        <SimulazioneRiceventeScenario
          nomeSchema={nomeSchema}
          scenarioId={scenarioId}
          codice={codice}
          onAnalisiCompletata={carica}
        />
      )}
    </div>
  );
}
