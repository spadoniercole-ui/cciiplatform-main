'use client';

// Configurazione XBRL per una specifica azienda: qui si CARICA il bilancio
// XBRL e si scelgono le tab (tra quelle già attive per l'intero spazio) da
// alimentare.
//
// Il caricamento sta QUI, e non solo nello Scenario, perché il percorso è
// questo: triage → Analisi Bilancio → Screening. Lo Screening legge il
// bilancio depositato per l'indicatore di attenzione e per la relazione;
// lasciare l'unico punto di caricamento dentro lo Scenario significava
// caricare il bilancio DOPO aver già generato lo screening, cioè quando non
// serve più. Lo Scenario resta il posto dove si aggiungono le annualità
// successive, con i dati attualizzati della proposta.

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, FileSpreadsheet, FileUp, Upload } from 'lucide-react';
import {
  ottieniTabXbrlAzienda,
  impostaTabXbrlAziendaAction,
  type TabXbrlAzienda,
} from '@/app/actions/aziendaConfig';
import {
  ottieniStoricoXbrlAzienda,
  salvaAnalisiXbrlAziendaAction,
  type BilancioStoricoAzienda,
} from '@/app/actions/xbrlAzienda';
import { segnaVistaAnalisiBilancioAction } from '@/app/actions/analisiBilancioStep';
import { improntaFile } from '@/lib/fascicolo/impronta';
import { registraDocumentoOrigineAction } from '@/app/actions/documentiOrigine';
import type { AnalisiXbrlResult } from '@/lib/xbrl/types';

interface Props {
  nomeSchema: string;
  aziendaId: number;
}

