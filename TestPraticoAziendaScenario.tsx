'use client';

// Documenti di corredo alla proposta — solo percorso Redigente. Ogni
// documento è una bozza scritta per intero dall'AI (come la Relazione),
// poi modificabile a mano dal professionista e stampabile/salvabile in
// PDF. Sono bozze da rivedere: il disclaimer in cima lo dice chiaro.

import React, { useEffect, useState } from 'react';
import { FileSignature, Sparkles, RefreshCw, Save, Printer, AlertTriangle } from 'lucide-react';
import {
  ottieniDocumentiCorredo,
  generaDocumentoCorredoAction,
  salvaDocumentoCorredoAction,
  type DocumentoCorredo,
} from '@/app/actions/documentiCorredo';
import { DOCUMENTI_CORREDO, type TipoDocumentoCorredo } from '@/lib/documentiCorredo/costanti';
import { stampaTesto } from '@/lib/stampaTesto';

interface Props {
  nomeSchema: string;
  scenarioId: number;
}

export function DocumentiCorredoRedigente({ nomeSchema, scenarioId }: Props) {
  const [documenti, setDocumenti] = useState<DocumentoCorredo[]>([]);
  const [bozze, setBozze] = useState<Record<string, string>>({});
  const [caricamento, setCaricamento] = useState(true);
  const [azione, setAzione] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [salvato, setSalvato] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setCaricamento(true);
      const risultato = await ottieniDocumentiCorredo(nomeSchema, scenarioId);
      if (risultato.success) {
        setDocumenti(risultato.documenti);
        const iniziali: Record<string, string> = {};
        for (const d of risultato.documenti) iniziali[d.tipo] = d.testo ?? '';
        setBozze(iniziali);
      } else {
        setErrore(risultato.error || 'Impossibile caricare i documenti.');
      }
      setCaricamento(false);
    })();
  }, [nomeSchema, scenarioId]);

  const docPerTipo = (tipo: TipoDocumentoCorredo) => documenti.find((d) => d.tipo === tipo);

  const handleGenera = async (tipo: TipoDocumentoCorredo) => {
    setAzione(`gen-${tipo}`);
    setErrore(null);
    setSalvato(null);
    const risultato = await generaDocumentoCorredoAction(nomeSchema, scenarioId, tipo);
    if (risultato.success && risultato.testo !== undefined) {
      setBozze((b) => ({ ...b, [tipo]: risultato.testo as string }));
      const ricarica = await ottieniDocumentiCorredo(nomeSchema, scenarioId);
      if (ricarica.success) setDocumenti(ricarica.documenti);
      if (risultato.troncata) {
        setErrore(
          'La bozza potrebbe essere stata troncata per lunghezza — controlla il finale e, se serve, rigenerala.'
        );
      }
    } else {
      setErrore(risultato.error || 'Impossibile generare il documento.');
    }
    setAzione(null);
  };

  const handleSalva = async (tipo: TipoDocumentoCorredo) => {
    setAzione(`save-${tipo}`);
    setErrore(null);
    setSalvato(null);
    const risultato = await salvaDocumentoCorredoAction(
      nomeSchema,
      scenarioId,
      tipo,
      bozze[tipo] ?? ''
    );
    if (risultato.success) {
      setSalvato(tipo);
      const ricarica = await ottieniDocumentiCorredo(nomeSchema, scenarioId);
      if (ricarica.success) setDocumenti(ricarica.documenti);
    } else {
      setErrore(risultato.error || 'Impossibile salvare.');
    }
    setAzione(null);
  };

  if (caricamento) return <p className="text-xs text-slate-400">Caricamento dei documenti...</p>;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <FileSignature className="w-4 h-4 text-blue-600" />
        <div>
          <h2 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
            Documenti di corredo
          </h2>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Bozze scritte dall&apos;assistente sulla base del quadro raccolto (proposta,
            Brogliaccio, test pratico, confronto liquidatorio). Si redigono insieme alla proposta.
          </p>
        </div>
      </div>

      <div className="flex items-start gap-2 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <span>
          Sono <strong>bozze da rivedere e adattare</strong>: l&apos;assistente lascia segnaposto
          tra parentesi quadre dove manca un dato (date, nome dell&apos;esperto, tribunale…). Vanno
          controllate, completate e firmate dal professionista prima di ogni utilizzo.
        </span>
      </div>

      {errore && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          {errore}
        </div>
      )}

      {DOCUMENTI_CORREDO.map((meta) => {
        const doc = docPerTipo(meta.tipo);
        const generato = azione === `gen-${meta.tipo}`;
        const salvando = azione === `save-${meta.tipo}`;
        const bozza = bozze[meta.tipo] ?? '';
        const modificatoDopoGenerazione =
          doc?.generatoIl && doc?.aggiornatoIl
            ? new Date(doc.aggiornatoIl).getTime() - new Date(doc.generatoIl).getTime() > 1500
            : false;
        return (
          <div
            key={meta.tipo}
            className="bg-white border border-slate-200 rounded-xl p-5 space-y-3"
          >
            <div className="flex items-start justify-between flex-wrap gap-2">
              <div>
                <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider flex items-center gap-2">
                  {meta.titolo}
                  {!meta.sempre && (
                    <span className="text-[9px] font-bold text-slate-400 normal-case">
                      (eventuale)
                    </span>
                  )}
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">{meta.sottotitolo}</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {bozza && (
                  <button
                    type="button"
                    onClick={() => stampaTesto(meta.titolo, bozza, doc?.generatoIl ?? null)}
                    className="flex items-center gap-1 px-2 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 font-bold text-[9px] uppercase rounded transition-colors"
                    title="Apre una finestra di stampa — da lì puoi salvare come PDF"
                  >
                    <Printer className="w-3 h-3" /> Stampa / PDF
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleGenera(meta.tipo)}
                  disabled={generato}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white font-bold text-[10px] uppercase rounded-lg transition-colors"
                >
                  {generato ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5" />
                  )}
                  {doc?.testo ? 'Rigenera' : 'Genera'}
                </button>
              </div>
            </div>

            {bozza ? (
              <>
                <textarea
                  value={bozza}
                  onChange={(e) => setBozze((b) => ({ ...b, [meta.tipo]: e.target.value }))}
                  rows={14}
                  className="w-full text-xs text-slate-700 leading-relaxed p-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400 font-mono"
                />
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <p className="text-[10px] text-slate-400">
                    {doc?.generatoIl &&
                      `Generato il ${new Date(doc.generatoIl).toLocaleString('it-IT')}`}
                    {modificatoDopoGenerazione && ' · modificato a mano dopo la generazione'}
                    {salvato === meta.tipo && ' · salvato'}
                  </p>
                  <button
                    type="button"
                    onClick={() => handleSalva(meta.tipo)}
                    disabled={salvando}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-bold text-[10px] uppercase rounded-lg transition-colors"
                  >
                    {salvando ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Save className="w-3.5 h-3.5" />
                    )}
                    Salva modifiche
                  </button>
                </div>
              </>
            ) : (
              <p className="text-xs text-slate-400">
                Non ancora generato — l&apos;assistente scriverà una bozza sulla base del quadro
                raccolto per questo scenario.
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
