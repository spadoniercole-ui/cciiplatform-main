'use client';

// Pannello «Revisione» — mostra l'esito del revisore a regole su un testo
// generato (Relazione, relazione di Screening, documenti di corredo).
//
// Il revisore e' logica pura e gira qui, nel browser: vale quindi anche per i
// testi generati prima che esistesse. Regola di consegna (Libra E.1): un testo
// con anche un solo controllo in BLOCCO non si esporta. Resta leggibile a
// schermo, con i rilievi in evidenza, perche' chi lavora deve vedere che cosa
// non va per poterlo rigenerare o riscrivere.

import React, { useMemo, useState } from 'react';
import { ShieldCheck, ShieldAlert, ChevronDown, ChevronRight } from 'lucide-react';
import { revisionaTesto, type EsitoControllo, type Revisione } from '@/lib/revisore/revisore';
import { ETICHETTA_GRUPPO, type GruppoControllo } from '@/lib/revisore/catalogo';
import { ETICHETTA_TIPO_OUTPUT, LIVELLI_OUTPUT, type TipoOutput } from '@/lib/revisore/livelli';
import { stampaTesto } from '@/lib/stampaTesto';
import type { Evidenza } from '@/lib/fascicolo/evidenza';

const STILE_ESITO: Record<EsitoControllo, { etichetta: string; classe: string }> = {
  PASS: { etichetta: 'Superato', classe: 'bg-emerald-100 text-emerald-800' },
  BLOCCO: { etichetta: 'Bloccato', classe: 'bg-red-100 text-red-800' },
  SEGNALAZIONE: { etichetta: 'Segnalato', classe: 'bg-amber-100 text-amber-800' },
  CORREZIONE_AUTOMATICA: { etichetta: 'Corretto', classe: 'bg-blue-100 text-blue-800' },
  NON_VERIFICATO: { etichetta: 'Non verificato', classe: 'bg-slate-200 text-slate-600' },
};

export function useRevisione(
  testo: string | null | undefined,
  tipo: TipoOutput,
  fascicolo?: Evidenza[] | null
): Revisione | null {
  return useMemo(
    () => (testo && testo.trim() ? revisionaTesto(testo, tipo, { fascicolo }) : null),
    [testo, tipo, fascicolo]
  );
}

/**
 * Esporta in PDF solo un testo consegnabile, e nella versione RIVISTA
 * (intestazione di livello, sostituzioni, qualificazioni in calce).
 * Restituisce false se il testo e' bloccato.
 */
export function stampaSeConsegnabile(
  tipo: TipoOutput,
  titolo: string,
  testo: string,
  dataGenerazione: string | null,
  fascicolo?: Evidenza[] | null
): boolean {
  const revisione = revisionaTesto(testo, tipo, { fascicolo });
  if (!revisione.consegnabile) {
    window.alert(
      `Esportazione bloccata dal revisore: ${revisione.conteggi.BLOCCO} ${revisione.conteggi.BLOCCO === 1 ? 'controllo è' : 'controlli sono'} in stato «Bloccato». Apri il pannello Revisione per vedere i rilievi, poi rigenera o correggi il testo.`
    );
    return false;
  }
  stampaTesto(titolo, revisione.testoRivisto, dataGenerazione);
  return true;
}

interface Props {
  testo: string | null | undefined;
  tipo: TipoOutput;
  /** Se presente, il revisore riconcilia gli importi del testo con il fascicolo (REV-010). */
  fascicolo?: Evidenza[] | null;
}

