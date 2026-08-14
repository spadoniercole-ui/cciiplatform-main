'use client';

// Posizione Aggiornata dello scenario: il bilancio di verifica
// infrannuale (o di fine anno non ancora deliberato dall'assemblea) che
// si affianca agli anni già presenti nei file XBRL. Lo schema è proposto
// automaticamente a partire dai dati XBRL già caricati per questa azienda
// (fino agli ultimi N anni come colonne di riferimento, con N parametro di
// spazio) — l'operatore aggiunge solo la colonna della posizione aggiornata.

import React, { useEffect, useState } from 'react';
import { ClipboardEdit, Download, Upload, Save, AlertTriangle } from 'lucide-react';
import {
  ottieniTuttePosizioniAggiornate,
  salvaPosizioneAggiornataAction,
  eliminaPosizioneAggiornataAction,
  type PosizioneAggiornata as TipoPosizioneAggiornata,
} from '@/app/actions/posizioneAggiornata';
import { ottieniStoricoXbrlAzienda } from '@/app/actions/xbrlAzienda';
import { ottieniAnniStoricoMax } from '@/app/actions/parametriSpazio';
import { CAMPI_POSIZIONE, DATI_VUOTI } from '@/lib/posizioneAggiornata/schemaCampi';
import {
  esportaPosizioneExcel,
  importaPosizioneExcel,
  type RiferimentoPeriodo,
} from '@/lib/posizioneAggiornata/excelPosizione';
import { MAX_ANNI_STORICO_DEFAULT } from '@/lib/parametriPeriodi';
import type { DatiFinanziariPeriodo } from '@/lib/xbrl/types';

interface Props {
  nomeSchema: string;
  scenarioId: number;
  aziendaId: number;
  nomeScenario: string;
}

function formatEuro(val: number | null | undefined): string {
  if (val === null || val === undefined || Number.isNaN(val)) return '—';
  return val.toLocaleString('it-IT', { maximumFractionDigits: 0 });
}

