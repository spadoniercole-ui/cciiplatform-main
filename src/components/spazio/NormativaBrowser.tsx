'use client';

import React, { useMemo, useState } from 'react';
import {
  BookOpen,
  Search,
  ExternalLink,
  Lightbulb,
  Sigma,
  AlertTriangle,
  ScrollText,
  ListChecks,
  Info,
} from 'lucide-react';
import {
  ARTICOLI,
  GLOSSARIO,
  SOGLIE,
  DECRETO_ATTUATIVO,
  type ArticoloNormativa,
} from '@/lib/normativa/dati';

type Scheda = 'articoli' | 'glossario' | 'soglie';

interface Props {
  /** Numero articolo da preselezionare (deep-link dai report: ?art=25-novies). */
  articoloIniziale?: string;
  /** Termine di glossario da preselezionare (?voce=...). */
  voceIniziale?: string;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

export function NormativaBrowser({ articoloIniziale, voceIniziale }: Props) {
  const schedaIniziale: Scheda = voceIniziale ? 'glossario' : 'articoli';
  const [scheda, setScheda] = useState<Scheda>(schedaIniziale);
  const [ricerca, setRicerca] = useState('');

  const articoloDefault =
    (articoloIniziale && ARTICOLI.find((a) => a.numero === articoloIniziale)?.numero) ||
    ARTICOLI[0]?.numero ||
    '';
  const [articoloSel, setArticoloSel] = useState<string>(articoloDefault);
  const voceSel = voceIniziale || '';

  const articoliFiltrati = useMemo(() => {
    const q = norm(ricerca.trim());
    if (!q) return ARTICOLI;
    return ARTICOLI.filter((a) =>
      norm(`${a.numero} ${a.rubrica} ${a.testo} ${a.inParoleSemplici || ''}`).includes(q)
    );
  }, [ricerca]);

  const glossarioFiltrato = useMemo(() => {
    const q = norm(ricerca.trim());
    if (!q) return GLOSSARIO;
    return GLOSSARIO.filter((v) =>
      norm(`${v.termine} ${v.sigla || ''} ${v.definizione} ${v.esempio}`).includes(q)
    );
  }, [ricerca]);

  const articolo: ArticoloNormativa | undefined =
    ARTICOLI.find((a) => a.numero === articoloSel) || articoliFiltrati[0];

  const vaiAdArticolo = (numero: string) => {
    setScheda('articoli');
    setRicerca('');
    setArticoloSel(numero);
  };

  return (
    <div className="space-y-5 max-w-6xl">
      <div className="flex items-start gap-3">
        <div className="inline-flex p-2 rounded-lg bg-blue-50 text-blue-600 shrink-0">
          <BookOpen className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Normativa CCII</h1>
          <p className="text-slate-500 text-xs mt-1">
            Codice della crisi d&apos;impresa e dell&apos;insolvenza (D.Lgs. 14/2019) e decreti
            attuativi: articoli chiave della composizione negoziata, glossario e soglie ufficiali.
          </p>
        </div>
      </div>

      <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
        <span>
          Strumento di consultazione a fini divulgativi e operativi. Il testo qui riportato è tratto
          da fonti pubbliche autorevoli e allineato ai correttivi vigenti, ma{' '}
          <strong>non costituisce testo legale vincolante</strong>: per l&apos;uso ufficiale fa fede
          il testo pubblicato su{' '}
          <a
            href="https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legislativo:2019-01-12;14"
            target="_blank"
            rel="noopener noreferrer"
            className="underline font-semibold"
          >
            Normattiva
          </a>
          .
        </span>
      </div>

      {/* Schede */}
      <div className="flex items-center gap-1 border-b border-slate-200">
        {(
          [
            { id: 'articoli', label: 'Articoli', icon: ScrollText },
            { id: 'glossario', label: 'Glossario', icon: Lightbulb },
            { id: 'soglie', label: 'Soglie & Parametri', icon: ListChecks },
          ] as { id: Scheda; label: string; icon: typeof ScrollText }[]
        ).map((t) => {
          const Icon = t.icon;
          const attivo = scheda === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setScheda(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold border-b-2 -mb-px transition-colors ${
                attivo
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Ricerca (articoli e glossario) */}
      {scheda !== 'soglie' && (
        <div className="relative max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={ricerca}
            onChange={(e) => setRicerca(e.target.value)}
            placeholder={
              scheda === 'articoli' ? 'Cerca per articolo o parola…' : 'Cerca un termine…'
            }
            className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
        </div>
      )}

      {/* ARTICOLI */}
      {scheda === 'articoli' && (
        <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-5">
          <div className="border border-slate-200 rounded-xl overflow-hidden self-start">
            <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              {articoliFiltrati.length} articoli
            </div>
            <div className="max-h-[60vh] overflow-y-auto divide-y divide-slate-100">
              {articoliFiltrati.map((a) => {
                const attivo = articolo?.numero === a.numero;
                return (
                  <button
                    key={a.numero}
                    onClick={() => setArticoloSel(a.numero)}
                    className={`w-full text-left px-3 py-2.5 transition-colors ${
                      attivo ? 'bg-blue-50' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div
                      className={`text-xs font-bold ${attivo ? 'text-blue-700' : 'text-slate-800'}`}
                    >
                      Art. {a.numero}
                    </div>
                    <div className="text-[11px] text-slate-500 leading-snug mt-0.5">
                      {a.rubrica}
                    </div>
                  </button>
                );
              })}
              {articoliFiltrati.length === 0 && (
                <div className="px-3 py-4 text-[11px] text-slate-400">Nessun articolo trovato.</div>
              )}
            </div>
          </div>

          {articolo && (
            <article className="border border-slate-200 rounded-xl p-5 bg-white">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                {articolo.capo}
              </div>
              <h2 className="text-base font-bold text-slate-900 mt-1">
                Art. {articolo.numero} — {articolo.rubrica}
              </h2>

              {articolo.inParoleSemplici && (
                <div className="mt-3 bg-blue-50 border border-blue-100 rounded-lg p-3">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-blue-700 mb-1">
                    <Lightbulb className="w-3.5 h-3.5" /> In parole semplici
                  </div>
                  <p className="text-xs text-slate-700 leading-relaxed">
                    {articolo.inParoleSemplici}
                  </p>
                  {articolo.esempio && (
                    <p className="text-xs text-slate-600 leading-relaxed mt-2">
                      <span className="font-semibold text-slate-700">Esempio.</span>{' '}
                      {articolo.esempio}
                    </p>
                  )}
                </div>
              )}

              {articolo.soglie && (
                <div className="mt-3 bg-emerald-50 border border-emerald-100 rounded-lg p-3">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700 mb-1">
                    <ListChecks className="w-3.5 h-3.5" /> Soglie e valori
                  </div>
                  <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">
                    {articolo.soglie}
                  </p>
                </div>
              )}

              <div className="mt-4">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Testo dell&apos;articolo
                </div>
                <div className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">
                  {articolo.testo}
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100">
                <a
                  href={articolo.fonteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:underline"
                >
                  <ExternalLink className="w-3 h-3" /> Fonte del testo
                </a>
              </div>
            </article>
          )}
        </div>
      )}

      {/* GLOSSARIO */}
      {scheda === 'glossario' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {glossarioFiltrato.map((v) => {
            const evidenziata = voceSel && norm(voceSel) === norm(v.termine);
            return (
              <div
                key={v.termine}
                className={`border rounded-xl p-4 bg-white ${
                  evidenziata ? 'border-blue-300 ring-2 ring-blue-100' : 'border-slate-200'
                }`}
              >
                <div className="flex items-baseline gap-2">
                  <h3 className="text-sm font-bold text-slate-900">{v.termine}</h3>
                  {v.sigla && (
                    <span className="text-[10px] font-mono font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                      {v.sigla}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-700 leading-relaxed mt-1.5">{v.definizione}</p>
                {v.formula && (
                  <div className="mt-2 flex items-start gap-1.5 text-[11px] text-slate-600 bg-slate-50 border border-slate-100 rounded p-2 font-mono">
                    <Sigma className="w-3.5 h-3.5 shrink-0 mt-0.5 text-slate-400" />
                    <span>{v.formula}</span>
                  </div>
                )}
                <p className="text-[11px] text-slate-600 leading-relaxed mt-2">
                  <span className="font-semibold text-slate-700">Esempio.</span> {v.esempio}
                </p>
                {v.articoliCorrelati && v.articoliCorrelati.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">
                      Vedi:
                    </span>
                    {v.articoliCorrelati.map((n) => (
                      <button
                        key={n}
                        onClick={() => vaiAdArticolo(n)}
                        className="text-[10px] font-bold text-blue-600 border border-blue-200 rounded px-1.5 py-0.5 hover:bg-blue-50"
                      >
                        Art. {n}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {glossarioFiltrato.length === 0 && (
            <div className="text-[11px] text-slate-400">Nessun termine trovato.</div>
          )}
        </div>
      )}

      {/* SOGLIE */}
      {scheda === 'soglie' && (
        <div className="space-y-4">
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 text-left text-[10px] uppercase tracking-wider text-slate-500">
                    <th className="px-3 py-2 font-bold">Ambito</th>
                    <th className="px-3 py-2 font-bold">Soglia / valore</th>
                    <th className="px-3 py-2 font-bold">Dettaglio</th>
                    <th className="px-3 py-2 font-bold whitespace-nowrap">Rif.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {SOGLIE.map((s, i) => (
                    <tr key={i} className="hover:bg-slate-50 align-top">
                      <td className="px-3 py-2.5 font-semibold text-slate-800">{s.ambito}</td>
                      <td className="px-3 py-2.5 font-mono font-bold text-emerald-700 whitespace-nowrap">
                        {s.valore}
                      </td>
                      <td className="px-3 py-2.5 text-slate-600 leading-relaxed">
                        {s.descrizione}
                      </td>
                      <td className="px-3 py-2.5">
                        <button
                          onClick={() => vaiAdArticolo(s.riferimento)}
                          className="text-[10px] font-bold text-blue-600 border border-blue-200 rounded px-1.5 py-0.5 hover:bg-blue-50 whitespace-nowrap"
                        >
                          Art. {s.riferimento}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <p className="text-[10px] text-slate-400 flex items-center gap-1.5">
            <Info className="w-3 h-3" /> Soglie delle segnalazioni dei creditori pubblici
            qualificati (art. 25-novies) e parametri dell&apos;impresa minore (art. 2). Verificare
            sempre gli aggiornamenti su Normattiva.
          </p>
        </div>
      )}

      {/* Decreto attuativo */}
      <div className="border border-slate-200 rounded-xl p-4 bg-white">
        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
          <ScrollText className="w-3.5 h-3.5" /> Decreto attuativo
        </div>
        <h3 className="text-xs font-bold text-slate-800">{DECRETO_ATTUATIVO.titolo}</h3>
        <p className="text-[11px] text-slate-600 leading-relaxed mt-1.5">
          {DECRETO_ATTUATIVO.contenuto}
        </p>
        <a
          href={DECRETO_ATTUATIVO.fonteUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:underline mt-2"
        >
          <ExternalLink className="w-3 h-3" /> Fonte
        </a>
      </div>
    </div>
  );
}
