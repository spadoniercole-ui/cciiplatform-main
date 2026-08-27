'use client';

// Anagrafica di una singola azienda. I campi che qualificano l'azienda sono
// quasi tutti obbligatori (vedi src/lib/anagraficaAzienda.ts): sono marcati
// con l'asterisco e validati al salvataggio. Le tre sezioni sono comprimibili
// per non allungare troppo la vista — quelle già complete si chiudono da sole.

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Save, ChevronDown, ChevronRight, CheckCircle2, AlertCircle } from 'lucide-react';
import { modificaAziendaAction, type Azienda } from '@/app/actions/aziende';
import { anagraficaAziendaCompleta, campiMancantiAzienda } from '@/lib/anagraficaAzienda';

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
  // Dati per il test delle soglie di segnalazione INPS (art. 25-novies).
  // Stringhe/'' per il tre-stati: '' = non dichiarato.
  conLavoratoriSubordinati: '' | 'si' | 'no';
  contributiDovutiAnnoPrecedente: string;
  annoContributiDovuti: string;
}

function Campo({
  label,
  obbligatorio,
  children,
  hint,
}: {
  label: string;
  obbligatorio?: boolean;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div>
      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
        {label}
        {obbligatorio && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="text-[10px] text-slate-400 mt-1">{hint}</p>}
    </div>
  );
}

/** Sezione comprimibile con indicatore di completezza. */
function Sezione({
  titolo,
  aperta,
  onToggle,
  completa,
  children,
}: {
  titolo: string;
  aperta: boolean;
  onToggle: () => void;
  completa: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-2 px-4 py-2.5 bg-slate-50 hover:bg-slate-100 transition-colors"
      >
        <span className="flex items-center gap-2">
          {aperta ? (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronRight className="w-4 h-4 text-slate-400" />
          )}
          <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
            {titolo}
          </span>
        </span>
        {completa ? (
          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
        ) : (
          <AlertCircle className="w-4 h-4 text-amber-500" />
        )}
      </button>
      {aperta && <div className="p-4 space-y-4">{children}</div>}
    </div>
  );
}

const classeInput =
  'w-full p-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-blue-500 text-slate-900';

