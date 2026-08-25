'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Scale, ExternalLink, AlertTriangle, Info, Printer, RefreshCw } from 'lucide-react';
import { calcolaRiscontriNormativiAzienda } from '@/app/actions/screeningAzienda';
import type { Riscontri, EsitoSoglia } from '@/lib/normativa/riscontri';
import { linkNormativaArticolo } from '@/lib/normativa/riferimenti';
import { stampaHtml } from '@/lib/stampaTesto';

interface Props {
  nomeSchema: string;
  aziendaId: number;
  codice: string;
  ragioneSociale?: string;
}

const euro = (n: number | null) =>
  n === null
    ? '—'
    : n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

function BadgeEsito({ esito }: { esito: EsitoSoglia }) {
  const map: Record<EsitoSoglia, { txt: string; cls: string }> = {
    sopra: { txt: 'Oltre soglia', cls: 'bg-red-50 text-red-700 border-red-200' },
    sotto: { txt: 'Sotto soglia', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    non_disponibile: { txt: 'Da verificare', cls: 'bg-slate-50 text-slate-500 border-slate-200' },
  };
  const s = map[esito];
  return (
    <span
      className={`inline-block text-[9px] font-bold uppercase tracking-wider border rounded px-1.5 py-0.5 whitespace-nowrap ${s.cls}`}
    >
      {s.txt}
    </span>
  );
}

const CAT_LABEL: Record<string, string> = {
  soglia: 'Soglia',
  indicatore: 'Indicatore',
  leva: 'Leva',
};
const CAT_CLS: Record<string, string> = {
  soglia: 'bg-blue-50 text-blue-700 border-blue-200',
  indicatore: 'bg-amber-50 text-amber-700 border-amber-200',
  leva: 'bg-violet-50 text-violet-700 border-violet-200',
};

export function RiscontriNormativi({ nomeSchema, aziendaId, codice, ragioneSociale }: Props) {
  const [dati, setDati] = useState<Riscontri | null>(null);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);

  const carica = async () => {
    setCaricamento(true);
    setErrore(null);
    const r = await calcolaRiscontriNormativiAzienda(nomeSchema, aziendaId);
    if (r.success && r.riscontri) setDati(r.riscontri);
    else setErrore(r.error || 'Calcolo non riuscito.');
    setCaricamento(false);
  };

  useEffect(() => {
    carica();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nomeSchema, aziendaId]);

  const stampa = () => {
    if (!dati) return;
    const rigaSoglia = (s: Riscontri['soglie'][number]) =>
      `<tr><td>${s.parametro}</td><td class="num">${euro(s.valoreRilevato)}</td><td>${s.soglia}</td><td>${
        s.esito === 'sopra'
          ? 'OLTRE SOGLIA'
          : s.esito === 'sotto'
            ? 'sotto soglia'
            : 'da verificare'
      }</td><td>${s.fonte}${s.cautela ? `<br><em style="color:#94a3b8">${s.cautela}</em>` : ''}</td></tr>`;
    const corpo = `
      <h2 style="font-size:14px">Articoli movimentati</h2>
      <ul>${dati.articoli
        .map(
          (a) =>
            `<li><strong>Art. ${a.numero}</strong> (${CAT_LABEL[a.categoria]}): ${a.motivo}</li>`
        )
        .join('')}</ul>
      <h2 style="font-size:14px">Soglie verificate</h2>
      <table><thead><tr><th>Parametro</th><th>Valore rilevato</th><th>Soglia</th><th>Esito</th><th>Fonte / cautela</th></tr></thead>
      <tbody>${dati.soglie.map(rigaSoglia).join('')}</tbody></table>
      ${
        dati.indicatori.length
          ? `<h2 style="font-size:14px">Indicatori di crisi</h2><ul>${dati.indicatori
              .map(
                (i) => `<li><strong>${i.nome}</strong> — ${i.dettaglio} (art. ${i.articolo})</li>`
              )
              .join('')}</ul>`
          : ''
      }
      ${
        dati.datiMancanti.length
          ? `<h2 style="font-size:14px">Cosa non è stato verificato automaticamente</h2><ul>${dati.datiMancanti
              .map((d) => `<li>${d}</li>`)
              .join('')}</ul>`
          : ''
      }
      <p class="note">Calcolo deterministico sui dati disponibili. Non costituisce parere legale; per l'uso ufficiale fa fede il testo su Normattiva.</p>`;
    stampaHtml(
      `Riscontri normativi${ragioneSociale ? ` — ${ragioneSociale}` : ''}`,
      corpo,
      'Articoli e soglie movimentati dall’analisi (calcolo automatico)'
    );
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-3">
        <div className="flex items-center gap-2">
          <Scale className="w-4 h-4 text-slate-500" />
          <h3 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
            Riscontri normativi
          </h3>
          <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-600 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5">
            Calcolo automatico
          </span>
        </div>
        {dati && !caricamento && (
          <button
            type="button"
            onClick={stampa}
            className="flex items-center gap-1 px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[9px] uppercase rounded transition-colors"
            title="Apre la stampa dei riscontri — da lì puoi salvare come PDF"
          >
            <Printer className="w-3 h-3" /> Stampa / PDF
          </button>
        )}
      </div>

      <p className="text-[11px] text-slate-500 mb-4">
        Articoli e soglie «movimentati» dall’analisi, individuati in modo{' '}
        <strong>deterministico</strong> sui dati reali (bilancio XBRL, posizione ente, V.E.R.A.):
        nessuna inferenza dell’AI, solo aritmetica sulle soglie di legge.
      </p>

      {caricamento && (
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Calcolo in corso…
        </div>
      )}

      {errore && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          {errore}
        </div>
      )}

      {dati && !caricamento && (
        <div className="space-y-5">
          {/* Articoli movimentati */}
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
              Articoli movimentati
            </div>
            {dati.articoli.length === 0 ? (
              <p className="text-xs text-slate-400">
                Nessun articolo movimentato dai dati disponibili.
              </p>
            ) : (
              <div className="space-y-2">
                {dati.articoli.map((a, i) => (
                  <div
                    key={`${a.numero}-${i}`}
                    className="flex items-start gap-2.5 border border-slate-100 rounded-lg p-2.5"
                  >
                    <Link
                      href={linkNormativaArticolo(codice, a.numero)}
                      className="shrink-0 text-[11px] font-bold text-blue-700 bg-blue-50 border border-blue-200 rounded px-2 py-1 hover:bg-blue-100 transition-colors whitespace-nowrap"
                    >
                      Art. {a.numero}
                    </Link>
                    <div className="min-w-0">
                      <span
                        className={`inline-block text-[8px] font-bold uppercase tracking-wider border rounded px-1.5 py-0.5 mb-1 ${CAT_CLS[a.categoria]}`}
                      >
                        {CAT_LABEL[a.categoria]}
                      </span>
                      <p className="text-[11px] text-slate-600 leading-relaxed">{a.motivo}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Soglie verificate */}
          {dati.soglie.length > 0 && (
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                Soglie verificate
                {dati.impresaMinore !== null && (
                  <span className="ml-2 normal-case tracking-normal text-slate-500">
                    · Profilo{' '}
                    <strong>
                      {dati.impresaMinore
                        ? 'impresa minore'
                        : 'oltre le soglie dell’impresa minore'}
                    </strong>
                  </span>
                )}
              </div>
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-50 text-left text-[10px] uppercase tracking-wider text-slate-500">
                        <th className="px-3 py-2 font-bold">Parametro</th>
                        <th className="px-3 py-2 font-bold text-right">Rilevato</th>
                        <th className="px-3 py-2 font-bold">Soglia di legge</th>
                        <th className="px-3 py-2 font-bold">Esito</th>
                        <th className="px-3 py-2 font-bold whitespace-nowrap">Art.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {dati.soglie.map((s, i) => (
                        <tr key={i} className="align-top">
                          <td className="px-3 py-2.5">
                            <div className="font-semibold text-slate-800">{s.parametro}</div>
                            <div className="text-[10px] text-slate-400 mt-0.5">{s.fonte}</div>
                            {s.cautela && (
                              <div className="text-[10px] text-amber-700 bg-amber-50 border border-amber-100 rounded px-1.5 py-1 mt-1 flex items-start gap-1">
                                <Info className="w-3 h-3 shrink-0 mt-0.5" />
                                <span>{s.cautela}</span>
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2.5 font-mono font-bold text-slate-900 text-right whitespace-nowrap">
                            {euro(s.valoreRilevato)}
                          </td>
                          <td className="px-3 py-2.5 text-slate-600 leading-relaxed">{s.soglia}</td>
                          <td className="px-3 py-2.5">
                            <BadgeEsito esito={s.esito} />
                          </td>
                          <td className="px-3 py-2.5">
                            <Link
                              href={linkNormativaArticolo(codice, s.articolo)}
                              className="text-[10px] font-bold text-blue-600 border border-blue-200 rounded px-1.5 py-0.5 hover:bg-blue-50 whitespace-nowrap"
                            >
                              {s.articolo}
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Indicatori di crisi */}
          {dati.indicatori.length > 0 && (
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                Indicatori di crisi rilevati
              </div>
              <div className="space-y-1.5">
                {dati.indicatori.map((ind, i) => (
                  <div key={i} className="flex items-start gap-2 text-[11px]">
                    <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-amber-500 mt-1.5" />
                    <span className="text-slate-700">
                      <strong>{ind.nome}</strong> — {ind.dettaglio}{' '}
                      <Link
                        href={linkNormativaArticolo(codice, ind.articolo)}
                        className="text-blue-600 hover:underline font-semibold"
                      >
                        art. {ind.articolo}
                      </Link>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Dati mancanti / trasparenza */}
          {dati.datiMancanti.length > 0 && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                <Info className="w-3.5 h-3.5" /> Cosa non è stato verificato automaticamente
              </div>
              <ul className="space-y-1">
                {dati.datiMancanti.map((d, i) => (
                  <li key={i} className="text-[11px] text-slate-500 leading-relaxed">
                    • {d}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="pt-2 border-t border-slate-100">
            <a
              href="https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legislativo:2019-01-12;14"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[10px] text-slate-400 hover:text-blue-600"
            >
              <ExternalLink className="w-3 h-3" /> Calcolo a fini operativi; per l’uso ufficiale fa
              fede Normattiva.
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
