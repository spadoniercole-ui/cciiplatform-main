'use client';

// Import del piano dell'azienda: da Excel in formato libero (voci in righe,
// anni in colonne; abbinamento delle voci proposto e memorizzato per
// azienda) oppure da PDF letto dall'AI. In entrambi i casi l'operatore vede
// e corregge la tabella normalizzata prima di salvarla: niente arriva nel
// confronto senza la sua conferma.

import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { FileSpreadsheet, FileText, X, AlertTriangle, RefreshCw } from 'lucide-react';
import { ETICHETTA_RIGA, type RigaInput } from '@/lib/piano/piano';
import {
  RIGHE_AZIENDA,
  ETICHETTA_DESTINAZIONE,
  leggiPianoExcel,
  proponiDestinazione,
  valoriDaVoci,
  anniDelPiano,
  type DestinazioneVoce,
  type LetturaPianoExcel,
  type ValoriPianoAzienda,
} from '@/lib/piano/pianoAziendale';
import { numeroDaCella } from '@/lib/bilancino/lettura';
import {
  estraiPianoAziendaleDaPdfAction,
  salvaPianoAziendaleAction,
} from '@/app/actions/pianoAziendale';
import { registraDocumentoOrigineAction } from '@/app/actions/documentiOrigine';
import { improntaFile } from '@/lib/fascicolo/impronta';
import { confermaApp } from '@/components/FinestreApp';

interface Props {
  nomeSchema: string;
  codice: string;
  scenarioId: number;
  aziendaId: number;
  file: File;
  abbinamentoMemorizzato: Record<string, DestinazioneVoce>;
  unitaMemorizzata: number;
  anniPiano: number[];
  onSalvato: () => void;
  onChiudi: () => void;
}

const DESTINAZIONI: DestinazioneVoce[] = [...RIGHE_AZIENDA, 'costiProduzioneTotali', 'esclusa'];
const etichettaDest = (d: DestinazioneVoce) =>
  ETICHETTA_DESTINAZIONE[d] ?? ETICHETTA_RIGA[d as RigaInput];
const fmt = (n: number | undefined) =>
  n === undefined ? '' : Math.round(n).toLocaleString('it-IT');

