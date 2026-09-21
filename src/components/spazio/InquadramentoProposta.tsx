'use client';

// Inquadramento della proposta — in testa alla scheda Proposta, per entrambi
// i percorsi. Tre dati (strumento, data di deposito, quota degli altri
// aderenti) da cui dipende quale regola del registro delle fonti si applica.
//
// La regola viene ricalcolata nel browser a ogni modifica (logica pura in
// src/lib/proposta/inquadramento.ts): l'operatore vede subito che cosa cambia
// spostando la data oltre il 28/09/2024 o la quota oltre il 25%. Si salva
// solo con il pulsante.
//
// Il pannello non esprime giudizi: mostra parametri, perimetri, dati mancanti
// e fonti. La formula e' quella del percorso in corso — Ricevente per una
// proposta ricevuta, Redigente per una proposta da definire.

import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, AlertTriangle, Save, RotateCcw, Lock } from 'lucide-react';
import {
  ottieniInquadramentoPropostaAction,
  salvaInquadramentoPropostaAction,
  type DatiInquadramento,
} from '@/app/actions/inquadramentoProposta';
import {
  ADESIONI_RIGA,
  STRUMENTI_PROPOSTA,
  inquadraProposta,
  voceStrumento,
  type AdesioneRiga,
  type RigaPerQuota,
} from '@/lib/proposta/inquadramento';
import type { TipoProposta } from '@/lib/origineProposta';

interface Props {
  nomeSchema: string;
  scenarioId: number;
  tipoSpazio: 'ENTE' | 'NON_ENTE';
  tipoProposta: TipoProposta;
  /** Cambia quando le righe della proposta cambiano: il pannello le rilegge. */
  versioneRighe: number;
}

interface AdesioneForm {
  adesione: AdesioneRiga | null;
  importoAderenteTesto: string;
  /** true = valore proposto dalla mappatura, non ancora confermato salvando. */
  suggerita: boolean;
}

function parseNumero(testo: string): number | null {
  const pulito = testo.trim().replace(/\./g, '').replace(',', '.');
  if (pulito === '') return null;
  const n = Number(pulito);
  return Number.isFinite(n) ? n : null;
}

/** "35" o "35,5" -> 0.35 / 0.355. Vuoto = nessuna correzione a mano. */
function parsePercentuale(testo: string): number | null {
  const pulito = testo.trim().replace('%', '').replace(',', '.');
  if (pulito === '') return null;
  const n = Number(pulito);
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return n / 100;
}

