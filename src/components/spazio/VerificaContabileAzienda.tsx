'use client';

// VERIFICA CONTABILE — il percorso a livello azienda.
//
// Quattro acquisizioni, nell'ordine in cui servono: la visura storica (che qui
// non racconta la vita dell'azienda ma fissa l'anagrafica su cui si innestano
// i parametri dell'ente), i parametri dell'ente per questa azienda, i bilanci
// XBRL, e infine il prospetto a scalare con gli indici. La verifica si chiude
// con l'acquisizione del dato storico: nessuna simulazione, nessuna
// conclusione — quella è materia della verifica azienda.
//
// La certificazione dei debiti non si chiede e non si mostra: è il dato della
// verifica amministrativa, che vive nel suo esito. Qui resta il solo dato
// storico dell'azienda.

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  CircleDashed,
  FileSpreadsheet,
  FileText,
  Loader2,
  Upload,
} from 'lucide-react';
import { AziendaBilanciXbrl } from './AziendaBilanciXbrl';
import { ProspettoContabileStorico } from './ProspettoContabileStorico';
import { registraVisuraTriageAction } from '@/app/actions/visuraTriage';
import { estraiAnagraficaDaVisuraAction } from '@/app/actions/visuraEstrazione';
import {
  ottieniAnagraficaEnte,
  salvaAnagraficaEnteAction,
  type AnagraficaEnte,
} from '@/app/actions/anagraficaEnte';

interface Props {
  nomeSchema: string;
  codice: string;
  aziendaId: number;
  ragioneSociale: string;
  visuraIniziale: { nome: string; caricataIl: string } | null;
  parametriIniziali: AnagraficaEnte;
  anniXbrl: number;
}

const campiAnagrafica: { chiave: keyof AnagraficaEnte; etichetta: string }[] = [
  { chiave: 'idEnte', etichetta: 'ID ente' },
  ...Array.from({ length: 10 }, (_, i) => ({
    chiave: `campo${i + 1}` as keyof AnagraficaEnte,
    etichetta: `Parametro ${i + 1}`,
  })),
];

const vuota: AnagraficaEnte = {
  idEnte: null,
  campo1: null,
  campo2: null,
  campo3: null,
  campo4: null,
  campo5: null,
  campo6: null,
  campo7: null,
  campo8: null,
  campo9: null,
  campo10: null,
};

