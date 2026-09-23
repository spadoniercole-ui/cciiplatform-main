'use client';

// Titoli di credito dell'ente — Parametri di Spazio. Una riga per codice di
// partita: atto, presupposto giuridico, riferimento interno (circolare),
// effetto sul calcolo. Al salvataggio la piattaforma riscontra norma e
// riferimento sulle sole fonti ufficiali; l'esito resta sulla riga.

import React, { useEffect, useState } from 'react';
import { Scale, Plus, Save, Trash2, ExternalLink, AlertTriangle, Check } from 'lucide-react';
import {
  eliminaTitoloEnteAction,
  ottieniTitoliEnteAction,
  precaricaTitoliInpsAction,
  salvaDominioEnteAction,
  salvaTitoloEnteAction,
} from '@/app/actions/titoliEnte';
import {
  AVVERTENZA_TITOLI_ENTE,
  ETICHETTA_EFFETTO,
  ETICHETTA_ESITO,
  RISCONTRO_VUOTO,
  type RiscontroFonte,
  type TitoloEnte,
} from '@/lib/titoliEnte/titoli';
import { confermaApp } from '@/components/FinestreApp';

interface Props {
  nomeSchema: string;
  codice: string;
}

const CLASSE_CAMPO =
  'w-full p-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 disabled:text-slate-500';