export function AziendaConfigXbrl({ nomeSchema, aziendaId }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<TabXbrlAzienda[]>([]);
  const [storico, setStorico] = useState<BilancioStoricoAzienda[]>([]);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);
  const [erroreSalvataggio, setErroreSalvataggio] = useState<string | null>(null);
  const [caricamentoFile, setCaricamentoFile] = useState(false);
  const [erroreFile, setErroreFile] = useState<string | null>(null);
  const [esitoCaricamento, setEsitoCaricamento] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setCaricamento(true);
      const [risultato, storicoRis] = await Promise.all([
        ottieniTabXbrlAzienda(nomeSchema, aziendaId),
        ottieniStoricoXbrlAzienda(nomeSchema, aziendaId),
      ]);
      if (risultato.success) setTab(risultato.tab);
      else setErrore(risultato.error || 'Impossibile caricare la configurazione.');
      if (storicoRis.success) setStorico(storicoRis.storico);
      setCaricamento(false);
    })();
  }, [nomeSchema, aziendaId]);

  // Presa visione della sotto-sezione: aprirla è ciò che concorre a rendere
  // verde "Analisi Bilancio". Segniamo la visita e, solo se è la prima volta
  // (cambiato), aggiorniamo il semaforo dei passi nel layout (Server
  // Component) con router.refresh().
  useEffect(() => {
    (async () => {
      const esito = await segnaVistaAnalisiBilancioAction(nomeSchema, aziendaId, 'xbrl');
      if (esito.success && esito.cambiato) router.refresh();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nomeSchema, aziendaId]);

  const handleCaricaBilancio = async (file: File) => {
    setCaricamentoFile(true);
    setErroreFile(null);
    setEsitoCaricamento(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const risposta = await fetch('/api/xbrl/parse', { method: 'POST', body: formData });
      const corpo = await risposta.json();
      if (!risposta.ok || corpo.error) {
        setErroreFile(corpo.error || "Errore durante l'elaborazione del bilancio XBRL.");
        return;
      }
      const analisi = corpo as AnalisiXbrlResult;
      const regX = await registraDocumentoOrigineAction(
        nomeSchema,
        aziendaId,
        'XBRL',
        await improntaFile(file)
      );
      const risultato = await salvaAnalisiXbrlAziendaAction(
        nomeSchema,
        aziendaId,
        analisi,
        regX.success && regX.documentoId ? regX.documentoId : null
      );
      if (!risultato.success) {
        setErroreFile(risultato.error || 'Impossibile salvare il bilancio.');
        return;
      }
      // Lo storico conta le annualità DISTINTE effettivamente archiviate: un
      // file porta l'anno corrente e il comparativo, e ricaricare lo stesso
      // anno sovrascrive la riga senza aggiungerne una.
      const storicoRis = await ottieniStoricoXbrlAzienda(nomeSchema, aziendaId);
      if (storicoRis.success) setStorico(storicoRis.storico);
      setEsitoCaricamento(
        `Bilancio ${analisi.annoBilancio ?? ''} salvato: ${
          storicoRis.success ? storicoRis.storico.length : storico.length
        } annualità in archivio.`
      );
      // "Analisi Bilancio" diventa verde con un bilancio in archivio: il
      // semaforo vive nel layout (Server Component), quindi va riletto.
      router.refresh();
    } catch (err: any) {
      setErroreFile(`Impossibile leggere il file: ${err.message || err}`);
    } finally {
      setCaricamentoFile(false);
    }
  };

  const handleToggle = async (t: TabXbrlAzienda) => {
    setErroreSalvataggio(null);
    const nuovoValore = !t.abilitato;
    setTab((prev) =>
      prev.map((x) => (x.codice === t.codice ? { ...x, abilitato: nuovoValore } : x))
    );

    const risultato = await impostaTabXbrlAziendaAction(
      nomeSchema,
      aziendaId,
      t.codice,
      nuovoValore
    );
    if (!risultato.success) {
      setTab((prev) =>
        prev.map((x) => (x.codice === t.codice ? { ...x, abilitato: t.abilitato } : x))
      );
      setErroreSalvataggio(risultato.error || 'Impossibile salvare la modifica della tab.');
    }
  };

  if (caricamento) return <p className="text-xs text-slate-400">Caricamento...</p>;

  return (
    <div className="max-w-2xl space-y-4">
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <FileUp className="w-4 h-4 text-blue-600" />
          <h2 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
            Bilanci XBRL di questa azienda
          </h2>
        </div>
        <p className="text-[11px] text-slate-500">
          Il bilancio depositato si carica qui, dopo il triage e prima dello Screening: è quello che
          l&apos;indicatore di attenzione e la relazione leggono. Un file porta l&apos;anno corrente
          e il comparativo; ricaricare lo stesso anno lo aggiorna, non lo duplica.
        </p>

        {erroreFile && (
          <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
            {erroreFile}
          </div>
        )}
        {esitoCaricamento && (
          <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
            {esitoCaricamento}
          </div>
        )}

        {storico.length > 0 ? (
          <ul className="space-y-1">
            {storico.map((b) => (
              <li key={b.id} className="flex items-center gap-2 text-xs text-slate-700">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span className="font-bold">{b.annoBilancio ?? 'anno non determinato'}</span>
                <span className="text-slate-500 truncate">{b.nomeFile || 'file non indicato'}</span>
                <span className="ml-auto text-[10px] text-slate-400 shrink-0">
                  severità {b.severity}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
            Nessun bilancio caricato: senza, lo Screening procede sui soli dati disponibili e lo
            dichiara nella relazione.
          </p>
        )}

        <label className="inline-flex items-center gap-2 px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-[11px] uppercase rounded-lg cursor-pointer transition-colors w-fit">
          <Upload className="w-3.5 h-3.5" />
          {caricamentoFile ? 'Analisi in corso...' : 'Carica bilancio XBRL'}
          <input
            type="file"
            accept=".xbrl,.xml"
            className="hidden"
            disabled={caricamentoFile}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleCaricaBilancio(file);
              e.target.value = '';
            }}
          />
        </label>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <FileSpreadsheet className="w-4 h-4 text-blue-600" />
          <h2 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
            Tab XBRL per questa azienda
          </h2>
        </div>
        <p className="text-[11px] text-slate-500">
          Nel bilancio caricato sopra, solo le tab confermate qui saranno alimentate. L&apos;elenco
          mostra solo le tab già attive per l&apos;intero spazio (Parametri di Spazio) — per
          aggiungerne una nuova, va prima abilitata lì.
        </p>

        {errore && (
          <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
            {errore}
          </div>
        )}
        {erroreSalvataggio && (
          <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
            {erroreSalvataggio}
          </div>
        )}

        <div className="space-y-1">
          {tab.map((t) => (
            <label
              key={t.codice}
              className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer py-1"
            >
              <input type="checkbox" checked={t.abilitato} onChange={() => handleToggle(t)} />
              <span className={t.abilitato ? '' : 'text-slate-400 line-through'}>
                {t.etichetta}
              </span>
            </label>
          ))}
          {tab.length === 0 && (
            <p className="text-xs text-slate-400">
              Nessuna tab XBRL attiva per questo spazio — configurale prima in Parametri di Spazio.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
