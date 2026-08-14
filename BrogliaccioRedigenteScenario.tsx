'use client';

// Anagrafica di una singola azienda, nella sua pagina di dettaglio.
// Estesa con i dati di sede legale, capitale sociale, rappresentante
// legale, REA e PEC — servono alla reportistica (intestazioni di lettere
// e relazioni li richiedono per esteso).

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Save } from 'lucide-react';
import { modificaAziendaAction, type Azienda } from '@/app/actions/aziende';

interface Props {
  nomeSchema: string;
  azienda: Azienda;
  codice: string;
  tipoSpazio: 'ENTE' | 'NON_ENTE';
}

interface FormState {
  ragioneSociale: string;
  codiceFiscale: string;
  partitaIva: string;
  codiceAteco: string;
  formaGiuridica: string;
  indirizzoSedeLegale: string;
  citta: string;
  provincia: string;
  cap: string;
  numeroSediSecondarie: number;
  capitaleSociale: string;
  rappresentanteLegale: string;
  ruoloRappresentanteLegale: string;
  numeroRea: string;
  pec: string;
}

function Campo({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div>
      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">{label}</label>
      {children}
      {hint && <p className="text-[10px] text-slate-400 mt-1">{hint}</p>}
    </div>
  );
}

const classeInput =
  'w-full p-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-blue-500 text-slate-900';

