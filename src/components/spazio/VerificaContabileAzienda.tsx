'use client';

// VERIFICA CONTABILE — il percorso a livello azienda, sui numeri.
//
// L'ordine è quello della direttrice contabile, non quello del vecchio
// screening: si acquisiscono i bilanci XBRL, si legge il prospetto a scalare
// con gli indici, si contano i differenziali e si simula l'assetto alla data
// della verifica, e il report contabile raccoglie il risultato stampabile.
// Le note integrative danno la spiegazione dei numeri; la certificazione dei
// debiti non si chiede, è il dato della verifica amministrativa.
//
// Visura storica e parametri dell'ente non sono la verifica: sono il corredo
// che identifica l'azienda presso l'ente, e stanno in fondo, dichiarati come
// tali. Le etichette dei parametri sono solo quelle configurate nello spazio
// (Parametri di Spazio → Anagrafica Ente): prima comparivano come «Parametro
// 1…10» e poi venivano mascherate dal nome vero, e sembravano due cose.

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
import { ProiezioneContabile } from './ProiezioneContabile';
import { registraVisuraTriageAction } from '@/app/actions/visuraTriage';
import { estraiAnagraficaDaVisuraAction } from '@/app/actions/visuraEstrazione';
import {
  ottieniAnagraficaEnte,
  salvaAnagraficaEnteAction,
  type AnagraficaEnte,
} from '@/app/actions/anagraficaEnte';
import {
  ottieniEtichetteAnagraficaEnte,
  type EtichettaAnagraficaEnte,
} from '@/app/actions/anagraficaEnteConfig';

interface Props {
  nomeSchema: string;
  codice: string;
  aziendaId: number;
  ragioneSociale: string;
  visuraIniziale: { nome: string; caricataIl: string } | null;
  parametriIniziali: AnagraficaEnte;
  anniXbrl: number;
  /** Codici degli indici abilitati nello spazio: il prospetto mostra questi. */
  indiciAbilitati?: string[];
  /** Da dove si è arrivati (verifica azienda): il ritorno riporta lì. */
  ritorno?: string | null;
}