const perc = (q: number) =>
  `${(q * 100).toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
const euro = (n: number) => `€ ${Math.round(n).toLocaleString('it-IT')}`;

const CLASSE_LABEL = 'block text-[9px] font-bold text-slate-400 uppercase mb-1';
const CLASSE_CAMPO =
  'w-full p-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 disabled:text-slate-500';

export function InquadramentoProposta({
  nomeSchema,
  scenarioId,
  tipoSpazio,
  tipoProposta,
  versioneRighe,
}: Props) {
  const [dati, setDati] = useState<DatiInquadramento | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [strumento, setStrumento] = useState<string>('');
  const [dataDeposito, setDataDeposito] = useState<string>('');
  const [quotaTesto, setQuotaTesto] = useState<string>('');
  const [adesioni, setAdesioni] = useState<Record<number, AdesioneForm>>({});
  const [modificato, setModificato] = useState(false);
  const [salvataggio, setSalvataggio] = useState(false);
  const [salvato, setSalvato] = useState(false);

  const percorso = tipoProposta === 'RICEVUTA' ? 'RICEVENTE' : 'REDIGENTE';

  const carica = async (mantieniTestata: boolean) => {
    const r = await ottieniInquadramentoPropostaAction(nomeSchema, scenarioId, tipoSpazio);
    if (!r.success || !r.dati) {
      setErrore(r.error || 'Impossibile caricare l’inquadramento della proposta.');
      return;
    }
    setErrore(null);
    setDati(r.dati);
    // Se le righe cambiano mentre la testata e' in modifica, non si butta via
    // cio' che l'operatore sta scrivendo: si rileggono solo le righe.
    if (!mantieniTestata) {
      setStrumento(r.dati.strumento ?? '');
      setDataDeposito(r.dati.dataDeposito ?? '');
      setQuotaTesto(
        r.dati.quotaManuale === null
          ? ''
          : String(Math.round(r.dati.quotaManuale * 10000) / 100).replace('.', ',')
      );
    }
    setAdesioni((precedenti) => {
      const nuove: Record<number, AdesioneForm> = {};
      for (const riga of r.dati!.righe) {
        const gia = mantieniTestata ? precedenti[riga.id] : undefined;
        nuove[riga.id] = gia ?? {
          adesione: riga.adesione ?? riga.adesioneSuggerita,
          importoAderenteTesto:
            riga.importoAderente === null ? '' : String(riga.importoAderente).replace('.', ','),
          suggerita: riga.adesione === null && riga.adesioneSuggerita !== null,
        };
      }
      return nuove;
    });
  };

  useEffect(() => {
    carica(modificato);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nomeSchema, scenarioId, versioneRighe]);

  const righePerQuota: RigaPerQuota[] = useMemo(
    () =>
      (dati?.righe ?? []).map((r) => ({
        categoriaCreditore: r.categoriaCreditore,
        importoDovuto: r.importoDovuto,
        adesione: adesioni[r.id]?.adesione ?? null,
        importoAderente: parseNumero(adesioni[r.id]?.importoAderenteTesto ?? ''),
      })),
    [dati, adesioni]
  );

  const quotaManuale = parsePercentuale(quotaTesto);
  const quotaTestoNonValido = quotaTesto.trim() !== '' && quotaManuale === null;

  const quadro = useMemo(
    () =>
      inquadraProposta({
        strumento: strumento || null,
        dataDeposito: dataDeposito || null,
        quotaManuale,
        righe: righePerQuota,
        percorso,
        enteSpazio: dati?.enteSpazio ?? null,
      }),
    [strumento, dataDeposito, quotaManuale, righePerQuota, percorso, dati]
  );

  if (errore) {
    return (
      <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
        {errore}
      </div>
    );
  }
  if (!dati) return null;

  const solaLettura = dati.solaLettura;
  const regolaStrumento = voceStrumento(strumento)?.regola ?? null;
  const mostraAdesioni = regolaStrumento === 'CRAMDOWN_63';
  const calcolata = quadro.quota.calcolata;
  const suggeriteNonConfermate = Object.values(adesioni).some((a) => a.suggerita);

  const segnaModificato = () => {
    setModificato(true);
    setSalvato(false);
  };

  const handleSalva = async () => {
    if (quotaTestoNonValido) return;
    setSalvataggio(true);
    const r = await salvaInquadramentoPropostaAction(nomeSchema, scenarioId, {
      strumento: strumento || null,
      dataDeposito: dataDeposito || null,
      quotaManuale,
      adesioni: dati.righe.map((riga) => ({
        id: riga.id,
        adesione: adesioni[riga.id]?.adesione ?? null,
        importoAderente: parseNumero(adesioni[riga.id]?.importoAderenteTesto ?? ''),
      })),
    });
    setSalvataggio(false);
    if (!r.success) {
      setErrore(r.error || 'Impossibile salvare.');
      return;
    }
    setModificato(false);
    setSalvato(true);
    await carica(false);
  };

  const coloreEsito =
    quadro.stato === 'DETERMINATO'
      ? 'bg-blue-50 border-blue-200'
      : quadro.stato === 'BLOCCATO'
        ? 'bg-amber-50 border-amber-300'
        : 'bg-slate-50 border-slate-200';

  const titoloEsito =
    quadro.stato === 'DETERMINATO'
      ? quadro.cramDown
        ? 'Parametri dell’art. 63'
        : 'Perimetro dell’art. 23, comma 2-bis'
      : quadro.stato === 'BLOCCATO'
        ? 'Regola bloccata: manca un dato decisivo'
        : quadro.stato === 'REGOLA_NON_IN_REGISTRO'
          ? 'Regola non ancora nel registro delle fonti'
          : 'Da compilare';

  const righePubbliche = dati.righe.filter((r) => adesioni[r.id]?.adesione === 'PUBBLICO');

  return (
    <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap border-b border-slate-100 pb-3">
        <div className="flex items-start gap-2">
          <BookOpen className="w-4 h-4 text-blue-600 mt-0.5" />
          <div>
            <h2 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
              Inquadramento della proposta
            </h2>
            <p className="text-slate-500 text-[11px] mt-1 max-w-2xl">
              Strumento, data di deposito e quota degli altri aderenti decidono quale norma si
              applica. La piattaforma rileva parametri e perimetri citando la fonte; il giudizio
              resta al professionista, all’ente e al tribunale.
            </p>
          </div>
        </div>
        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500 bg-slate-100 rounded px-2 py-1">
          Formula per il {percorso === 'RICEVENTE' ? 'Ricevente' : 'Redigente'}
        </span>
      </div>

      {solaLettura && (
        <div className="flex items-center gap-2 text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-2">
          <Lock className="w-3.5 h-3.5" /> Scenario in sola lettura: i dati non sono modificabili.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className={CLASSE_LABEL} htmlFor="inq-strumento">
            Strumento scelto
          </label>
          <select
            id="inq-strumento"
            value={strumento}
            disabled={solaLettura}
            onChange={(e) => {
              setStrumento(e.target.value);
              segnaModificato();
            }}
            className={CLASSE_CAMPO}
          >
            <option value="">— non indicato —</option>
            {STRUMENTI_PROPOSTA.map((s) => (
              <option key={s.valore} value={s.valore}>
                {s.etichetta} ({s.riferimento})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={CLASSE_LABEL} htmlFor="inq-data">
            Data di deposito della proposta{percorso === 'REDIGENTE' ? ' (anche prevista)' : ''}
          </label>
          <input
            id="inq-data"
            type="date"
            value={dataDeposito}
            disabled={solaLettura}
            onChange={(e) => {
              setDataDeposito(e.target.value);
              segnaModificato();
            }}
            className={CLASSE_CAMPO}
          />
          <p className="text-[10px] text-slate-400 mt-1">
            Conta la data della proposta, non quella di oggi.
          </p>
        </div>
        <div>
          <label className={CLASSE_LABEL} htmlFor="inq-quota">
            Quota degli altri aderenti sull’indebitamento (%)
          </label>
          <div className="flex items-center gap-2">
            <input
              id="inq-quota"
              type="text"
              inputMode="decimal"
              value={quotaTesto}
              disabled={solaLettura}
              placeholder={
                calcolata.quota !== null
                  ? `${perc(calcolata.quota)} (calcolata)`
                  : 'non calcolabile'
              }
              onChange={(e) => {
                setQuotaTesto(e.target.value);
                segnaModificato();
              }}
              className={`${CLASSE_CAMPO} ${quotaTestoNonValido ? 'border-red-400' : ''}`}
            />
            {quotaTesto.trim() !== '' && !solaLettura && (
              <button
                type="button"
                onClick={() => {
                  setQuotaTesto('');
                  segnaModificato();
                }}
                title="Torna al valore calcolato dalle righe"
                className="flex items-center gap-1 px-2 py-2 text-[10px] font-bold uppercase text-slate-500 hover:text-blue-700 whitespace-nowrap"
              >
                <RotateCcw className="w-3 h-3" /> Calcolata
              </button>
            )}
          </div>
          <p className="text-[10px] mt-1 text-slate-500">
            {quotaTestoNonValido ? (
              <span className="text-red-600">Inserire un valore tra 0 e 100.</span>
            ) : calcolata.quota !== null ? (
              <>
                Dalle righe: <strong>{perc(calcolata.quota)}</strong> ({euro(calcolata.numeratore)}{' '}
                su {euro(calcolata.denominatore)}, {calcolata.numeroRighe} righe).
                {calcolata.righeSenzaAdesione.length > 0 &&
                  calcolata.quotaPotenziale !== null &&
                  ` Voti non ancora espressi: fino a ${perc(calcolata.quotaPotenziale)} — stessa soglia.`}
                {quadro.quota.origine === 'MANUALE' && ' In uso il valore a mano.'}
              </>
            ) : (
              <>
                Dalle righe: non determinabile.
                {calcolata.quotaCerta !== null && calcolata.quotaPotenziale !== null
                  ? ` Favorevoli certi ${perc(calcolata.quotaCerta)}, possibili fino a ${perc(calcolata.quotaPotenziale)}. `
                  : ' '}
                {calcolata.motivo}
              </>
            )}
          </p>
        </div>
      </div>

      {mostraAdesioni && dati.righe.length > 0 && (
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <div className="bg-slate-50 border-b border-slate-200 px-3 py-2">
            <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              {percorso === 'RICEVENTE'
                ? 'Promemoria dei voti degli altri creditori — facoltativo'
                : 'Intenzioni di voto raccolte — base del calcolo della quota'}
            </h3>
            <p className="text-[10px] text-slate-500 mt-0.5">
              {percorso === 'RICEVENTE'
                ? 'Il voto riguarda la proposta nel suo insieme. L’ente non si esprime sul voto degli altri creditori: questo promemoria non cambia l’esito dell’istruttoria. La quota si ricava dall’attestazione e si inserisce a mano; l’intenzione di voto dell’ente arriva alla fine del percorso, con la relazione conclusiva.'
                : 'Il voto riguarda la proposta nel suo insieme. Il denominatore è la somma di tutte le righe; il numeratore solo gli altri creditori favorevoli. Sulle intenzioni raccolte si rimodulano proposta, piano di sviluppo e piano di rientro.'}
            </p>
          </div>
          <table className="w-full text-left text-xs">
            <tbody className="divide-y divide-slate-100">
              {dati.righe.map((r) => {
                const a = adesioni[r.id];
                return (
                  <tr key={r.id}>
                    <td className="p-2 pl-3 font-bold text-slate-900">{r.categoriaCreditore}</td>
                    <td className="p-2 text-slate-600 whitespace-nowrap">
                      {euro(r.importoDovuto)}
                    </td>
                    <td className="p-2">
                      <select
                        value={a?.adesione ?? ''}
                        disabled={solaLettura}
                        aria-label={`Intenzione di voto di ${r.categoriaCreditore}`}
                        onChange={(e) => {
                          const v = (e.target.value || null) as AdesioneRiga | null;
                          setAdesioni((p) => ({
                            ...p,
                            [r.id]: {
                              adesione: v,
                              importoAderenteTesto:
                                v === 'ADERENTE' ? (a?.importoAderenteTesto ?? '') : '',
                              suggerita: false,
                            },
                          }));
                          segnaModificato();
                        }}
                        className={`${CLASSE_CAMPO} ${a?.adesione || percorso === 'RICEVENTE' ? '' : 'border-amber-400'}`}
                      >
                        <option value="">— non espressa —</option>
                        {ADESIONI_RIGA.map((o) => (
                          <option key={o.valore} value={o.valore}>
                            {o.etichetta}
                          </option>
                        ))}
                      </select>
                      {a?.suggerita && (
                        <p className="text-[10px] text-amber-700 mt-1">
                          {r.origineSuggerimento === 'NOME'
                            ? 'Proposto dal nome della categoria'
                            : r.origineSuggerimento === 'RILEVANTE'
                              ? 'Proposto perché è la riga rilevante per l’ente'
                              : 'Proposto dalla mappatura delle categorie'}
                          : si conferma salvando.
                        </p>
                      )}
                    </td>
                    <td className="p-2 pr-3 w-44">
                      {a?.adesione === 'ADERENTE' && (
                        <input
                          type="text"
                          inputMode="decimal"
                          value={a.importoAderenteTesto}
                          disabled={solaLettura}
                          placeholder={`intera riga (${euro(r.importoDovuto)})`}
                          aria-label={`Importo favorevole di ${r.categoriaCreditore}`}
                          onChange={(e) => {
                            setAdesioni((p) => ({
                              ...p,
                              [r.id]: { ...p[r.id], importoAderenteTesto: e.target.value },
                            }));
                            segnaModificato();
                          }}
                          className={CLASSE_CAMPO}
                        />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className={`border rounded-lg p-4 space-y-3 ${coloreEsito}`}>
        <div className="flex items-center gap-2">
          {quadro.stato !== 'DETERMINATO' && <AlertTriangle className="w-4 h-4 text-amber-600" />}
          <h3 className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
            {titoloEsito}
          </h3>
        </div>

        {quadro.cramDown && (
          <div className="flex flex-wrap gap-2">
            <span className="text-xs font-bold text-slate-900 bg-white border border-slate-200 rounded px-2 py-1">
              Soddisfacimento non inferiore al {quadro.cramDown.percentualeMinima}%
            </span>
            {quadro.cramDown.dilazioneMassimaAnni !== null && (
              <span className="text-xs font-bold text-slate-900 bg-white border border-slate-200 rounded px-2 py-1">
                Dilazione non oltre {quadro.cramDown.dilazioneMassimaAnni} anni
              </span>
            )}
            <span className="text-xs text-slate-700 bg-white border border-slate-200 rounded px-2 py-1">
              {quadro.cramDown.regime === 'correttivo-ter'
                ? 'Art. 63 in vigore dal 28/09/2024'
                : 'Disciplina transitoria (fino al 27/09/2024)'}
            </span>
            {quadro.quota.valore !== null && (
              <span className="text-xs text-slate-700 bg-white border border-slate-200 rounded px-2 py-1">
                Altri aderenti: {perc(quadro.quota.valore)} (
                {quadro.quota.origine === 'MANUALE' ? 'a mano' : 'calcolata'}) —{' '}
                {quadro.quota.valore >= 0.25 ? 'almeno un quarto' : 'meno di un quarto'}
              </span>
            )}
          </div>
        )}

        {quadro.formula && (
          <p className="text-xs text-slate-800 leading-relaxed">{quadro.formula}</p>
        )}

        {quadro.perimetro.length > 1 && (
          <ul className="space-y-2">
            {quadro.perimetro.map((p) => (
              <li key={p.ente} className="bg-white border border-slate-200 rounded p-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-900">{p.etichettaEnte}</span>
                  <span
                    className={`text-[9px] font-bold uppercase rounded px-1.5 py-0.5 ${p.ammesso ? 'bg-blue-100 text-blue-800' : 'bg-slate-200 text-slate-700'}`}
                  >
                    {p.ammesso ? 'Nel perimetro' : 'Fuori perimetro'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-700 mt-1 leading-relaxed">{p.formula}</p>
              </li>
            ))}
          </ul>
        )}

        {quadro.cramDown && righePubbliche.length > 0 && (
          <div className="bg-white border border-slate-200 rounded p-3">
            <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">
              Riscontro sulle righe dei creditori pubblici
            </h4>
            <ul className="space-y-1">
              {righePubbliche.map((r) => {
                const sotto = r.percentualeOfferta < (quadro.cramDown?.percentualeMinima ?? 0);
                return (
                  <li key={r.id} className="text-xs text-slate-800 flex flex-wrap gap-x-2">
                    <strong>{r.categoriaCreditore}</strong>
                    <span>offerta {r.percentualeOfferta.toLocaleString('it-IT')}%</span>
                    <span className={sotto ? 'text-amber-700 font-bold' : 'text-slate-600'}>
                      {sotto ? 'inferiore al parametro' : 'non inferiore al parametro'}
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="text-[10px] text-slate-500 mt-2">
              La percentuale della riga è calcolata sull’importo dovuto così come inserito.
              {quadro.cramDown.regime === 'correttivo-ter' &&
                ' Il parametro dell’art. 63 si misura sul credito al netto di sanzioni e interessi: accertare che la riga sia costruita allo stesso modo.'}{' '}
              Il riscontro è numerico e non dice se l’omologazione forzosa sia applicabile.
            </p>
          </div>
        )}

        {quadro.avvisi.length > 0 && (
          <ul className="space-y-1">
            {quadro.avvisi.map((a) => (
              <li key={a} className="text-[11px] text-slate-700 flex gap-1.5">
                <span className="text-amber-600 font-bold">!</span>
                <span>{a}</span>
              </li>
            ))}
          </ul>
        )}

        {quadro.fonti.length > 0 && (
          <div className="border-t border-slate-200/70 pt-2">
            <h4 className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">
              Fonti citate dal registro
            </h4>
            <ul className="space-y-1">
              {quadro.fonti.map((f) => (
                <li key={f.id} className="text-[11px] text-slate-700" title={f.notaVerifica}>
                  <code className="font-mono text-[10px] text-slate-500 mr-1.5">{f.id}</code>
                  {f.norma}
                  {!f.sostieneEsito && (
                    <span className="ml-1.5 text-[9px] font-bold uppercase bg-amber-100 text-amber-800 rounded px-1.5 py-0.5">
                      non ancora riscontrata
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {!solaLettura && (
        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={handleSalva}
            disabled={
              salvataggio || quotaTestoNonValido || (!modificato && !suggeriteNonConfermate)
            }
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-bold text-[10px] uppercase rounded-lg transition-colors"
          >
            <Save className="w-3.5 h-3.5" />
            {salvataggio ? 'Salvataggio...' : 'Salva inquadramento'}
          </button>
          {modificato && (
            <span className="text-[11px] text-amber-700">
              Modifiche non salvate: ciò che vedi sopra è un’anteprima.
            </span>
          )}
          {salvato && !modificato && (
            <span className="text-[11px] text-slate-500">Inquadramento salvato.</span>
          )}
        </div>
      )}
    </section>
  );
}