export function AziendaAnagraficaEditor({ nomeSchema, azienda, codice, tipoSpazio }: Props) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>({
    ragioneSociale: azienda.ragioneSociale,
    codiceFiscale: azienda.codiceFiscale || '',
    partitaIva: azienda.partitaIva || '',
    codiceAteco: azienda.codiceAteco || '',
    formaGiuridica: azienda.formaGiuridica || '',
    indirizzoSedeLegale: azienda.indirizzoSedeLegale || '',
    citta: azienda.citta || '',
    provincia: azienda.provincia || '',
    cap: azienda.cap || '',
    numeroSediSecondarie: azienda.numeroSediSecondarie ?? 0,
    capitaleSociale: azienda.capitaleSociale !== null ? String(azienda.capitaleSociale) : '',
    rappresentanteLegale: azienda.rappresentanteLegale || '',
    ruoloRappresentanteLegale: azienda.ruoloRappresentanteLegale || '',
    numeroRea: azienda.numeroRea || '',
    pec: azienda.pec || '',
  });
  const [salvataggio, setSalvataggio] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [salvato, setSalvato] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSalvataggio(true);
    setErrore(null);
    setSalvato(false);
    try {
      const risultato = await modificaAziendaAction(nomeSchema, azienda.id, {
        ...form,
        capitaleSociale: form.capitaleSociale.trim() === '' ? null : Number(form.capitaleSociale),
      });
      if (!risultato.success) {
        setErrore(risultato.error || "Impossibile salvare l'azienda.");
        return;
      }
      setSalvato(true);
      // Invalida la cache di navigazione: senza questo, l'intestazione
      // della scheda (Server Component in layout.tsx) e i dati mostrati
      // se si torna su questa tab restano quelli precedenti al
      // salvataggio finché non si ricarica la pagina per intero — sembra
      // che il salvataggio non abbia funzionato, anche se in realtà sì.
      router.refresh();
    } finally {
      setSalvataggio(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-4">
      {/* Il link allo Screening vive già nella scheda del layout condiviso (layout.tsx) — niente da ripetere qui. */}
      <form
        onSubmit={handleSubmit}
        className="bg-white border border-slate-200 rounded-xl p-5 space-y-6"
      >
        {errore && (
          <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
            {errore}
          </div>
        )}
        {salvato && (
          <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
            Anagrafica aggiornata.
          </div>
        )}

        <div className="space-y-4">
          <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            Dati identificativi
          </h3>
          <Campo label="Ragione Sociale">
            <input
              type="text"
              value={form.ragioneSociale}
              onChange={(e) => setForm({ ...form, ragioneSociale: e.target.value })}
              className={classeInput}
              required
            />
          </Campo>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Campo label="Forma Giuridica" hint="Es. S.r.l., S.p.A., S.r.l. Unipersonale">
              <input
                type="text"
                value={form.formaGiuridica}
                onChange={(e) => setForm({ ...form, formaGiuridica: e.target.value })}
                className={classeInput}
              />
            </Campo>
            <Campo label="Codice ATECO">
              <input
                type="text"
                value={form.codiceAteco}
                onChange={(e) => setForm({ ...form, codiceAteco: e.target.value })}
                className={`${classeInput} font-mono`}
              />
            </Campo>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Campo label="Codice Fiscale">
              <input
                type="text"
                value={form.codiceFiscale}
                onChange={(e) => setForm({ ...form, codiceFiscale: e.target.value })}
                className={`${classeInput} font-mono`}
              />
            </Campo>
            <Campo label="Partita IVA">
              <input
                type="text"
                value={form.partitaIva}
                onChange={(e) => setForm({ ...form, partitaIva: e.target.value })}
                className={`${classeInput} font-mono`}
              />
            </Campo>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Campo label="Numero REA" hint="Numero di iscrizione al Registro Imprese">
              <input
                type="text"
                value={form.numeroRea}
                onChange={(e) => setForm({ ...form, numeroRea: e.target.value })}
                className={`${classeInput} font-mono`}
              />
            </Campo>
            <Campo label="Capitale Sociale (€)">
              <input
                type="number"
                min={0}
                step="0.01"
                value={form.capitaleSociale}
                onChange={(e) => setForm({ ...form, capitaleSociale: e.target.value })}
                className={`${classeInput} font-mono`}
              />
            </Campo>
          </div>
        </div>

        <div className="space-y-4 border-t border-slate-100 pt-4">
          <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            Sede legale
          </h3>
          <Campo label="Indirizzo">
            <input
              type="text"
              value={form.indirizzoSedeLegale}
              onChange={(e) => setForm({ ...form, indirizzoSedeLegale: e.target.value })}
              className={classeInput}
            />
          </Campo>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Campo label="Città">
              <input
                type="text"
                value={form.citta}
                onChange={(e) => setForm({ ...form, citta: e.target.value })}
                className={classeInput}
              />
            </Campo>
            <Campo label="Provincia" hint="Sigla, es. MI">
              <input
                type="text"
                maxLength={2}
                value={form.provincia}
                onChange={(e) => setForm({ ...form, provincia: e.target.value.toUpperCase() })}
                className={`${classeInput} font-mono uppercase`}
              />
            </Campo>
            <Campo label="CAP">
              <input
                type="text"
                value={form.cap}
                onChange={(e) => setForm({ ...form, cap: e.target.value })}
                className={`${classeInput} font-mono`}
              />
            </Campo>
          </div>
          <Campo label="Numero sedi secondarie" hint="0 se l'azienda opera solo dalla sede legale">
            <input
              type="number"
              min={0}
              value={form.numeroSediSecondarie}
              onChange={(e) =>
                setForm({ ...form, numeroSediSecondarie: Number(e.target.value) || 0 })
              }
              className={`${classeInput} font-mono max-w-[8rem]`}
            />
          </Campo>
        </div>

        <div className="space-y-4 border-t border-slate-100 pt-4">
          <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            Rappresentanza e contatti
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Campo label="Rappresentante Legale" hint="Nome e cognome">
              <input
                type="text"
                value={form.rappresentanteLegale}
                onChange={(e) => setForm({ ...form, rappresentanteLegale: e.target.value })}
                className={classeInput}
              />
            </Campo>
            <Campo label="Ruolo" hint="Es. Amministratore Unico, Presidente CdA">
              <input
                type="text"
                value={form.ruoloRappresentanteLegale}
                onChange={(e) => setForm({ ...form, ruoloRappresentanteLegale: e.target.value })}
                className={classeInput}
              />
            </Campo>
          </div>
          <Campo label="PEC" hint="Necessaria per comunicazioni formali (es. a Enti, creditori)">
            <input
              type="email"
              value={form.pec}
              onChange={(e) => setForm({ ...form, pec: e.target.value })}
              className={`${classeInput} font-mono`}
            />
          </Campo>
        </div>

        <button
          type="submit"
          disabled={salvataggio}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-bold text-[11px] uppercase rounded-lg transition-colors"
        >
          <Save className="w-3.5 h-3.5" /> {salvataggio ? 'Salvataggio...' : 'Salva'}
        </button>
      </form>
    </div>
  );
}