export function PosizioneAggiornataScenario({
  nomeSchema,
  scenarioId,
  aziendaId,
  nomeScenario,
}: Props) {
  // Colonne di riferimento: fino agli ultimi N anni dal file XBRL (N =
  // parametro di spazio), in ordine cronologico crescente (il più recente a
  // destra, a ridosso della colonna Posizione Aggiornata da compilare).
  const [riferimenti, setRiferimenti] = useState<RiferimentoPeriodo[]>([]);
  const [maxAnniVis, setMaxAnniVis] = useState<number>(MAX_ANNI_STORICO_DEFAULT);

  const [dati, setDati] = useState<DatiFinanziariPeriodo>(DATI_VUOTI);
  const [campoAFuoco, setCampoAFuoco] = useState<keyof DatiFinanziariPeriodo | null>(null);
  const [dataRiferimento, setDataRiferimento] = useState<string>('');
  const [deliberato, setDeliberato] = useState(false);
  const [posizioniSalvate, setPosizioniSalvate] = useState<TipoPosizioneAggiornata[]>([]);
  const [idInModifica, setIdInModifica] = useState<number | null>(null);

  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);
  const [salvataggio, setSalvataggio] = useState(false);
  const [salvato, setSalvato] = useState(false);
  const [importazioneInCorso, setImportazioneInCorso] = useState(false);
  const [esitoImportazione, setEsitoImportazione] = useState<string | null>(null);

  const carica = async () => {
    setCaricamento(true);
    try {
      const [storicoRis, elencoRis, anniRis] = await Promise.all([
        ottieniStoricoXbrlAzienda(nomeSchema, aziendaId),
        ottieniTuttePosizioniAggiornate(nomeSchema, scenarioId),
        ottieniAnniStoricoMax(nomeSchema),
      ]);
      const maxAnni = anniRis.success ? anniRis.anni : MAX_ANNI_STORICO_DEFAULT;
      setMaxAnniVis(maxAnni);
      if (storicoRis.success && storicoRis.storico.length > 0) {
        const ordinato = [...storicoRis.storico].sort(
          (a, b) => (a.annoBilancio ?? 0) - (b.annoBilancio ?? 0)
        );
        const ultimiAnni = ordinato.slice(-maxAnni);
        setRiferimenti(
          ultimiAnni.map((anno, i) => ({
            etichetta: anno.annoBilancio ? `Anno ${anno.annoBilancio}` : `Periodo ${i + 1}`,
            dati: anno.datiFinanziari,
          }))
        );
      }
      if (elencoRis.success) {
        setPosizioniSalvate(elencoRis.posizioni);
      } else {
        setErrore(elencoRis.error || 'Impossibile caricare la posizione aggiornata.');
      }
    } finally {
      setCaricamento(false);
    }
  };

  useEffect(() => {
    carica();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nomeSchema, scenarioId, aziendaId]);

  const handleCambiaCampo = (chiave: keyof DatiFinanziariPeriodo, valore: string) => {
    const pulito = valore.trim().replace(/\./g, '').replace(',', '.');
    setDati((prev) => ({ ...prev, [chiave]: pulito === '' ? 0 : Number(pulito) || 0 }));
    setSalvato(false);
  };

  const handleSalva = async () => {
    setSalvataggio(true);
    setErrore(null);
    try {
      const risultato = await salvaPosizioneAggiornataAction(
        nomeSchema,
        scenarioId,
        dataRiferimento || null,
        deliberato,
        dati,
        idInModifica
      );
      if (!risultato.success) {
        setErrore(risultato.error || 'Impossibile salvare.');
        return;
      }
      setSalvato(true);
      await carica();
    } finally {
      setSalvataggio(false);
    }
  };

  const handleNuovoCaricamento = () => {
    setIdInModifica(null);
    setDati(DATI_VUOTI);
    setDataRiferimento('');
    setDeliberato(false);
    setSalvato(false);
    setErrore(null);
  };

  const handleSelezionaPosizione = (pos: TipoPosizioneAggiornata) => {
    setIdInModifica(pos.id);
    setDati(pos.dati);
    setDataRiferimento(pos.dataRiferimento || '');
    setDeliberato(pos.deliberato);
    setSalvato(false);
    setErrore(null);
  };

  const handleElimina = async (id: number) => {
    const risultato = await eliminaPosizioneAggiornataAction(nomeSchema, id);
    if (!risultato.success) {
      setErrore(risultato.error || 'Impossibile eliminare.');
      return;
    }
    if (idInModifica === id) handleNuovoCaricamento();
    await carica();
  };

  const handleEsporta = () => {
    esportaPosizioneExcel(nomeScenario, riferimenti, dati);
  };

  const handleImporta = async (file: File) => {
    setImportazioneInCorso(true);
    setEsitoImportazione(null);
    try {
      const { dati: datiImportati } = await importaPosizioneExcel(file);
      setDati(datiImportati);
      setSalvato(false);
      setEsitoImportazione(
        'Prospetto importato — controlla i valori e premi Salva per confermare.'
      );
    } catch (err: any) {
      setEsitoImportazione(`Impossibile leggere il file: ${err.message || err}`);
    } finally {
      setImportazioneInCorso(false);
    }
  };

  if (caricamento) return <p className="text-xs text-slate-400">Caricamento...</p>;

  const nessunDatoXbrl = riferimenti.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <ClipboardEdit className="w-4 h-4 text-blue-600" />
        <h2 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
          Posizione Aggiornata
        </h2>
      </div>
      <p className="text-[11px] text-slate-500">
        Schema proposto a partire dai bilanci XBRL già caricati per questa azienda (fino agli ultimi{' '}
        {maxAnniVis} anni come colonne di riferimento, impostabili in Parametri di Spazio) —
        aggiungi la posizione aggiornata alla data di predisposizione dello scenario. Un dato
        infrannuale o di fine anno non ancora deliberato dall&apos;assemblea vale come verifica
        intermedia, non come bilancio approvato.
      </p>

      {nessunDatoXbrl && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800">
            Nessun bilancio XBRL ancora caricato per questa azienda: le colonne di riferimento
            resteranno vuote. Puoi comunque compilare la posizione aggiornata da sola, ma ti
            conviene caricare prima un bilancio XBRL per avere lo schema pre-popolato.
          </p>
        </div>
      )}

      {errore && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          {errore}
        </div>
      )}

      {posizioniSalvate.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
          <h3 className="font-bold text-slate-900 uppercase text-xs tracking-wider mb-2">
            Caricamenti esistenti
          </h3>
          {posizioniSalvate.map((pos) => (
            <div
              key={pos.id}
              className={`flex items-center justify-between gap-2 border rounded-lg p-2.5 ${
                idInModifica === pos.id
                  ? 'border-blue-300 bg-blue-50/40'
                  : 'border-slate-200 hover:border-blue-200'
              }`}
            >
              <button
                type="button"
                onClick={() => handleSelezionaPosizione(pos)}
                className="flex-1 text-left text-xs text-slate-700"
              >
                <span className="font-bold text-slate-900">
                  {pos.dataRiferimento
                    ? new Date(pos.dataRiferimento).toLocaleDateString('it-IT')
                    : 'Senza data'}
                </span>
                {!pos.deliberato && (
                  <span className="ml-2 text-[10px] text-amber-600 uppercase font-bold">
                    Verifica intermedia
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => pos.id && handleElimina(pos.id)}
                className="text-slate-400 hover:text-red-600 text-[10px] font-bold uppercase px-2 py-1"
              >
                Elimina
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={handleNuovoCaricamento}
            className="w-full mt-1 px-3 py-2 border-2 border-dashed border-slate-200 hover:border-blue-300 hover:bg-blue-50/30 text-slate-500 hover:text-blue-700 font-bold text-[10px] uppercase rounded-lg transition-colors"
          >
            + Nuovo caricamento
          </button>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
        {idInModifica && (
          <p className="text-[10px] text-blue-600 font-bold uppercase">
            Stai modificando un caricamento esistente
          </p>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
              Data di riferimento
            </label>
            <input
              type="date"
              value={dataRiferimento}
              onChange={(e) => {
                setDataRiferimento(e.target.value);
                setSalvato(false);
              }}
              className="w-full p-2 text-sm border border-slate-200 rounded-lg text-slate-900 bg-white"
            />
          </div>
          <div className="flex items-end pb-2.5">
            <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={!deliberato}
                onChange={(e) => {
                  setDeliberato(!e.target.checked);
                  setSalvato(false);
                }}
              />
              Verifica intermedia, non ancora deliberata dall&apos;assemblea
            </label>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleEsporta}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[10px] uppercase rounded-lg transition-colors"
          >
            <Download className="w-3.5 h-3.5" /> Esporta prospetto
          </button>
          <label className="flex items-center gap-1.5 px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-[10px] uppercase rounded-lg transition-colors cursor-pointer">
            <Upload className="w-3.5 h-3.5" />
            {importazioneInCorso ? 'Importazione...' : 'Importa compilato'}
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
          <button
            type="button"
            onClick={handleSalva}
            disabled={salvataggio}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white font-bold text-[10px] uppercase rounded-lg transition-colors ml-auto"
          >
            <Save className="w-3.5 h-3.5" /> {salvataggio ? 'Salvataggio...' : 'Salva'}
          </button>
        </div>
        {esitoImportazione && (
          <div className="text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-3">
            {esitoImportazione}
          </div>
        )}
        {salvato && (
          <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
            Posizione aggiornata salvata.
          </div>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="bg-slate-100 text-[9px] font-bold text-slate-600 border-b border-slate-200 uppercase">
              <th className="p-2.5">Voce</th>
              {riferimenti.map((r) => (
                <th key={r.etichetta} className="p-2.5 text-right">
                  {r.etichetta}
                </th>
              ))}
              <th className="p-2.5 text-right w-36">Posizione Aggiornata</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(['CE', 'SP'] as const).map((gruppo) => (
              <React.Fragment key={gruppo}>
                <tr className="bg-slate-50">
                  <td
                    colSpan={riferimenti.length + 2}
                    className="p-2 text-[10px] font-bold text-slate-500 uppercase"
                  >
                    {gruppo === 'CE'
                      ? 'Conto Economico (a valore della produzione)'
                      : 'Stato Patrimoniale (criterio finanziario)'}
                  </td>
                </tr>
                {CAMPI_POSIZIONE.filter((c) => c.gruppo === gruppo).map((campo) => (
                  <tr key={campo.chiave}>
                    <td className="p-2.5 text-slate-700">{campo.etichetta}</td>
                    {riferimenti.map((r) => (
                      <td key={r.etichetta} className="p-2.5 text-right font-mono text-slate-500">
                        {formatEuro(r.dati[campo.chiave])}
                      </td>
                    ))}
                    <td className="p-2.5 text-right">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={
                          campoAFuoco === campo.chiave
                            ? dati[campo.chiave] || ''
                            : formatEuro(dati[campo.chiave])
                        }
                        onFocus={() => setCampoAFuoco(campo.chiave)}
                        onBlur={() => setCampoAFuoco(null)}
                        onChange={(e) => handleCambiaCampo(campo.chiave, e.target.value)}
                        className="w-full p-1 text-right text-xs font-mono border border-slate-200 rounded text-slate-900 bg-white"
                      />
                    </td>
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
