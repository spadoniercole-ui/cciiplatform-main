'use client';

// Posizione Debitoria dell'Ente — a livello di AZIENDA. Percorso a
// TRACCIATI: ogni formato di file (nrc, DettaglioRichiesta, futuri) è un
// tracciato riconosciuto per firma. Al caricamento il sistema riconosce il
// tracciato (o apre il wizard per uno nuovo), chiede la mappatura dei soli
// codici-guida nuovi, e sostituisce SOLO le righe di quel tracciato. Le
// categorie (Debito/AVA/Neutro di default) sono parametriche di spazio.

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, Pencil, X, Download, Upload, FileStack } from 'lucide-react';
import {
  ottieniDebitiEnte,
  aggiungiRigaDebitoEnteAction,
  modificaRigaDebitoEnteAction,
  eliminaRigaDebitoEnteAction,
  eliminaDebitiPerTracciatoAzienda,
  type RigaDebitoEnte,
  type DatiRigaDebitoEnte,
} from '@/app/actions/debitiEnte';
import {
  ottieniCategorieTipoDebito,
  type CategoriaTipoDebito,
} from '@/app/actions/categorieTipoDebito';
import {
  ottieniTracciatiDebitiEnte,
  salvaTracciatoDebitiEnteAction,
  aggiornaMappaturaCodiciTracciatoAction,
  eliminaTracciatoDebitiEnteAction,
} from '@/app/actions/debitiEnteTracciati';
import {
  analizzaFoglio,
  riconosciTracciato,
  rilevaCodiciNuovi,
  estraiRighe,
  suggerisciRuoli,
  type AnalisiFoglio,
} from '@/lib/debitiEnte/tracciatoImport';
import {
  calcolaFirma,
  valoriDistintiColonna,
  type RuoloColonna,
  type ClassificazioneModo,
  type Tracciato,
  type SezioneEstratta,
} from '@/lib/debitiEnte/tracciatoCore';
import { raggruppaPerTipoDebito, etichettaTipoDebito } from '@/lib/debitiEnte/tipoDebito';
import { esportaDebitiEnteExcel } from '@/lib/debitiEnte/excelDebitiEnte';
import { useDichiaraContestoAssistente } from '@/components/ContestoAssistenteContext';

interface Props {
  nomeSchema: string;
  aziendaId: number;
  nomeAzienda: string;
}

const RUOLI_OPZIONI: { valore: RuoloColonna; label: string }[] = [
  { valore: 'ignora', label: 'Ignora questa colonna' },
  { valore: 'voce', label: 'Voce / descrizione' },
  { valore: 'importo', label: 'Importo (debito)' },
  { valore: 'importo_versato', label: 'Importo versato (per il saldo)' },
  { valore: 'guida', label: 'Colonna-guida (codici da classificare)' },
  { valore: 'data', label: 'Data' },
  { valore: 'nota', label: 'Nota' },
  { valore: 'extra', label: "Colonna extra (salva com'è)" },
];

function parseNumeroItaliano(testo: string): number {
  const pulito = testo.trim().replace(',', '.');
  const numero = Number(pulito);
  return Number.isNaN(numero) ? 0 : numero;
}

