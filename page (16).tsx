'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Building2,
  Sliders,
  Key,
  RefreshCw,
  Save,
  Copy,
  Check,
  ArrowLeft,
  PauseCircle,
  PlayCircle,
  XCircle,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  getLicenzaPerId,
  creaLicenzaCommercialeAction,
  rigeneraChiaveLicenza,
  salvaParametriLicenza,
  salvaAnagraficaLicenza,
  salvaFunzioniPlusLicenzaAction,
  sospendiLicenzaAction,
  riattivaLicenzaAction,
  cessaLicenzaAction,
  type Licenza,
} from '@/app/actions/licenze';

interface ModuloLicenzaProps {
  /** null = crea una nuova licenza commerciale; altrimenti modifica quella esistente. */
  idLicenza: string | null;
  onCreata?: (nuovaLicenza: Licenza) => void;
  onTornaAllaLista?: () => void;
}

export default function ModuloLicenza({
  idLicenza,
  onCreata,
  onTornaAllaLista,
}: ModuloLicenzaProps) {
  const [licenza, setLicenza] = useState<Licenza | null>(null);
  const [loading, setLoading] = useState<boolean>(idLicenza !== null);
  const [saving, setSaving] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'anagrafica' | 'parametri' | 'plus'>('anagrafica');

  // Stato Anagrafica
  const [ragioneSociale, setRagioneSociale] = useState('');
  const [codiceFiscale, setCodiceFiscale] = useState('');
  const [partitaIva, setPartitaIva] = useState('');
  const [indirizzo, setIndirizzo] = useState('');
  const [cap, setCap] = useState('');
  const [citta, setCitta] = useState('');
  const [pec, setPec] = useState('');

  // Stato Parametri / Limiti
  const [maxSpazi, setMaxSpazi] = useState(5);
  const [maxAziende, setMaxAziende] = useState(10);
  const [maxUtenti, setMaxUtenti] = useState(15);
  const [dataScadenza, setDataScadenza] = useState('');

  // Stato Funzioni Plus — default per ogni nuovo spazio creato sotto
  // questa licenza, si veda il commento in salvaFunzioniPlusLicenzaAction.
  const [plusDatiSettore, setPlusDatiSettore] = useState(false);
  const [plusSimulazione, setPlusSimulazione] = useState(false);
  const [plusRelazioneAi, setPlusRelazioneAi] = useState(false);
  const [savingPlus, setSavingPlus] = useState(false);

  // Caricamento dei dati dal DB (solo in modalità modifica: idLicenza valorizzato)
  const caricaLicenza = useCallback(async () => {
    if (!idLicenza) return;
    setLoading(true);
    try {
      const data = await getLicenzaPerId(idLicenza);
      if (!data) {
        toast.error('Licenza non trovata.');
        return;
      }

      setLicenza(data);
      setRagioneSociale(data.ragione_sociale || '');
      setCodiceFiscale(data.codice_fiscale || '');
      setPartitaIva(data.partita_iva || '');
      setIndirizzo(data.indirizzo || '');
      setCap(data.cap || '');
      setCitta(data.citta || '');
      setPec(data.pec || '');
      setMaxSpazi(data.max_spazi);
      setMaxAziende(data.max_aziende);
      setMaxUtenti(data.max_utenti);
      setPlusDatiSettore(data.plus_dati_settore || false);
      setPlusSimulazione(data.plus_simulazione || false);
      setPlusRelazioneAi(data.plus_relazione_ai || false);

      if (data.data_scadenza) {
        const dateObj = new Date(data.data_scadenza);
        setDataScadenza(dateObj.toISOString().split('T')[0]);
      } else {
        setDataScadenza('');
      }
    } catch (error) {
      console.error(error);
      toast.error('Errore nel caricamento della licenza.');
    } finally {
      setLoading(false);
    }
  }, [idLicenza]);

  useEffect(() => {
    caricaLicenza();
  }, [caricaLicenza]);

  const handleCopyKey = () => {
    if (!licenza) return;
    navigator.clipboard.writeText(licenza.id_licenza);
    setCopied(true);
    toast.success('Chiave licenza copiata negli appunti!');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRigeneraChiave = async () => {
    if (!licenza) return;

    const conferma = window.confirm(
      'ATTENZIONE: rigenerando la chiave, gli spazi già collegati restano collegati (il legame è per id interno, non per la chiave mostrata), ma la chiave visibile cambierà. Vuoi procedere?'
    );

    if (!conferma) return;

    setSaving(true);
    try {
      const risultato = await rigeneraChiaveLicenza(licenza.id_licenza);
      if (!risultato.success) {
        toast.error(risultato.error || 'Impossibile rigenerare la chiave.');
        return;
      }
      toast.success(`Nuova chiave licenza generata: ${risultato.nuovaChiave}`);
      await caricaLicenza();
    } catch (error) {
      console.error(error);
      toast.error('Errore durante la rigenerazione della chiave.');
    } finally {
      setSaving(false);
    }
  };

  // Creazione di una nuova licenza commerciale (modalità idLicenza === null)
  const handleCreaLicenza = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ragioneSociale.trim()) {
      toast.error('La ragione sociale è obbligatoria.');
      return;
    }
    setSaving(true);
    try {
      const risultato = await creaLicenzaCommercialeAction(ragioneSociale.trim());
      if (!risultato.success || !risultato.licenza) {
        toast.error(risultato.error || 'Impossibile creare la licenza.');
        return;
      }
      toast.success(`Licenza commerciale creata: ${risultato.licenza.id_licenza}`);
      onCreata?.(risultato.licenza);
    } catch (error) {
      console.error(error);
      toast.error('Errore durante la creazione della licenza.');
    } finally {
      setSaving(false);
    }
  };

  const handleSalvaAnagrafica = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!licenza) return;
    setSaving(true);

    try {
      const risultato = await salvaAnagraficaLicenza(licenza.id_licenza, {
        ragione_sociale: ragioneSociale,
        codice_fiscale: codiceFiscale,
        partita_iva: partitaIva,
        indirizzo,
        cap,
        citta,
        pec,
      });

      if (risultato.success) {
        toast.success('Dati anagrafici aggiornati.');
        await caricaLicenza();
      } else {
        toast.error(risultato.error || 'Impossibile salvare i dati anagrafici.');
      }
    } catch (error) {
      console.error(error);
      toast.error('Errore durante il salvataggio.');
    } finally {
      setSaving(false);
    }
  };

  const handleSalvaParametri = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!licenza) return;
    setSaving(true);

    try {
      const risultato = await salvaParametriLicenza(licenza.id_licenza, {
        maxSpazi,
        maxAziende,
        maxUtenti,
        dataScadenza,
      });

      if (risultato.success) {
        toast.success('Parametri operativi aggiornati.');
        await caricaLicenza();
      } else {
        toast.error(risultato.error || 'Impossibile salvare i parametri.');
      }
    } catch (error) {
      console.error(error);
      toast.error('Errore durante il salvataggio.');
    } finally {
      setSaving(false);
    }
  };

  const handleSalvaPlus = async () => {
    if (!licenza) return;
    setSavingPlus(true);
    try {
      const risultato = await salvaFunzioniPlusLicenzaAction(licenza.id_licenza, {
        datiSettore: plusDatiSettore,
        simulazione: plusSimulazione,
        relazioneAi: plusRelazioneAi,
      });
      if (risultato.success) {
        toast.success(
          'Funzioni plus di default aggiornate — valgono per i nuovi spazi creati da ora in poi.'
        );
        await caricaLicenza();
      } else {
        toast.error(risultato.error || 'Impossibile salvare le funzioni plus.');
      }
    } catch (error) {
      console.error(error);
      toast.error('Errore durante il salvataggio.');
    } finally {
      setSavingPlus(false);
    }
  };

  // Sospensione / riattivazione / cessazione (indipendenti dalla scadenza naturale)
  const handleSospendi = async () => {
    if (!licenza) return;
    const motivo = window.prompt('Motivo della sospensione (facoltativo):') || undefined;
    setSaving(true);
    try {
      const risultato = await sospendiLicenzaAction(licenza.id_licenza, motivo);
      if (risultato.success) {
        toast.success('Licenza sospesa.');
        await caricaLicenza();
      } else {
        toast.error(risultato.error || 'Impossibile sospendere la licenza.');
      }
    } catch (error) {
      console.error(error);
      toast.error('Errore durante la sospensione.');
    } finally {
      setSaving(false);
    }
  };

  const handleRiattiva = async () => {
    if (!licenza) return;
    setSaving(true);
    try {
      const risultato = await riattivaLicenzaAction(licenza.id_licenza);
      if (risultato.success) {
        toast.success('Licenza riattivata.');
        await caricaLicenza();
      } else {
        toast.error(risultato.error || 'Impossibile riattivare la licenza.');
      }
    } catch (error) {
      console.error(error);
      toast.error('Errore durante la riattivazione.');
    } finally {
      setSaving(false);
    }
  };

  const handleCessa = async () => {
    if (!licenza) return;
    const conferma = window.confirm(
      'ATTENZIONE: la cessazione è pensata per essere definitiva (fine anticipata del rapporto commerciale). Gli spazi già collegati NON vengono toccati, ma non sarà più possibile crearne di nuovi con questa licenza. Vuoi procedere?'
    );
    if (!conferma) return;
    const motivo = window.prompt('Motivo della cessazione (facoltativo):') || undefined;
    setSaving(true);
    try {
      const risultato = await cessaLicenzaAction(licenza.id_licenza, motivo);
      if (risultato.success) {
        toast.success('Licenza cessata.');
        await caricaLicenza();
      } else {
        toast.error(risultato.error || 'Impossibile cessare la licenza.');
      }
    } catch (error) {
      console.error(error);
      toast.error('Errore durante la cessazione.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-blue-600" />
        <span className="ml-3 text-gray-600">Sincronizzazione licenza in corso...</span>
      </div>
    );
  }

  // MODALITÀ CREAZIONE (idLicenza === null): form minimo, solo ragione sociale.
  if (!idLicenza) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-6">
        <div className="flex items-center justify-between border-b border-gray-100 pb-4 mb-6">
          <div className="flex items-center space-x-3">
            <Key className="h-6 w-6 text-blue-600" />
            <h2 className="text-xl font-bold text-gray-900">Nuova Licenza Commerciale</h2>
          </div>
          {onTornaAllaLista && (
            <button
              type="button"
              onClick={onTornaAllaLista}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
            >
              <ArrowLeft className="h-4 w-4" /> Torna all&apos;elenco
            </button>
          )}
        </div>
        <form onSubmit={handleCreaLicenza} className="space-y-4 max-w-lg">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Ragione Sociale del cliente commerciale
            </label>
            <input
              type="text"
              required
              value={ragioneSociale}
              onChange={(e) => setRagioneSociale(e.target.value)}
              placeholder="Es. Studio Rossi & Associati SRL"
              className="w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
            />
          </div>
          <p className="text-xs text-gray-500">
            La chiave di licenza e i limiti (max spazi/aziende/utenti) vengono impostati con valori
            di default alla creazione: potrai modificarli subito dopo.
          </p>
          <button
            type="submit"
            disabled={saving}
            className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold px-6 py-2.5 rounded-lg shadow-sm transition"
          >
            <Save className="h-4 w-4" />
            <span>{saving ? 'Creazione...' : 'Crea Licenza Commerciale'}</span>
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-gray-100 p-6 gap-4">
        <div className="flex items-center space-x-3">
          <Key className="h-6 w-6 text-blue-600" />
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-gray-900">Licenza Commerciale</h2>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                  licenza?.stato === 'ATTIVA'
                    ? 'bg-emerald-100 text-emerald-800'
                    : licenza?.stato === 'SOSPESA'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-red-100 text-red-800'
                }`}
              >
                {licenza?.stato || 'ATTIVA'}
              </span>
            </div>
            <div className="flex items-center space-x-2 mt-1">
              <span className="text-xs text-gray-500 font-semibold uppercase tracking-wider">
                CHIAVE ATTIVA:
              </span>
              <div className="flex items-center bg-gray-100 px-2 py-1 rounded border border-gray-200">
                <code className="text-sm font-mono font-bold text-blue-700 mr-2">
                  {licenza?.id_licenza}
                </code>
                <button
                  type="button"
                  onClick={handleCopyKey}
                  className="text-gray-400 hover:text-blue-600 transition"
                  title="Copia negli appunti"
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-green-600" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
            {licenza?.motivo_stato && (
              <p className="text-xs text-gray-500 mt-1">Motivo: {licenza.motivo_stato}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {onTornaAllaLista && (
            <button
              type="button"
              onClick={onTornaAllaLista}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 px-2"
            >
              <ArrowLeft className="h-4 w-4" /> Elenco
            </button>
          )}

          {licenza?.stato === 'ATTIVA' && (
            <button
              type="button"
              onClick={handleSospendi}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-700 font-semibold text-xs rounded-lg border border-amber-200 transition"
            >
              <PauseCircle className="h-4 w-4" /> Sospendi
            </button>
          )}
          {licenza?.stato === 'SOSPESA' && (
            <button
              type="button"
              onClick={handleRiattiva}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-semibold text-xs rounded-lg border border-emerald-200 transition"
            >
              <PlayCircle className="h-4 w-4" /> Riattiva
            </button>
          )}
          {licenza?.stato !== 'CESSATA' && (
            <button
              type="button"
              onClick={handleCessa}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-2 bg-red-50 hover:bg-red-100 text-red-700 font-semibold text-xs rounded-lg border border-red-200 transition"
            >
              <XCircle className="h-4 w-4" /> Cessa
            </button>
          )}

          <button
            type="button"
            onClick={handleRigeneraChiave}
            disabled={saving}
            className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition border border-gray-200"
            title="Rigenera chiave"
          >
            <RefreshCw className={`h-4 w-4 ${saving ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="flex border-b border-gray-100 px-6">
        <button
          onClick={() => setActiveTab('anagrafica')}
          className={`flex items-center space-x-2 py-4 px-4 border-b-2 font-medium text-sm transition-all ${
            activeTab === 'anagrafica'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-200'
          }`}
        >
          <Building2 className="h-4 w-4" />
          <span>Dati Societari ed Anagrafica</span>
        </button>
        <button
          onClick={() => setActiveTab('parametri')}
          className={`flex items-center space-x-2 py-4 px-4 border-b-2 font-medium text-sm transition-all ${
            activeTab === 'parametri'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-200'
          }`}
        >
          <Sliders className="h-4 w-4" />
          <span>Soglie e Parametri Operativi</span>
        </button>
        <button
          onClick={() => setActiveTab('plus')}
          className={`flex items-center space-x-2 py-4 px-4 border-b-2 font-medium text-sm transition-all ${
            activeTab === 'plus'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-200'
          }`}
        >
          <Sparkles className="h-4 w-4" />
          <span>Funzioni Plus</span>
        </button>
      </div>

      <div className="p-6">
        {activeTab === 'anagrafica' ? (
          <form onSubmit={handleSalvaAnagrafica} className="space-y-6">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Ragione Sociale
                </label>
                <input
                  type="text"
                  required
                  value={ragioneSociale}
                  onChange={(e) => setRagioneSociale(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Codice Fiscale
                </label>
                <input
                  type="text"
                  value={codiceFiscale}
                  onChange={(e) => setCodiceFiscale(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none font-mono"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Partita IVA
                </label>
                <input
                  type="text"
                  value={partitaIva}
                  onChange={(e) => setPartitaIva(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none font-mono"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Indirizzo Sede Legale
                </label>
                <input
                  type="text"
                  value={indirizzo}
                  onChange={(e) => setIndirizzo(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Città</label>
                <input
                  type="text"
                  value={citta}
                  onChange={(e) => setCitta(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">CAP</label>
                  <input
                    type="text"
                    value={cap}
                    onChange={(e) => setCap(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Indirizzo PEC
                  </label>
                  <input
                    type="email"
                    value={pec}
                    onChange={(e) => setPec(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-4 border-t border-gray-100">
              <button
                type="submit"
                disabled={saving}
                className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold px-6 py-2.5 rounded-lg shadow-sm transition"
              >
                <Save className="h-4 w-4" />
                <span>{saving ? 'Salvataggio...' : 'Salva Anagrafica'}</span>
              </button>
            </div>
          </form>
        ) : activeTab === 'parametri' ? (
          <form onSubmit={handleSalvaParametri} className="space-y-6">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Massimo Spazi Lavoro (Workspaces)
                </label>
                <input
                  type="number"
                  required
                  min={1}
                  value={maxSpazi}
                  onChange={(e) => setMaxSpazi(parseInt(e.target.value, 10) || 1)}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Numero Massimo Aziende Gestibili
                </label>
                <input
                  type="number"
                  required
                  min={1}
                  value={maxAziende}
                  onChange={(e) => setMaxAziende(parseInt(e.target.value, 10) || 1)}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Numero Massimo Utenti Registrabili
                </label>
                <input
                  type="number"
                  required
                  min={1}
                  value={maxUtenti}
                  onChange={(e) => setMaxUtenti(parseInt(e.target.value, 10) || 1)}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Data Scadenza Licenza
                </label>
                <input
                  type="date"
                  required
                  value={dataScadenza}
                  onChange={(e) => setDataScadenza(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none font-mono"
                />
              </div>
            </div>

            <div className="flex justify-end pt-4 border-t border-gray-100">
              <button
                type="submit"
                disabled={saving}
                className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold px-6 py-2.5 rounded-lg shadow-sm transition"
              >
                <Save className="h-4 w-4" />
                <span>{saving ? 'Salvataggio...' : 'Salva Parametri'}</span>
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-6">
            <p className="text-sm text-gray-500">
              Valori di default ereditati da ogni nuovo spazio creato sotto questa licenza — non
              retroattivi sugli spazi già esistenti, che restano modificabili singolarmente da
              Manutenzione Spazi.
            </p>
            <div className="space-y-3 max-w-md">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={plusDatiSettore}
                  onChange={(e) => setPlusDatiSettore(e.target.checked)}
                />
                Dati di Settore
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={plusSimulazione}
                  onChange={(e) => setPlusSimulazione(e.target.checked)}
                />
                Simulazione
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={plusRelazioneAi}
                  onChange={(e) => setPlusRelazioneAi(e.target.checked)}
                />
                Relazione AI
              </label>
            </div>
            <div className="flex justify-end pt-4 border-t border-gray-100">
              <button
                type="button"
                onClick={handleSalvaPlus}
                disabled={savingPlus}
                className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold px-6 py-2.5 rounded-lg shadow-sm transition"
              >
                <Save className="h-4 w-4" />
                <span>{savingPlus ? 'Salvataggio...' : 'Salva Funzioni Plus'}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
