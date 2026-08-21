'use client';

// Posizione Debitoria dell'Ente — "step 0" del cammino, solo per le
// proposte RICEVUTE. Stesso sistema di caricamento della Proposta (stessa
// UI, stesso export/import Excel, stessa selezione multipla), ma è
// un'altra tabella: qui l'ente dichiara cosa gli è dovuto secondo la
// propria contabilità (CLE/CEN/CEC/CEA), un parametro di confronto
// indipendente rispetto a quanto l'azienda ha dichiarato nella Proposta.

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, Pencil, X, Download, Upload } from 'lucide-react';
import {
  ottieniDebitiEnte,
  aggiungiRigaDebitoEnteAction,
  modificaRigaDebitoEnteAction,
  eliminaRigaDebitoEnteAction,
  eliminaTuttiDebitiEnteAction,
  type RigaDebitoEnte,
  type DatiRigaDebitoEnte,
} from '@/app/actions/debitiEnte';
import { useDichiaraContestoAssistente } from '@/components/ContestoAssistenteContext';
import { esportaDebitiEnteExcel } from '@/lib/debitiEnte/excelDebitiEnte';
import {
  leggiIntestazioniExcel,
  importaConArchitrave,
  type IntestazioniLette,
  type RigaDebitoEsportabile,
} from '@/lib/debitiEnte/excelDebitiEnte';
import {
  ottieniArchitraveDebitiEnte,
  salvaArchitraveDebitiEnteAction,
  azzeraArchitraveDebitiEnteAction,
  type ArchitraveDebitiEnte,
  type RuoloColonnaDebito,
} from '@/app/actions/debitiEnteArchitrave';
import {
  TIPI_DEBITO_ENTE,
  raggruppaPerTipoDebito,
  etichettaTipoDebito,
  type TipoDebitoEnte,
} from '@/lib/debitiEnte/tipoDebito';
import {
  ottieniEtichetteTipoDebito,
  type EtichettaTipoDebito,
} from '@/app/actions/tipoDebitoConfig';

interface Props {
  nomeSchema: string;
  aziendaId: number;
  nomeAzienda: string;
}

const FORM_VUOTO: DatiRigaDebitoEnte = {
  voce: '',
  importo: 0,
  importoVersato: null,
  tipo: 'CLE',
  note: null,
  data: null,
};

function parseNumeroItaliano(testo: string): number {
  const pulito = testo.trim().replace(',', '.');
  const numero = Number(pulito);
  return Number.isNaN(numero) ? 0 : numero;
}

