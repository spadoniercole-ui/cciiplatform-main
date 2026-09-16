'use client';

// Raccolta delle posizioni debitorie nel triage.
//
// Dopo visura e XBRL si pone una domanda sola: hai prospetti, o si imputa a
// mano? È la differenza fra un ente strutturato e uno che non lo è, e finora
// la piattaforma dava per scontato il primo caso.
//
// Le righe sono le stesse in entrambi i casi: categoria, tre anni, e il
// termine di paragone che la soglia di quella categoria richiede. Cambia
// solo come ci si arriva.

import React, { useEffect, useState } from 'react';
import { Plus, Trash2, Save, Table2, PencilLine } from 'lucide-react';
import {
  CATEGORIE,
  anniDelTriage,
  andamento,
  totalePerCategoria,
  type CategoriaDebito,
  type RigaDebitoTriage,
} from '@/lib/debitiTriage/modello';
import { ottieniDebitiTriageAction, salvaDebitiTriageAction } from '@/app/actions/debitiTriage';

interface Props {
  nomeSchema: string;
  aziendaId: number | null;
  /** Data di verifica: da qui i tre anni, senza chiedere nulla. */
  dataVerifica: string;
  onSalvato?: (righe: RigaDebitoTriage[]) => void;
}

const CLASSE =
  'w-full border border-slate-300 rounded-lg px-2 py-1.5 text-xs text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-sky-500';

const vuota = (): RigaDebitoTriage => ({
  descrizione: '',
  categoria: 'PREVIDENZIALE',
  importoAnnoCorrente: null,
  importoAnnoPrecedente: null,
  importoAnnoMeno2: null,
  riferimentoAnnoPrecedente: null,
  prospettoId: null,
});

const euro = (n: number) => `${Math.round(n).toLocaleString('it-IT')} €`;