export function VerificaContabileAzienda({
  nomeSchema,
  codice,
  aziendaId,
  ragioneSociale,
  visuraIniziale,
  parametriIniziali,
  anniXbrl,
  indiciAbilitati = [],
  ritorno = null,
}: Props) {
  const [visura, setVisura] = useState(visuraIniziale);
  const [fileVisura, setFileVisura] = useState<File | null>(null);
  const [caricamentoVisura, setCaricamentoVisura] = useState(false);
  const [estrazione, setEstrazione] = useState<Record<string, string | null> | null>(null);
  const [parametri, setParametri] = useState<AnagraficaEnte>(parametriIniziali);
  const [salvataggioParametri, setSalvataggioParametri] = useState(false);
  const [messaggio, setMessaggio] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [etichette, setEtichette] = useState<EtichettaAnagraficaEnte[] | null>(null);

  useEffect(() => {
    (async () => {
      const r = await ottieniAnagraficaEnte(nomeSchema, aziendaId);
      if (r.success) setParametri(r.dati);
      const e = await ottieniEtichetteAnagraficaEnte(nomeSchema);
      if (e.success) setEtichette(e.etichette);
    })();
  }, [nomeSchema, aziendaId]);

  // I campi attivi, con il nome che l'ente dà loro (matricola, CSC, CA…).
  // Nessun ripiego «Parametro N»: se lo spazio non ha configurato le etichette
  // la sezione lo dice e manda a configurarle, invece di mostrare nomi che
  // l'ente non usa.
  const campiEnte = useMemo(
    () =>
      (etichette ?? [])
        .filter((e) => e.attivo)
        .map((e) => ({
          chiave: `campo${e.campo}` as keyof AnagraficaEnte,
          etichetta: e.etichetta,
        })),
    [etichette]
  );
  const etichettePronte = etichette !== null;

  const parametriCompilati = useMemo(() => {
    const chiavi: (keyof AnagraficaEnte)[] = [...campiEnte.map((c) => c.chiave), 'idEnte'];
    return chiavi.some((k) => (parametri[k] ?? '').trim() !== '');
  }, [parametri, campiEnte]);

  const passi = useMemo(
    () => [
      { etichetta: 'Bilanci XBRL', fatto: anniXbrl > 0 },
      { etichetta: 'Corredo (visura e parametri)', fatto: Boolean(visura) && parametriCompilati },
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
      setMessaggio('Visura storica acquisita: è il corredo dell’anagrafica della verifica.');
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
          La verifica contabile legge i bilanci XBRL depositati, ne ricava il prospetto a scalare e
          gli indici, conta i differenziali e simula l’assetto alla data della verifica. Il report
          raccoglie i numeri, gli indici, i differenziali e la proiezione; le note integrative danno
          la spiegazione delle voci. La certificazione dei debiti non è richiesta: è il dato della
          verifica amministrativa.
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
          <FileSpreadsheet className="w-3.5 h-3.5 text-blue-600" /> 1. Bilanci XBRL
        </h2>
        <p className="text-[11px] text-slate-500">
          Le istanze depositate sono il dato della verifica: da qui nascono prospetto, indici e
          serie dei differenziali. Una nuova istanza si aggiunge all’archivio, non lo sostituisce.
        </p>
        <AziendaBilanciXbrl
          nomeSchema={nomeSchema}
          aziendaId={aziendaId}
          hrefConfigurazione={`${base}/xbrl`}
        />
      </section>

      <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
            2. Prospetto a scalare e indici
          </h2>
          <Link
            href={`/spazio/${codice}/verifica-contabile/${aziendaId}/fotografia`}
            className="text-[10px] font-bold uppercase tracking-wider text-blue-700 hover:text-blue-800"
          >
            Fotografia contabile (stampabile) →
          </Link>
        </div>
        <ProspettoContabileStorico
          nomeSchema={nomeSchema}
          aziendaId={aziendaId}
          indiciAbilitati={indiciAbilitati}
        />
      </section>

      <ProiezioneContabile nomeSchema={nomeSchema} aziendaId={aziendaId} />

      <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
          <FileText className="w-3.5 h-3.5 text-blue-600" /> 4. Report contabile
        </h2>
        <p className="text-[11px] text-slate-500 leading-relaxed">
          Il report contabile mette in fila le tre tabelle — prospetto, differenziali, simulazione —
          con accanto la spiegazione dei valori e le note integrative del bilancio. Ogni tabella si
          può stampare anche da sola; il documento racconta i numeri, non la vita dell’azienda:
          quella la racconta la verifica amministrativa, e le due si leggono insieme nella verifica
          aziendale.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/spazio/${codice}/verifica-contabile/${aziendaId}/report`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white hover:bg-slate-800"
          >
            <FileText className="w-3 h-3" /> Apri il report contabile
          </Link>
          {(
            [
              ['prospetto', 'Prospetto'],
              ['differenziali', 'Differenziali'],
              ['simulazione', 'Simulazione'],
            ] as const
          ).map(([slug, etichetta]) => (
            <Link
              key={slug}
              href={`/spazio/${codice}/verifica-contabile/${aziendaId}/report/${slug}`}
              className="text-[10px] font-bold uppercase tracking-wider text-blue-700 hover:text-blue-800"
            >
              {etichetta} →
            </Link>
          ))}
        </div>
      </section>

      {/* CORREDO — non è la verifica: sono l'identificazione dell'azienda
        presso l'ente. Sta in fondo, dichiarato, per non aprire il percorso con
        documenti che sembrano la verifica stessa. */}
      <section
        id="visura-storica"
        className="scroll-mt-4 bg-white border border-slate-200 rounded-xl p-5 space-y-3"
      >
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
          <FileText className="w-3.5 h-3.5 text-slate-500" /> Corredo — Visura storica
        </h2>
        {visura ? (
          <p className="text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg p-2.5">
            Acquisita <strong>{visura.nome}</strong> il {visura.caricataIl}. Una nuova visura
            sostituisce questa.
          </p>
        ) : (
          <p className="text-[11px] text-slate-500">
            La visura storica identifica l’azienda (denominazione, sede, organi, eventi iscritti) e
            non entra nei numeri della verifica. Non sostituisce quella della verifica
            amministrativa.
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
              dell’azienda si modifica dalla sua scheda.
            </p>
          </div>
        )}
      </section>

      <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
          Corredo — Parametri dell’ente per questa azienda
        </h2>
        <p className="text-[11px] text-slate-500">
          I campi con cui l’ente identifica l’azienda (matricola, CSC, CA…): restano a livello
          azienda, non di scenario, e non entrano nei numeri della verifica.
        </p>
        {!etichettePronte ? (
          <p className="text-[11px] text-slate-400">Lettura delle etichette in corso…</p>
        ) : campiEnte.length === 0 ? (
          <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
            Nessun campo dell’ente è configurato per questo spazio: qui non si mostrano nomi
            generici.{' '}
            <Link
              href={`/spazio/${codice}/parametri/anagrafica-ente`}
              className="font-bold text-blue-700 hover:text-blue-800"
            >
              Configura i campi dell’ente
            </Link>
            .
          </p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-2">
            {campiEnte.map((c) => (
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
            <label className="text-[10px] text-slate-600 sm:col-span-2">
              ID ente (riferimento interno, facoltativo)
              <input
                type="text"
                value={parametri.idEnte ?? ''}
                onChange={(e) => setParametri((p) => ({ ...p, idEnte: e.target.value || null }))}
                className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1 text-xs text-slate-900"
              />
            </label>
          </div>
        )}
        {campiEnte.length > 0 && (
          <button
            type="button"
            onClick={salvaParametri}
            disabled={salvataggioParametri}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white hover:bg-blue-800 disabled:opacity-50"
          >
            {salvataggioParametri && <Loader2 className="w-3 h-3 animate-spin" />}
            Salva i parametri
          </button>
        )}
      </section>

      <p className="text-[11px] text-slate-500">
        La verifica contabile porta il dato storico fino all’anno in cui è stata aperta: la verifica
        aziendale riparte da qui, con i due dati già sullo stesso asse temporale.{' '}
        <Link
          href={
            ritorno && ritorno.startsWith('/spazio/')
              ? ritorno
              : `/spazio/${codice}/verifica-contabile`
          }
          className="font-bold text-blue-700 hover:text-blue-800"
        >
          {ritorno && ritorno.startsWith('/spazio/')
            ? 'Torna alla verifica azienda'
            : 'Torna all’elenco'}
        </Link>
      </p>
    </div>
  );
}
