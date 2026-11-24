'use client';

// GESTIONE UTENTI DELLO SPAZIO (0.255.16).
//
// La creazione è tornata qui, dal menù Utenti, e non più dentro la scheda
// dell'azienda: si scrive l'anagrafica, si sceglie il profilo (Operatore o
// Consultatore) e si spuntano le aziende attive su cui la persona lavora.
// Alla fine del salvataggio la schermata mostra le funzioni del profilo
// scelto, con i flag accesi: l'Admin li spegne o li riaccende e li salva,
// così quello che l'utente può fare è deciso una volta, qui.

import React, { useEffect, useState } from 'react';
import {
  Users,
  Ban,
  RotateCcw,
  KeyRound,
  ShieldCheck,
  Copy,
  Download,
  Plus,
  X,
} from 'lucide-react';
import {
  ottieniUtentiSpazio,
  creaUtenteSpazioAction,
  modificaUtenteSpazioAction,
  impostaPermessiAziendaUtenteAction,
  disabilitaUtenteSpazioAction,
  riattivaUtenteSpazioAction,
  rigeneraPasswordUtenteAction,
  type UtenteSpazio,
  type TipologiaUtente,
} from '@/app/actions/utenti';
import { ottieniAziende, type Azienda } from '@/app/actions/aziende';
import { MODULI_PERMESSO, type LivelloPermesso, type Modulo } from '@/lib/moduliPermesso';
import {
  DESCRIZIONE_PROFILO,
  ETICHETTA_PROFILO,
  TIPOLOGIE_PROFILO,
  permessiDelProfilo,
} from '@/lib/profiliUtente';
import type { LivelloAzienda } from '@/lib/permessiAzienda';
import { avvisoApp, confermaApp } from '@/components/FinestreApp';

const ETICHETTE_MODULO: Record<string, string> = {
  scenari: 'Scenari',
  checklist: 'Check List',
  indici: 'Indici',
  xbrl: 'Import XBRL',
  report: 'Proposta',
  relazione: 'Relazione AI',
  simulazione: 'Piano di sviluppo',
};

/** Le tre scelte per una funzione su un'azienda. */
const ETICHETTE_LIVELLO: Record<LivelloPermesso, string> = {
  NESSUNO: 'Spenta',
  LETTURA: 'Sola lettura',
  SCRITTURA: 'Lettura e scrittura',
};

/** Il livello che il profilo propone per un modulo, quando l'Admin non ha scelto. */
const livelloDelProfilo = (tipologia: TipologiaUtente, modulo: Modulo): LivelloPermesso =>
  permessiDelProfilo(tipologia)[modulo] ?? 'NESSUNO';

const FORM_VUOTO = {
  nome: '',
  cognome: '',
  email: '',
  tipologia: 'OPERATIVO' as TipologiaUtente,
  aziendeIds: [] as number[],
  /** aziendaId → modulo → livello. Vuoto = si parte dai valori del profilo. */
  permessiAzienda: {} as Record<number, Partial<Record<Modulo, LivelloPermesso>>>,
};

interface Props {
  nomeSchema: string;
}

