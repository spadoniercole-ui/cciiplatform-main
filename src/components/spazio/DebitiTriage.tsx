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
import {
  ottieniDebitiTriageAction,
  salvaTutteDebitiTriageAction,
} from '@/app/actions/debitiTriage';
import { riconosciProspetto, ETICHETTA_PROSPETTO, type TipoProspetto } from '@/lib/denunce/lettura';
import { leggiFoglioAoa } from '@/lib/debitiEnte/tracciatoExcel';
import {
  estraiRighe,
  firmaIntestazioni,
  individuaIntestazione,
  proponiMappatura,
  type MappaturaProspetto,
} from '@/lib/debitiTriage/mappatura';
import { cercaStrutturaProspettoAction } from '@/app/actions/struttureProspetto';
import { PannelloMappatura } from '@/components/spazio/PannelloMappatura';

interface Props {
  nomeSchema: string;
  aziendaId: number | null;
  /** Data di verifica: da qui i tre anni, senza chiedere nulla. */
  dataVerifica: string;
  onSalvato?: (righe: RigaDebitoTriage[]) => void;
  /** File caricati come prospetti: li elabora la pagina alla conferma. */
  prospetti?: File[];
  onProspetti?: (file: File[]) => void;
  /**
   * La tabella comunica le proprie righe alla pagina, che le salva insieme
   * all'azienda alla conferma. Senza, le posizioni inserite prima che
   * l'azienda esistesse restavano solo sullo schermo.
   */
  onRighe?: (righe: RigaDebitoTriage[]) => void;
  /** Strutture da ricordare, salvate dalla pagina quando l'azienda esiste. */
  onStruttura?: (s: {
    ente: string;
    firma: string;
    mappatura: MappaturaProspetto;
    nome: string;
  }) => void;
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

export function DebitiTriage({
  nomeSchema,
  aziendaId,
  dataVerifica,
  onSalvato,
  prospetti = [],
  onProspetti,
  onRighe,
  onStruttura,
}: Props) {
  // Il prospetto in mappatura in questo momento, con il suo foglio già letto.
  const [inMappatura, setInMappatura] = useState<{
    nome: string;
    aoa: unknown[][];
    proposta: MappaturaProspetto;
  } | null>(null);
  const [notaStruttura, setNotaStruttura] = useState<Record<string, string>>({});
  const [tipi, setTipi] = useState<Record<string, TipoProspetto>>({});
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

  useEffect(() => {
    onRighe?.(righe);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [righe]);

  const aggiorna = (i: number, campo: keyof RigaDebitoTriage, valore: unknown) => {
    const copia = [...righe];
    copia[i] = { ...copia[i], [campo]: valore };
    setRighe(copia);
  };

  /** Aggiunge le righe estratte, togliendo l'eventuale riga vuota iniziale. */
  const aggiungiEstratte = (nuove: RigaDebitoTriage[]) => {
    const esistenti = righe.filter(
      (r) =>
        r.descrizione.trim() !== '' ||
        r.importoAnnoCorrente !== null ||
        r.importoAnnoPrecedente !== null ||
        r.importoAnnoMeno2 !== null
    );
    setRighe([...esistenti, ...nuove]);
  };

  const apriMappatura = async (f: File) => {
    const { aoa } = await leggiFoglioAoa(f);
    setInMappatura({ nome: f.name, aoa, proposta: proponiMappatura(aoa) });
  };

  const salva = async () => {
    if (!aziendaId) {
      // Le righe si salvano sull'azienda, che nasce alla conferma dei dati:
      // dirlo è meglio che far premere un pulsante che non fa nulla.
      setEsito('Conferma prima i dati anagrafici: le posizioni si salvano sull’azienda.');
      return;
    }
    setSalvataggio(true);
    // Si salva la tabella per INTERO: è l'unica superficie dove le posizioni
    // si vedono e si correggono, quelle a mano e quelle dai prospetti.
    const r = await salvaTutteDebitiTriageAction(nomeSchema, aziendaId, righe);
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
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-[11px] leading-relaxed text-slate-600">
            Carica i prospetti che hai, di qualunque natura: la piattaforma riconosce da sola cosa
            sono dalle intestazioni. Il V.E.R.A., le denunce, le deleghe e le inadempienze
            dell&apos;INPS si riconoscono in entrambe le varianti — Cassetto e INPS-CPC.
          </p>
          <input
            type="file"
            multiple
            accept=".xls,.xlsx,.csv"
            onChange={async (e) => {
              const elenco = Array.from(e.target.files ?? []);
              onProspetti?.(elenco);
              // Il riconoscimento si mostra SUBITO, prima della conferma: chi
              // carica un file deve sapere se la piattaforma l'ha capito, non
              // scoprirlo dopo nel riepilogo.
              const esiti: Record<string, TipoProspetto> = {};
              const note: Record<string, string> = {};
              for (const f of elenco) {
                esiti[f.name] = await riconosciProspetto(f);
                if (esiti[f.name] !== 'SCONOSCIUTO') continue;
                // Tracciato non standard: forse è già stato mappato una volta.
                // Se sì, si applica la mappatura salvata e lo si dichiara;
                // se ci sono più enti per la stessa firma, si lascia decidere.
                const { aoa } = await leggiFoglioAoa(f);
                const firma = firmaIntestazioni(aoa[individuaIntestazione(aoa)] ?? []);
                const r = await cercaStrutturaProspettoAction(nomeSchema, firma);
                const note1 = r.strutture ?? [];
                if (note1.length === 1) {
                  const e = estraiRighe(aoa, note1[0].mappatura, anni, null, f.name);
                  aggiungiEstratte(e.righe);
                  note[f.name] =
                    `riconosciuto da una mappatura salvata (${note1[0].ente}): ${e.righe.length} posizioni aggiunte`;
                } else if (note1.length > 1) {
                  note[f.name] = `tracciato noto per più enti: mappalo per scegliere quale`;
                }
              }
              setTipi(esiti);
              setNotaStruttura(note);
            }}
            className="w-full font-mono text-xs text-slate-900 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-[10px] file:font-bold file:uppercase file:text-slate-700"
          />
          {prospetti.length > 0 && (
            <ul className="space-y-1">
              {prospetti.map((f) => {
                const t = tipi[f.name];
                return (
                  <li key={f.name} className="flex items-center justify-between gap-3 text-[11px]">
                    <span className="truncate font-mono text-slate-700">
                      {f.name}
                      {notaStruttura[f.name] && (
                        <span className="ml-2 font-sans text-[10px] text-emerald-700">
                          — {notaStruttura[f.name]}
                        </span>
                      )}
                    </span>
                    <span
                      className={`shrink-0 font-bold ${
                        !t
                          ? 'text-slate-400'
                          : t === 'SCONOSCIUTO'
                            ? 'text-amber-700'
                            : t === 'F24_AGGREGATO'
                              ? 'text-amber-600'
                              : 'text-emerald-700'
                      }`}
                    >
                      {t ? ETICHETTA_PROSPETTO[t] : 'riconoscimento...'}
                      {t === 'SCONOSCIUTO' &&
                        !notaStruttura[f.name]?.startsWith('riconosciuto') && (
                          <button
                            onClick={() => void apriMappatura(f)}
                            className="ml-2 font-bold text-sky-700 hover:underline"
                          >
                            mappa le colonne
                          </button>
                        )}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          {inMappatura && (
            <PannelloMappatura
              nomeFile={inMappatura.nome}
              aoa={inMappatura.aoa}
              proposta={inMappatura.proposta}
              anni={anni}
              onApplica={({ righe: estratte, ente, mappatura, firma }) => {
                aggiungiEstratte(estratte);
                onStruttura?.({ ente, firma, mappatura, nome: inMappatura.nome });
                setNotaStruttura({
                  ...notaStruttura,
                  [inMappatura.nome]: `mappato: ${estratte.length} posizioni aggiunte`,
                });
                setInMappatura(null);
                setHaProspetti(false);
              }}
              onAnnulla={() => setInMappatura(null)}
            />
          )}
          <p className="text-[10px] leading-relaxed text-slate-400">
            Le posizioni estratte finiscono nella tabella delle posizioni, dove le vedi e le
            correggi prima che entrino nel calcolo.
          </p>
          <button
            onClick={() => setHaProspetti(false)}
            className="text-[11px] font-bold text-sky-700 hover:underline"
          >
            Integra a mano
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

          {aziendaId ? (
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
          ) : (
            <p className="text-[11px] leading-relaxed text-slate-500">
              Le posizioni si salvano con la conferma dei dati, insieme all&apos;azienda: è da lì
              che l&apos;indicatore le legge.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