export function DebitiEnteScenario({ nomeSchema, aziendaId, nomeAzienda }: Props) {
  const router = useRouter();
  // Il primo caricamento (mount) non deve forzare un refresh del layout: solo
  // le ricariche successive a una mutazione (aggiunta/modifica/eliminazione/
  // import/cambio modello) devono aggiornare il semaforo dei passi in alto,
  // che vive nel layout (Server Component) e non si rilegge da solo.
  const primoCaricamento = React.useRef(true);
  const [righe, setRighe] = useState<RigaDebitoEnte[]>([]);
  const [etichetteTipoDebito, setEtichetteTipoDebito] = useState<EtichettaTipoDebito[]>(
    TIPI_DEBITO_ENTE.map((t) => ({
      codice: t.valore,
      etichetta: t.etichetta,
      descrizione: t.descrizione,
    }))
  );
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);

  const [form, setForm] = useState<DatiRigaDebitoEnte>(FORM_VUOTO);
  const [rigaInModifica, setRigaInModifica] = useState<number | null>(null);
  const [salvataggio, setSalvataggio] = useState(false);

  const [righeSelezionate, setRigheSelezionate] = useState<Set<number>>(new Set());
  const [eliminazioneMultiplaInCorso, setEliminazioneMultiplaInCorso] = useState(false);
  const [importazioneInCorso, setImportazioneInCorso] = useState(false);
  const [architrave, setArchitrave] = useState<ArchitraveDebitiEnte | null>(null);
  const [caricamentoArchitrave, setCaricamentoArchitrave] = useState(true);
  // Fase di mappatura — attiva solo al primo caricamento, quando non esiste ancora un architrave.
  const [inMappatura, setInMappatura] = useState(false);
  const [fileInMappatura, setFileInMappatura] = useState<File | null>(null);
  const [intestazioniLette, setIntestazioniLette] = useState<IntestazioniLette | null>(null);
  const [ruoliScelti, setRuoliScelti] = useState<RuoloColonnaDebito[]>([]);
  const [mappaturaTipoScelta, setMappaturaTipoScelta] = useState<Record<string, TipoDebitoEnte>>(
    {}
  );
  // Alternativa a mappare una colonna Tipo — alcuni export (es. INPS)
  // non ce l'hanno affatto, ogni riga è implicitamente della stessa
  // natura.
  const [usaTipoFisso, setUsaTipoFisso] = useState(false);
  const [tipoFissoScelto, setTipoFissoScelto] = useState<TipoDebitoEnte | ''>('');
  const [erroreMappatura, setErroreMappatura] = useState<string | null>(null);
  const [cambioModelloInCorso, setCambioModelloInCorso] = useState(false);
  const [confermaCambioModello, setConfermaCambioModello] = useState('');
  const [esitoImportazione, setEsitoImportazione] = useState<string | null>(null);

  useDichiaraContestoAssistente({ pagina: 'debitoria-ente', nomeSchema, scenarioId: aziendaId });

  // Mappa codice -> etichetta, per le funzioni condivise (etichettaTipoDebito,
  // raggruppaPerTipoDebito, export Excel) che accettano etichette personalizzate opzionali.
  const mappaEtichette = React.useMemo(
    () =>
      Object.fromEntries(etichetteTipoDebito.map((e) => [e.codice, e.etichetta])) as Record<
        TipoDebitoEnte,
        string
      >,
    [etichetteTipoDebito]
  );

  const carica = async () => {
    setCaricamento(true);
    setCaricamentoArchitrave(true);
    try {
      const [risultato, risultatoEtichette, risultatoArchitrave] = await Promise.all([
        ottieniDebitiEnte(nomeSchema, aziendaId),
        ottieniEtichetteTipoDebito(nomeSchema),
        ottieniArchitraveDebitiEnte(nomeSchema),
      ]);
      if (risultato.success) setRighe(risultato.righe);
      else setErrore(risultato.error || 'Impossibile caricare la posizione debitoria.');
      if (risultatoEtichette.success) setEtichetteTipoDebito(risultatoEtichette.etichette);
      if (risultatoArchitrave.success) setArchitrave(risultatoArchitrave.architrave);
    } finally {
      setCaricamento(false);
      setCaricamentoArchitrave(false);
      // Ogni mutazione (add/modifica/elimina/import/cambio modello) e ogni
      // aggiornamento dall'assistente passano da qui: rileggiamo il semaforo
      // dei passi solo dopo il primo caricamento, così "Posizione Ente"
      // diventa verde appena la prima riga è salvata, senza reload manuale.
      if (primoCaricamento.current) {
        primoCaricamento.current = false;
      } else {
        router.refresh();
      }
    }
  };

  useEffect(() => {
    carica();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nomeSchema, aziendaId]);

  useEffect(() => {
    const handler = () => carica();
    window.addEventListener('assistente:dati-aggiornati', handler);
    return () => window.removeEventListener('assistente:dati-aggiornati', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nomeSchema, aziendaId]);

  const handleSalva = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.voce.trim()) {
      setErrore('Inserisci la voce di debito.');
      return;
    }
    setSalvataggio(true);
    setErrore(null);
    const risultato = rigaInModifica
      ? await modificaRigaDebitoEnteAction(nomeSchema, rigaInModifica, form)
      : await aggiungiRigaDebitoEnteAction(nomeSchema, aziendaId, form);
    if (!risultato.success) {
      setErrore(
        risultato.error || `Impossibile ${rigaInModifica ? 'modificare' : 'aggiungere'} la riga.`
      );
      setSalvataggio(false);
      return;
    }
    setForm(FORM_VUOTO);
    setRigaInModifica(null);
    setSalvataggio(false);
    await carica();
  };

  const apriModifica = (riga: RigaDebitoEnte) => {
    setForm({
      voce: riga.voce,
      importo: riga.importo,
      importoVersato: riga.importoVersato,
      tipo: riga.tipo,
      note: riga.note,
      data: riga.data,
    });
    setRigaInModifica(riga.id);
    setErrore(null);
  };

  const handleAnnullaModifica = () => {
    setForm(FORM_VUOTO);
    setRigaInModifica(null);
    setErrore(null);
  };

  const handleElimina = async (id: number) => {
    if (rigaInModifica === id) handleAnnullaModifica();
    await eliminaRigaDebitoEnteAction(nomeSchema, id);
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
        await eliminaRigaDebitoEnteAction(nomeSchema, id);
      }
      setRigheSelezionate(new Set());
      if (righeSelezionate.has(rigaInModifica ?? -1)) handleAnnullaModifica();
      await carica();
    } finally {
      setEliminazioneMultiplaInCorso(false);
    }
  };

  const handleEsporta = () => {
    esportaDebitiEnteExcel(nomeAzienda, righe, mappaEtichette);
  };

  /** Condiviso tra "importa con architrave già noto" e "primo caricamento, dopo la mappatura" — stessa logica di sostituzione (non aggiunta) delle righe esistenti. */
  const salvaRigheImportate = async (
    righeImportate: RigaDebitoEsportabile[],
    righeConErrore: { indice: number; motivo: string }[]
  ) => {
    if (righe.length > 0) {
      const risultatoPulizia = await eliminaTuttiDebitiEnteAction(nomeSchema, aziendaId);
      if (!risultatoPulizia.success) {
        setEsitoImportazione(
          risultatoPulizia.error || 'Impossibile eliminare le righe esistenti prima di importare.'
        );
        return;
      }
    }

    let salvate = 0;
    const erroriSalvataggio: string[] = [];
    for (const riga of righeImportate) {
      const risultato = await aggiungiRigaDebitoEnteAction(nomeSchema, aziendaId, riga);
      if (risultato.success) salvate += 1;
      else erroriSalvataggio.push(`"${riga.voce}": ${risultato.error || 'errore sconosciuto'}`);
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
  };

  const handleSelezionaFile = async (file: File) => {
    if (righe.length > 0) {
      const conferma = window.confirm(
        `Questo scenario ha già ${righe.length} rig${righe.length === 1 ? 'a' : 'he'} di posizione debitoria. Importando da questo file, le righe esistenti verranno eliminate e sostituite con quelle del file — non aggiunte. Continuare?`
      );
      if (!conferma) return;
    }

    // Architrave già riconosciuto: applica direttamente, nessuna
    // interpretazione nuova da chiedere.
    if (architrave) {
      setImportazioneInCorso(true);
      setEsitoImportazione(null);
      try {
        const {
          righe: righeImportate,
          righeConErrore,
          strutturaNonCorrispondente,
        } = await importaConArchitrave(
          file,
          architrave.mappatura,
          architrave.mappaturaTipo,
          architrave.numeroColonne,
          architrave.nomeFoglio,
          architrave.tipoFisso
        );
        if (strutturaNonCorrispondente) {
          setEsitoImportazione(
            `Questo file ha un numero di colonne diverso dal modello riconosciuto (${architrave.numeroColonne}) — non corrisponde al formato atteso. Se il formato è davvero cambiato, usa "Cambia modello" qui sotto.`
          );
          return;
        }
        await salvaRigheImportate(righeImportate, righeConErrore);
      } catch (err: any) {
        setEsitoImportazione(`Impossibile leggere il file: ${err.message || err}`);
      } finally {
        setImportazioneInCorso(false);
      }
      return;
    }

    // Primo caricamento: nessun modello ancora riconosciuto — si legge
    // solo la struttura, la si mostra all'operatore, e si chiede come
    // interpretarla. Non si importa nulla finché non è confermata.
    setImportazioneInCorso(true);
    setErroreMappatura(null);
    try {
      const lette = await leggiIntestazioniExcel(file);
      setIntestazioniLette(lette);
      setRuoliScelti(lette.intestazioni.map(() => 'ignora' as RuoloColonnaDebito));
      setMappaturaTipoScelta({});
      setFileInMappatura(file);
      setInMappatura(true);
    } catch (err: any) {
      setEsitoImportazione(`Impossibile leggere il file: ${err.message || err}`);
    } finally {
      setImportazioneInCorso(false);
    }
  };

  const handleCambiaFoglio = async (nuovoFoglio: string) => {
    if (!fileInMappatura) return;
    setImportazioneInCorso(true);
    setErroreMappatura(null);
    try {
      const lette = await leggiIntestazioniExcel(fileInMappatura, nuovoFoglio);
      setIntestazioniLette(lette);
      // Colonne diverse da un foglio all'altro — la mappatura scelta
      // finora non ha più senso, riparte da zero.
      setRuoliScelti(lette.intestazioni.map(() => 'ignora' as RuoloColonnaDebito));
      setMappaturaTipoScelta({});
      setUsaTipoFisso(false);
      setTipoFissoScelto('');
    } catch (err: any) {
      setErroreMappatura(`Impossibile leggere il foglio: ${err.message || err}`);
    } finally {
      setImportazioneInCorso(false);
    }
  };

  const handleConfermaMappatura = async () => {
    if (!intestazioniLette || !fileInMappatura) return;
    const idxImporto = ruoliScelti.indexOf('importo');
    if (idxImporto < 0) {
      setErroreMappatura('Devi indicare quale colonna è "Importo".');
      return;
    }
    if (usaTipoFisso) {
      if (!tipoFissoScelto) {
        setErroreMappatura('Scegli il tipo fisso da applicare a tutte le righe.');
        return;
      }
    } else {
      const idxTipo = ruoliScelti.indexOf('tipo');
      if (idxTipo < 0) {
        setErroreMappatura('Devi indicare quale colonna è "Tipo".');
        return;
      }
      const valoriTipo = intestazioniLette.valoriDistintiPerColonna[idxTipo] || [];
      const nonMappati = valoriTipo.filter((v) => !mappaturaTipoScelta[v]);
      if (nonMappati.length > 0) {
        setErroreMappatura(
          `Mappa ancora questi valori trovati nella colonna Tipo: ${nonMappati.join(', ')}.`
        );
        return;
      }
    }

    setImportazioneInCorso(true);
    setErroreMappatura(null);
    try {
      const tipoFissoDaSalvare = usaTipoFisso ? (tipoFissoScelto as TipoDebitoEnte) : null;
      const nuovoArchitrave: ArchitraveDebitiEnte = {
        intestazioniOriginali: intestazioniLette.intestazioni,
        mappatura: ruoliScelti,
        mappaturaTipo: mappaturaTipoScelta,
        numeroColonne: intestazioniLette.intestazioni.length,
        nomeFileOrigine: fileInMappatura.name,
        nomeFoglio: intestazioniLette.foglioLetto,
        tipoFisso: tipoFissoDaSalvare,
      };
      const risultatoSalvataggio = await salvaArchitraveDebitiEnteAction(
        nomeSchema,
        nuovoArchitrave
      );
      if (!risultatoSalvataggio.success) {
        setErroreMappatura(risultatoSalvataggio.error || 'Impossibile salvare il modello.');
        return;
      }
      const { righe: righeImportate, righeConErrore } = await importaConArchitrave(
        fileInMappatura,
        ruoliScelti,
        mappaturaTipoScelta,
        intestazioniLette.intestazioni.length,
        intestazioniLette.foglioLetto,
        tipoFissoDaSalvare
      );
      await salvaRigheImportate(righeImportate, righeConErrore);
      setArchitrave(nuovoArchitrave);
      setInMappatura(false);
      setFileInMappatura(null);
      setIntestazioniLette(null);
    } catch (err: any) {
      setErroreMappatura(`Impossibile importare: ${err.message || err}`);
    } finally {
      setImportazioneInCorso(false);
    }
  };

  const handleAnnullaMappatura = () => {
    setInMappatura(false);
    setFileInMappatura(null);
    setIntestazioniLette(null);
    setErroreMappatura(null);
    setUsaTipoFisso(false);
    setTipoFissoScelto('');
  };

  const handleCambiaModello = async () => {
    if (confermaCambioModello !== 'CAMBIA MODELLO') return;
    setCambioModelloInCorso(true);
    try {
      const risultato = await azzeraArchitraveDebitiEnteAction(nomeSchema);
      if (risultato.success) {
        setArchitrave(null);
        setConfermaCambioModello('');
        await carica();
      } else {
        setEsitoImportazione(risultato.error || 'Impossibile cambiare modello.');
      }
    } finally {
      setCambioModelloInCorso(false);
    }
  };

  if (caricamento) return <p className="text-xs text-slate-400">Caricamento...</p>;

  const riepilogo = raggruppaPerTipoDebito(righe, mappaEtichette);
  const totaleComplessivo = riepilogo.reduce((acc, r) => acc + r.totale, 0);
  const totaleSaldoComplessivo = riepilogo.reduce((acc, r) => acc + r.totaleSaldo, 0);
  const haDistinzioneSaldo = righe.some((r) => r.importoVersato !== null);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
          Posizione Debitoria dell&apos;Ente
        </h2>
        <p className="text-slate-500 text-[11px] mt-1">
          Cosa l&apos;ente dichiara essergli dovuto secondo la propria contabilità — un parametro di
          confronto indipendente da quanto dichiarato nella Proposta, non una sua copia. In
          difficoltà? L&apos;assistente in basso a destra può registrare le voci parlandone.
        </p>
      </div>

      {errore && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          {errore}
        </div>
      )}

      <form
        onSubmit={handleSalva}
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
              Voce di debito
            </label>
            <input
              type="text"
              value={form.voce}
              onChange={(e) => setForm({ ...form, voce: e.target.value })}
              placeholder="Es. Contributi 2023"
              className="w-full p-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
            />
          </div>
          <div>
            <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">
              Importo (€)
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={form.importo}
              onChange={(e) => setForm({ ...form, importo: parseNumeroItaliano(e.target.value) })}
              className="w-full p-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
            />
          </div>
          <div>
            <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Tipo</label>
            <select
              value={form.tipo}
              onChange={(e) => setForm({ ...form, tipo: e.target.value as TipoDebitoEnte })}
              className="w-full p-2 text-xs bg-white border border-slate-200 rounded-lg text-slate-900"
            >
              {etichetteTipoDebito.map((t) => (
                <option key={t.codice} value={t.codice}>
                  {t.etichetta} — {t.descrizione}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Note</label>
            <input
              type="text"
              value={form.note || ''}
              onChange={(e) => setForm({ ...form, note: e.target.value || null })}
              className="w-full p-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
            />
          </div>
        </div>
        <button
          type="submit"
          disabled={salvataggio}
          className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-bold text-[10px] uppercase rounded-lg transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          {salvataggio ? 'Salvataggio...' : rigaInModifica ? 'Salva modifiche' : 'Aggiungi riga'}
        </button>
      </form>

      {!caricamentoArchitrave && !inMappatura && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleEsporta}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[10px] uppercase rounded-lg transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Scarica quanto già inserito (consultazione)
            </button>
            <label className="flex items-center gap-1.5 px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-[10px] uppercase rounded-lg transition-colors cursor-pointer">
              <Upload className="w-3.5 h-3.5" />
              {importazioneInCorso
                ? 'Elaborazione...'
                : architrave
                  ? 'Carica il file dell\u2019ente'
                  : 'Carica il primo file dell\u2019ente'}
              <input
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                disabled={importazioneInCorso}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleSelezionaFile(file);
                  e.target.value = '';
                }}
              />
            </label>
          </div>
          {architrave ? (
            <p className="text-[10px] text-slate-400">
              Modello riconosciuto da &quot;{architrave.nomeFileOrigine || 'un file precedente'}
              &quot; ({architrave.numeroColonne} colonne) — ogni nuovo file deve avere la stessa
              struttura.
            </p>
          ) : (
            <p className="text-[10px] text-slate-400">
              Nessun modello riconosciuto ancora — il primo file che carichi qui, con le colonne che
              l&apos;ente già usa, diventa il riferimento fisso per i caricamenti successivi.
            </p>
          )}
        </div>
      )}

      {esitoImportazione && (
        <div className="text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-3">
          {esitoImportazione}
        </div>
      )}

      {inMappatura && intestazioniLette && (
        <div className="bg-white border border-blue-200 rounded-xl p-5 space-y-4">
          <div>
            <h3 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
              Riconosci le colonne del tuo file
            </h3>
            <p className="text-[11px] text-slate-500 mt-1">
              {intestazioniLette.numeroRigheDati} righe di dati trovate. Dicci cosa significa
              ciascuna colonna — questa scelta diventa il modello fisso per i caricamenti
              successivi, cambiarla dopo richiede di cancellare tutto e ricominciare.
            </p>
          </div>

          {erroreMappatura && (
            <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
              {erroreMappatura}
            </div>
          )}

          {intestazioniLette.fogliDisponibili.length > 1 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <label className="text-[10px] font-bold text-amber-800 uppercase tracking-wider block mb-1">
                Questo file ha più fogli — quale leggiamo?
              </label>
              <p className="text-[10px] text-amber-700 mb-2">
                Molti export (es. INPS) hanno un foglio di riepilogo e altri di dettaglio — scegli
                quello con le righe che ti interessano. Gli altri fogli vengono ignorati, anche nei
                caricamenti successivi.
              </p>
              <select
                value={intestazioniLette.foglioLetto}
                onChange={(e) => handleCambiaFoglio(e.target.value)}
                className="w-full sm:w-64 p-2 text-xs bg-white border border-amber-300 rounded-lg outline-none focus:border-blue-500 text-slate-900"
              >
                {intestazioniLette.fogliDisponibili.map((nome) => (
                  <option key={nome} value={nome}>
                    {nome}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
            <label className="flex items-center gap-2 text-[11px] text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={usaTipoFisso}
                onChange={(e) => setUsaTipoFisso(e.target.checked)}
              />
              Questo file non ha una colonna &quot;Tipo&quot; — tutte le righe sono dello stesso
              tipo (es. un export INPS, tutto contributi/sanzioni previdenziali)
            </label>
            {usaTipoFisso && (
              <select
                value={tipoFissoScelto}
                onChange={(e) => setTipoFissoScelto(e.target.value as TipoDebitoEnte)}
                className="w-full sm:w-64 p-2 mt-2 text-xs bg-white border border-slate-300 rounded-lg outline-none focus:border-blue-500 text-slate-900"
              >
                <option value="">— scegli il tipo —</option>
                {etichetteTipoDebito.map((t) => (
                  <option key={t.codice} value={t.codice}>
                    {t.etichetta}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="space-y-3">
            {intestazioniLette.intestazioni.map((intestazione, i) => (
              <div key={i} className="border border-slate-200 rounded-lg p-3">
                <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                  <span className="font-bold text-slate-900 text-xs">
                    Colonna {i + 1}: &quot;{intestazione}&quot;
                  </span>
                  <select
                    value={ruoliScelti[i]}
                    onChange={(e) => {
                      const nuovi = [...ruoliScelti];
                      nuovi[i] = e.target.value as RuoloColonnaDebito;
                      setRuoliScelti(nuovi);
                    }}
                    className="p-1.5 text-xs border border-slate-200 rounded-lg text-slate-900 bg-white"
                  >
                    <option value="ignora">Ignora questa colonna</option>
                    <option value="voce">Voce / descrizione</option>
                    <option value="importo">Importo (debito)</option>
                    <option value="importo_versato">
                      Importo versato (per calcolare il saldo)
                    </option>
                    <option value="tipo">Tipo (classificazione del debito)</option>
                    <option value="nota">Nota</option>
                    <option value="data">Data</option>
                    <option value="extra">Colonna extra (salva com&apos;è)</option>
                  </select>
                </div>
                {!usaTipoFisso &&
                  ruoliScelti[i] === 'tipo' &&
                  (intestazioniLette.valoriDistintiPerColonna[i] || []).length > 0 && (
                    <div className="mt-2 space-y-1.5 bg-slate-50 rounded-lg p-2.5">
                      <span className="text-[10px] font-bold text-slate-500 uppercase block">
                        Valori trovati in questa colonna — mappa ciascuno su un codice
                      </span>
                      {intestazioniLette.valoriDistintiPerColonna[i].map((valore) => (
                        <div key={valore} className="flex items-center gap-2">
                          <span className="text-xs text-slate-700 flex-1 truncate">
                            &quot;{valore}&quot;
                          </span>
                          <select
                            value={mappaturaTipoScelta[valore] || ''}
                            onChange={(e) =>
                              setMappaturaTipoScelta({
                                ...mappaturaTipoScelta,
                                [valore]: e.target.value as TipoDebitoEnte,
                              })
                            }
                            className="p-1 text-xs border border-slate-200 rounded text-slate-900 bg-white"
                          >
                            <option value="">— scegli —</option>
                            {TIPI_DEBITO_ENTE.map((t) => (
                              <option key={t.valore} value={t.valore}>
                                {etichetteTipoDebito.find((e) => e.codice === t.valore)
                                  ?.etichetta || t.etichetta}
                              </option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                  )}
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleAnnullaMappatura}
              className="px-4 py-2 text-xs font-bold uppercase text-slate-500 hover:text-slate-700"
            >
              Annulla
            </button>
            <button
              type="button"
              onClick={handleConfermaMappatura}
              disabled={importazioneInCorso}
              className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white font-bold uppercase tracking-wider rounded-lg text-xs transition-colors"
            >
              {importazioneInCorso ? 'Salvataggio...' : 'Conferma e importa'}
            </button>
          </div>
        </div>
      )}

      {architrave && !inMappatura && (
        <div className="border border-amber-200 bg-amber-50/50 rounded-lg p-3 space-y-2">
          <p className="text-[11px] text-amber-800">
            Cambiare modello cancella <strong>ogni riga</strong> di Situazione Debitoria già
            inserita in <strong>tutti</strong> gli scenari di questo spazio, non solo questo — il
            vecchio formato non descrive più i dati nuovi.
          </p>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={confermaCambioModello}
              onChange={(e) => setConfermaCambioModello(e.target.value)}
              placeholder='Scrivi "CAMBIA MODELLO" per confermare'
              className="flex-1 p-2 text-xs border border-amber-300 rounded-lg text-slate-900 bg-white"
            />
            <button
              type="button"
              onClick={handleCambiaModello}
              disabled={confermaCambioModello !== 'CAMBIA MODELLO' || cambioModelloInCorso}
              className="px-3 py-2 bg-red-600 hover:bg-red-700 disabled:bg-slate-300 text-white font-bold text-[10px] uppercase rounded-lg transition-colors shrink-0"
            >
              {cambioModelloInCorso ? 'In corso...' : 'Cambia modello'}
            </button>
          </div>
        </div>
      )}

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
                <th className="p-3">Voce</th>
                <th className="p-3">Importo</th>
                {haDistinzioneSaldo && <th className="p-3">Saldo</th>}
                <th className="p-3">Tipo</th>
                <th className="p-3">Note</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {righe.map((r) => (
                <tr key={r.id}>
                  <td className="p-3">
                    <input
                      type="checkbox"
                      checked={righeSelezionate.has(r.id)}
                      onChange={() => toggleSelezione(r.id)}
                      aria-label={`Seleziona riga ${r.voce}`}
                    />
                  </td>
                  <td className="p-3 font-bold text-slate-900">
                    {r.voce}
                    {r.data && (
                      <span className="block text-[10px] font-normal text-slate-400">
                        {new Date(r.data).toLocaleDateString('it-IT')}
                      </span>
                    )}
                  </td>
                  <td className="p-3 text-slate-700">€ {r.importo.toLocaleString('it-IT')}</td>
                  {haDistinzioneSaldo && (
                    <td className="p-3 font-bold text-slate-900">
                      € {(r.importo - (r.importoVersato ?? 0)).toLocaleString('it-IT')}
                    </td>
                  )}
                  <td className="p-3">
                    <span
                      className="px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-slate-100 text-slate-700"
                      title={r.tipo}
                    >
                      {etichettaTipoDebito(r.tipo, mappaEtichette)}
                    </span>
                  </td>
                  <td className="p-3 text-slate-500 text-[11px]">
                    {r.note || '—'}
                    {r.datiExtra && Object.keys(r.datiExtra).length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {Object.entries(r.datiExtra).map(([k, v]) => (
                          <span
                            key={k}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-50 border border-slate-200 text-[10px] text-slate-600"
                            title={`${k}: ${v}`}
                          >
                            <span className="text-slate-400">{k}:</span>
                            <span className="font-medium text-slate-700">{v}</span>
                          </span>
                        ))}
                      </div>
                    )}
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
                      onClick={() => handleElimina(r.id)}
                      className="text-slate-400 hover:text-red-600"
                      title="Elimina"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {righe.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="p-3 border-b border-slate-100 bg-slate-50">
            <h3 className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
              Riepilogo per tipo
            </h3>
          </div>
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-[10px] uppercase text-slate-500 font-bold border-b border-slate-100">
                <th className="p-3">Tipo</th>
                <th className="p-3">Righe</th>
                <th className="p-3">{haDistinzioneSaldo ? 'Debito lordo' : 'Totale'}</th>
                {haDistinzioneSaldo && <th className="p-3">Saldo (usato per il confronto)</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {riepilogo
                .filter((r) => r.numeroRighe > 0)
                .map((r) => (
                  <tr key={r.tipo}>
                    <td
                      className="p-3 font-bold text-slate-900"
                      title={etichettaTipoDebito(r.tipo, mappaEtichette)}
                    >
                      {r.etichetta}
                    </td>
                    <td className="p-3 text-slate-700">{r.numeroRighe}</td>
                    <td className="p-3 text-slate-700">€ {r.totale.toLocaleString('it-IT')}</td>
                    {haDistinzioneSaldo && (
                      <td className="p-3 font-bold text-slate-900">
                        € {r.totaleSaldo.toLocaleString('it-IT')}
                      </td>
                    )}
                  </tr>
                ))}
              <tr className="bg-slate-50 font-black">
                <td className="p-3 text-slate-900" colSpan={2}>
                  Totale complessivo
                </td>
                <td className="p-3 text-slate-900">
                  € {totaleComplessivo.toLocaleString('it-IT')}
                </td>
                {haDistinzioneSaldo && (
                  <td className="p-3 text-slate-900">
                    € {totaleSaldoComplessivo.toLocaleString('it-IT')}
                  </td>
                )}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