export function ImportaPianoAziendale({
  nomeSchema,
  codice,
  scenarioId,
  aziendaId,
  file,
  abbinamentoMemorizzato,
  unitaMemorizzata,
  anniPiano,
  onSalvato,
  onChiudi,
}: Props) {
  const pdf = /\.pdf$/i.test(file.name);
  const [lettura, setLettura] = useState<LetturaPianoExcel | null>(null);
  const [abbinamento, setAbbinamento] = useState<Record<string, DestinazioneVoce | undefined>>({});
  const [unita, setUnita] = useState(1);
  // Valori modificati a mano nella tabella finale (sovrascrivono quelli calcolati).
  const [valoriManuali, setValoriManuali] = useState<ValoriPianoAzienda | null>(null);
  const [fonti, setFonti] = useState<Partial<Record<string, string>>>({});
  const [notaLettura, setNotaLettura] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [caricamento, setCaricamento] = useState(true);
  const [salvataggio, setSalvataggio] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        if (pdf) {
          const fd = new FormData();
          fd.append('file', file);
          fd.append('codice', codice);
          const up = await fetch('/api/blob-upload', { method: 'POST', body: fd });
          const corpo = await up.json();
          if (!up.ok || corpo.error) {
            setErrore(corpo.error || `Impossibile caricare «${file.name}».`);
            return;
          }
          const r = await estraiPianoAziendaleDaPdfAction(codice, corpo.url, file.name);
          if (!r.success || !r.estrazione) {
            setErrore(r.error || 'Lettura del PDF non riuscita.');
            return;
          }
          setValoriManuali(r.estrazione.valori);
          setFonti(r.estrazione.fonti);
          setNotaLettura(
            [
              r.estrazione.unitaDocumento
                ? `Unità del documento: ${r.estrazione.unitaDocumento}.`
                : '',
              r.estrazione.note ?? '',
              Object.keys(r.estrazione.valori).length === 0
                ? 'Nessun valore previsionale trovato nel documento.'
                : '',
            ]
              .filter(Boolean)
              .join(' ') || null
          );
        } else {
          const testuale = /\.(csv|txt)$/i.test(file.name);
          const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', raw: testuale });
          let migliore: LetturaPianoExcel | null = null;
          for (const nome of wb.SheetNames) {
            const righe = XLSX.utils.sheet_to_json(wb.Sheets[nome], {
              header: 1,
              raw: true,
              blankrows: true,
              defval: null,
            }) as unknown[][];
            const l = leggiPianoExcel(righe);
            if (l && (!migliore || l.voci.length > migliore.voci.length)) migliore = l;
          }
          if (!migliore) {
            setErrore(
              'Non trovo una riga con gli anni (almeno due colonne con un anno, es. 2026, «Budget 2027»). Usa il modello Excel della piattaforma o controlla il file.'
            );
            return;
          }
          const abb: Record<string, DestinazioneVoce | undefined> = {};
          for (const v of migliore.voci)
            abb[v.chiave] =
              abbinamentoMemorizzato[v.chiave] ?? proponiDestinazione(v.etichetta) ?? undefined;
          setLettura(migliore);
          setAbbinamento(abb);
          setUnita(migliore.unitaSuggerita !== 1 ? migliore.unitaSuggerita : unitaMemorizzata);
        }
      } catch (e: unknown) {
        setErrore(`Impossibile leggere il file: ${(e as Error).message || e}`);
      } finally {
        setCaricamento(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  const valoriCalcolati: ValoriPianoAzienda = useMemo(
    () => (lettura ? valoriDaVoci(lettura.voci, abbinamento, unita) : {}),
    [lettura, abbinamento, unita]
  );
  const valori = valoriManuali ?? valoriCalcolati;
  const anni = useMemo(() => {
    const s = new Set([...anniDelPiano(valori), ...(lettura ? Object.values(lettura.anni) : [])]);
    return [...s].sort((a, b) => a - b);
  }, [valori, lettura]);

  const cambiaValore = (riga: RigaInput, anno: number, testo: string) => {
    const base: ValoriPianoAzienda = JSON.parse(JSON.stringify(valori));
    const n = testo.trim() === '' ? null : numeroDaCella(testo);
    const perAnno = { ...(base[riga] ?? {}) };
    if (n === null) delete perAnno[String(anno)];
    else perAnno[String(anno)] = n;
    base[riga] = perAnno;
    setValoriManuali(base);
  };

  const salva = async () => {
    const righeCompilate = RIGHE_AZIENDA.filter((r) => Object.keys(valori[r] ?? {}).length > 0);
    const anniNelPiano = anni.filter((a) => anniPiano.includes(a));
    const avvertenze = [
      `Salvo il piano dell’azienda da «${file.name}»: ${righeCompilate.length} righe, anni ${anni.join(', ') || '—'}.`,
      anniNelPiano.length < anniPiano.length
        ? `Anni del piano senza dati dell’azienda: ${anniPiano.filter((a) => !anni.includes(a)).join(', ')} — non saranno confrontati.`
        : '',
      righeCompilate.length < RIGHE_AZIENDA.length
        ? `Righe non indicate: ${RIGHE_AZIENDA.filter((r) => !righeCompilate.includes(r))
            .map((r) => ETICHETTA_RIGA[r].toLowerCase())
            .join('; ')}. Nel calcolo resta il valore dell’anno prima.`
        : '',
      'Le voci calcolate (EBITDA, risultato, cassa) le ricalcola la piattaforma dalle ipotesi.',
    ].filter(Boolean);
    if (
      !(await confermaApp(avvertenze.join('\n\n'), {
        titolo: 'Conferma del piano dell’azienda',
        etichettaConferma: 'Salva il piano',
      }))
    )
      return;
    setSalvataggio(true);
    setErrore(null);
    try {
      const impronta = await improntaFile(file);
      const doc = await registraDocumentoOrigineAction(
        nomeSchema,
        aziendaId,
        'PIANO_AZIENDALE',
        impronta
      );
      const memoria = lettura
        ? {
            abbinamento: Object.fromEntries(
              Object.entries(abbinamento).filter((e): e is [string, DestinazioneVoce] => !!e[1])
            ),
            unita,
          }
        : null;
      const notaCompleta = [
        note.trim(),
        pdf && Object.keys(fonti).length
          ? `Letto con l’AI dal PDF. Fonti: ${Object.entries(fonti)
              .map(([k, v]) => `${ETICHETTA_RIGA[k as RigaInput]}: ${v}`)
              .join('; ')}`
          : '',
      ]
        .filter(Boolean)
        .join('\n');
      const r = await salvaPianoAziendaleAction(
        codice,
        scenarioId,
        aziendaId,
        {
          valori,
          origine: pdf ? 'pdf' : 'excel',
          nomeFile: file.name,
          documentoId: doc.success ? (doc.documentoId ?? null) : null,
          note: notaCompleta || null,
        },
        memoria
      );
      if (!r.success) {
        setErrore(r.error || 'Salvataggio non riuscito.');
        return;
      }
      onSalvato();
    } finally {
      setSalvataggio(false);
    }
  };

  const selectCls = 'p-1.5 text-xs border border-slate-200 rounded-lg bg-white text-slate-900';

  return (
    <div className="bg-white border-2 border-blue-200 rounded-xl p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          {pdf ? (
            <FileText className="w-4 h-4 text-blue-600 mt-0.5" />
          ) : (
            <FileSpreadsheet className="w-4 h-4 text-blue-600 mt-0.5" />
          )}
          <div>
            <h3 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
              Piano dell’azienda — {file.name}
            </h3>
            <p className="text-[11px] text-slate-500 mt-1">
              {pdf
                ? 'L’AI legge il documento e propone i valori: controllali qui sotto, con la fonte indicata per ogni riga, prima di salvare. Il PDF non si conserva.'
                : 'Abbina le voci del file alle righe del piano (la scelta resta memorizzata per questa azienda), poi controlla la tabella prima di salvare.'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onChiudi}
          className="flex items-center gap-1 px-2.5 py-1.5 text-slate-500 hover:text-red-600 text-[10px] font-bold uppercase"
        >
          <X className="w-3.5 h-3.5" /> Annulla
        </button>
      </div>

      {errore && (
        <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <p>{errore}</p>
        </div>
      )}
      {caricamento && (
        <p className="text-xs text-slate-500 flex items-center gap-1.5">
          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          {pdf ? 'Lettura del PDF con l’AI (può richiedere un minuto)…' : 'Lettura del file…'}
        </p>
      )}
      {notaLettura && (
        <p className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-2">
          {notaLettura}
        </p>
      )}

      {lettura && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              1. Abbinamento delle voci del file
            </h4>
            <label className="flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase">
              Valori del file in
              <select
                className={selectCls}
                value={unita}
                onChange={(e) => {
                  setUnita(Number(e.target.value));
                  setValoriManuali(null);
                }}
              >
                <option value={1}>euro</option>
                <option value={1000}>migliaia di euro</option>
                <option value={1000000}>milioni di euro</option>
              </select>
            </label>
          </div>
          <div className="max-h-80 overflow-y-auto border border-slate-200 rounded-lg">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-slate-100 text-[9px] font-bold text-slate-600 uppercase">
                <tr>
                  <th className="p-2 text-left">Voce del file</th>
                  {Object.values(lettura.anni).map((a) => (
                    <th key={a} className="p-2 text-right">
                      {a}
                    </th>
                  ))}
                  <th className="p-2 text-left">Riga del piano</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lettura.voci.map((v) => (
                  <tr key={v.chiave} className={!abbinamento[v.chiave] ? 'bg-amber-50' : ''}>
                    <td className="p-2 text-slate-800">{v.etichetta}</td>
                    {Object.values(lettura.anni).map((a) => (
                      <td key={a} className="p-2 text-right font-mono text-slate-600">
                        {fmt(v.valori[String(a)])}
                      </td>
                    ))}
                    <td className="p-2">
                      <select
                        className={`${selectCls} w-full`}
                        value={abbinamento[v.chiave] ?? ''}
                        onChange={(e) => {
                          setAbbinamento((m) => ({
                            ...m,
                            [v.chiave]: (e.target.value || undefined) as
                              DestinazioneVoce | undefined,
                          }));
                          setValoriManuali(null);
                        }}
                      >
                        <option value="">— da scegliere —</option>
                        {DESTINAZIONI.map((d) => (
                          <option key={d} value={d}>
                            {etichettaDest(d)}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-slate-500">
            Più voci sulla stessa riga si sommano (es. materie, servizi e personale nei costi della
            produzione). Costi scritti con il meno: si prendono in valore assoluto.
          </p>
        </div>
      )}

      {!caricamento && (lettura || valoriManuali) && (
        <div className="space-y-2">
          <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            {lettura ? '2. ' : ''}Piano normalizzato (euro) — correggibile cella per cella
          </h4>
          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-xs">
              <thead className="bg-slate-100 text-[9px] font-bold text-slate-600 uppercase">
                <tr>
                  <th className="p-2 text-left min-w-56">Riga del piano</th>
                  {anni.map((a) => (
                    <th
                      key={a}
                      className={`p-2 text-right ${anniPiano.includes(a) ? 'text-blue-700' : ''}`}
                    >
                      {a}
                      {anniPiano.includes(a) ? '' : ' (fuori piano)'}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {RIGHE_AZIENDA.map((r) => (
                  <tr key={r}>
                    <td className="p-2 text-slate-800">
                      {ETICHETTA_RIGA[r]}
                      {fonti[r] && (
                        <span className="block text-[9px] text-slate-400">Fonte: {fonti[r]}</span>
                      )}
                    </td>
                    {anni.map((a) => (
                      <td key={a} className="p-1 text-right">
                        <input
                          type="text"
                          inputMode="decimal"
                          defaultValue={fmt(valori[r]?.[String(a)])}
                          key={`${r}-${a}-${valori[r]?.[String(a)] ?? ''}`}
                          onBlur={(e) => cambiaValore(r, a, e.target.value)}
                          className="w-28 p-1 text-right text-xs font-mono border border-slate-200 rounded bg-white text-slate-900"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <label className="block text-[9px] font-bold text-slate-400 uppercase">
            Note (da dove viene il piano, versione, data)
          </label>
          <textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full p-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onChiudi}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[10px] uppercase rounded-lg"
            >
              Annulla
            </button>
            <button
              type="button"
              onClick={salva}
              disabled={salvataggio || anni.length === 0}
              className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-bold text-[10px] uppercase rounded-lg"
            >
              {salvataggio ? 'Salvataggio…' : 'Salva il piano dell’azienda'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