export function DebitiTriage({ nomeSchema, aziendaId, dataVerifica, onSalvato }: Props) {
  const anni = anniDelTriage(new Date(`${dataVerifica}T12:00:00Z`));
  const [haProspetti, setHaProspetti] = useState<boolean | null>(null);
  const [righe, setRighe] = useState<RigaDebitoTriage[]>([vuota()]);
  const [salvataggio, setSalvataggio] = useState(false);
  const [esito, setEsito] = useState<string | null>(null);

  useEffect(() => {
    if (!aziendaId) return;
    void ottieniDebitiTriageAction(nomeSchema, aziendaId).then((r) => {
      if (r.success && r.righe && r.righe.length > 0) {
        setRighe(r.righe);
        setHaProspetti(false);
      }
    });
  }, [nomeSchema, aziendaId]);

  const aggiorna = (i: number, campo: keyof RigaDebitoTriage, valore: unknown) => {
    const copia = [...righe];
    copia[i] = { ...copia[i], [campo]: valore };
    setRighe(copia);
  };

  const salva = async () => {
    if (!aziendaId) {
      // Le righe si salvano sull'azienda, che nasce alla conferma dei dati:
      // dirlo è meglio che far premere un pulsante che non fa nulla.
      setEsito('Conferma prima i dati anagrafici: le posizioni si salvano sull’azienda.');
      return;
    }
    setSalvataggio(true);
    const r = await salvaDebitiTriageAction(nomeSchema, aziendaId, righe, null);
    setSalvataggio(false);
    setEsito(r.success ? `${r.salvate} posizioni salvate.` : (r.error ?? 'Errore.'));
    if (r.success) onSalvato?.(righe);
  };

  const totali = totalePerCategoria(righe, 'corrente');
  const trend = andamento(righe);

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-sky-700">
          Posizioni debitorie
        </p>
        <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
          Le soglie si calcolano su numeri reali, non sul bilancio: lo schema civilistico mette
          previdenziali e assicurativi nella stessa voce, e una soglia che riguarda un ente solo non
          può poggiare su un dato che ne contiene due. Il bilancio serve al quadro d&apos;insieme e
          agli indici.
        </p>
      </div>

      {haProspetti === null && (
        <div className="space-y-3 rounded-xl border border-sky-200 bg-sky-50 p-4">
          <p className="text-xs font-bold text-slate-900">
            Sei in condizione di caricare prospetti per la valutazione dei debiti?
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setHaProspetti(true)}
              className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-700 hover:bg-slate-50"
            >
              <Table2 className="h-3.5 w-3.5" />
              Sì, ho dei prospetti
            </button>
            <button
              onClick={() => setHaProspetti(false)}
              className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-slate-800"
            >
              <PencilLine className="h-3.5 w-3.5" />
              No, inserisco a mano
            </button>
          </div>
        </div>
      )}

      {haProspetti === true && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-[11px] leading-relaxed text-amber-900">
            Il caricamento dei prospetti liberi — con mappatura delle colonne — non è ancora
            disponibile. Nel frattempo puoi inserire le posizioni a mano: sono le stesse righe, e
            quando i prospetti arriveranno compileranno esattamente questa tabella.
          </p>
          <button
            onClick={() => setHaProspetti(false)}
            className="mt-2 text-[11px] font-bold text-sky-700 hover:underline"
          >
            Inserisci a mano
          </button>
        </div>
      )}

      {haProspetti === false && (
        <div className="space-y-3">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[56rem] text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-left">
                  <th className="pb-2 pr-2 text-[10px] font-bold uppercase tracking-wider text-slate-600">
                    Descrizione
                  </th>
                  <th className="pb-2 pr-2 text-[10px] font-bold uppercase tracking-wider text-slate-600">
                    Categoria
                  </th>
                  <th className="pb-2 pr-2 text-right text-[10px] font-bold uppercase tracking-wider text-slate-600">
                    {anni.corrente}
                  </th>
                  <th className="pb-2 pr-2 text-right text-[10px] font-bold uppercase tracking-wider text-slate-600">
                    {anni.precedente}
                  </th>
                  <th className="pb-2 pr-2 text-right text-[10px] font-bold uppercase tracking-wider text-slate-600">
                    {anni.meno2}
                  </th>
                  <th className="pb-2 pr-2 text-right text-[10px] font-bold uppercase tracking-wider text-slate-600">
                    Riferimento {anni.precedente}
                  </th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody>
                {righe.map((r, i) => {
                  const cat = CATEGORIE.find((c) => c.codice === r.categoria);
                  return (
                    <tr key={i} className="border-b border-slate-100">
                      <td className="py-1.5 pr-2">
                        <input
                          type="text"
                          value={r.descrizione}
                          onChange={(e) => aggiorna(i, 'descrizione', e.target.value)}
                          placeholder="Es. contributi INPS gestione aziende"
                          className={CLASSE}
                        />
                      </td>
                      <td className="py-1.5 pr-2">
                        <select
                          value={r.categoria}
                          onChange={(e) =>
                            aggiorna(i, 'categoria', e.target.value as CategoriaDebito)
                          }
                          className={CLASSE}
                        >
                          {CATEGORIE.map((c) => (
                            <option key={c.codice} value={c.codice}>
                              {c.etichetta}
                              {c.ente ? ` — ${c.ente}` : ''}
                            </option>
                          ))}
                        </select>
                      </td>
                      {(
                        [
                          'importoAnnoCorrente',
                          'importoAnnoPrecedente',
                          'importoAnnoMeno2',
                        ] as const
                      ).map((campo) => (
                        <td key={campo} className="py-1.5 pr-2">
                          <input
                            type="number"
                            step="0.01"
                            value={r[campo] ?? ''}
                            onChange={(e) =>
                              aggiorna(
                                i,
                                campo,
                                e.target.value === '' ? null : Number(e.target.value)
                              )
                            }
                            className={`${CLASSE} text-right font-mono`}
                          />
                        </td>
                      ))}
                      <td className="py-1.5 pr-2">
                        {/* Il termine di paragone si chiede SOLO dove la soglia
                            di quella categoria lo richiede: chiederlo su una
                            riga commerciale sarebbe chiedere un dato inutile. */}
                        {cat?.riferimento ? (
                          <input
                            type="number"
                            step="0.01"
                            value={r.riferimentoAnnoPrecedente ?? ''}
                            onChange={(e) =>
                              aggiorna(
                                i,
                                'riferimentoAnnoPrecedente',
                                e.target.value === '' ? null : Number(e.target.value)
                              )
                            }
                            placeholder={
                              cat.riferimento === 'CONTRIBUTI_DOVUTI'
                                ? 'contributi dovuti'
                                : 'volume d’affari'
                            }
                            className={`${CLASSE} text-right font-mono`}
                          />
                        ) : (
                          <span className="block text-right text-[10px] text-slate-300">
                            non richiesto
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 text-right">
                        <button
                          onClick={() => setRighe(righe.filter((_, j) => j !== i))}
                          className="text-slate-400 hover:text-red-600"
                          aria-label="Elimina riga"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <button
            onClick={() => setRighe([...righe, vuota()])}
            className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-sky-700 hover:underline"
          >
            <Plus className="h-3.5 w-3.5" />
            Aggiungi riga
          </button>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
              Totali {anni.corrente}
            </p>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
              {CATEGORIE.map((c) => (
                <span key={c.codice} className="text-[11px] text-slate-600">
                  {c.etichetta}:{' '}
                  <span className="font-mono font-bold text-slate-900">
                    {euro(totali[c.codice])}
                  </span>
                  {!c.qualificato && <span className="text-slate-400"> (fuori soglia)</span>}
                </span>
              ))}
            </div>
            {trend.variazionePercentuale !== null && (
              <p className="mt-1 text-[10px] text-slate-500">
                Rispetto al {anni.precedente}: {trend.variazionePercentuale > 0 ? '+' : ''}
                {trend.variazionePercentuale}%
              </p>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => void salva()}
              disabled={salvataggio}
              className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-slate-800 disabled:bg-slate-300"
            >
              <Save className="h-3.5 w-3.5" />
              {salvataggio ? 'Salvataggio...' : 'Consolida e salva'}
            </button>
            {esito && <span className="text-[11px] font-bold text-slate-600">{esito}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
