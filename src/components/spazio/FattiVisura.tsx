'use client';

// Fatti della visura — estratti una volta dalla visura caricata per lo
// Screening e salvati con l'impronta del documento. Sono DATI (ciascuno
// riferito alla visura) e, dove serve, avvisi che rilevano senza accertare.

import React from 'react';
import { FileText, AlertTriangle } from 'lucide-react';
import { avvisiDaFattiVisura, type FattiVisura as Fatti } from '@/lib/visura/fatti';
import { improntaBreve } from '@/lib/fascicolo/impronta';

interface Props {
  fatti: Fatti | null;
  impronta: string | null;
  nomeFile: string | null;
}

const d = (s: string | null) => (s ? s.split('-').reverse().join('/') : null);

export function FattiVisura({ fatti, impronta, nomeFile }: Props) {
  if (!fatti) return null;
  const avvisi = avvisiDaFattiVisura(fatti, new Date().toISOString().slice(0, 10));
  const voci: [string, string | null][] = [
    ['Denominazione', fatti.denominazione],
    ['Codice fiscale', fatti.codiceFiscale],
    ['Forma giuridica', fatti.formaGiuridica],
    ['Sede legale', fatti.sedeLegale],
    ['Costituzione', d(fatti.dataCostituzione)],
    ['Durata', fatti.durata],
    ['Stato attività', fatti.statoAttivita],
    [
      'Capitale sociale',
      fatti.capitaleSociale === null ? null : `€ ${fatti.capitaleSociale.toLocaleString('it-IT')}`,
    ],
    [
      'Addetti',
      fatti.addetti
        ? `${fatti.addetti.numero}${fatti.addetti.riferimento ? ` (${fatti.addetti.riferimento})` : ''}`
        : null,
    ],
    ['Data della visura', d(fatti.dataVisura)],
  ];

  return (
    <section
      className="bg-white border border-slate-200 rounded-xl p-5 space-y-3"
      aria-label="Fatti della visura"
    >
      <div className="flex items-start justify-between gap-3 flex-wrap border-b border-slate-100 pb-3">
        <div className="flex items-start gap-2">
          <FileText className="w-4 h-4 text-blue-600 mt-0.5" />
          <div>
            <h3 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
              Fatti della visura
            </h3>
            <p className="text-[11px] text-slate-600 mt-0.5">
              Estratti una volta dalla visura e salvati: sono dati riferiti al documento, non
              valutazioni. Da qui in poi l’assistente li riceve come tali, invece di rileggere la
              visura a ogni generazione.
            </p>
          </div>
        </div>
        {nomeFile && (
          <span
            className="text-[10px] text-slate-500"
            title={impronta ? `SHA-256 ${impronta}` : undefined}
          >
            {nomeFile}
            {impronta && (
              <code className="block font-mono text-slate-400">{improntaBreve(impronta)}…</code>
            )}
          </span>
        )}
      </div>

      {avvisi.length > 0 && (
        <ul className="space-y-1.5">
          {avvisi.map((a) => (
            <li
              key={a.codice + a.testo}
              className={`flex gap-2 text-[11px] rounded-lg p-2 border ${a.codice === 'PROCEDURA_PENDENTE' ? 'bg-red-50 border-red-200 text-red-900' : 'bg-amber-50 border-amber-200 text-amber-900'}`}
            >
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>{a.testo}</span>
            </li>
          ))}
        </ul>
      )}

      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
        {voci
          .filter(([, v]) => v !== null)
          .map(([k, v]) => (
            <div key={k} className="flex gap-2">
              <dt className="text-slate-500 w-32 shrink-0">{k}</dt>
              <dd className="text-slate-900">{v}</dd>
            </div>
          ))}
      </dl>

      {fatti.amministratori.length > 0 && (
        <p className="text-xs text-slate-800">
          <span className="text-slate-500">Organi: </span>
          {fatti.amministratori.map((a) => `${a.nome} (${a.carica})`).join('; ')}
        </p>
      )}
      {fatti.procedureConcorsuali.length > 0 && (
        <div className="text-xs">
          <p className="text-slate-500 mb-1">Procedure concorsuali risultanti dalla visura</p>
          <ul className="space-y-0.5">
            {fatti.procedureConcorsuali.map((p, i) => (
              <li key={i} className="text-slate-900">
                {p.tipo}
                {p.data ? ` — ${d(p.data)}` : ''}
                {p.tribunale ? ` — ${p.tribunale}` : ''} — stato «{p.stato ?? 'non indicato'}»
              </li>
            ))}
          </ul>
        </div>
      )}
      {(fatti.trasferimentiSede.length > 0 || fatti.attiRilevanti.length > 0) && (
        <div className="text-xs">
          <p className="text-slate-500 mb-1">Atti e variazioni</p>
          <ul className="space-y-0.5 text-slate-900">
            {fatti.trasferimentiSede.map((t, i) => (
              <li key={`t${i}`}>
                Trasferimento di sede{t.data ? ` del ${d(t.data)}` : ''}: {t.da ?? '?'} →{' '}
                {t.a ?? '?'}
              </li>
            ))}
            {fatti.attiRilevanti.map((a, i) => (
              <li key={`a${i}`}>
                {a.data ? `${d(a.data)} — ` : ''}
                {a.descrizione}
              </li>
            ))}
          </ul>
        </div>
      )}
      {fatti.oggettoSociale && (
        <p className="text-[11px] text-slate-600">
          <span className="text-slate-500">Oggetto sociale: </span>
          {fatti.oggettoSociale}
        </p>
      )}
    </section>
  );
}
