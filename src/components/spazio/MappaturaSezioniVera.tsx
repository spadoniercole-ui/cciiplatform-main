'use client';

// LA MAPPATURA DELLE SEZIONI V.E.R.A. SI FA QUI, NON PASSANDO PER L'AZIENDA.
//
// Una sezione del file di verifica che non si riconduce da sola a una materia
// resta senza destinazione: la posizione non arriva a nessun ufficio e i
// documenti per le unità operative non si possono generare. La mappatura però
// è un dato dello SPAZIO — sezione del file → materia o categoria di debito —
// e non dell'azienda: si scrive una volta e vale per tutti i caricamenti.
//
// Prima l'unico posto dove mapparla era la scheda Posizione V.E.R.A. della
// singola azienda, e ci si arrivava uscendo dal triage: la scheda si apriva
// solo con l'anagrafica compilata e l'indirizzo `?scheda=vera` non veniva
// nemmeno letto, quindi il rimando lasciava l'operatore sull'Anagrafica. Qui
// invece si apre una finestra, si sceglie, si salva: al salvataggio la
// mappatura viene riagganciata alle righe già lette (`onSalvate`), così le
// comunicazioni e i report si ricompongono subito, senza rifare il triage.

import React, { useEffect, useState } from 'react';
import { AlertTriangle, Link2, X } from 'lucide-react';
import { salvaMappaturaTitoliVeraAction } from '@/app/actions/posizioneVera';
import {
  ottieniCategorieTipoDebito,
  type CategoriaTipoDebito,
} from '@/app/actions/categorieTipoDebito';
import { ottieniMaterieEnteAction } from '@/app/actions/titoliEnte';
import { chiaveMateria } from '@/lib/lavorazioni/instradamentoMateria';
import { formattaImportoEuro } from '@/lib/lavorazioni/comunicazioni';

/** Una sezione del file che nessuna materia e nessuna categoria reclamano. */
export interface SezioneDaMappare {
  /** La forma normalizzata del titolo: è la chiave con cui si salva. */
  norm: string;
  /** Il titolo come lo scrive il file (o «(senza titolo)»). */
  titolo: string;
  righe: number;
  totale: number;
}

interface Props {
  nomeSchema: string;
  sezioni: SezioneDaMappare[];
  onChiudi: () => void;
  /** Le scelte fatte, chiave = titolo normalizzato. Si applicano alle righe già lette. */
  onSalvate: (scelte: Record<string, string>) => void;
}