function Esito({ r, etichetta }: { r: RiscontroFonte; etichetta: string }) {
  const classe =
    r.esito === 'CONFERMATO'
      ? 'bg-emerald-100 text-emerald-800'
      : r.esito === 'IN_CONTRASTO'
        ? 'bg-red-100 text-red-800'
        : r.esito === 'NON_VERIFICABILE'
          ? 'bg-amber-100 text-amber-800'
          : 'bg-slate-100 text-slate-500';
  return (
    <div className="text-[10px] text-slate-600">
      <span className="text-slate-400 mr-1">{etichetta}:</span>
      <span className={`font-bold uppercase rounded px-1.5 py-0.5 ${classe}`}>
        {ETICHETTA_ESITO[r.esito]}
      </span>
      {r.motivo && <span className="ml-1">{r.motivo}</span>}
      {r.estratto && <span className="block italic text-slate-500 mt-0.5">«{r.estratto}»</span>}
      {r.url && (
        <a
          href={r.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-blue-700 mt-0.5"
        >
          <ExternalLink className="w-3 h-3" /> {r.url.replace(/^https?:\/\//, '').slice(0, 70)}
        </a>
      )}
      {r.confermatoDa && (
        <span className="block text-slate-400">confermato da {r.confermatoDa}</span>
      )}
    </div>
  );
}

const NUOVO: TitoloEnte = {
  id: null,
  codice: '',
  atto: '',
  presuppostoGiuridico: '',
  riferimentoInterno: null,
  effettoCalcolo: 'NESSUNO',
  note: null,
  riscontroNorma: RISCONTRO_VUOTO,
  riscontroInterno: RISCONTRO_VUOTO,
};

export function TitoliEnteManager({ nomeSchema, codice }: Props) {
  const [titoli, setTitoli] = useState<TitoloEnte[]>([]);
  const [dominio, setDominio] = useState('');
  const [inModifica, setInModifica] = useState<TitoloEnte | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [inCorso, setInCorso] = useState(false);
  const [esitoProposto, setEsitoProposto] = useState<TitoloEnte | null>(null);

  const carica = async () => {
    const r = await ottieniTitoliEnteAction(nomeSchema);
    if (r.success) {
      setTitoli(r.titoli);
      setDominio(r.dominioEnte ?? '');
    } else setErrore(r.error ?? 'Lettura non riuscita.');
  };
  useEffect(() => {
    carica();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nomeSchema]);

  const salva = async (conferma = false) => {
    if (!inModifica) return;
    setInCorso(true);
    setErrore(null);
    setEsitoProposto(null);
    const r = await salvaTitoloEnteAction(codice, inModifica, {
      confermaNonVerificabile: conferma,
    });
    setInCorso(false);
    if (r.success) {
      setInModifica(null);
      await carica();
      return;
    }
    if (r.richiedeConferma && r.titolo) {
      setEsitoProposto(r.titolo);
      const ok = await confermaApp(
        'Il riscontro automatico non ha potuto verificare uno dei riferimenti sulle fonti ufficiali. La riga può essere salvata con l’etichetta «da riscontrare»: resterà segnalata finché un riscontro non la chiude. Salvare comunque?',
        { titolo: 'Riferimento da riscontrare', etichettaConferma: 'Salva come da riscontrare' }
      );
      if (ok) await salva(true);
      return;
    }
    if (r.bloccato && r.titolo) setEsitoProposto(r.titolo);
    setErrore(r.error ?? 'Salvataggio non riuscito.');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 border-b border-slate-100 pb-3">
        <Scale className="w-4 h-4 text-blue-600 mt-0.5" />
        <div>
          <h2 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
            Titoli di credito dell’ente
          </h2>
          <p className="text-[11px] text-slate-600 mt-1">
            La tabella giuridica su cui l’ente fonda il recupero: per ogni codice di partita dei
            tracciati, l’atto o il flusso, il presupposto giuridico e il riferimento interno (la
            circolare che lo traduce in prassi). Al salvataggio la piattaforma riscontra la norma su
            Gazzetta Ufficiale e Normattiva, e il riferimento interno sul sito dell’ente:
            nessun’altra fonte. Un riscontro in contrasto impedisce il salvataggio.
          </p>
          <p className="text-[11px] text-slate-500 italic mt-1">{AVVERTENZA_TITOLI_ENTE}</p>
        </div>
      </div>

      <div className="flex items-end gap-2 flex-wrap">
        <div className="min-w-64">
          <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">
            Sito ufficiale dell’ente (per il riscontro dei riferimenti interni)
          </label>
          <input
            value={dominio}
            onChange={(e) => setDominio(e.target.value)}
            placeholder="es. inps.it"
            className={CLASSE_CAMPO}
          />
        </div>
        <button
          type="button"
          onClick={async () => {
            const r = await salvaDominioEnteAction(codice, dominio);
            if (!r.success) setErrore(r.error ?? 'Errore.');
            else await carica();
          }}
          className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[10px] uppercase rounded-lg"
        >
          Salva sito
        </button>
        {titoli.length === 0 && (
          <button
            type="button"
            onClick={async () => {
              const r = await precaricaTitoliInpsAction(nomeSchema);
              if (!r.success) setErrore(r.error ?? 'Errore.');
              await carica();
            }}
            className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-[10px] uppercase rounded-lg"
          >
            Precarica i codici INPS
          </button>
        )}
        <button
          type="button"
          onClick={() => setInModifica({ ...NUOVO })}
          className="flex items-center gap-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-[10px] uppercase rounded-lg"
        >
          <Plus className="w-3.5 h-3.5" /> Nuovo codice
        </button>
      </div>

      {errore && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2 flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> <span>{errore}</span>
        </p>
      )}

      {inModifica && (
        <div className="border border-blue-200 bg-blue-50/40 rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">
                Codice partita
              </label>
              <input
                value={inModifica.codice}
                onChange={(e) => setInModifica({ ...inModifica, codice: e.target.value })}
                className={CLASSE_CAMPO}
              />
            </div>
            <div className="sm:col-span-3">
              <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">
                Atto o flusso
              </label>
              <input
                value={inModifica.atto}
                onChange={(e) => setInModifica({ ...inModifica, atto: e.target.value })}
                className={CLASSE_CAMPO}
                placeholder="es. Denuncia Uniemens presentata e non versata"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">
                Presupposto giuridico (norma, articolo, comma)
              </label>
              <input
                value={inModifica.presuppostoGiuridico}
                onChange={(e) =>
                  setInModifica({ ...inModifica, presuppostoGiuridico: e.target.value })
                }
                className={CLASSE_CAMPO}
                placeholder="es. D.L. 269/2003, art. 44, comma 9"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">
                Riferimento interno (circolare, messaggio)
              </label>
              <input
                value={inModifica.riferimentoInterno ?? ''}
                onChange={(e) =>
                  setInModifica({ ...inModifica, riferimentoInterno: e.target.value || null })
                }
                className={CLASSE_CAMPO}
                placeholder="es. circolare INPS n. … del …"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">
                Effetto sul calcolo
              </label>
              <select
                value={inModifica.effettoCalcolo}
                onChange={(e) =>
                  setInModifica({
                    ...inModifica,
                    effettoCalcolo: e.target.value as TitoloEnte['effettoCalcolo'],
                  })
                }
                className={CLASSE_CAMPO}
              >
                {(Object.keys(ETICHETTA_EFFETTO) as TitoloEnte['effettoCalcolo'][]).map((k) => (
                  <option key={k} value={k}>
                    {ETICHETTA_EFFETTO[k]}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">
                Note dell’ente
              </label>
              <input
                value={inModifica.note ?? ''}
                onChange={(e) => setInModifica({ ...inModifica, note: e.target.value || null })}
                className={CLASSE_CAMPO}
              />
            </div>
          </div>
          {esitoProposto && (
            <div className="bg-white border border-slate-200 rounded-lg p-3 space-y-1">
              <Esito r={esitoProposto.riscontroNorma} etichetta="Norma" />
              <Esito r={esitoProposto.riscontroInterno} etichetta="Riferimento interno" />
            </div>
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => salva(false)}
              disabled={inCorso}
              className="flex items-center gap-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-bold text-[10px] uppercase rounded-lg"
            >
              <Save className="w-3.5 h-3.5" />{' '}
              {inCorso ? 'Riscontro sulle fonti ufficiali in corso…' : 'Salva e riscontra'}
            </button>
            <button
              type="button"
              onClick={() => {
                setInModifica(null);
                setEsitoProposto(null);
                setErrore(null);
              }}
              className="px-3 py-2 text-[10px] font-bold uppercase text-slate-500"
            >
              Annulla
            </button>
            {inCorso && (
              <span className="text-[11px] text-slate-500">
                Può richiedere fino a un minuto: la ricerca è limitata a Gazzetta Ufficiale,
                Normattiva e al sito dell’ente.
              </span>
            )}
          </div>
        </div>
      )}

      <div className="overflow-x-auto border border-slate-200 rounded-lg">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 text-[9px] uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2 font-bold">Codice</th>
              <th className="px-3 py-2 font-bold">Atto o flusso</th>
              <th className="px-3 py-2 font-bold">Presupposto giuridico</th>
              <th className="px-3 py-2 font-bold">Riferimento interno</th>
              <th className="px-3 py-2 font-bold">Effetto sul calcolo</th>
              <th className="px-3 py-2 font-bold"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {titoli.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-4 text-slate-500">
                  Nessun codice configurato: per uno spazio INPS usa «Precarica i codici INPS»,
                  altrimenti «Nuovo codice».
                </td>
              </tr>
            )}
            {titoli.map((t) => (
              <tr key={t.id ?? t.codice} className="align-top">
                <td className="px-3 py-2 font-bold text-slate-900">{t.codice}</td>
                <td className="px-3 py-2 text-slate-800">
                  {t.atto}
                  {t.note && <span className="block text-[10px] text-slate-500">{t.note}</span>}
                </td>
                <td className="px-3 py-2 text-slate-800">
                  {t.presuppostoGiuridico || <span className="text-amber-700">da indicare</span>}
                  <Esito r={t.riscontroNorma} etichetta="Riscontro" />
                </td>
                <td className="px-3 py-2 text-slate-800">
                  {t.riferimentoInterno ?? <span className="text-slate-400">—</span>}
                  {t.riferimentoInterno && <Esito r={t.riscontroInterno} etichetta="Riscontro" />}
                </td>
                <td className="px-3 py-2 text-slate-600">
                  {t.effettoCalcolo === 'NESSUNO' ? '—' : ETICHETTA_EFFETTO[t.effettoCalcolo]}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => {
                      setInModifica(t);
                      setEsitoProposto(null);
                    }}
                    className="text-[10px] font-bold uppercase text-blue-700 mr-2"
                  >
                    Modifica
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!t.id) return;
                      if (
                        !(await confermaApp(
                          `Eliminare il codice ${t.codice}? Le partite con questo codice resteranno senza titolo presunto.`,
                          { distruttiva: true, etichettaConferma: 'Elimina' }
                        ))
                      )
                        return;
                      const r = await eliminaTitoloEnteAction(codice, t.id);
                      if (!r.success) setErrore(r.error ?? 'Errore.');
                      await carica();
                    }}
                    className="text-slate-400 hover:text-red-600"
                    title="Elimina"
                  >
                    <Trash2 className="w-3.5 h-3.5 inline" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-slate-400 flex items-center gap-1">
        <Check className="w-3 h-3" /> Un riscontro confermato resta sulla riga finché norma o
        riferimento non cambiano.
      </p>
    </div>
  );
}