export function RevisioneTesto({ testo, tipo, fascicolo }: Props) {
  const revisione = useRevisione(testo, tipo, fascicolo);
  const [aperto, setAperto] = useState(false);
  const [mostraNonVerificati, setMostraNonVerificati] = useState(false);
  if (!revisione) return null;

  const livello = LIVELLI_OUTPUT[revisione.livello];
  const { conteggi } = revisione;
  const daMostrare = revisione.risultati.filter(
    (r) => r.esito !== 'PASS' && (mostraNonVerificati || r.esito !== 'NON_VERIFICATO')
  );
  const gruppi = Array.from(
    new Set(daMostrare.map((r) => r.controllo.gruppo))
  ) as GruppoControllo[];
  const espanso = aperto || !revisione.consegnabile;

  return (
    <section
      className={`border rounded-xl p-4 space-y-3 ${revisione.consegnabile ? 'bg-white border-slate-200' : 'bg-red-50 border-red-300'}`}
      aria-label="Revisione del testo"
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-2">
          {revisione.consegnabile ? (
            <ShieldCheck className="w-4 h-4 text-emerald-600 mt-0.5" />
          ) : (
            <ShieldAlert className="w-4 h-4 text-red-600 mt-0.5" />
          )}
          <div>
            <h3 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
              Revisione — {ETICHETTA_TIPO_OUTPUT[tipo]}
            </h3>
            <p className="text-[11px] text-slate-600 mt-0.5">
              {revisione.consegnabile
                ? 'Nessun controllo bloccante: il testo si può esportare, nella versione rivista.'
                : 'Testo non consegnabile: l’esportazione è bloccata finché restano controlli in stato «Bloccato». Rigenera o correggi il testo.'}
            </p>
          </div>
        </div>
        <span
          className="text-[9px] font-bold uppercase tracking-wider text-slate-600 bg-slate-100 rounded px-2 py-1"
          title={`${livello.esitoConsentito} — Dati richiesti: ${livello.datiRichiesti}`}
        >
          Livello {livello.livello} — {livello.nome}
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(STILE_ESITO) as EsitoControllo[]).map((e) =>
          conteggi[e] > 0 ? (
            <span
              key={e}
              className={`text-[10px] font-bold uppercase rounded px-2 py-1 ${STILE_ESITO[e].classe}`}
            >
              {STILE_ESITO[e].etichetta}: {conteggi[e]}
            </span>
          ) : null
        )}
      </div>

      <button
        type="button"
        onClick={() => setAperto((v) => !v)}
        className="flex items-center gap-1 text-[10px] font-bold uppercase text-slate-500 hover:text-blue-700"
      >
        {espanso ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        Dettaglio dei controlli
      </button>

      {espanso && (
        <div className="space-y-3">
          {gruppi.length === 0 && (
            <p className="text-[11px] text-slate-500">Tutti i controlli eseguiti sono superati.</p>
          )}
          {gruppi.map((g) => (
            <div key={g}>
              <h4 className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                {ETICHETTA_GRUPPO[g]}
              </h4>
              <ul className="space-y-1.5">
                {daMostrare
                  .filter((r) => r.controllo.gruppo === g)
                  .map((r) => (
                    <li
                      key={r.controllo.id}
                      className="bg-white border border-slate-200 rounded p-2"
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <code className="font-mono text-[10px] text-slate-500">
                          {r.controllo.id}
                        </code>
                        <span
                          className={`text-[9px] font-bold uppercase rounded px-1.5 py-0.5 ${STILE_ESITO[r.esito].classe}`}
                        >
                          {STILE_ESITO[r.esito].etichetta}
                        </span>
                        <span className="text-[11px] text-slate-800">{r.controllo.verifica}</span>
                      </div>
                      <p className="text-[11px] text-slate-600 mt-1">{r.messaggio}</p>
                      {r.rilievi.map((ril, i) => (
                        <div key={i} className="mt-1 pl-2 border-l-2 border-slate-200">
                          <p className="text-[11px] text-slate-700">
                            <strong>«{ril.trovato}»</strong> — …{ril.contesto}…
                          </p>
                          <p className="text-[10px] text-slate-500">{ril.nota}</p>
                        </div>
                      ))}
                    </li>
                  ))}
              </ul>
            </div>
          ))}
          <label className="flex items-center gap-2 text-[11px] text-slate-600">
            <input
              type="checkbox"
              checked={mostraNonVerificati}
              onChange={(e) => setMostraNonVerificati(e.target.checked)}
            />
            Mostra anche i {conteggi.NON_VERIFICATO} controlli che la piattaforma non è ancora in
            grado di eseguire (restano a carico della revisione professionale).
          </label>
        </div>
      )}
    </section>
  );
}