export function AziendaAnagraficaEditor({ nomeSchema, azienda }: Props) {
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
    conLavoratoriSubordinati:
      azienda.conLavoratoriSubordinati === null || azienda.conLavoratoriSubordinati === undefined
        ? ''
        : azienda.conLavoratoriSubordinati
          ? 'si'
          : 'no',
    contributiDovutiAnnoPrecedente:
      azienda.contributiDovutiAnnoPrecedente !== null &&
      azienda.contributiDovutiAnnoPrecedente !== undefined
        ? String(azienda.contributiDovutiAnnoPrecedente)
        : '',
    annoContributiDovuti:
      azienda.annoContributiDovuti !== null && azienda.annoContributiDovuti !== undefined
        ? String(azienda.annoContributiDovuti)
        : '',
  });
  const [salvataggio, setSalvataggio] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [salvato, setSalvato] = useState(false);

  // Completezza per sezione (guida l'apertura iniziale e l'indicatore).
  const sezioneIdentificativiCompleta =
    !!form.ragioneSociale.trim() &&
    !!form.formaGiuridica.trim() &&
    !!form.codiceAteco.trim() &&
    !!form.codiceFiscale.trim() &&
    !!form.partitaIva.trim() &&
    !!form.numeroRea.trim() &&
    form.capitaleSociale.trim() !== '';
  const sezioneSedeCompleta =
    !!form.indirizzoSedeLegale.trim() &&
    !!form.citta.trim() &&
    !!form.provincia.trim() &&
    !!form.cap.trim();
  const sezioneContattiCompleta =
    !!form.rappresentanteLegale.trim() &&
    !!form.ruoloRappresentanteLegale.trim() &&
    !!form.pec.trim();

  // All'apertura: le sezioni incomplete restano aperte, le complete chiuse.
  const [aperte, setAperte] = useState<Record<string, boolean>>({
    identificativi: !sezioneIdentificativiCompleta,
    sede: !sezioneSedeCompleta,
    contatti: !sezioneContattiCompleta,
  });
  const toggle = (k: string) => setAperte((p) => ({ ...p, [k]: !p[k] }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrore(null);
    setSalvato(false);

    // Validazione: tutti gli obbligatori valorizzati. Se manca qualcosa,
    // apre tutte le sezioni e mostra cosa manca.
    const formRecord = form as unknown as Record<string, unknown>;
    if (!anagraficaAziendaCompleta(formRecord)) {
      const mancanti = campiMancantiAzienda(formRecord);
      setAperte({ identificativi: true, sede: true, contatti: true });
      setErrore(`Compila i campi obbligatori mancanti: ${mancanti.join(', ')}.`);
      return;
    }

    setSalvataggio(true);
    try {
      const risultato = await modificaAziendaAction(nomeSchema, azienda.id, {
        ...form,
        capitaleSociale: form.capitaleSociale.trim() === '' ? null : Number(form.capitaleSociale),
        // Tre-stati preservato: '' resta null, non diventa false.
        conLavoratoriSubordinati:
          form.conLavoratoriSubordinati === '' ? null : form.conLavoratoriSubordinati === 'si',
        contributiDovutiAnnoPrecedente:
          form.contributiDovutiAnnoPrecedente.trim() === ''
            ? null
            : Number(form.contributiDovutiAnnoPrecedente),
        annoContributiDovuti:
          form.annoContributiDovuti.trim() === '' ? null : Number(form.annoContributiDovuti),
      });
      if (!risultato.success) {
        setErrore(risultato.error || "Impossibile salvare l'azienda.");
        return;
      }
      setSalvato(true);
      // Invalida la cache di navigazione: senza questo, l'intestazione della
      // scheda (Server Component in layout.tsx) e il semaforo degli step
      // restano quelli precedenti al salvataggio finché non si ricarica.
      router.refresh();
    } finally {
      setSalvataggio(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-4">
      <form onSubmit={handleSubmit} className="space-y-3">
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
        <p className="text-[10px] text-slate-400">
          I campi con <span className="text-red-500">*</span> sono obbligatori: qualificano
          l&apos;azienda e servono alla reportistica. Le sezioni si comprimono cliccando sul titolo.
        </p>

        <Sezione
          titolo="Dati identificativi"
          aperta={aperte.identificativi}
          onToggle={() => toggle('identificativi')}
          completa={sezioneIdentificativiCompleta}
        >
          <Campo label="Ragione Sociale" obbligatorio>
            <input
              type="text"
              value={form.ragioneSociale}
              onChange={(e) => setForm({ ...form, ragioneSociale: e.target.value })}
              className={classeInput}
            />
          </Campo>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Campo
              label="Forma Giuridica"
              obbligatorio
              hint="Es. S.r.l., S.p.A., S.r.l. Unipersonale"
            >
              <input
                type="text"
                value={form.formaGiuridica}
                onChange={(e) => setForm({ ...form, formaGiuridica: e.target.value })}
                className={classeInput}
              />
            </Campo>
            <Campo label="Codice ATECO" obbligatorio>
              <input
                type="text"
                value={form.codiceAteco}
                onChange={(e) => setForm({ ...form, codiceAteco: e.target.value })}
                className={`${classeInput} font-mono`}
              />
            </Campo>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Campo label="Codice Fiscale" obbligatorio>
              <input
                type="text"
                value={form.codiceFiscale}
                onChange={(e) => setForm({ ...form, codiceFiscale: e.target.value })}
                className={`${classeInput} font-mono`}
              />
            </Campo>
            <Campo label="Partita IVA" obbligatorio>
              <input
                type="text"
                value={form.partitaIva}
                onChange={(e) => setForm({ ...form, partitaIva: e.target.value })}
                className={`${classeInput} font-mono`}
              />
            </Campo>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Campo label="Numero REA" obbligatorio hint="Numero di iscrizione al Registro Imprese">
              <input
                type="text"
                value={form.numeroRea}
                onChange={(e) => setForm({ ...form, numeroRea: e.target.value })}
                className={`${classeInput} font-mono`}
              />
            </Campo>
            <Campo label="Capitale Sociale (€)" obbligatorio>
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
        </Sezione>

        <Sezione
          titolo="Sede legale"
          aperta={aperte.sede}
          onToggle={() => toggle('sede')}
          completa={sezioneSedeCompleta}
        >
          <Campo label="Indirizzo" obbligatorio>
            <input
              type="text"
              value={form.indirizzoSedeLegale}
              onChange={(e) => setForm({ ...form, indirizzoSedeLegale: e.target.value })}
              className={classeInput}
            />
          </Campo>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Campo label="Città" obbligatorio>
              <input
                type="text"
                value={form.citta}
                onChange={(e) => setForm({ ...form, citta: e.target.value })}
                className={classeInput}
              />
            </Campo>
            <Campo label="Provincia" obbligatorio hint="Sigla, es. MI">
              <input
                type="text"
                maxLength={2}
                value={form.provincia}
                onChange={(e) => setForm({ ...form, provincia: e.target.value.toUpperCase() })}
                className={`${classeInput} font-mono uppercase`}
              />
            </Campo>
            <Campo label="CAP" obbligatorio>
              <input
                type="text"
                value={form.cap}
                onChange={(e) => setForm({ ...form, cap: e.target.value })}
                className={`${classeInput} font-mono`}
              />
            </Campo>
          </div>
          <Campo
            label="Numero sedi secondarie"
            hint="Facoltativo — 0 se l'azienda opera solo dalla sede legale"
          >
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

          {/* Dati per le soglie di segnalazione INPS (art. 25-novies).
              Facoltativi: se mancano, la griglia in testata allo Screening
              dichiara l'esito non determinabile invece di inventarlo. */}
          <div className="border-t border-slate-100 pt-4 mt-2 space-y-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Soglie di segnalazione INPS — art. 25-novies
            </p>
            <Campo
              label="Lavoratori subordinati o parasubordinati"
              hint="Determina QUALE soglia si applica: con lavoratori vale il concorso 30% + 15.000 €, senza vale la sola soglia di 5.000 €. Se non dichiarato, nessuna delle due viene applicata."
            >
              <select
                value={form.conLavoratoriSubordinati}
                onChange={(e) =>
                  setForm({
                    ...form,
                    conLavoratoriSubordinati: e.target.value as '' | 'si' | 'no',
                  })
                }
                className={classeInput}
              >
                <option value="">Non dichiarato</option>
                <option value="si">Sì — l&apos;impresa ha lavoratori</option>
                <option value="no">No — impresa senza lavoratori</option>
              </select>
            </Campo>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Campo
                label="Contributi dovuti nell'anno precedente"
                hint="Totale dei contributi DOVUTI (non del debito). È la base su cui si calcola il 30%."
              >
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.contributiDovutiAnnoPrecedente}
                  onChange={(e) =>
                    setForm({ ...form, contributiDovutiAnnoPrecedente: e.target.value })
                  }
                  className={`${classeInput} font-mono`}
                />
              </Campo>
              <Campo label="Anno di riferimento" hint="Anno cui si riferisce l'importo qui accanto">
                <input
                  type="number"
                  min={2000}
                  max={2100}
                  value={form.annoContributiDovuti}
                  onChange={(e) => setForm({ ...form, annoContributiDovuti: e.target.value })}
                  className={`${classeInput} font-mono max-w-[8rem]`}
                />
              </Campo>
            </div>
          </div>
        </Sezione>

        <Sezione
          titolo="Rappresentanza e contatti"
          aperta={aperte.contatti}
          onToggle={() => toggle('contatti')}
          completa={sezioneContattiCompleta}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Campo label="Rappresentante Legale" obbligatorio hint="Nome e cognome">
              <input
                type="text"
                value={form.rappresentanteLegale}
                onChange={(e) => setForm({ ...form, rappresentanteLegale: e.target.value })}
                className={classeInput}
              />
            </Campo>
            <Campo label="Ruolo" obbligatorio hint="Es. Amministratore Unico, Presidente CdA">
              <input
                type="text"
                value={form.ruoloRappresentanteLegale}
                onChange={(e) => setForm({ ...form, ruoloRappresentanteLegale: e.target.value })}
                className={classeInput}
              />
            </Campo>
          </div>
          <Campo
            label="PEC"
            obbligatorio
            hint="Necessaria per comunicazioni formali (es. a Enti, creditori)"
          >
            <input
              type="email"
              value={form.pec}
              onChange={(e) => setForm({ ...form, pec: e.target.value })}
              className={`${classeInput} font-mono`}
            />
          </Campo>
        </Sezione>

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