export function DebitiEnteScenario({ nomeSchema, aziendaId, nomeAzienda }: Props) {
  const router = useRouter();
  const primoCaricamento = React.useRef(true);

  const [righe, setRighe] = useState<RigaDebitoEnte[]>([]);
  const [categorie, setCategorie] = useState<CategoriaTipoDebito[]>([]);
  const [tracciati, setTracciati] = useState<Tracciato[]>([]);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);
  const [esito, setEsito] = useState<string | null>(null);
  const [inElaborazione, setInElaborazione] = useState(false);

  // Form inserimento/modifica manuale.
  const [form, setForm] = useState<DatiRigaDebitoEnte>({
    voce: '',
    importo: 0,
    importoVersato: null,
    tipo: '',
    note: null,
    data: null,
  });
  const [rigaInModifica, setRigaInModifica] = useState<number | null>(null);
  const [salvataggio, setSalvataggio] = useState(false);

  // Selezione multipla per eliminazione.
  const [righeSelezionate, setRigheSelezionate] = useState<Set<number>>(new Set());

  // Wizard nuovo tracciato.
  const [wizardFile, setWizardFile] = useState<File | null>(null);
  const [analisi, setAnalisi] = useState<AnalisiFoglio | null>(null);
  const [ruoli, setRuoli] = useState<RuoloColonna[]>([]);
  const [modo, setModo] = useState<ClassificazioneModo>('colonna_guida');
  const [tipoFisso, setTipoFisso] = useState<string>('');
  const [mappaCodici, setMappaCodici] = useState<Record<string, string>>({});
  const [nomeTracciato, setNomeTracciato] = useState('');
  const [erroreWizard, setErroreWizard] = useState<string | null>(null);

  // Mappatura codici nuovi (tracciato già riconosciuto).
  const [codiciNuovi, setCodiciNuovi] = useState<{
    tracciato: Tracciato;
    sezione: SezioneEstratta;
    codici: string[];
    mappa: Record<string, string>;
  } | null>(null);

  useDichiaraContestoAssistente({ pagina: 'debitoria-ente', nomeSchema, scenarioId: aziendaId });

  const categorieAttive = categorie.filter((c) => c.attivo);
  const mappaEtichette: Record<string, string> = Object.fromEntries(
    categorie.map((c) => [c.codice, c.etichetta])
  );
  const ordineCategorie = categorie.map((c) => c.codice);
  const nomiTracciato: Record<number, string> = Object.fromEntries(
    tracciati.map((t) => [t.id, t.nome])
  );

  const carica = async () => {
    setCaricamento(true);
    try {
      const [rDebiti, rCat, rTrac] = await Promise.all([
        ottieniDebitiEnte(nomeSchema, aziendaId),
        ottieniCategorieTipoDebito(nomeSchema),
        ottieniTracciatiDebitiEnte(nomeSchema),
      ]);
      if (rDebiti.success) setRighe(rDebiti.righe);
      else setErrore(rDebiti.error || 'Impossibile caricare la posizione debitoria.');
      if (rCat.success) {
        setCategorie(rCat.categorie);
        setForm((f) =>
          f.tipo ? f : { ...f, tipo: rCat.categorie.find((c) => c.attivo)?.codice || '' }
        );
      }
      if (rTrac.success) setTracciati(rTrac.tracciati);
    } finally {
      setCaricamento(false);
      if (primoCaricamento.current) primoCaricamento.current = false;
      else router.refresh();
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

  // ---------------------------------------------------------------- manuale
  const handleSalvaManuale = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.voce.trim()) {
      setErrore('Inserisci la voce di debito.');
      return;
    }
    if (!form.tipo) {
      setErrore('Scegli la categoria.');
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
    setForm({
      voce: '',
      importo: 0,
      importoVersato: null,
      tipo: categorieAttive[0]?.codice || '',
      note: null,
      data: null,
    });
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

  const annullaModifica = () => {
    setForm({
      voce: '',
      importo: 0,
      importoVersato: null,
      tipo: categorieAttive[0]?.codice || '',
      note: null,
      data: null,
    });
    setRigaInModifica(null);
    setErrore(null);
  };

  const handleElimina = async (id: number) => {
    if (rigaInModifica === id) annullaModifica();
    await eliminaRigaDebitoEnteAction(nomeSchema, id);
    await carica();
  };

  const toggleSelezione = (id: number) => {
    setRigheSelezionate((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };
  const toggleSelezionaTutte = () => {
    setRigheSelezionate((prev) =>
      prev.size === righe.length ? new Set() : new Set(righe.map((r) => r.id))
    );
  };
  const handleEliminaSelezionate = async () => {
    if (righeSelezionate.size === 0) return;
    if (
      !window.confirm(
        `Eliminare ${righeSelezionate.size} righe selezionate? Operazione non reversibile.`
      )
    )
      return;
    setInElaborazione(true);
    try {
      for (const id of righeSelezionate) await eliminaRigaDebitoEnteAction(nomeSchema, id);
      setRigheSelezionate(new Set());
      await carica();
    } finally {
      setInElaborazione(false);
    }
  };

  const handleEsporta = () => esportaDebitiEnteExcel(nomeAzienda, righe, mappaEtichette);

  // --------------------------------------------------------------- import
  const salvaRigheDaSezione = async (tracciato: Tracciato, sezione: SezioneEstratta) => {
    const { righe: importate, scartate } = estraiRighe(sezione, tracciato);
    // Sostituzione PER-TRACCIATO: via solo le righe di questo tracciato.
    await eliminaDebitiPerTracciatoAzienda(nomeSchema, aziendaId, tracciato.id);
    let salvate = 0;
    const erroriSalvataggio: string[] = [];
    for (const r of importate) {
      const res = await aggiungiRigaDebitoEnteAction(nomeSchema, aziendaId, {
        voce: r.voce,
        importo: r.importo,
        importoVersato: r.importoVersato,
        tipo: r.tipo,
        note: r.note,
        data: r.data,
        datiExtra: r.datiExtra,
        tracciatoId: tracciato.id,
      });
      if (res.success) salvate++;
      else erroriSalvataggio.push(res.error || 'errore');
    }
    await carica();
    const parti = [`${salvate} righe importate dal tracciato «${tracciato.nome}».`];
    if (scartate.length > 0)
      parti.push(`${scartate.length} righe scartate (importo o categoria mancante).`);
    if (erroriSalvataggio.length > 0) parti.push(`${erroriSalvataggio.length} non salvate.`);
    setEsito(parti.join(' '));
  };

  const handleSelezionaFile = async (file: File) => {
    setErrore(null);
    setEsito(null);
    setInElaborazione(true);
    try {
      const ric = await riconosciTracciato(file, tracciati);
      if (ric) {
        const nuovi = rilevaCodiciNuovi(ric.sezione, ric.tracciato);
        if (nuovi.length > 0) {
          setCodiciNuovi({
            tracciato: ric.tracciato,
            sezione: ric.sezione,
            codici: nuovi,
            mappa: {},
          });
        } else {
          await salvaRigheDaSezione(ric.tracciato, ric.sezione);
        }
      } else {
        // Nuovo tracciato → wizard.
        const a = await analizzaFoglio(file);
        if (a.sezione.headerRow < 0) {
          setEsito('Non riesco a individuare l’intestazione in questo file. Controlla il foglio.');
          return;
        }
        setWizardFile(file);
        setAnalisi(a);
        setRuoli(suggerisciRuoli(a.sezione.intestazioni));
        setModo('colonna_guida');
        setTipoFisso('');
        setMappaCodici({});
        setNomeTracciato(file.name.replace(/\.(xlsx?|xls)$/i, ''));
        setErroreWizard(null);
      }
    } catch (err: any) {
      setEsito(`Impossibile leggere il file: ${err.message || err}`);
    } finally {
      setInElaborazione(false);
    }
  };

  const cambiaFoglioWizard = async (foglio: string) => {
    if (!wizardFile) return;
    setInElaborazione(true);
    try {
      const a = await analizzaFoglio(wizardFile, foglio);
      setAnalisi(a);
      setRuoli(suggerisciRuoli(a.sezione.intestazioni));
      setMappaCodici({});
    } finally {
      setInElaborazione(false);
    }
  };

  const idxGuidaWizard = ruoli.indexOf('guida');
  const valoriGuidaWizard =
    analisi && idxGuidaWizard >= 0
      ? valoriDistintiColonna(analisi.sezione.righe, idxGuidaWizard)
      : [];

  const confermaWizard = async () => {
    if (!analisi || !wizardFile) return;
    setErroreWizard(null);
    if (!ruoli.includes('importo')) {
      setErroreWizard('Indica quale colonna è l’Importo.');
      return;
    }
    if (modo === 'colonna_guida') {
      if (idxGuidaWizard < 0) {
        setErroreWizard('Indica la colonna-guida dei codici da classificare.');
        return;
      }
      const nonMappati = valoriGuidaWizard.filter((v) => !mappaCodici[v]);
      if (nonMappati.length > 0) {
        setErroreWizard(
          `Mappa ancora questi codici: ${nonMappati.slice(0, 8).join(', ')}${nonMappati.length > 8 ? '…' : ''}`
        );
        return;
      }
    } else if (!tipoFisso) {
      setErroreWizard('Scegli la categoria fissa per l’intera sezione.');
      return;
    }
    if (!nomeTracciato.trim()) {
      setErroreWizard('Dai un nome al tracciato.');
      return;
    }
    setInElaborazione(true);
    try {
      const firma = calcolaFirma(analisi.fogli, analisi.sezione.intestazioni);
      const codiciNoti = modo === 'colonna_guida' ? valoriGuidaWizard : [];
      const res = await salvaTracciatoDebitiEnteAction(nomeSchema, {
        nome: nomeTracciato.trim(),
        foglio: analisi.foglioLetto,
        intestazioni: analisi.sezione.intestazioni,
        ruoli,
        classificazioneModo: modo,
        tipoFisso: modo === 'tipo_fisso' ? tipoFisso : null,
        mappaturaCodici: modo === 'colonna_guida' ? mappaCodici : {},
        codiciNoti,
        firma,
        nomeFileOrigine: wizardFile.name,
      });
      if (!res.success || !res.id) {
        setErroreWizard(res.error || 'Impossibile salvare il tracciato.');
        return;
      }
      const tracciato: Tracciato = {
        id: res.id,
        nome: nomeTracciato.trim(),
        foglio: analisi.foglioLetto,
        intestazioni: analisi.sezione.intestazioni,
        ruoli,
        classificazioneModo: modo,
        tipoFisso: modo === 'tipo_fisso' ? tipoFisso : null,
        mappaturaCodici: modo === 'colonna_guida' ? mappaCodici : {},
        codiciNoti,
        nomeFileOrigine: wizardFile.name,
      };
      await salvaRigheDaSezione(tracciato, analisi.sezione);
      // reset wizard
      setWizardFile(null);
      setAnalisi(null);
    } catch (err: any) {
      setErroreWizard(`Impossibile completare: ${err.message || err}`);
    } finally {
      setInElaborazione(false);
    }
  };

  const annullaWizard = () => {
    setWizardFile(null);
    setAnalisi(null);
    setErroreWizard(null);
  };

  const confermaCodiciNuovi = async () => {
    if (!codiciNuovi) return;
    const nonMappati = codiciNuovi.codici.filter((c) => !codiciNuovi.mappa[c]);
    if (nonMappati.length > 0) return;
    setInElaborazione(true);
    try {
      const mappaturaAgg = { ...codiciNuovi.tracciato.mappaturaCodici, ...codiciNuovi.mappa };
      const codiciNotiAgg = Array.from(
        new Set([...codiciNuovi.tracciato.codiciNoti, ...codiciNuovi.codici])
      );
      await aggiornaMappaturaCodiciTracciatoAction(
        nomeSchema,
        codiciNuovi.tracciato.id,
        mappaturaAgg,
        codiciNotiAgg
      );
      const tracciatoAgg: Tracciato = {
        ...codiciNuovi.tracciato,
        mappaturaCodici: mappaturaAgg,
        codiciNoti: codiciNotiAgg,
      };
      await salvaRigheDaSezione(tracciatoAgg, codiciNuovi.sezione);
      setCodiciNuovi(null);
    } finally {
      setInElaborazione(false);
    }
  };

  const handleEliminaTracciato = async (t: Tracciato) => {
    if (
      !window.confirm(
        `Eliminare il tracciato «${t.nome}»? Verranno cancellate SOLO le righe importate con questo tracciato (in tutte le aziende dello spazio). Le righe manuali restano.`
      )
    )
      return;
    setInElaborazione(true);
    try {
      const res = await eliminaTracciatoDebitiEnteAction(nomeSchema, t.id);
      if (!res.success) setEsito(res.error || 'Impossibile eliminare il tracciato.');
      await carica();
    } finally {
      setInElaborazione(false);
    }
  };

  if (caricamento) return <p className="text-xs text-slate-400">Caricamento...</p>;

  const riepilogo = raggruppaPerTipoDebito(
    righe.map((r) => ({
      voce: r.voce,
      importo: r.importo,
      importoVersato: r.importoVersato,
      tipo: r.tipo,
    })),
    mappaEtichette,
    ordineCategorie
  );
  const totale = riepilogo.reduce((a, r) => a + r.totale, 0);
  const totaleSaldo = riepilogo.reduce((a, r) => a + r.totaleSaldo, 0);
  const haSaldo = righe.some((r) => r.importoVersato !== null);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
          Posizione Debitoria dell&apos;Ente
        </h2>
        <p className="text-slate-500 text-[11px] mt-1">
          Carica i file dell&apos;ente (contabilizzati e non): ogni formato è un «tracciato»
          riconosciuto in automatico. Al primo caricamento di un formato nuovo ti chiedo come
          leggerlo; ai successivi lo applico da solo, chiedendoti solo i codici mai visti.
        </p>
      </div>

      {errore && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          {errore}
        </div>
      )}
      {esito && (
        <div className="text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-3">
          {esito}
        </div>
      )}

      {/* ---- Inserimento / modifica manuale ---- */}
      <form
        onSubmit={handleSalvaManuale}
        className="bg-white border border-slate-200 rounded-xl p-5 space-y-3"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            {rigaInModifica ? 'Modifica riga' : 'Nuova riga (manuale)'}
          </h3>
          {rigaInModifica && (
            <button
              type="button"
              onClick={annullaModifica}
              className="flex items-center gap-1 text-[10px] font-bold text-slate-400 hover:text-red-600 uppercase"
            >
              <X className="w-3 h-3" /> Annulla
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div>
            <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Voce</label>
            <input
              type="text"
              value={form.voce}
              onChange={(e) => setForm({ ...form, voce: e.target.value })}
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
            <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">
              Categoria
            </label>
            <select
              value={form.tipo}
              onChange={(e) => setForm({ ...form, tipo: e.target.value })}
              className="w-full p-2 text-xs bg-white border border-slate-200 rounded-lg text-slate-900"
            >
              {categorieAttive.length === 0 && <option value="">—</option>}
              {categorieAttive.map((c) => (
                <option key={c.codice} value={c.codice}>
                  {c.etichetta}
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

      {/* ---- Caricamento file (tracciati) ---- */}
      {!wizardFile && !codiciNuovi && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleEsporta}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[10px] uppercase rounded-lg transition-colors"
            >
              <Download className="w-3.5 h-3.5" /> Scarica quanto inserito
            </button>
            <label className="flex items-center gap-1.5 px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-[10px] uppercase rounded-lg transition-colors cursor-pointer">
              <Upload className="w-3.5 h-3.5" />
              {inElaborazione ? 'Elaborazione...' : 'Carica un file dell’ente'}
              <input
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                disabled={inElaborazione}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleSelezionaFile(f);
                  e.target.value = '';
                }}
              />
            </label>
          </div>
          {tracciati.length > 0 && (
            <div className="text-[10px] text-slate-500">
              Tracciati riconosciuti:{' '}
              {tracciati.map((t, i) => (
                <span key={t.id} className="inline-flex items-center gap-1">
                  <span className="font-bold text-slate-700">{t.nome}</span>
                  <button
                    type="button"
                    onClick={() => handleEliminaTracciato(t)}
                    title="Elimina tracciato"
                    className="text-slate-300 hover:text-red-600"
                  >
                    <X className="w-3 h-3" />
                  </button>
                  {i < tracciati.length - 1 ? <span className="text-slate-300 mr-1">·</span> : null}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ---- Mappatura codici NUOVI (tracciato riconosciuto) ---- */}
      {codiciNuovi && (
        <div className="bg-white border border-amber-200 rounded-xl p-5 space-y-3">
          <h3 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
            Codici nuovi nel tracciato «{codiciNuovi.tracciato.nome}»
          </h3>
          <p className="text-[11px] text-slate-500">
            Questo file porta codici-guida mai visti prima. Assegna una categoria a ciascuno, poi
            importo.
          </p>
          <div className="space-y-1.5">
            {codiciNuovi.codici.map((c) => (
              <div key={c} className="flex items-center gap-2">
                <span className="text-xs font-mono text-slate-700 flex-1 truncate">{c}</span>
                <select
                  value={codiciNuovi.mappa[c] || ''}
                  onChange={(e) =>
                    setCodiciNuovi({
                      ...codiciNuovi,
                      mappa: { ...codiciNuovi.mappa, [c]: e.target.value },
                    })
                  }
                  className="p-1.5 text-xs border border-slate-200 rounded text-slate-900 bg-white"
                >
                  <option value="">— categoria —</option>
                  {categorieAttive.map((cat) => (
                    <option key={cat.codice} value={cat.codice}>
                      {cat.etichetta}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setCodiciNuovi(null)}
              className="px-4 py-2 text-xs font-bold uppercase text-slate-500 hover:text-slate-700"
            >
              Annulla
            </button>
            <button
              type="button"
              onClick={confermaCodiciNuovi}
              disabled={inElaborazione || codiciNuovi.codici.some((c) => !codiciNuovi.mappa[c])}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white font-bold uppercase tracking-wider rounded-lg text-xs"
            >
              {inElaborazione ? 'Import...' : 'Mappa e importa'}
            </button>
          </div>
        </div>
      )}

      {/* ---- Wizard NUOVO tracciato ---- */}
      {wizardFile && analisi && (
        <div className="bg-white border border-blue-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <FileStack className="w-4 h-4 text-blue-600" />
            <h3 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
              Nuovo tracciato — come leggo questo file?
            </h3>
          </div>

          {erroreWizard && (
            <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
              {erroreWizard}
            </div>
          )}

          {analisi.fogli.length > 1 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <label className="text-[10px] font-bold text-amber-800 uppercase tracking-wider block mb-1">
                Foglio da leggere
              </label>
              <select
                value={analisi.foglioLetto}
                onChange={(e) => cambiaFoglioWizard(e.target.value)}
                className="w-full sm:w-72 p-2 text-xs bg-white border border-amber-300 rounded-lg text-slate-900"
              >
                {analisi.fogli.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
          )}

          <p className="text-[11px] text-slate-500">
            Intestazione rilevata alla riga {analisi.sezione.headerRow + 1};{' '}
            {analisi.sezione.righe.length} righe utili fino al primo salto di sezione. Assegna un
            ruolo a ogni colonna.
          </p>

          <div className="space-y-2">
            {analisi.sezione.intestazioni.map((intest, i) => (
              <div key={i} className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-slate-900 text-xs min-w-0 flex-1 truncate">
                  Col {i + 1}: «{intest || '(vuota)'}»
                </span>
                <select
                  value={ruoli[i] || 'ignora'}
                  onChange={(e) => {
                    const nuovi = [...ruoli];
                    nuovi[i] = e.target.value as RuoloColonna;
                    // Una sola colonna-guida.
                    if (nuovi[i] === 'guida')
                      nuovi.forEach((r, k) => {
                        if (k !== i && r === 'guida') nuovi[k] = 'ignora';
                      });
                    setRuoli(nuovi);
                  }}
                  className="p-1.5 text-xs border border-slate-200 rounded-lg text-slate-900 bg-white"
                >
                  {RUOLI_OPZIONI.map((o) => (
                    <option key={o.valore} value={o.valore}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
            <span className="text-[10px] font-bold text-slate-500 uppercase block">
              Come si classificano i debiti di questa sezione?
            </span>
            <label className="flex items-center gap-2 text-[11px] text-slate-700">
              <input
                type="radio"
                checked={modo === 'colonna_guida'}
                onChange={() => setModo('colonna_guida')}
              />
              Da una colonna-guida (mappo i suoi codici sulle categorie)
            </label>
            <label className="flex items-center gap-2 text-[11px] text-slate-700">
              <input
                type="radio"
                checked={modo === 'tipo_fisso'}
                onChange={() => setModo('tipo_fisso')}
              />
              Tutta la sezione è un&apos;unica categoria
            </label>

            {modo === 'colonna_guida' && idxGuidaWizard >= 0 && (
              <div className="mt-2 space-y-1.5">
                <span className="text-[10px] font-bold text-slate-500 uppercase block">
                  Codici trovati nella colonna-guida — assegna una categoria
                </span>
                {valoriGuidaWizard.map((v) => (
                  <div key={v} className="flex items-center gap-2">
                    <span className="text-xs font-mono text-slate-700 flex-1 truncate">{v}</span>
                    <select
                      value={mappaCodici[v] || ''}
                      onChange={(e) => setMappaCodici({ ...mappaCodici, [v]: e.target.value })}
                      className="p-1 text-xs border border-slate-200 rounded text-slate-900 bg-white"
                    >
                      <option value="">— categoria —</option>
                      {categorieAttive.map((c) => (
                        <option key={c.codice} value={c.codice}>
                          {c.etichetta}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            )}
            {modo === 'colonna_guida' && idxGuidaWizard < 0 && (
              <p className="text-[10px] text-amber-600">
                Imposta una colonna al ruolo «Colonna-guida» qui sopra.
              </p>
            )}
            {modo === 'tipo_fisso' && (
              <select
                value={tipoFisso}
                onChange={(e) => setTipoFisso(e.target.value)}
                className="w-full sm:w-64 p-2 text-xs bg-white border border-slate-300 rounded-lg text-slate-900"
              >
                <option value="">— scegli la categoria —</option>
                {categorieAttive.map((c) => (
                  <option key={c.codice} value={c.codice}>
                    {c.etichetta}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
              Nome del tracciato
            </label>
            <input
              type="text"
              value={nomeTracciato}
              onChange={(e) => setNomeTracciato(e.target.value)}
              placeholder="Es. NRC INPS"
              className="w-full sm:w-72 p-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
            />
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={annullaWizard}
              className="px-4 py-2 text-xs font-bold uppercase text-slate-500 hover:text-slate-700"
            >
              Annulla
            </button>
            <button
              type="button"
              onClick={confermaWizard}
              disabled={inElaborazione}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white font-bold uppercase tracking-wider rounded-lg text-xs"
            >
              {inElaborazione ? 'Salvataggio...' : 'Salva tracciato e importa'}
            </button>
          </div>
        </div>
      )}

      {/* ---- Selezione multipla ---- */}
      {righeSelezionate.size > 0 && (
        <div className="flex items-center justify-between bg-red-50 border border-red-200 rounded-xl p-3">
          <span className="text-xs font-bold text-red-800">
            {righeSelezionate.size} righe selezionate
          </span>
          <button
            type="button"
            onClick={handleEliminaSelezionate}
            disabled={inElaborazione}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 disabled:bg-slate-300 text-white font-bold text-[10px] uppercase rounded-lg"
          >
            <Trash2 className="w-3.5 h-3.5" /> Elimina selezionate
          </button>
        </div>
      )}

      {/* ---- Tabella righe ---- */}
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
                    aria-label="Seleziona tutte"
                  />
                </th>
                <th className="p-3">Voce</th>
                <th className="p-3">Importo</th>
                {haSaldo && <th className="p-3">Saldo</th>}
                <th className="p-3">Categoria</th>
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
                      aria-label={`Seleziona ${r.voce}`}
                    />
                  </td>
                  <td className="p-3 font-bold text-slate-900">
                    {r.voce}
                    {r.data && (
                      <span className="block text-[10px] font-normal text-slate-400">{r.data}</span>
                    )}
                    {r.tracciatoId && nomiTracciato[r.tracciatoId] && (
                      <span className="block text-[9px] font-normal text-blue-400">
                        da {nomiTracciato[r.tracciatoId]}
                      </span>
                    )}
                  </td>
                  <td className="p-3 text-slate-700">€ {r.importo.toLocaleString('it-IT')}</td>
                  {haSaldo && (
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

      {/* ---- Riepilogo per categoria ---- */}
      {righe.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="p-3 border-b border-slate-100 bg-slate-50">
            <h3 className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
              Riepilogo per categoria
            </h3>
          </div>
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-[10px] uppercase text-slate-500 font-bold border-b border-slate-100">
                <th className="p-3">Categoria</th>
                <th className="p-3">Righe</th>
                <th className="p-3">{haSaldo ? 'Debito lordo' : 'Totale'}</th>
                {haSaldo && <th className="p-3">Saldo</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {riepilogo
                .filter((r) => r.numeroRighe > 0)
                .map((r) => (
                  <tr key={r.tipo}>
                    <td className="p-3 font-bold text-slate-900" title={r.tipo}>
                      {r.etichetta}
                    </td>
                    <td className="p-3 text-slate-700">{r.numeroRighe}</td>
                    <td className="p-3 text-slate-700">€ {r.totale.toLocaleString('it-IT')}</td>
                    {haSaldo && (
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
                <td className="p-3 text-slate-900">€ {totale.toLocaleString('it-IT')}</td>
                {haSaldo && (
                  <td className="p-3 text-slate-900">€ {totaleSaldo.toLocaleString('it-IT')}</td>
                )}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
