'use client';

// LE PROCEDURE DELLE COMUNICAZIONI ALLE UO (0.256.3).
//
// Una posizione debitoria non si chiude quando è accertata: si chiude quando le
// unità operative sanno che cosa devono contabilizzare. Le procedure erano
// rimaste solo dentro il triage, e dalla posizione dell'ente non c'era modo di
// arrivarci — chi lavora la pratica non sapeva a chi scrivere né che cosa
// chiedere.
//
// LA PROCEDURA È UN PARAMETRO, NON UN PASSO REGISTRATO. Che cosa va fatto per
// una tipologia di debito e a quale ufficio va chiesto è una regola dell'ente
// (materie, lavorazioni, destinatari): resta la stessa per tutte le aziende e
// non ha senso ricopiarla, azienda per azienda, in una sequenza di passi da
// spuntare. Ciò che cambia da azienda a azienda sono le posizioni che cadono
// sotto quella regola, e quelle si leggono qui.
//
// IL TESTO NON SI INVIA. Stessa regola del triage: il modulo compone, l'invio è
// personale. Qui non si registra un esito e non si promette che la
// contabilizzazione sia avvenuta.

import { useEffect, useState } from 'react';
import { AlertTriangle, Copy, Loader2, Mail, Check } from 'lucide-react';
import { ottieniDebitiVera } from '@/app/actions/posizioneVera';
import { ottieniTitoliEnteAction, ottieniMaterieEnteAction } from '@/app/actions/titoliEnte';
import { ottieniLavorazioniMateria } from '@/app/actions/materieLavorazione';
import { ottieniCategorieTipoDebito } from '@/app/actions/categorieTipoDebito';
import { ottieniLavorazioniTipoDebito } from '@/app/actions/lavorazioniTipoDebito';
import {
  componiComunicazioniVera,
  formattaImportoEuro,
  raggruppaPerReparto,
  type EsitoComunicazioniVera,
} from '@/lib/lavorazioni/comunicazioni';
import { instradaPerMateria } from '@/lib/lavorazioni/instradamentoMateria';
import type { RigaVera } from '@/lib/debitiEnte/veraImport';
import type { StatoMateria } from '@/lib/titoliEnte/materie';
import type { LavorazioneMateria } from '@/lib/titoliEnte/lavorazioniMateria';
import type { LavorazioneTipoDebito } from '@/app/actions/lavorazioniTipoDebito';

