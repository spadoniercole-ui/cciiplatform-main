'use client';

// Parametri di Spazio › Stampa: margini, intestazione, pie' di pagina, logo.

import React, { useEffect, useState } from 'react';
import { Printer, Save, Upload, Trash2 } from 'lucide-react';
import {
  ottieniParametriStampaAction,
  salvaParametriStampaAction,
} from '@/app/actions/parametriStampa';
import { impostaParametriStampa, stampaHtml, type ParametriStampa } from '@/lib/stampaTesto';

const CAMPO = 'w-full p-2 text-xs bg-slate-50 border border-slate-200 rounded-lg';

export function ParametriStampaManager({
  nomeSchema,
  codice,
}: {
  nomeSchema: string;
  codice: string;
}) {
  const [p, setP] = useState<ParametriStampa & { logoNome: string | null }>({
    margini: { alto: 15, destro: 15, basso: 15, sinistro: 15 },
    intestazione: null,
    piePagina: null,
    logoDataUrl: null,
    logoNome: null,
  });
  const [errore, setErrore] = useState<string | null>(null);
  const [salvato, setSalvato] = useState(false);

  useEffect(() => {
    ottieniParametriStampaAction(nomeSchema).then((r) => {
      if (r.success) setP(r.parametri);
      else setErrore(r.error ?? 'Lettura non riuscita.');
    });
  }, [nomeSchema]);

  const margine = (k: keyof ParametriStampa['margini'], v: string) => {
    setP({ ...p, margini: { ...p.margini, [k]: Math.max(5, Math.min(40, Number(v) || 0)) } });
    setSalvato(false);
  };
  const caricaLogo = async (f: File) => {
    if (f.size > 300 * 1024) return setErrore('Logo troppo grande: al massimo 300 KB.');
    const dataUrl = await new Promise<string>((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result));
      r.onerror = () => rej(new Error('Lettura non riuscita'));
      r.readAsDataURL(f);
    });
    setP({ ...p, logoDataUrl: dataUrl, logoNome: f.name });
    setErrore(null);
    setSalvato(false);
  };
  const salva = async () => {
    const r = await salvaParametriStampaAction(codice, {
      margini: p.margini,
      intestazione: p.intestazione,
      piePagina: p.piePagina,
      logoDataUrl: p.logoDataUrl,
      logoNome: p.logoNome,
    });
    if (!r.success) return setErrore(r.error ?? 'Errore.');
    impostaParametriStampa(p);
    setErrore(null);
    setSalvato(true);
  };
  const anteprima = () => {
    impostaParametriStampa(p);
    stampaHtml(
      'Anteprima di stampa',
      '<p>Questa pagina mostra intestazione, logo, margini e piè di pagina come verranno applicati a ogni documento dello spazio.</p><table><thead><tr><th>Colonna</th><th>Valore</th></tr></thead><tbody><tr><td>Esempio</td><td class="num">1.234,56 €</td></tr></tbody></table>',
      'Anteprima dei parametri di stampa',
      null
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 border-b border-slate-100 pb-3">
        <Printer className="w-4 h-4 text-blue-600 mt-0.5" />
        <div>
          <h2 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
            Stampa — margini, intestazione, piè di pagina, logo
          </h2>
          <p className="text-[11px] text-slate-600 mt-1">
            Si applicano a ogni documento stampato dallo spazio: Screening, relazioni, riscontri,
            prospetti, note. Il logo compare in testa, accanto all’intestazione; il piè di pagina
            precede il piede tecnico con versione e impronta.
          </p>
        </div>
      </div>
      {errore && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">
          {errore}
        </p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {(['alto', 'destro', 'basso', 'sinistro'] as const).map((k) => (
          <div key={k}>
            <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">
              Margine {k} (mm)
            </label>
            <input
              type="number"
              min={5}
              max={40}
              value={p.margini[k]}
              onChange={(e) => margine(k, e.target.value)}
              className={CAMPO}
            />
          </div>
        ))}
      </div>

      <div>
        <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">
          Intestazione (più righe: denominazione dell’ente, sede, struttura)
        </label>
        <textarea
          rows={3}
          value={p.intestazione ?? ''}
          onChange={(e) => {
            setP({ ...p, intestazione: e.target.value || null });
            setSalvato(false);
          }}
          className={CAMPO}
          placeholder={'INPS — Direzione provinciale di Milano\nPolo Crisi d’Impresa'}
        />
      </div>
      <div>
        <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">
          Piè di pagina
        </label>
        <textarea
          rows={2}
          value={p.piePagina ?? ''}
          onChange={(e) => {
            setP({ ...p, piePagina: e.target.value || null });
            setSalvato(false);
          }}
          className={CAMPO}
          placeholder="Documento interno a uso istruttorio — riproduzione vietata"
        />
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <label className="flex items-center gap-1 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[10px] uppercase rounded-lg cursor-pointer">
          <Upload className="w-3.5 h-3.5" /> Carica il logo (PNG, JPEG, SVG, WEBP, fino a 300 KB)
          <input
            type="file"
            accept="image/png,image/jpeg,image/svg+xml,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) caricaLogo(f);
            }}
          />
        </label>
        {p.logoDataUrl && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={p.logoDataUrl}
              alt="Logo dell’ente"
              className="h-12 max-w-[180px] object-contain border border-slate-200 rounded bg-white p-1"
            />
            <span className="text-[11px] text-slate-600">{p.logoNome}</span>
            <button
              type="button"
              onClick={() => {
                setP({ ...p, logoDataUrl: null, logoNome: null });
                setSalvato(false);
              }}
              className="text-slate-400 hover:text-red-600"
              title="Rimuovi il logo"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={salva}
          className="flex items-center gap-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-[10px] uppercase rounded-lg"
        >
          <Save className="w-3.5 h-3.5" /> Salva
        </button>
        <button
          type="button"
          onClick={anteprima}
          className="flex items-center gap-1 px-3 py-2 bg-white border border-slate-300 text-slate-700 font-bold text-[10px] uppercase rounded-lg"
        >
          <Printer className="w-3.5 h-3.5" /> Anteprima di stampa
        </button>
        {salvato && (
          <span className="text-[11px] text-emerald-700">
            Salvato: vale da subito per tutte le stampe dello spazio.
          </span>
        )}
      </div>
    </div>
  );
}
