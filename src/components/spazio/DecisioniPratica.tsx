'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, PenLine } from 'lucide-react';
import { registraDecisionePraticaAction } from '@/app/actions/posizionePratica';
import {
  ESITI_DECISIONE,
  MOTIVAZIONE_MINIMA,
  riassuntoDecisione,
  type Decisione,
  type EsitoDecisione,
} from '@/lib/posizionePratica/decisioni';

// LA DECISIONE SI REGISTRA, NON SI SALVA IL GIUDIZIO (0.242.0).
//
// Il modulo non propone un esito «giusto»: chiede che cosa si fa e perché.
// Gli esiti sono quattro e nessuno è preselezionato: la piattaforma non
// decide, e un default sarebbe già una raccomandazione.
//
// Chi decide non si scrive (0.242.3): l'autore è l'utente della sessione. Il
// modulo lo mostra e basta; l'azione lo rilegge dal server, perché un campo
// del browser non è una firma.

function dataOra(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.toLocaleDateString('it-IT')} ${d.toLocaleTimeString('it-IT', {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

export function DecisioniPratica({
  nomeSchema,
  aziendaId,
  decisioni,
  credito,
  copertura,
  autore,
}: {
  nomeSchema: string;
  aziendaId: number;
  decisioni: Decisione[];
  credito: number | null;
  copertura: string | null;
  /** L'utente della sessione: la decisione si firma con questo nome. */
  autore: string | null;
}) {
  const router = useRouter();
  const [esito, setEsito] = useState<'' | EsitoDecisione>('');
  const [motivazione, setMotivazione] = useState('');
  const [errore, setErrore] = useState<string | null>(null);
  const [inCorso, setInCorso] = useState(false);

  async function registra() {
    setErrore(null);
    if (!esito) {
      setErrore('Scegli che cosa si fa.');
      return;
    }
    setInCorso(true);
    const risposta = await registraDecisionePraticaAction(nomeSchema, aziendaId, {
      esito,
      motivazione,
      credito,
      copertura,
    });
    setInCorso(false);
    if (!risposta.success) {
      setErrore(risposta.error ?? 'Decisione non registrata.');
      return;
    }
    setMotivazione('');
    setEsito('');
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
        <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
          Registra una decisione
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-600">
              Che cosa si fa
            </span>
            <select
              value={esito}
              onChange={(e) => setEsito(e.target.value as EsitoDecisione)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[12px] text-slate-800"
            >
              <option value="">— scegli —</option>
              {ESITI_DECISIONE.map((e) => (
                <option key={e.codice} value={e.codice}>
                  {e.etichetta}
                </option>
              ))}
            </select>
          </label>
          <div>
            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-600">
              Chi decide
            </span>
            <p className="mt-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] text-slate-800">
              {autore ?? 'sessione senza nome'}
            </p>
            <p className="mt-1 text-[10px] text-slate-500">
              {autore
                ? 'La firma è l’utente con cui sei entrato: non si modifica da qui.'
                : 'Senza nome nella sessione la decisione non si può registrare: rientra e riprova.'}
            </p>
          </div>
        </div>
        <label className="block">
          <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-600">
            Perché (almeno {MOTIVAZIONE_MINIMA} caratteri)
          </span>
          <textarea
            value={motivazione}
            onChange={(e) => setMotivazione(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[12px] text-slate-800"
            placeholder="Il motivo resta scritto accanto ai numeri del giorno: fra sei mesi è la sola cosa che spiega la scelta."
          />
        </label>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={registra}
            disabled={inCorso || !autore}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-white hover:bg-blue-800 disabled:opacity-60"
          >
            {inCorso ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <PenLine className="w-3.5 h-3.5" />
            )}
            Registra
          </button>
          <span className="text-[10px] text-slate-500">
            Credito{' '}
            {credito === null
              ? 'non accertato'
              : `${Math.round(credito).toLocaleString('it-IT')} €`}
            {copertura ? ` · copertura ${copertura}` : ''} — annotati con la decisione.
          </span>
        </div>
        {errore && <p className="text-[11px] font-bold text-red-700">{errore}</p>}
      </div>

      {decisioni.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3 text-[11px] text-slate-600">
          Nessuna decisione registrata. La verifica resta ricalcolabile: la traccia comincia dal
          primo atto.
        </p>
      ) : (
        <ol className="space-y-2">
          {decisioni.map((d) => (
            <li key={d.id} className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-[11px] font-bold text-slate-800">{riassuntoDecisione(d)}</p>
              <p className="text-[10px] text-slate-500">
                {dataOra(d.decisaIl)}
                {d.autoreId
                  ? ` · utente #${d.autoreId}`
                  : d.autoreModalita === 'SALVAGENTE'
                    ? ' · sessione Superadmin'
                    : ' · senza id utente'}
              </p>
              <p className="mt-1 text-[11px] text-slate-700 leading-relaxed">{d.motivazione}</p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