export function VerificaContabileAzienda({
  nomeSchema,
  codice,
  aziendaId,
  ragioneSociale,
  visuraIniziale,
  parametriIniziali,
  anniXbrl,
}: Props) {
  const [visura, setVisura] = useState(visuraIniziale);
  const [fileVisura, setFileVisura] = useState<File | null>(null);
  const [caricamentoVisura, setCaricamentoVisura] = useState(false);
  const [estrazione, setEstrazione] = useState<Record<string, string | null> | null>(null);
  const [parametri, setParametri] = useState<AnagraficaEnte>(parametriIniziali);
  const [salvataggioParametri, setSalvataggioParametri] = useState(false);
  const [messaggio, setMessaggio] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const r = await ottieniAnagraficaEnte(nomeSchema, aziendaId);
      if (r.success) setParametri(r.dati);
    })();
  }, [nomeSchema, aziendaId]);

  const parametriCompilati = useMemo(
    () => campiAnagrafica.some((c) => (parametri[c.chiave] ?? '').trim() !== ''),
    [parametri]
  );

  const passi = useMemo(
    () => [
      { etichetta: 'Visura storica', fatto: Boolean(visura) },
      { etichetta: 'Parametri ente', fatto: parametriCompilati },
      { etichetta: 'Bilanci XBRL', fatto: anniXbrl > 0 },
    ],
    [visura, parametriCompilati, anniXbrl]
  );
  const completa = passi.every((p) => p.fatto);

  const caricaVisura = useCallback(async () => {
    if (!fileVisura) return;
    setCaricamentoVisura(true);
    setErrore(null);
    setMessaggio(null);
    try {
      const fd = new FormData();
      fd.append('file', fileVisura);
      fd.append('codice', codice);
      const up = await fetch('/api/blob-upload', { method: 'POST', body: fd });
      const corpo = await up.json().catch(() => ({}));
      if (!up.ok || corpo.error) {
        setErrore(corpo.error ?? `Caricamento non riuscito (HTTP ${up.status}).`);
        return;
      }
      const reg = await registraVisuraTriageAction(
        nomeSchema,
        aziendaId,
        corpo.url as string,
        fileVisura.name
      );
      if (!reg.success) {
        setErrore(reg.error ?? 'Visura non registrata.');
        return;
      }
      setVisura({
        nome: fileVisura.name,
        caricataIl: new Date().toISOString().slice(0, 10),
      });
      setMessaggio('Visura storica acquisita: è la base dell’anagrafica della verifica contabile.');
      setFileVisura(null);
    } catch (e) {
      setErrore(`Caricamento non riuscito: ${(e as Error).message}`);
    } finally {
      setCaricamentoVisura(false);
    }
  }, [fileVisura, codice, nomeSchema, aziendaId]);

  const leggiVisura = async () => {
    if (!fileVisura) return;
    setCaricamentoVisura(true);
    setErrore(null);
    try {
      const buffer = await fileVisura.arrayBuffer();
      let binario = '';
      const byte = new Uint8Array(buffer);
      for (let i = 0; i < byte.length; i++) binario += String.fromCharCode(byte[i]);
      const r = await estraiAnagraficaDaVisuraAction(btoa(binario));
      if (!r.success || !r.anagrafica) {
        setErrore(r.error ?? 'Anagrafica non estratta.');
        return;
      }
      setEstrazione(r.anagrafica as unknown as Record<string, string | null>);
      setMessaggio('Dati proposti dalla visura: sono una lettura, non un salvataggio.');
    } finally {
      setCaricamentoVisura(false);
    }
  };

  const salvaParametri = async () => {
    setSalvataggioParametri(true);
    setErrore(null);
    setMessaggio(null);
    const r = await salvaAnagraficaEnteAction(nomeSchema, aziendaId, parametri);
    setSalvataggioParametri(false);
    if (!r.success) {
      setErrore(r.error ?? 'Parametri non salvati.');
      return;
    }
    setMessaggio('Parametri dell’ente salvati per questa azienda.');
  };

  const base = `/spazio/${codice}/aziende/${aziendaId}`;

  return (
    <div className="max-w-5xl space-y-4">
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-blue-600" />
          <h1 className="text-sm font-bold text-slate-900">
            Verifica contabile — {ragioneSociale}
          </h1>
        </div>
        <p className="text-xs text-slate-500 leading-relaxed">
          Il percorso parte dalla visura storica, che qui serve a fissare l’anagrafica su cui si
          innestano i parametri dell’ente; prosegue con i parametri e con i bilanci XBRL, e si
          chiude con il prospetto a scalare e gli indici del dato depositato. La certificazione dei
          debiti non è richiesta: è il dato della verifica amministrativa.
        </p>
        <div className="flex flex-wrap gap-1.5 pt-1">
          {passi.map((p) => (
            <span
              key={p.etichetta}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[10px] font-bold ${
                p.fatto
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                  : 'bg-amber-50 border-amber-200 text-amber-800'
              }`}
            >
              {p.fatto ? (
                <CheckCircle2 className="w-3 h-3" />
              ) : (
                <CircleDashed className="w-3 h-3" />
              )}
              {p.etichetta}
            </span>
          ))}
          <span
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[10px] font-bold ${
              completa
                ? 'bg-emerald-600 border-emerald-600 text-white'
                : 'bg-slate-50 border-slate-200 text-slate-400'
            }`}
          >
            {completa ? 'Verifica contabile completa' : 'Da completare'}
          </span>
        </div>
      </div>

      {errore && (
        <p className="text-xs font-bold text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {errore}
        </p>
      )}
      {messaggio && (
        <p className="text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
          {messaggio}
        </p>
      )}

      <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
          <FileText className="w-3.5 h-3.5 text-blue-600" /> 1. Visura storica
        </h2>
        {visura ? (
          <p className="text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg p-2.5">
            Acquisita <strong>{visura.nome}</strong> il {visura.caricataIl}. Una nuova visura
            sostituisce questa.
          </p>
        ) : (
          <p className="text-[11px] text-slate-500">
            La visura della verifica contabile è quella storica dell’azienda: serve a fissare
            l’anagrafica su cui si innestano i parametri dell’ente. Non sostituisce quella della
            verifica amministrativa.
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="file"
            accept="application/pdf,.pdf"
            onChange={(e) => setFileVisura(e.target.files?.[0] ?? null)}
            className="text-[11px] text-slate-600"
          />
          <button
            type="button"
            onClick={caricaVisura}
            disabled={!fileVisura || caricamentoVisura}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white hover:bg-slate-800 disabled:opacity-40"
          >
            {caricamentoVisura ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Upload className="w-3 h-3" />
            )}
            Acquisisci la visura
          </button>
          <button
            type="button"
            onClick={leggiVisura}
            disabled={!fileVisura || caricamentoVisura}
            className="text-[10px] font-bold uppercase tracking-wider text-blue-700 hover:text-blue-800 disabled:opacity-40"
          >
            Leggi l’anagrafica dalla visura
          </button>
        </div>
        {estrazione && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              Dati proposti dalla visura
            </p>
            <ul className="grid sm:grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-slate-700">
              {Object.entries(estrazione).map(([k, v]) => (
                <li key={k}>
                  <span className="text-slate-400">{k}: </span>
                  {v ?? '—'}
                </li>
              ))}
            </ul>
            <p className="mt-1 text-[10px] text-slate-400">
              Lettura del modello sulla visura: i valori non sono stati salvati. L’anagrafica
              dell’azienda si modifica dalla sua scheda Anagrafica.
            </p>
          </div>
        )}
      </section>

      <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
          2. Parametri dell’ente per questa azienda
        </h2>
        <p className="text-[11px] text-slate-500">
          I campi che caratterizzano l’azienda dentro l’ente: restano a livello azienda, non di
          scenario. Compila quelli che servono — l’etichetta dei campi è quella configurata nello
          spazio.
        </p>
        <div className="grid sm:grid-cols-2 gap-2">
          {campiAnagrafica.map((c) => (
            <label key={c.chiave} className="text-[10px] text-slate-600">
              {c.etichetta}
              <input
                type="text"
                value={parametri[c.chiave] ?? ''}
                onChange={(e) =>
                  setParametri((p) => ({ ...p, [c.chiave]: e.target.value || null }))
                }
                className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1 text-xs text-slate-900"
              />
            </label>
          ))}
        </div>
        <button
          type="button"
          onClick={salvaParametri}
          disabled={salvataggioParametri}
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white hover:bg-blue-800 disabled:opacity-50"
        >
          {salvataggioParametri && <Loader2 className="w-3 h-3 animate-spin" />}
          Salva i parametri
        </button>
      </section>

      <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
          <FileSpreadsheet className="w-3.5 h-3.5 text-blue-600" /> 3. Bilanci XBRL
        </h2>
        <AziendaBilanciXbrl
          nomeSchema={nomeSchema}
          aziendaId={aziendaId}
          hrefConfigurazione={`${base}/xbrl`}
        />
      </section>

      <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
          4. Prospetto a scalare e indici
        </h2>
        <ProspettoContabileStorico nomeSchema={nomeSchema} aziendaId={aziendaId} />
      </section>

      <p className="text-[11px] text-slate-500">
        La verifica contabile si chiude con l’acquisizione del dato storico: per la simulazione e le
        proiezioni c’è la verifica azienda.{' '}
        <Link
          href={`/spazio/${codice}/verifica-contabile`}
          className="font-bold text-blue-700 hover:text-blue-800"
        >
          Torna all’elenco
        </Link>
      </p>
    </div>
  );
}