export function UtentiManager({ nomeSchema }: Props) {
  const [utenti, setUtenti] = useState<UtenteSpazio[]>([]);
  const [aziende, setAziende] = useState<Azienda[]>([]);
  const [caricamento, setCaricamento] = useState(true);
  const [erroreLista, setErroreLista] = useState<string | null>(null);

  const [mostraForm, setMostraForm] = useState(false);
  const [form, setForm] = useState(FORM_VUOTO);
  const [salvataggio, setSalvataggio] = useState(false);

  // L'utente appena creato: credenziali da consegnare e funzioni da rivedere.
  const [creato, setCreato] = useState<{
    utenteId: number | null;
    nome: string;
    cognome: string;
    tipologia: TipologiaUtente;
    username: string;
    password: string;
  } | null>(null);
  const [utenteAziendeAperto, setUtenteAziendeAperto] = useState<number | null>(null);
  const [aziendeBozza, setAziendeBozza] = useState<number[]>([]);
  // Utente di cui si stanno modificando le funzioni per azienda.
  const [utenteFunzioniAperto, setUtenteFunzioniAperto] = useState<number | null>(null);

  const [passwordAppenaGenerata, setPasswordAppenaGenerata] = useState<{
    utenteId: number;
    password: string;
  } | null>(null);

  const carica = async () => {
    setCaricamento(true);
    setErroreLista(null);
    try {
      const [risultatoUtenti, risultatoAziende] = await Promise.all([
        ottieniUtentiSpazio(nomeSchema),
        ottieniAziende(nomeSchema),
      ]);
      if (!risultatoUtenti.success) {
        setErroreLista(risultatoUtenti.error || 'Impossibile caricare gli utenti.');
      }
      setUtenti(risultatoUtenti.utenti);
      setAziende(risultatoAziende.aziende);
    } catch (err: any) {
      setErroreLista(`Impossibile caricare gli utenti: ${err.message || err}`);
    } finally {
      setCaricamento(false);
    }
  };

  useEffect(() => {
    carica();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nomeSchema]);

  // Si scelgono solo le aziende attive: una disabilitata non è una posizione
  // su cui assegnare lavoro.
  const aziendeAttive = aziende.filter((a) => a.attiva);

  /** Il livello scelto per un modulo su un'azienda, o quello del profilo. */
  const livelloForm = (aziendaId: number, modulo: Modulo): LivelloPermesso =>
    form.permessiAzienda[aziendaId]?.[modulo] ?? livelloDelProfilo(form.tipologia, modulo);

  const setLivelloForm = (aziendaId: number, modulo: Modulo, livello: LivelloPermesso) => {
    setForm((prev) => ({
      ...prev,
      permessiAzienda: {
        ...prev.permessiAzienda,
        [aziendaId]: { ...(prev.permessiAzienda[aziendaId] ?? {}), [modulo]: livello },
      },
    }));
  };

  /**
   * Cambiare profilo non deve lasciare acceso quello che il profilo non può:
   * il Consultatore è in sola lettura, e le scelte già fatte si riallineano
   * invece di restare in scrittura finché non si toccano.
   */
  const cambiaProfilo = (tipologia: TipologiaUtente) => {
    setForm((prev) => {
      const permessiAzienda = Object.fromEntries(
        Object.entries(prev.permessiAzienda).map(([azienda, mappa]) => [
          azienda,
          Object.fromEntries(
            Object.entries(mappa ?? {}).map(([modulo, livello]) => [
              modulo,
              tipologia === 'CONSULTATORE' && livello === 'SCRITTURA' ? 'LETTURA' : livello,
            ])
          ),
        ])
      ) as Record<number, Partial<Record<Modulo, LivelloPermesso>>>;
      return { ...prev, tipologia, permessiAzienda };
    });
  };

  const toggleAziendaForm = (aziendaId: number) => {
    setForm((prev) => {
      const presente = prev.aziendeIds.includes(aziendaId);
      return {
        ...prev,
        aziendeIds: presente
          ? prev.aziendeIds.filter((id) => id !== aziendaId)
          : [...prev.aziendeIds, aziendaId],
      };
    });
  };

  const apriForm = () => {
    setForm(FORM_VUOTO);
    setCreato(null);
    setMostraForm(true);
  };

  const handleCrea = async (e: React.FormEvent) => {
    e.preventDefault();
    setSalvataggio(true);
    setErroreLista(null);
    try {
      // Le funzioni si scrivono SEMPRE per azienda, anche quando l'Admin non
      // tocca i selettori: partono dal profilo scelto e da lì si cambiano.
      const permessiAzienda: Record<number, Partial<Record<Modulo, LivelloPermesso>>> = {};
      const livelli: Record<number, LivelloAzienda> = {};
      for (const aziendaId of form.aziendeIds) {
        const scelti: Partial<Record<Modulo, LivelloPermesso>> = {};
        for (const modulo of MODULI_PERMESSO) {
          scelti[modulo] = livelloForm(aziendaId, modulo);
        }
        permessiAzienda[aziendaId] = scelti;
        // Il tetto dell'associazione resta coerente con le funzioni scelte:
        // scrittura se almeno una funzione è in scrittura, altrimenti lettura.
        livelli[aziendaId] = MODULI_PERMESSO.some((m) => scelti[m] === 'SCRITTURA')
          ? 'SCRITTURA'
          : 'LETTURA';
      }
      const risultato = await creaUtenteSpazioAction(nomeSchema, {
        nome: form.nome,
        cognome: form.cognome,
        email: form.email,
        tipologia: form.tipologia,
        aziendeIds: form.aziendeIds,
        livelli,
        permessiAzienda,
      });
      if (!risultato.success) {
        setErroreLista(risultato.error || "Impossibile creare l'utente.");
        return;
      }
      setCreato({
        utenteId: risultato.utenteId ?? null,
        nome: form.nome,
        cognome: form.cognome,
        tipologia: form.tipologia,
        username: risultato.username || '',
        password: risultato.passwordTemporanea || '',
      });
      setForm(FORM_VUOTO);
      await carica();
    } finally {
      setSalvataggio(false);
    }
  };

  const scaricaCredenziali = () => {
    if (!creato) return;
    const ruolo = ETICHETTA_PROFILO[creato.tipologia];
    const contenuto = `Credenziali di accesso — ${ruolo} ${creato.nome} ${creato.cognome}
Generate il ${new Date().toLocaleString('it-IT')}

Login (nome utente): ${creato.username}
Password temporanea: ${creato.password}

Si accede con il NOME UTENTE (non con l'email). La password è temporanea e va cambiata al primo accesso.
Conserva questo file in un posto sicuro e cancellalo dopo aver comunicato le credenziali — non è recuperabile una seconda volta da qui.`;
    const blob = new Blob([contenuto], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `credenziali-${creato.username}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleToggleStato = async (utente: UtenteSpazio) => {
    const azione = utente.attivo ? disabilitaUtenteSpazioAction : riattivaUtenteSpazioAction;
    const risultato = await azione(nomeSchema, utente.id);
    if (!risultato.success) {
      avvisoApp(risultato.error || 'Operazione fallita.');
    }
    await carica();
  };

  const handleApriAziende = (utente: UtenteSpazio) => {
    if (utenteAziendeAperto === utente.id) {
      setUtenteAziendeAperto(null);
      return;
    }
    setUtenteAziendeAperto(utente.id);
    setAziendeBozza(utente.aziendeIds);
  };

  /**
   * Le funzioni si leggono e si salvano PER AZIENDA: è l'unica profilatura
   * che conta, quindi aprire «Funzioni» offre le aziende dell'utente, non un
   * elenco unico valido ovunque (0.256.1).
   */
  const handleApriFunzioni = (utente: UtenteSpazio) => {
    if (utenteFunzioniAperto === utente.id) {
      setUtenteFunzioniAperto(null);
      return;
    }
    setUtenteAziendeAperto(null);
    setUtenteFunzioniAperto(utente.id);
  };

  const handleSalvaAziende = async (utente: UtenteSpazio) => {
    if (aziendeBozza.length === 0) {
      avvisoApp(
        "L'utente deve restare associato ad almeno un'azienda attiva: se non deve più lavorare qui, disabilitalo."
      );
      return;
    }
    const risultato = await modificaUtenteSpazioAction(nomeSchema, utente.id, {
      nome: utente.nome,
      cognome: utente.cognome,
      email: utente.email,
      tipologia: utente.tipologia,
      aziendeIds: aziendeBozza,
    });
    if (!risultato.success) {
      avvisoApp(risultato.error || 'Associazioni non salvate.');
      return;
    }
    setUtenteAziendeAperto(null);
    await carica();
  };

  const handleRigeneraPassword = async (utente: UtenteSpazio) => {
    const conferma = await confermaApp(
      `Rigenerare la password di ${utente.nome} ${utente.cognome}? La password attuale smetterà di funzionare.`
    );
    if (!conferma) return;
    const risultato = await rigeneraPasswordUtenteAction(nomeSchema, utente.id);
    if (!risultato.success || !risultato.passwordTemporanea) {
      avvisoApp(risultato.error || 'Impossibile rigenerare la password.');
      return;
    }
    setPasswordAppenaGenerata({ utenteId: utente.id, password: risultato.passwordTemporanea });
  };

  const nomeAzienda = (id: number) => aziende.find((a) => a.id === id)?.ragioneSociale || `#${id}`;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
            Utenti Operatori e Consultatori
          </h2>
          <p className="text-slate-500 text-[11px] mt-1">
            Qui si crea un utente, si sceglie il profilo e si spuntano le aziende attive su cui può
            operare. Dopo il salvataggio si vedono le funzioni del profilo e si accendono o spengono
            i flag.
          </p>
        </div>
        {!mostraForm && (
          <button
            type="button"
            onClick={apriForm}
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-[10px] uppercase rounded-lg transition-colors shrink-0"
          >
            <Plus className="w-3.5 h-3.5" /> Nuovo utente
          </button>
        )}
      </div>

      {erroreLista && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          {erroreLista}
        </div>
      )}

      {mostraForm && (
        <form
          onSubmit={handleCrea}
          className="bg-white border border-slate-200 rounded-xl p-5 space-y-3"
        >
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
              Nuovo utente
            </h3>
            <button
              type="button"
              onClick={() => setMostraForm(false)}
              className="text-slate-400 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <input
              type="text"
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
              placeholder="Nome"
              className="p-2 text-sm border border-slate-200 rounded-lg text-slate-900"
              required
            />
            <input
              type="text"
              value={form.cognome}
              onChange={(e) => setForm({ ...form, cognome: e.target.value })}
              placeholder="Cognome"
              className="p-2 text-sm border border-slate-200 rounded-lg text-slate-900"
              required
            />
          </div>
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="Email"
            className="w-full p-2 text-sm border border-slate-200 rounded-lg text-slate-900"
            required
          />

          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Profilo
            </label>
            <div className="mt-1 grid grid-cols-2 gap-2">
              {TIPOLOGIE_PROFILO.map((tipologia) => (
                <button
                  key={tipologia}
                  type="button"
                  onClick={() => cambiaProfilo(tipologia)}
                  className={`text-left p-2.5 rounded-lg border transition-colors ${
                    form.tipologia === tipologia
                      ? 'border-blue-400 bg-blue-50'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="text-[11px] font-bold text-slate-900">
                    {ETICHETTA_PROFILO[tipologia]}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    {DESCRIZIONE_PROFILO[tipologia]}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Aziende attive su cui può operare
            </label>
            {aziendeAttive.length === 0 ? (
              <p className="text-[11px] text-slate-400 mt-1">
                Nessuna azienda attiva nello spazio: creala prima di assegnare un utente.
              </p>
            ) : (
              <div className="mt-1 space-y-1.5">
                {aziendeAttive.map((azienda) => {
                  const scelta = form.aziendeIds.includes(azienda.id);
                  return (
                    <div
                      key={azienda.id}
                      className={`flex items-center justify-between gap-2 p-2 rounded-lg border ${
                        scelta ? 'border-blue-200 bg-blue-50/50' : 'border-slate-200'
                      }`}
                    >
                      <label className="flex items-center gap-2 text-[11px] text-slate-700 cursor-pointer min-w-0">
                        <input
                          type="checkbox"
                          checked={scelta}
                          onChange={() => toggleAziendaForm(azienda.id)}
                        />
                        <span className="truncate">{azienda.ragioneSociale}</span>
                      </label>
                    </div>
                  );
                })}
              </div>
            )}
            {form.aziendeIds.length > 0 && (
              <div className="mt-3 space-y-2 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Funzioni per azienda
                </p>
                <p className="text-[10px] text-slate-500 leading-relaxed">
                  Le stesse funzioni possono valere in modo diverso da un&apos;azienda
                  all&apos;altra: qui si dice, per ciascuna, che cosa questa persona legge e che
                  cosa scrive.
                  {form.tipologia === 'CONSULTATORE'
                    ? ' Il Consultatore è in sola lettura: la scrittura non è selezionabile.'
                    : ''}
                </p>
                {form.aziendeIds.map((aziendaId) => {
                  const azienda = aziendeAttive.find((a) => a.id === aziendaId);
                  return (
                    <div
                      key={aziendaId}
                      className="rounded-lg border border-slate-200 bg-white p-2.5 space-y-1.5"
                    >
                      <p className="text-[11px] font-bold text-slate-800 truncate">
                        {azienda?.ragioneSociale ?? `#${aziendaId}`}
                      </p>
                      {MODULI_PERMESSO.map((modulo) => (
                        <div key={modulo} className="flex items-center justify-between gap-2">
                          <span className="text-[10px] text-slate-600">
                            {ETICHETTE_MODULO[modulo] ?? modulo}
                          </span>
                          <select
                            value={livelloForm(aziendaId, modulo)}
                            onChange={(e) =>
                              setLivelloForm(aziendaId, modulo, e.target.value as LivelloPermesso)
                            }
                            className="p-1 text-[10px] font-bold border border-slate-200 rounded bg-white text-slate-700"
                          >
                            {(Object.keys(ETICHETTE_LIVELLO) as LivelloPermesso[])
                              .filter(
                                (livello) =>
                                  form.tipologia === 'OPERATIVO' || livello !== 'SCRITTURA'
                              )
                              .map((livello) => (
                                <option key={livello} value={livello}>
                                  {ETICHETTE_LIVELLO[livello]}
                                </option>
                              ))}
                          </select>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={salvataggio || form.aziendeIds.length === 0}
            className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white font-bold uppercase tracking-wider rounded-lg text-xs transition-colors"
          >
            {salvataggio ? 'Creazione...' : 'Crea utente'}
          </button>
        </form>
      )}

      {creato && (
        <div className="bg-white border border-emerald-200 rounded-xl p-5 space-y-4">
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-xs text-emerald-800 space-y-2">
            <div className="font-bold uppercase tracking-wider text-[10px]">
              {ETICHETTA_PROFILO[creato.tipologia]} creato — credenziali mostrate una sola volta
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase text-emerald-700 w-24 shrink-0">
                Nome utente
              </span>
              <code className="font-mono bg-white px-2 py-1 rounded border border-emerald-200">
                {creato.username}
              </code>
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(creato.username)}
                className="text-emerald-700 hover:text-emerald-900"
                title="Copia"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase text-emerald-700 w-24 shrink-0">
                Password
              </span>
              <code className="font-mono bg-white px-2 py-1 rounded border border-emerald-200">
                {creato.password}
              </code>
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(creato.password)}
                className="text-emerald-700 hover:text-emerald-900"
                title="Copia"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="text-[10px]">
              L&apos;utente accede con il <strong>nome utente</strong> (non con l&apos;email) e
              dovrà cambiare la password al primo accesso.
            </p>
            <div className="flex items-center gap-3 pt-1">
              <button
                type="button"
                onClick={scaricaCredenziali}
                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-emerald-300 hover:bg-emerald-100 text-emerald-800 font-bold text-[10px] uppercase rounded-lg transition-colors"
              >
                <Download className="w-3.5 h-3.5" /> Scarica credenziali (.txt)
              </button>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-2">
              <h3 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
                Funzioni per azienda
              </h3>
              <span className="text-[10px] text-slate-500 max-w-[50%] text-right">
                {DESCRIZIONE_PROFILO[creato.tipologia]}
              </span>
            </div>
            <p className="text-[10px] text-slate-500 mt-2">
              Sono già scritte come le hai impostate nella creazione. Da qui scegli l&apos;azienda e
              cambi che cosa questa persona legge e che cosa scrive: la scelta vale solo su
              quell&apos;azienda.
            </p>
            <div className="mt-2">
              {creato.utenteId ? (
                <FunzioniAziendaEditor
                  nomeSchema={nomeSchema}
                  utenteId={creato.utenteId}
                  tipologia={creato.tipologia}
                  aziende={(utenti.find((u) => u.id === creato.utenteId)?.aziende ?? []).map(
                    (a) => ({
                      id: a.id,
                      ragioneSociale: nomeAzienda(a.id),
                      permessi: a.permessi,
                    })
                  )}
                />
              ) : null}
            </div>
            <div className="flex items-center gap-3 mt-3">
              <button
                type="button"
                onClick={() => {
                  setCreato(null);
                  setMostraForm(false);
                }}
                className="text-slate-500 hover:text-slate-700 underline text-[10px] font-bold"
              >
                Chiudi
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3 mb-4">
          <Users className="w-4 h-4 text-slate-500" />
          <h3 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
            Utenti esistenti ({utenti.length})
          </h3>
        </div>

        {caricamento && <p className="text-xs text-slate-400">Caricamento...</p>}
        {!caricamento && !erroreLista && utenti.length === 0 && (
          <p className="text-xs text-slate-400">
            Nessun utente creato finora — usa «Nuovo utente» qui sopra.
          </p>
        )}

        <div className="space-y-2">
          {utenti.map((utente) => (
            <div key={utente.id}>
              <div
                className={`border rounded-lg p-3 flex flex-wrap justify-between items-center gap-3 ${
                  utente.attivo ? 'border-slate-200' : 'border-slate-200 bg-slate-50 opacity-70'
                }`}
              >
                <div className="min-w-0">
                  <div className="font-bold text-slate-900 text-xs">
                    {utente.nome} {utente.cognome}
                  </div>
                  {utente.username && (
                    <div className="text-[10px] text-slate-600 font-mono mt-0.5">
                      <span className="text-slate-400">nome utente:</span> {utente.username}
                    </div>
                  )}
                  {utente.email && (
                    <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                      {utente.email}
                    </div>
                  )}
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    {utente.tipologia === 'OPERATIVO' ? 'Operatore' : 'Consultatore'} ·{' '}
                    {utente.aziende.length === 0
                      ? 'nessuna azienda associata'
                      : utente.aziende
                          .map(
                            (a) =>
                              `${nomeAzienda(a.id)} (${
                                a.livello === 'LETTURA' ? 'sola lettura' : 'lettura e scrittura'
                              })`
                          )
                          .join(', ')}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                      utente.attivo
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {utente.attivo ? 'Attivo' : 'Disabilitato'}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleApriAziende(utente)}
                    className={`px-1.5 py-1 rounded text-[9px] font-bold uppercase border ${
                      utenteAziendeAperto === utente.id
                        ? 'border-blue-300 text-blue-700 bg-blue-50'
                        : 'border-slate-200 text-slate-500 hover:text-blue-600'
                    }`}
                    title="Aziende su cui può operare"
                  >
                    Aziende
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApriFunzioni(utente)}
                    className={`p-1.5 ${utenteFunzioniAperto === utente.id ? 'text-blue-600' : 'text-slate-400 hover:text-blue-600'}`}
                    title="Funzioni per azienda"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRigeneraPassword(utente)}
                    className="p-1.5 text-slate-400 hover:text-amber-600"
                    title="Rigenera password"
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleStato(utente)}
                    className="p-1.5 text-slate-400 hover:text-red-600"
                    title={utente.attivo ? 'Disabilita' : 'Riattiva'}
                  >
                    {utente.attivo ? (
                      <Ban className="w-3.5 h-3.5" />
                    ) : (
                      <RotateCcw className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>

              {utenteAziendeAperto === utente.id && (
                <div className="mt-1.5 ml-3 border-l-2 border-blue-200 pl-3 py-2 space-y-2">
                  <p className="text-[10px] text-slate-500">
                    Aziende attive su cui può operare. Le funzioni si scelgono per azienda dal
                    pulsante dello scudo, accanto al nome.
                  </p>
                  {aziendeAttive.map((azienda) => {
                    const scelta = aziendeBozza.includes(azienda.id);
                    return (
                      <div key={azienda.id} className="flex items-center justify-between gap-2">
                        <label className="flex items-center gap-2 text-[11px] text-slate-700 cursor-pointer min-w-0">
                          <input
                            type="checkbox"
                            checked={scelta}
                            onChange={() =>
                              setAziendeBozza((prev) =>
                                scelta
                                  ? prev.filter((id) => id !== azienda.id)
                                  : [...prev, azienda.id]
                              )
                            }
                          />
                          <span className="truncate">{azienda.ragioneSociale}</span>
                        </label>
                      </div>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => handleSalvaAziende(utente)}
                    className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-[10px] uppercase rounded-lg"
                  >
                    Salva le aziende
                  </button>
                </div>
              )}

              {passwordAppenaGenerata?.utenteId === utente.id && (
                <div className="mt-1.5 ml-3 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5 flex items-center gap-2">
                  <span>
                    Password temporanea: <strong>{passwordAppenaGenerata.password}</strong>
                  </span>
                  <button
                    type="button"
                    onClick={() => navigator.clipboard.writeText(passwordAppenaGenerata.password)}
                    className="text-amber-700 hover:text-amber-900"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPasswordAppenaGenerata(null)}
                    className="ml-auto underline font-bold"
                  >
                    Chiudi
                  </button>
                </div>
              )}

              {utenteFunzioniAperto === utente.id && (
                <div className="mt-1.5 ml-3 border-l-2 border-blue-200 pl-3 py-2">
                  <FunzioniAziendaEditor
                    nomeSchema={nomeSchema}
                    utenteId={utente.id}
                    tipologia={utente.tipologia}
                    aziende={utente.aziende.map((a) => ({
                      id: a.id,
                      ragioneSociale: nomeAzienda(a.id),
                      permessi: a.permessi,
                    }))}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * LE FUNZIONI SU UNA AZIENDA (0.256.1).
 *
 * Si sceglie l'azienda, si vede che cosa quella persona può fare lì, e si
 * salva. È l'unica profilatura che conta davvero: le stesse funzioni possono
 * valere in modo diverso da un'azienda all'altra, e il Consultatore non ha la
 * scrittura (la regola è anche nel server: qui si spegne la scelta).
 */
function FunzioniAziendaEditor({
  nomeSchema,
  utenteId,
  tipologia,
  aziende,
}: {
  nomeSchema: string;
  utenteId: number;
  tipologia: TipologiaUtente;
  aziende: {
    id: number;
    ragioneSociale: string;
    permessi: Partial<Record<Modulo, LivelloPermesso>>;
  }[];
}) {
  const [scelta, setScelta] = useState<number | null>(aziende[0]?.id ?? null);
  const [livelli, setLivelli] = useState<Partial<Record<Modulo, LivelloPermesso>>>({});
  const [salvataggio, setSalvataggio] = useState(false);
  const [salvato, setSalvato] = useState(false);

  const azienda = aziende.find((a) => a.id === scelta) ?? null;

  // Le scelte salvate dell'azienda scelta; quando si cambia azienda si
  // riparte dalle sue, non da quelle dell'azienda di prima.
  useEffect(() => {
    const iniziali = aziende.find((a) => a.id === scelta)?.permessi ?? {};
    setLivelli(iniziali);
    setSalvato(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scelta, utenteId]);

  const livello = (modulo: Modulo): LivelloPermesso =>
    livelli[modulo] ?? livelloDelProfilo(tipologia, modulo);

  const salva = async () => {
    if (!azienda) return;
    const scelti: Partial<Record<Modulo, LivelloPermesso>> = {};
    for (const modulo of MODULI_PERMESSO) scelti[modulo] = livello(modulo);
    setSalvataggio(true);
    const risultato = await impostaPermessiAziendaUtenteAction(
      nomeSchema,
      utenteId,
      azienda.id,
      scelti
    );
    setSalvataggio(false);
    if (!risultato.success) {
      avvisoApp(risultato.error || 'Funzioni non salvate.');
      return;
    }
    setLivelli(scelti);
    setSalvato(true);
  };

  if (aziende.length === 0) {
    return (
      <p className="text-[11px] text-slate-500">
        Nessuna azienda associata: assegnala prima da «Aziende», poi scegli le funzioni.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
        Azienda su cui stai decidendo
      </p>
      <div className="flex flex-wrap gap-1.5">
        {aziende.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => setScelta(a.id)}
            className={`px-2 py-1 rounded-lg border text-[10px] font-bold uppercase tracking-wider ${
              a.id === scelta
                ? 'border-blue-300 bg-blue-50 text-blue-800'
                : 'border-slate-200 text-slate-600 hover:border-blue-200'
            }`}
          >
            {a.ragioneSociale}
          </button>
        ))}
      </div>

      {azienda && (
        <div className="space-y-1.5">
          {MODULI_PERMESSO.map((modulo) => (
            <div key={modulo} className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-slate-600 font-bold">
                {ETICHETTE_MODULO[modulo] ?? modulo}
              </span>
              <select
                value={livello(modulo)}
                onChange={(e) => {
                  setSalvato(false);
                  setLivelli((prev) => ({
                    ...prev,
                    [modulo]: e.target.value as LivelloPermesso,
                  }));
                }}
                className="text-[10px] font-bold px-2 py-1 border border-slate-200 rounded text-slate-900 bg-white"
              >
                {(Object.keys(ETICHETTE_LIVELLO) as LivelloPermesso[])
                  .filter((l) => tipologia === 'OPERATIVO' || l !== 'SCRITTURA')
                  .map((l) => (
                    <option key={l} value={l}>
                      {ETICHETTE_LIVELLO[l]}
                    </option>
                  ))}
              </select>
            </div>
          ))}
          {tipologia === 'CONSULTATORE' && (
            <p className="text-[10px] text-slate-500 leading-relaxed">
              Il Consultatore è in sola lettura: può vedere le funzioni accese, non modificarle.
            </p>
          )}
          <button
            type="button"
            onClick={() => void salva()}
            disabled={salvataggio || salvato}
            className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white font-bold text-[10px] uppercase rounded-lg"
          >
            {salvataggio ? 'Salvataggio...' : salvato ? 'Funzioni salvate' : 'Salva le funzioni'}
          </button>
        </div>
      )}
    </div>
  );
}
