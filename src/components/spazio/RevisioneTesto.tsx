'use client';

// Pannello «Revisione» — mostra l'esito del revisore a regole su un testo
// generato (Relazione, relazione di Screening, documenti di corredo).
//
// Il revisore e' logica pura e gira qui, nel browser: vale quindi anche per i
// testi generati prima che esistesse. Regola di consegna (Libra E.1): un testo
// con anche un solo controllo in BLOCCO non si esporta. Resta leggibile a
// schermo, con i rilievi in evidenza, perche' chi lavora deve vedere che cosa
// non va per poterlo rigenerare o riscrivere.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ShieldCheck, ShieldAlert, ChevronDown, ChevronRight } from 'lucide-react';
import { revisionaTesto, type EsitoControllo, type Revisione } from '@/lib/revisore/revisore';
import { ETICHETTA_GRUPPO, type GruppoControllo } from '@/lib/revisore/catalogo';
import { ETICHETTA_TIPO_OUTPUT, LIVELLI_OUTPUT, type TipoOutput } from '@/lib/revisore/livelli';
import { stampaTesto, stampaHtml } from '@/lib/stampaTesto';
import type { Evidenza } from '@/lib/fascicolo/evidenza';
import { appendiceRilievi } from '@/lib/revisore/correzione';

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
 * Esporta in PDF la versione RIVISTA del testo (intestazione di livello,
 * sostituzioni, qualificazioni) e, in calce, i rilievi rimasti. Non blocca
 * mai: un rilievo su un testo che l'utente non puo' modificare sarebbe lavoro
 * sprecato (regola di Ercole); le informazioni del revisore stanno DENTRO il
 * documento. Il nome resta per non toccare i chiamanti.
 */
export function stampaSeConsegnabile(
  tipo: TipoOutput,
  titolo: string,
  testo: string,
  dataGenerazione: string | null,
  fascicolo?: Evidenza[] | null
): boolean {
  const revisione = revisionaTesto(testo, tipo, { fascicolo });
  stampaTesto(titolo, revisione.testoRivisto + appendiceRilievi(revisione), dataGenerazione);
  return true;
}

/**
 * Come stampaSeConsegnabile, ma con una COPERTINA in HTML davanti (l'Indice di
 * Attenzione Istruttoria) e il testo rivisto a seguire, su pagina nuova.
 */
export function stampaConCopertina(
  tipo: TipoOutput,
  titolo: string,
  copertinaHtml: string,
  testo: string,
  dataGenerazione: string | null,
  fascicolo?: Evidenza[] | null,
  /** Allegato in coda (es. nota metodologica); vuoto = nessuno. */
  allegatoHtml = ''
): void {
  const revisione = revisionaTesto(testo, tipo, { fascicolo });
  // Con l'allegato «Riferimenti e metodo» i rilievi residui stanno li', non in calce al testo.
  const corpo = (
    allegatoHtml ? revisione.testoRivisto : revisione.testoRivisto + appendiceRilievi(revisione)
  )
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  stampaHtml(
    titolo,
    `${copertinaHtml}<div style="page-break-before:always"></div><h2 style="font-size:14px">Relazione</h2><div style="white-space:pre-wrap;font-size:12px;line-height:1.5">${corpo}</div>${allegatoHtml ? `<div style="page-break-before:always"></div>${allegatoHtml}` : ''}`,
    undefined,
    dataGenerazione
  );
}

export const EVENTO_ESPORTAZIONE_BLOCCATA = 'ccii:esportazione-bloccata';
export interface EventoEsportazioneBloccata {
  testo: string;
  tipo: TipoOutput;
  blocchi: number;
}

/**
 * Dove si trova il pannello Revisione, nelle parole dell'interfaccia. Chi
 * conosce l'applicativo lo sa; chi e' alle prime armi ha bisogno del percorso,
 * e darlo non costa nulla.
 */
