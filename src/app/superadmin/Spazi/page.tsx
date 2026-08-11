'use client';

// Gestione Spazi di Lavoro — creazione reale: collega una licenza operativa
// a una licenza commerciale esistente (creata prima in /superadmin/Licenze)
// e crea contestualmente l'Admin di Spazio con password temporanea.
//
// Percorso a step: qui c'è creazione (con admin incluso) + elenco. Dizionario
// Indici per spazio, Storage e Backup (visti nel vecchio mockup
// ModuloSpazi.tsx, mai collegato) restano step successivi.

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, CheckCircle2, UserCog, Copy, Wrench, Download } from 'lucide-react';
import { creaSpazioAction } from '@/app/actions/spazi';
import { RUOLI_ADMIN_SPAZIO, type RuoloAdminSpazio } from '@/lib/ruoliAdminSpazio';
import { elencaLicenzeCommerciali, type Licenza } from '@/app/actions/licenze';

const TIER_OPTIONS = [
  { value: 'MICRO', label: 'Micro Impresa' },
  { value: 'PMI', label: 'PMI Standard' },
  { value: 'HOLDING', label: 'Holding / Gruppi' },
  { value: 'CUSTOM', label: 'Contratto Custom / Sartoriale' },
] as const;

export default function SpaziPage() {
  const [licenzeCommerciali, setLicenzeCommerciali] = useState<Licenza[]>([]);

  const [descrizione, setDescrizione] = useState('');
  const [licenzaCommercialeId, setLicenzaCommercialeId] = useState('');
  const [tier, setTier] = useState<'MICRO' | 'PMI' | 'HOLDING' | 'CUSTOM'>('MICRO');
  const [maxUtenti, setMaxUtenti] = useState(5);
  const [maxAziende, setMaxAziende] = useState(1);
  const [dataScadenza, setDataScadenza] = useState('');
  const [tipoSpazio, setTipoSpazio] = useState<'ENTE' | 'NON_ENTE'>('NON_ENTE');
  const [giudicante, setGiudicante] = useState(false);

  const [adminNome, setAdminNome] = useState('');
  const [adminCognome, setAdminCognome] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminRuolo, setAdminRuolo] = useState<RuoloAdminSpazio>('Titolare');
  const [adminCellulare, setAdminCellulare] = useState('');

  const [salvataggio, setSalvataggio] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [successo, setSuccesso] = useState<string | null>(null);
  const [ultimoCodiceCreato, setUltimoCodiceCreato] = useState<string | null>(null);
  const [passwordGenerata, setPasswordGenerata] = useState<string | null>(null);
  const [emailCredenziali, setEmailCredenziali] = useState<string | null>(null);

  const caricaLicenze = async () => {
    const risultato = await elencaLicenzeCommerciali();
    if (risultato.success) {
      setLicenzeCommerciali(risultato.licenze);
    }
  };

  useEffect(() => {
    caricaLicenze();
  }, []);

  const handleScaricaCredenziali = () => {
    if (!ultimoCodiceCreato || !passwordGenerata || !emailCredenziali) return;
    const contenuto = `Credenziali di accesso — Spazio ${ultimoCodiceCreato}
Generate il ${new Date().toLocaleString('it-IT')}

Codice spazio: ${ultimoCodiceCreato}
Login (email): ${emailCredenziali}
Password temporanea: ${passwordGenerata}

Questa password è temporanea e va cambiata al primo accesso.
Conserva questo file in un posto sicuro e cancellalo dopo aver comunicato le credenziali — non è recuperabile una seconda volta da qui.`;
    const blob = new Blob([contenuto], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `credenziali-${ultimoCodiceCreato}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSalvataggio(true);
    setErrore(null);
    setSuccesso(null);
    setPasswordGenerata(null);
    setUltimoCodiceCreato(null);

    try {
      const risultato = await creaSpazioAction({
        descrizione,
        licenzaCommercialeId,
        tier,
        maxUtenti,
        maxAziende,
        dataScadenza: dataScadenza || null,
        tipoSpazio,
        giudicante,
        admin: {
          nome: adminNome,
          cognome: adminCognome,
          email: adminEmail,
          ruolo: adminRuolo,
          cellulare: adminCellulare,
        },
      });

      if (!risultato.success) {
        setErrore(risultato.error || 'Errore durante la creazione dello spazio.');
        return;
      }

      if (risultato.error) {
        // Creato ma con un problema nel provisioning/admin: successo parziale.
        setErrore(risultato.error);
      } else {
        setSuccesso(`Spazio creato con codice ${risultato.codice}.`);
        setUltimoCodiceCreato(risultato.codice || null);
      }
      if (risultato.passwordTemporanea) {
        setPasswordGenerata(risultato.passwordTemporanea);
        setEmailCredenziali(adminEmail);
      }

      setDescrizione('');
      setLicenzaCommercialeId('');
      setTier('MICRO');
      setMaxUtenti(5);
      setMaxAziende(1);
      setDataScadenza('');
      setAdminNome('');
      setAdminCognome('');
      setAdminEmail('');
      setAdminRuolo('Titolare');
      setAdminCellulare('');
      await caricaLicenze();
    } catch (err) {
      console.error('Errore durante la creazione dello spazio:', err);
      setErrore('Impossibile completare la richiesta. Verifica la connessione.');
    } finally {
      setSalvataggio(false);
    }
  };

  return (
    <div className="p-6 space-y-6 font-sans text-sm text-slate-800 max-w-5xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Crea Nuovo Spazio</h1>
          <p className="text-slate-500 text-xs mt-1">
            Ogni spazio collega una licenza operativa a una licenza commerciale esistente, e ha il
            proprio Admin di Spazio.
          </p>
        </div>
        <Link
          href="/superadmin/ManutenzioneSpazi"
          className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] uppercase tracking-wider rounded-lg transition-colors shrink-0"
        >
          <Wrench className="w-3.5 h-3.5" /> Vai a Manutenzione Spazi
        </Link>
      </div>

      <form
        onSubmit={handleSubmit}
        className="bg-white border border-slate-200 rounded-xl p-6 space-y-5"
      >
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <Plus className="w-4 h-4 text-blue-600" />
          <h2 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
            Crea nuovo spazio
          </h2>
        </div>

        {errore && (
          <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
            {errore}
          </div>
        )}
        {successo && (
          <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-3 flex items-center gap-2 flex-wrap">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successo}</span>
            {ultimoCodiceCreato && (
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(ultimoCodiceCreato)}
                className="ml-auto flex items-center gap-1 px-2 py-1 bg-white border border-emerald-200 rounded text-emerald-800 font-mono text-[11px] hover:bg-emerald-100"
                title="Copia il codice spazio"
              >
                <Copy className="w-3 h-3" /> {ultimoCodiceCreato}
              </button>
            )}
          </div>
        )}
        {passwordGenerata && (
          <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-1">
            <div className="font-bold uppercase tracking-wider text-[10px]">
              Password temporanea dell&apos;Admin di Spazio — mostrata una sola volta
            </div>
            <div className="flex items-center gap-2">
              <code className="font-mono bg-white px-2 py-1 rounded border border-amber-200">
                {passwordGenerata}
              </code>
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(passwordGenerata)}
                className="text-amber-700 hover:text-amber-900"
                title="Copia"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="text-[10px]">
              Comunicala all&apos;Admin di Spazio per un canale sicuro: dovrà cambiarla al primo
              accesso.
            </p>
            <button
              type="button"
              onClick={handleScaricaCredenziali}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-amber-300 hover:bg-amber-100 text-amber-800 font-bold text-[10px] uppercase rounded-lg transition-colors"
            >
              <Download className="w-3.5 h-3.5" /> Scarica credenziali (.txt)
            </button>
          </div>
        )}

        <div>
          <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">
            Descrizione dello spazio
          </label>
          <input
            type="text"
            value={descrizione}
            onChange={(e) => setDescrizione(e.target.value)}
            placeholder="Es. Studio Rossi & Associati"
            className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-blue-500 text-slate-900"
            required
          />
          <p className="text-[10px] text-slate-400 mt-1">
            Il codice dello spazio (es. WP-2026-001) viene generato automaticamente.
          </p>
        </div>

        <div>
          <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">
            Licenza commerciale
          </label>
          <select
            value={licenzaCommercialeId}
            onChange={(e) => setLicenzaCommercialeId(e.target.value)}
            className="w-full p-2.5 bg-white border border-slate-200 rounded-lg outline-none focus:border-blue-500 text-slate-900"
            required
          >
            <option value="">— Seleziona una licenza commerciale —</option>
            {licenzeCommerciali
              .filter((l) => l.stato !== 'SOSPESA' && l.stato !== 'CESSATA')
              .map((l) => (
                <option key={l.id_licenza} value={l.id_licenza}>
                  {l.ragione_sociale} - {l.id_licenza} (max {l.max_spazi} spazi)
                </option>
              ))}
          </select>
          {licenzeCommerciali.length === 0 && (
            <p className="text-[10px] text-amber-600 mt-1">
              Nessuna licenza commerciale esistente: creane una da{' '}
              <a href="/superadmin/Licenze" className="underline">
                Gestione Licenze
              </a>{' '}
              prima di creare uno spazio.
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">
              Tier commerciale dello spazio
            </label>
            <select
              value={tier}
              onChange={(e) => setTier(e.target.value as typeof tier)}
              className="w-full p-2.5 bg-white border border-slate-200 rounded-lg outline-none focus:border-blue-500 text-slate-900"
            >
              {TIER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">
              Data di scadenza (opzionale)
            </label>
            <input
              type="date"
              value={dataScadenza}
              onChange={(e) => setDataScadenza(e.target.value)}
              className="w-full p-2.5 bg-white border border-slate-200 rounded-lg outline-none focus:border-blue-500 text-slate-900"
            />
          </div>
        </div>

        <div className="border border-slate-200 rounded-lg p-3 space-y-2">
          <span className="block text-[11px] font-bold text-slate-700 uppercase">
            Tipo di spazio
          </span>
          <p className="text-[10px] text-slate-400">
            ENTE riduce i limiti di ricevibilità a una sola soglia (invece delle N categorie) e
            cambia il feedback sulla Proposta — condiziona più moduli, non solo un&apos;etichetta.
          </p>
          <div className="flex gap-4">
            <label className="flex items-center gap-1.5 text-xs text-slate-700">
              <input
                type="radio"
                checked={tipoSpazio === 'NON_ENTE'}
                onChange={() => setTipoSpazio('NON_ENTE')}
              />
              Non Ente (redige proposte)
            </label>
            <label className="flex items-center gap-1.5 text-xs text-slate-700">
              <input
                type="radio"
                checked={tipoSpazio === 'ENTE'}
                onChange={() => setTipoSpazio('ENTE')}
              />
              Ente (valuta proposte ricevute)
            </label>
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-500 pt-1">
            <input
              type="checkbox"
              checked={giudicante}
              onChange={(e) => setGiudicante(e.target.checked)}
            />
            Giudicante — predisposto per un futuro sviluppo, non ancora operativo
          </label>
        </div>

        <div className="border border-blue-100 bg-blue-50/40 rounded-lg p-3 space-y-2">
          <span className="block text-[11px] font-bold text-blue-700 uppercase">
            Funzioni Plus — ereditate dalla licenza commerciale
          </span>
          {(() => {
            const licenzaScelta = licenzeCommerciali.find(
              (l) => l.id_licenza === licenzaCommercialeId
            );
            if (!licenzaScelta) {
              return (
                <p className="text-[11px] text-slate-500">
                  Scegli prima la licenza commerciale qui sopra per vedere quali funzioni plus
                  eredita questo spazio.
                </p>
              );
            }
            const funzioni = [
              { attiva: licenzaScelta.plus_dati_settore, etichetta: 'Dati di Settore' },
              { attiva: licenzaScelta.plus_simulazione, etichetta: 'Simulazione' },
              { attiva: licenzaScelta.plus_relazione_ai, etichetta: 'Relazione AI' },
            ];
            const nessuna = funzioni.every((f) => !f.attiva);
            return (
              <>
                <div className="flex flex-wrap gap-1.5">
                  {funzioni.map((f) => (
                    <span
                      key={f.etichetta}
                      className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                        f.attiva ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'
                      }`}
                    >
                      {f.etichetta}
                    </span>
                  ))}
                </div>
                {nessuna && (
                  <p className="text-[11px] text-slate-500">
                    Nessuna funzione plus impostata su questa licenza — modificabile dopo, per
                    questo spazio, da Manutenzione Spazi, o sulla licenza stessa per i prossimi
                    spazi che ne dipenderanno.
                  </p>
                )}
              </>
            );
          })()}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">
              Max utenti
            </label>
            <input
              type="number"
              min={1}
              value={maxUtenti}
              onChange={(e) => setMaxUtenti(parseInt(e.target.value, 10) || 1)}
              className="w-full p-2.5 bg-white border border-slate-200 rounded-lg outline-none focus:border-blue-500 text-slate-900"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">
              Max aziende
            </label>
            <input
              type="number"
              min={1}
              value={maxAziende}
              onChange={(e) => setMaxAziende(parseInt(e.target.value, 10) || 1)}
              className="w-full p-2.5 bg-white border border-slate-200 rounded-lg outline-none focus:border-blue-500 text-slate-900"
            />
          </div>
        </div>

        <div className="border-t border-slate-100 pt-4">
          <div className="flex items-center gap-2 mb-3">
            <UserCog className="w-4 h-4 text-blue-600" />
            <h3 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
              Admin di Spazio
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">
                Nome
              </label>
              <input
                type="text"
                value={adminNome}
                onChange={(e) => setAdminNome(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-blue-500 text-slate-900"
                required
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">
                Cognome
              </label>
              <input
                type="text"
                value={adminCognome}
                onChange={(e) => setAdminCognome(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-blue-500 text-slate-900"
                required
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">
                Email (login)
              </label>
              <input
                type="email"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-blue-500 text-slate-900"
                required
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">
                Ruolo in azienda
              </label>
              <select
                value={adminRuolo}
                onChange={(e) => setAdminRuolo(e.target.value as RuoloAdminSpazio)}
                className="w-full p-2.5 bg-white border border-slate-200 rounded-lg outline-none focus:border-blue-500 text-slate-900"
              >
                {RUOLI_ADMIN_SPAZIO.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">
                Numero di cellulare
              </label>
              <input
                type="tel"
                value={adminCellulare}
                onChange={(e) => setAdminCellulare(e.target.value)}
                placeholder="Es. +39 333 1234567"
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-blue-500 text-slate-900"
                required
              />
              <p className="text-[10px] text-slate-400 mt-1">
                Verrà usato per l&apos;OTP di sicurezza sulle operazioni sensibili (funzione
                futura): oggi viene solo salvato.
              </p>
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={salvataggio}
          className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white font-bold uppercase tracking-wider rounded-lg text-xs transition-colors"
        >
          {salvataggio ? 'Creazione in corso...' : 'Crea spazio'}
        </button>
      </form>

      {ultimoCodiceCreato && (
        <div className="text-center">
          <Link
            href="/superadmin/ManutenzioneSpazi"
            className="text-xs text-blue-600 hover:text-blue-700 underline"
          >
            Vai a Manutenzione Spazi per entrare nello spazio appena creato →
          </Link>
        </div>
      )}
    </div>
  );
}