export function ProcedureComunicazioniUo({
  nomeSchema,
  aziendaId,
  ragioneSociale,
  dataVerifica,
}: {
  nomeSchema: string;
  aziendaId: number;
  ragioneSociale: string;
  /** Data della verifica in formato AAAA-MM-GG: è la data che il testo cita. */
  dataVerifica: string;
}) {
  const [esito, setEsito] = useState<EsitoComunicazioniVera | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [caricamento, setCaricamento] = useState(true);
  const [copiata, setCopiata] = useState<string | null>(null);

  useEffect(() => {
    let annullato = false;
    (async () => {
      try {
        const [debiti, lav, cat, titoli, materie, perMateria] = await Promise.all([
          ottieniDebitiVera(nomeSchema, aziendaId),
          ottieniLavorazioniTipoDebito(nomeSchema),
          ottieniCategorieTipoDebito(nomeSchema),
          ottieniTitoliEnteAction(nomeSchema),
          ottieniMaterieEnteAction(nomeSchema),
          ottieniLavorazioniMateria(nomeSchema),
        ]);
        if (annullato) return;
        if (!debiti.success) {
          setErrore(debiti.error || 'La certificazione dei debiti non si legge.');
          setCaricamento(false);
          return;
        }

        const lavorazioniCategoria: LavorazioneTipoDebito[] = lav.success ? lav.lavorazioni : [];
        const etichetteCategoria: Record<string, string> = cat.success
          ? Object.fromEntries(cat.categorie.map((x) => [x.codice, x.etichetta]))
          : {};
        const titoliUo = titoli.success
          ? titoli.titoli.map((t) => ({
              codice: t.codice,
              materiaId: t.materiaId ?? null,
              dipendenza: t.dipendenza ?? null,
            }))
          : [];
        const materieUo = materie.success
          ? materie.materie
              .filter((m): m is typeof m & { id: number } => m.id !== null)
              .map((m) => ({
                id: m.id,
                nome: m.nome,
                codiciIndicativi: m.codiciIndicativi,
                stato: m.stato as StatoMateria,
              }))
          : [];
        const lavorazioniUo: LavorazioneMateria[] = perMateria.success
          ? perMateria.lavorazioni
          : [];

        // Lo stesso instradamento del triage: prima la materia, la categoria
        // solo come ripiego per gli spazi configurati prima.
        const instradamento = instradaPerMateria(debiti.righe as RigaVera[], {
          titoli: titoliUo,
          materie: materieUo,
          lavorazioni: lavorazioniUo,
          lavorazioniCategoria,
          etichetteCategoria,
        });
        const raggruppamento = raggruppaPerReparto({
          righe: instradamento.righe,
          lavorazioni: instradamento.lavorazioni,
          etichette: instradamento.etichette,
        });
        setEsito(
          componiComunicazioniVera(
            {
              azienda: ragioneSociale,
              dataVerifica,
              righe: instradamento.righe,
              lavorazioni: instradamento.lavorazioni,
              etichette: instradamento.etichette,
            },
            raggruppamento
          )
        );
      } catch (e) {
        if (!annullato) setErrore(`Le comunicazioni non si compongono: ${String(e)}`);
      } finally {
        if (!annullato) setCaricamento(false);
      }
    })();
    return () => {
      annullato = true;
    };
  }, [nomeSchema, aziendaId, ragioneSociale, dataVerifica]);

  if (caricamento) {
    return (
      <p className="flex items-center gap-2 text-[11px] text-slate-500">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Compongo le comunicazioni dalle posizioni e
        dalle lavorazioni configurate…
      </p>
    );
  }

  if (errore) {
    return (
      <p className="flex items-start gap-2 text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-3 leading-relaxed">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {errore}
      </p>
    );
  }

  if (!esito) return null;

  const { comunicazioni, categorieSenzaLavorazione, righeSenzaCategoria, contabilizzate } = esito;

  if (comunicazioni.length === 0) {
    return (
      <div className="space-y-2">
        <p className="text-[11px] text-slate-600 leading-relaxed">
          Nessuna posizione da comunicare: o la certificazione dei debiti è vuota, o tutto ciò che
          contiene è già in contabilità
          {contabilizzate.righe > 0
            ? ` (${contabilizzate.righe} ${
                contabilizzate.righe === 1 ? 'posizione' : 'posizioni'
              } per ${formattaImportoEuro(contabilizzate.totale)})`
            : ''}
          .
        </p>
        {categorieSenzaLavorazione.length > 0 && (
          <p className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-3 leading-relaxed">
            <strong>Nessun ufficio da avvisare.</strong> Per {categorieSenzaLavorazione.length}{' '}
            {categorieSenzaLavorazione.length === 1 ? 'tipologia' : 'tipologie'} di debito non è
            configurata una lavorazione:{' '}
            {categorieSenzaLavorazione.map((c) => c.etichetta).join(', ')}. La procedura si imposta
            nei parametri dello spazio (lavorazioni per tipologia di debito).
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-slate-600 leading-relaxed">
        {comunicazioni.length} {comunicazioni.length === 1 ? 'comunicazione' : 'comunicazioni'}, una
        per unità operativa: le posizioni sono raggruppate per destinatario, con le lavorazioni che
        la procedura gli assegna. Il testo si copia e si invia a mano — da qui non parte nulla.
      </p>

      {comunicazioni.map((c) => (
        <div key={c.destinatario} className="rounded-lg border border-slate-200 p-3 space-y-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-[11px] font-bold text-slate-900">
                <Mail className="w-3.5 h-3.5 text-slate-400" /> {c.destinatario}
              </p>
              <p className="text-[10px] text-slate-500">
                {c.righe} {c.righe === 1 ? 'posizione' : 'posizioni'} ·{' '}
                {formattaImportoEuro(c.totale)} ·{' '}
                {c.lavorazioni.length === 1
                  ? c.lavorazioni[0]
                  : `${c.lavorazioni.length} lavorazioni`}
              </p>
            </div>
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(`${c.oggetto}\n\n${c.corpo}`);
                setCopiata(c.destinatario);
                setTimeout(() => setCopiata(null), 2000);
              }}
              className="flex items-center gap-1 rounded-lg bg-slate-900 px-2.5 py-1.5 text-[10px] font-bold uppercase text-white hover:bg-slate-700"
            >
              {copiata === c.destinatario ? (
                <>
                  <Check className="w-3 h-3" /> Copiata
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" /> Copia
                </>
              )}
            </button>
          </div>
          <details className="rounded-lg bg-slate-50 p-2">
            <summary className="cursor-pointer text-[10px] font-bold uppercase tracking-wider text-slate-600">
              {c.oggetto}
            </summary>
            <pre className="mt-2 whitespace-pre-wrap text-[10px] text-slate-700 leading-relaxed">
              {c.corpo}
            </pre>
          </details>
        </div>
      ))}

      {righeSenzaCategoria > 0 && (
        <p className="text-[10px] text-amber-800 leading-relaxed">
          {righeSenzaCategoria}{' '}
          {righeSenzaCategoria === 1 ? 'posizione resta' : 'posizioni restano'} fuori dalle
          comunicazioni: la sezione della certificazione dei debiti non è mappata su una materia né
          su una tipologia di debito. La mappatura si imposta nei parametri dello spazio.
        </p>
      )}
      {categorieSenzaLavorazione.length > 0 && (
        <p className="text-[10px] text-amber-800 leading-relaxed">
          Senza lavorazione configurata:{' '}
          {categorieSenzaLavorazione.map((c) => c.etichetta).join(', ')} — nessun ufficio riceve
          queste posizioni.
        </p>
      )}
    </div>
  );
}