export function MappaturaSezioniVera({ nomeSchema, sezioni, onChiudi, onSalvate }: Props) {
  const [materie, setMaterie] = useState<{ id: number; nome: string }[]>([]);
  const [categorie, setCategorie] = useState<CategoriaTipoDebito[]>([]);
  const [scelte, setScelte] = useState<Record<string, string>>({});
  const [caricamento, setCaricamento] = useState(true);
  const [inSalvataggio, setInSalvataggio] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  // Le due destinazioni possibili: la materia dell'ente (che porta le
  // lavorazioni e l'ufficio che le compie) e la categoria di debito, che resta
  // valida per gli spazi configurati prima delle materie.
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const [m, c] = await Promise.all([
          ottieniMaterieEnteAction(nomeSchema),
          ottieniCategorieTipoDebito(nomeSchema),
        ]);
        if (!vivo) return;
        if (m.success)
          setMaterie(
            m.materie
              .filter((x): x is typeof x & { id: number } => x.id !== null)
              .map((x) => ({ id: x.id, nome: x.nome }))
          );
        if (c.success) setCategorie(c.categorie.filter((x) => x.attivo));
        const problemi = [!m.success && m.error, !c.success && c.error].filter((x): x is string =>
          Boolean(x)
        );
        if (problemi.length > 0) setErrore(problemi.join(' '));
      } catch (e) {
        if (vivo) setErrore(`Destinazioni non caricate: ${String(e)}`);
      } finally {
        if (vivo) setCaricamento(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [nomeSchema]);

  const salva = async () => {
    const mancanti = sezioni.filter((s) => !scelte[s.norm]);
    if (mancanti.length > 0) {
      setErrore(
        mancanti.length === 1
          ? 'Una sezione non ha ancora una destinazione: senza, le sue posizioni restano fuori dai documenti.'
          : `${mancanti.length} sezioni non hanno ancora una destinazione: senza, le loro posizioni restano fuori dai documenti.`
      );
      return;
    }
    setInSalvataggio(true);
    setErrore(null);
    try {
      const r = await salvaMappaturaTitoliVeraAction(
        nomeSchema,
        sezioni.map((s) => ({ norm: s.norm, label: s.titolo, categoria: scelte[s.norm] }))
      );
      if (!r.success) {
        setErrore(r.error ?? 'Mappatura non salvata.');
        return;
      }
      onSalvate(scelte);
    } catch (e) {
      setErrore(`Mappatura non salvata: ${String(e)}`);
    } finally {
      setInSalvataggio(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 p-4"
      role="presentation"
      onClick={() => !inSalvataggio && onChiudi()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="mappatura-vera-titolo"
        onClick={(e) => e.stopPropagation()}
        className="mx-auto my-8 w-full max-w-2xl bg-white rounded-xl border border-slate-200 shadow-xl p-5 space-y-4"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3
              id="mappatura-vera-titolo"
              className="flex items-center gap-2 font-bold text-slate-900 uppercase text-xs tracking-wider"
            >
              <Link2 className="w-4 h-4 text-slate-500" />
              Mappa le sezioni V.E.R.A.
            </h3>
            <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
              Queste sezioni del file non si riconducono a nessuna materia: le loro posizioni non
              arrivano a un ufficio. La scelta vale per lo spazio — non per questa azienda — e al
              salvataggio si applica subito alle posizioni già lette, così i documenti per le unità
              operative si possono generare senza rifare il triage.
            </p>
          </div>
          <button
            type="button"
            onClick={onChiudi}
            disabled={inSalvataggio}
            className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-50"
            aria-label="Chiudi"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {caricamento ? (
          <p className="text-[11px] text-slate-500">Caricamento delle destinazioni…</p>
        ) : (
          <ul className="space-y-2">
            {sezioni.map((s) => (
              <li key={s.norm} className="border border-slate-200 rounded-lg p-3 space-y-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-xs font-bold text-slate-900">{s.titolo}</span>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {s.righe} {s.righe === 1 ? 'posizione' : 'posizioni'} ·{' '}
                    {formattaImportoEuro(s.totale)}
                  </span>
                </div>
                <select
                  aria-label={`Destinazione di ${s.titolo}`}
                  value={scelte[s.norm] ?? ''}
                  onChange={(e) => setScelte({ ...scelte, [s.norm]: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-xs text-slate-900 bg-white"
                >
                  <option value="">Scegli dove vanno le posizioni…</option>
                  {materie.length > 0 && (
                    <optgroup label="Materie dell'ente">
                      {materie.map((m) => (
                        <option key={`m-${m.id}`} value={chiaveMateria(m.id)}>
                          {m.nome}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {categorie.length > 0 && (
                    <optgroup label="Categorie di debito">
                      {categorie.map((c) => (
                        <option key={c.codice} value={c.codice}>
                          {c.etichetta}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </li>
            ))}
          </ul>
        )}

        {errore && (
          <p className="flex items-start gap-2 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3 leading-relaxed">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {errore}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
          <p className="text-[10px] text-slate-400 leading-relaxed max-w-sm">
            La mappatura si corregge anche dopo, dalla scheda Posizione V.E.R.A. dell&apos;azienda:
            quella strada resta, questa evita di uscire dal triage.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onChiudi}
              disabled={inSalvataggio}
              className="px-3 py-2 rounded-lg border border-slate-300 text-[10px] font-bold uppercase tracking-wider text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Annulla
            </button>
            <button
              type="button"
              onClick={() => void salva()}
              disabled={inSalvataggio || caricamento || sezioni.length === 0}
              className="px-3 py-2 rounded-lg bg-slate-900 text-white text-[10px] font-bold uppercase tracking-wider hover:bg-slate-800 disabled:bg-slate-300"
            >
              {inSalvataggio ? 'Salvataggio…' : 'Salva e aggancia'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
