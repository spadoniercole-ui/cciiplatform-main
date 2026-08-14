'use client';

// Manutenzione Spazi — elenco degli spazi esistenti e ingresso come
// "salvagente". Separata dalla pagina di creazione (/superadmin/Spazi) per
// non far scorrere troppo quella pagina: creazione e gestione sono due
// momenti diversi, ora anche due schermate diverse.
//
// L'ingresso in uno spazio apre sempre in una nuova scheda: il superadmin
// resta con la propria sessione/navigazione qui, senza perderla.

import React, { useEffect, useState } from 'react';
import { Building2, ShieldAlert, RefreshCw, Copy, Trash2 } from 'lucide-react';
import {
  ottieniSpaziAction,
  riprovaProvisioningAction,
  entraComeSalvagenteAction,
  type SpazioConLicenza,
} from '@/app/actions/spazi';
import { aggiornaFunzioniPlusAction, type FunzioniPlus } from '@/app/actions/funzioniPlus';
import { aggiornaAnagraficaSpazioAction, eliminaSpazioCompletoAction } from '@/app/actions/spazi';
import { RiparazioneIndiceAdmin } from '@/components/superadmin/RiparazioneIndiceAdmin';

export default function ManutenzioneSpaziPage() {
  const [spazi, setSpazi] = useState<SpazioConLicenza[]>([]);
  const [caricamento, setCaricamento] = useState(true);
  const [erroreLista, setErroreLista] = useState<string | null>(null);
  const [azioneInCorsoId, setAzioneInCorsoId] = useState<number | null>(null);
  const [anagraficaInModifica, setAnagraficaInModifica] = useState<{
    id: number;
    descrizione: string;
    tipoSpazio: 'ENTE' | 'NON_ENTE';
    giudicante: boolean;
  } | null>(null);
  const [salvataggioAnagrafica, setSalvataggioAnagrafica] = useState(false);
  const [spazioInEliminazione, setSpazioInEliminazione] = useState<SpazioConLicenza | null>(null);
  const [confermaEliminazione, setConfermaEliminazione] = useState('');
  const [eliminazioneInCorso, setEliminazioneInCorso] = useState(false);

  const handleEliminaSpazio = async () => {
    if (!spazioInEliminazione || confermaEliminazione !== spazioInEliminazione.codice) return;
    setEliminazioneInCorso(true);
    const esito = await eliminaSpazioCompletoAction(spazioInEliminazione.id);
    if (esito.success) {
      setSpazi((prev) => prev.filter((s) => s.id !== spazioInEliminazione.id));
      setSpazioInEliminazione(null);
      setConfermaEliminazione('');
    } else {
      setErroreLista(esito.error || 'Impossibile eliminare lo spazio.');
    }
    setEliminazioneInCorso(false);
  };

  const handleApriAnagrafica = (spazio: SpazioConLicenza) => {
    setAnagraficaInModifica({
      id: spazio.id,
      descrizione: spazio.descrizione,
      tipoSpazio: spazio.tipoSpazio,
      giudicante: spazio.giudicante,
    });
  };

  const handleSalvaAnagrafica = async () => {
    if (!anagraficaInModifica) return;
    setSalvataggioAnagrafica(true);
    const esito = await aggiornaAnagraficaSpazioAction(anagraficaInModifica.id, {
      descrizione: anagraficaInModifica.descrizione,
      tipoSpazio: anagraficaInModifica.tipoSpazio,
      giudicante: anagraficaInModifica.giudicante,
    });
    if (esito.success) {
      setSpazi((prev) =>
        prev.map((s) =>
          s.id === anagraficaInModifica.id
            ? {
                ...s,
                descrizione: anagraficaInModifica.descrizione,
                tipoSpazio: anagraficaInModifica.tipoSpazio,
                giudicante: anagraficaInModifica.giudicante,
              }
            : s
        )
      );
      setAnagraficaInModifica(null);
    } else {
      setErroreLista(esito.error || "Impossibile salvare l'anagrafica.");
    }
    setSalvataggioAnagrafica(false);
  };

  const handleTogglePlus = async (
    spazio: SpazioConLicenza,
    campo: 'plusDatiSettore' | 'plusSimulazione' | 'plusRelazioneAi'
  ) => {
    const valoreNuovo = !spazio[campo];
    setSpazi((prev) => prev.map((s) => (s.id === spazio.id ? { ...s, [campo]: valoreNuovo } : s)));
    await aggiornaFunzioniPlusAction(spazio.id, {
      datiSettore: campo === 'plusDatiSettore' ? valoreNuovo : spazio.plusDatiSettore,
      simulazione: campo === 'plusSimulazione' ? valoreNuovo : spazio.plusSimulazione,
      relazioneAi: campo === 'plusRelazioneAi' ? valoreNuovo : spazio.plusRelazioneAi,
    });
  };

  const caricaSpazi = async () => {
    setCaricamento(true);
    setErroreLista(null);
    try {
      const risultato = await ottieniSpaziAction();
      if (!risultato.success) {
        setErroreLista(risultato.error || 'Impossibile caricare gli spazi.');
      }
      setSpazi(risultato.spazi);
    } catch (err: any) {
      console.error('Errore nel caricamento degli spazi:', err);
      setErroreLista(`Impossibile caricare l'elenco: ${err.message || err}.`);
    } finally {
      setCaricamento(false);
    }
  };

  useEffect(() => {
    caricaSpazi();
  }, []);

  const handleRiprovaProvisioning = async (spazio: SpazioConLicenza) => {
    setAzioneInCorsoId(spazio.id);
    try {
      const risultato = await riprovaProvisioningAction(spazio.id, spazio.codice);
      if (!risultato.success) {
        alert(risultato.error || 'Provisioning fallito.');
      }
      await caricaSpazi();
    } finally {
      setAzioneInCorsoId(null);
    }
  };

  const handleEntraComeSalvagente = async (spazio: SpazioConLicenza) => {
    setAzioneInCorsoId(spazio.id);
    try {
      const risultato = await entraComeSalvagenteAction(spazio.id);
      if (!risultato.success) {
        alert(risultato.error || 'Impossibile entrare in questo spazio.');
        return;
      }
      // Nuova scheda: il superadmin non perde la propria pagina di
      // manutenzione, può entrare in più spazi in schede separate.
      window.open(`/spazio/${spazio.codice}`, '_blank', 'noopener,noreferrer');
    } finally {
      setAzioneInCorsoId(null);
    }
  };

  return (
    <div className="p-6 space-y-6 font-sans text-sm text-slate-800 max-w-5xl">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Manutenzione Spazi</h1>
        <p className="text-slate-500 text-xs mt-1">
          Elenco degli spazi esistenti. L&apos;ingresso in uno spazio apre in una nuova scheda.
        </p>
      </div>

      <RiparazioneIndiceAdmin />

      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3 mb-4">
          <Building2 className="w-4 h-4 text-slate-500" />
          <h2 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
            Spazi esistenti ({spazi.length})
          </h2>
        </div>

        {erroreLista && (
          <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 mb-3">
            {erroreLista}
          </div>
        )}
        {caricamento && <p className="text-xs text-slate-400">Caricamento...</p>}
        {!caricamento && !erroreLista && spazi.length === 0 && (
          <p className="text-xs text-slate-400">
            Nessuno spazio creato finora. Vai su &quot;Spazi di Lavoro&quot; per crearne uno.
          </p>
        )}

        <div className="space-y-2">
          {spazi.map((s) => (
            <div
              key={s.id}
              className="border border-slate-200 rounded-lg p-3 flex flex-wrap justify-between items-center gap-3"
            >
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-slate-900 font-mono text-xs">{s.codice}</span>
                  <button
                    type="button"
                    onClick={() => navigator.clipboard.writeText(s.codice)}
                    className="text-slate-300 hover:text-blue-600"
                    title="Copia codice spazio"
                  >
                    <Copy className="w-3 h-3" />
                  </button>
                </div>
                <div className="text-xs text-slate-600">{s.descrizione}</div>
                <div className="text-[10px] text-slate-400 font-mono mt-0.5 flex items-center gap-1">
                  <span>{s.chiaveLicenza}</span>
                  <button
                    type="button"
                    onClick={() => navigator.clipboard.writeText(s.chiaveLicenza)}
                    className="text-slate-300 hover:text-blue-600"
                    title="Copia chiave licenza operativa"
                  >
                    <Copy className="w-2.5 h-2.5" />
                  </button>
                  <span>
                    · {s.tier} · max {s.maxUtenti} utenti / {s.maxAziende} aziende
                    {s.dataScadenza
                      ? ` · scade il ${new Date(s.dataScadenza).toLocaleDateString('it-IT')}`
                      : ''}
                  </span>
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  Licenza commerciale:{' '}
                  <span className="font-semibold text-slate-600">
                    {s.ragioneSocialeLicenzaCommerciale || 'N/D'}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 mt-1.5">
                  <span className="text-[9px] text-slate-400 uppercase font-bold">Plus:</span>
                  {[
                    { campo: 'plusDatiSettore' as const, etichetta: 'Dati di Settore' },
                    { campo: 'plusSimulazione' as const, etichetta: 'Simulazione' },
                    { campo: 'plusRelazioneAi' as const, etichetta: 'Relazione AI' },
                  ].map(({ campo, etichetta }) => (
                    <button
                      key={campo}
                      type="button"
                      onClick={() => handleTogglePlus(s, campo)}
                      title={
                        s[campo]
                          ? 'Attiva — clicca per disattivare'
                          : 'Disattiva — clicca per attivare'
                      }
                      className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase transition-colors ${
                        s[campo]
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                      }`}
                    >
                      {etichetta}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-1.5 mt-1.5">
                  <span
                    className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                      s.tipoSpazio === 'ENTE'
                        ? 'bg-purple-100 text-purple-700'
                        : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {s.tipoSpazio === 'ENTE' ? 'Ente' : 'Non Ente'}
                  </span>
                  {s.giudicante && (
                    <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-slate-800 text-white">
                      Giudicante
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => handleApriAnagrafica(s)}
                    className="text-[9px] font-bold uppercase text-blue-600 hover:text-blue-800 underline"
                  >
                    Modifica anagrafica
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span
                  className={`px-2 py-1 rounded text-[9px] font-bold uppercase ${
                    s.schemaProvisionato
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {s.schemaProvisionato ? 'Schema pronto' : 'Schema non provisionato'}
                </span>

                {!s.schemaProvisionato && (
                  <button
                    type="button"
                    onClick={() => handleRiprovaProvisioning(s)}
                    disabled={azioneInCorsoId === s.id}
                    className="flex items-center gap-1 px-2.5 py-1.5 bg-amber-600 hover:bg-amber-500 disabled:bg-amber-300 text-white font-bold text-[9px] uppercase rounded-md transition-colors"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Riprova
                  </button>
                )}

                {s.schemaProvisionato && (
                  <button
                    type="button"
                    onClick={() => handleEntraComeSalvagente(s)}
                    disabled={azioneInCorsoId === s.id}
                    className="flex items-center gap-1 px-2.5 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-300 text-white font-bold text-[9px] uppercase rounded-md transition-colors"
                  >
                    <ShieldAlert className="w-3 h-3" />
                    Entra (salvagente)
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setSpazioInEliminazione(s);
                    setConfermaEliminazione('');
                  }}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-white border border-red-200 hover:bg-red-50 text-red-600 font-bold text-[9px] uppercase rounded-md transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                  Elimina
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {anagraficaInModifica && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-5 w-full max-w-md space-y-4">
            <h3 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
              Anagrafica dello spazio
            </h3>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                Descrizione
              </label>
              <input
                type="text"
                value={anagraficaInModifica.descrizione}
                onChange={(e) =>
                  setAnagraficaInModifica({ ...anagraficaInModifica, descrizione: e.target.value })
                }
                className="w-full p-2 text-sm border border-slate-200 rounded-lg text-slate-900 bg-white"
              />
            </div>
            <div>
              <span className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                Tipo di spazio
              </span>
              <div className="flex gap-4">
                <label className="flex items-center gap-1.5 text-xs text-slate-700">
                  <input
                    type="radio"
                    checked={anagraficaInModifica.tipoSpazio === 'NON_ENTE'}
                    onChange={() =>
                      setAnagraficaInModifica({ ...anagraficaInModifica, tipoSpazio: 'NON_ENTE' })
                    }
                  />
                  Non Ente
                </label>
                <label className="flex items-center gap-1.5 text-xs text-slate-700">
                  <input
                    type="radio"
                    checked={anagraficaInModifica.tipoSpazio === 'ENTE'}
                    onChange={() =>
                      setAnagraficaInModifica({ ...anagraficaInModifica, tipoSpazio: 'ENTE' })
                    }
                  />
                  Ente
                </label>
              </div>
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={anagraficaInModifica.giudicante}
                onChange={(e) =>
                  setAnagraficaInModifica({ ...anagraficaInModifica, giudicante: e.target.checked })
                }
              />
              Giudicante — predisposto per un futuro sviluppo, non ancora operativo
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setAnagraficaInModifica(null)}
                className="px-4 py-2 text-xs font-bold uppercase text-slate-500 hover:text-slate-700"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={handleSalvaAnagrafica}
                disabled={salvataggioAnagrafica}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white font-bold uppercase tracking-wider rounded-lg text-xs transition-colors"
              >
                {salvataggioAnagrafica ? 'Salvataggio...' : 'Salva'}
              </button>
            </div>
          </div>
        </div>
      )}

      {spazioInEliminazione && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-5 w-full max-w-md space-y-4">
            <h3 className="font-bold text-red-700 uppercase text-xs tracking-wider">
              Elimina spazio definitivamente
            </h3>
            <p className="text-xs text-slate-600">
              Elimina per intero lo schema di <strong>{spazioInEliminazione.descrizione}</strong> (
              {spazioInEliminazione.codice}) — ogni azienda, scenario, proposta, bilancio, risposta
              Check List e documento collegato a questo spazio. <strong>Irreversibile.</strong>{' '}
              Molto più mirata di &quot;Azzera tutto&quot;: tocca solo questo spazio, non
              l&apos;intero database.
            </p>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                Scrivi il codice esatto (&quot;{spazioInEliminazione.codice}&quot;) per confermare
              </label>
              <input
                type="text"
                value={confermaEliminazione}
                onChange={(e) => setConfermaEliminazione(e.target.value)}
                className="w-full p-2 text-xs border border-red-200 rounded-lg text-slate-900 bg-white"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setSpazioInEliminazione(null);
                  setConfermaEliminazione('');
                }}
                className="px-4 py-2 text-xs font-bold uppercase text-slate-500 hover:text-slate-700"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={handleEliminaSpazio}
                disabled={
                  confermaEliminazione !== spazioInEliminazione.codice || eliminazioneInCorso
                }
                className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-slate-300 text-white font-bold uppercase tracking-wider rounded-lg text-xs transition-colors"
              >
                {eliminazioneInCorso ? 'Eliminazione...' : 'Elimina definitivamente'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