const PERCORSO_PANNELLO: Record<TipoOutput, string> = {
  RELAZIONE_SCENARIO:
    'Scenari › apri lo scenario › scheda «Relazione» › riquadro «Revisione», subito sopra il testo della relazione.',
  RELAZIONE_SCREENING:
    'Verifica salute azienda › apri l’azienda › scheda «Screening» › riquadro «Revisione», subito sopra la relazione di Screening.',
  DOCUMENTO_CORREDO:
    'Scenari › apri lo scenario › scheda «Proposta» › sezione «Documenti di corredo» › riquadro «Revisione», sopra la bozza del documento.',
  ANALISI_PROPOSTA:
    'Scenari › apri lo scenario › scheda «Proposta» › riquadro «Revisione», sopra l’analisi.',
};

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
  const [avvisoBlocchi, setAvvisoBlocchi] = useState<number | null>(null);
  const riferimento = useRef<HTMLElement>(null);

  useEffect(() => {
    const ascolta = (e: Event) => {
      const d = (e as CustomEvent<EventoEsportazioneBloccata>).detail;
      if (d.tipo === tipo && d.testo === testo) setAvvisoBlocchi(d.blocchi);
    };
    window.addEventListener(EVENTO_ESPORTAZIONE_BLOCCATA, ascolta);
    return () => window.removeEventListener(EVENTO_ESPORTAZIONE_BLOCCATA, ascolta);
  }, [tipo, testo]);

  if (!revisione) return null;

  const vaiAiRilievi = () => {
    setAvvisoBlocchi(null);
    setAperto(true);
    riferimento.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

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
      ref={riferimento}
      className={`border rounded-xl p-4 space-y-3 ${revisione.consegnabile ? 'bg-white border-slate-200' : 'bg-amber-50 border-amber-300'}`}
      aria-label="Revisione del testo"
    >
      {avvisoBlocchi !== null && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-label="Esportazione non disponibile"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
        >
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5 space-y-3">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-red-600" />
              <h4 className="font-bold text-slate-900 text-sm">Esportazione non disponibile</h4>
            </div>
            <p className="text-xs text-slate-700 leading-relaxed">
              Il PDF non può essere generato:{' '}
              {avvisoBlocchi === 1
                ? 'un controllo del revisore è'
                : `${avvisoBlocchi} controlli del revisore sono`}{' '}
              in stato «Bloccato». Il testo resta leggibile a schermo, ma non può uscire
              dall’applicativo finché i rilievi non sono risolti.
            </p>
            <div className="text-xs text-slate-700 leading-relaxed space-y-1">
              <p className="font-bold text-slate-900">Che cosa fare</p>
              <ol className="list-decimal pl-5 space-y-1">
                <li>
                  Apri il riquadro «Revisione» e leggi i rilievi contrassegnati «Bloccato».
                  Percorso: {PERCORSO_PANNELLO[tipo]}
                </li>
                <li>
                  Rigenera il testo con il pulsante «Rigenera» (o «Genera») dello stesso riquadro in
                  cui si trova il testo, oppure correggilo dove l’applicativo lo consente.
                </li>
                <li>
                  Quando nel riquadro «Revisione» non restano controlli «Bloccato», il pulsante di
                  esportazione produce il PDF.
                </li>
              </ol>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setAvvisoBlocchi(null)}
                className="px-3 py-2 text-[10px] font-bold uppercase text-slate-600 hover:text-slate-900"
              >
                Chiudi
              </button>
              <button
                type="button"
                onClick={vaiAiRilievi}
                className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-bold uppercase rounded-lg"
              >
                Vai ai rilievi
              </button>
            </div>
          </div>
        </div>
      )}
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
                ? 'Nessun rilievo da risolvere: il PDF esce nella versione rivista.'
                : 'Restano rilievi da risolvere: il PDF esce comunque, nella versione rivista e con i rilievi riportati in calce, come parte del documento. Rigenerare il testo fa ripartire la correzione automatica.'}
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
