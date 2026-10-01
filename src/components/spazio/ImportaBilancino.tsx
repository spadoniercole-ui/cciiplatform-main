'use client';

// Import adattivo di un bilancino di verifica (o situazione contabile) nella
// Posizione Aggiornata. Il file resta nel browser: si leggono colonne e
// conti, si propone la classificazione, l'operatore conferma, e solo le
// macro-voci aggregate passano al prospetto (che poi si salva con «Salva»,
// seconda conferma). Colonne e classificazione confermate si memorizzano
// come tracciato dell'azienda: il caricamento successivo dello stesso
// formato chiede conferma solo sui conti nuovi.

import React, { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { FileSpreadsheet, X, CheckCircle2, AlertTriangle, Scale } from 'lucide-react';
import {
  CATEGORIE,
  proponiCategoria,
  type IdCategoria,
  type Confidenza,
} from '@/lib/bilancino/categorie';
import {
  riconosciColonne,
  estraiConti,
  firmaIntestazione,
  dataDiRiferimento,
  suggerisciOrientamento,
  ETICHETTE_MODO,
  type ColonneBilancino,
  type ContoLetto,
  type ModoImporti,
} from '@/lib/bilancino/lettura';
import { aggregaBilancino, type MappaConti } from '@/lib/bilancino/aggregazione';
import { CAMPI_POSIZIONE } from '@/lib/posizioneAggiornata/schemaCampi';
import {
  ottieniTracciatoBilancinoAction,
  salvaTracciatoBilancinoAction,
  type TracciatoTrovato,
} from '@/app/actions/tracciatiBilancino';
import { registraDocumentoOrigineAction } from '@/app/actions/documentiOrigine';
import { improntaFile } from '@/lib/fascicolo/impronta';
import { confermaApp } from '@/components/FinestreApp';
import type { DatiFinanziariPeriodo } from '@/lib/xbrl/types';

export interface EsitoImportBilancino {
  dati: DatiFinanziariPeriodo;
  nomeFile: string;
  documentoId: number | null;
  dataRiferimento: string | null;
  conti: number;
  quadrata: boolean;
}

interface Props {
  nomeSchema: string;
  aziendaId: number;
  file: File;
  onApplica: (esito: EsitoImportBilancino) => void;
  onChiudi: () => void;
}

type OrigineClassificazione = 'memoria' | 'proposta' | 'proposta_incerta' | 'nessuna' | 'operatore';

const euro = (n: number) =>
  n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const lettera = (i: number) => {
  let s = '';
  let n = i + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};

const GRUPPI = Array.from(new Set(CATEGORIE.map((c) => c.gruppo)));

export function ImportaBilancino({ nomeSchema, aziendaId, file, onApplica, onChiudi }: Props) {
  const [fogli, setFogli] = useState<{ nome: string; righe: unknown[][] }[]>([]);
  const [foglio, setFoglio] = useState(0);
  const [colonne, setColonne] = useState<ColonneBilancino | null>(null);
  const [tracciato, setTracciato] = useState<TracciatoTrovato | null>(null);
  const [mappa, setMappa] = useState<MappaConti>({});
  const [origine, setOrigine] = useState<Record<string, OrigineClassificazione>>({});
  const [filtro, setFiltro] = useState<'controllare' | 'tutti'>('controllare');
  const [caricamento, setCaricamento] = useState(true);
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  const righe = fogli[foglio]?.righe ?? [];
  const firma = colonne ? firmaIntestazione(righe, colonne.rigaIntestazione) : '';
  const conti: ContoLetto[] = useMemo(
    () => (colonne ? estraiConti(righe, colonne) : []),
    [righe, colonne]
  );

  // Classificazione: memoria del tracciato, poi proposta per parole chiave.
  const classifica = (
    elenco: ContoLetto[],
    memoria: Record<string, IdCategoria>,
    precedente: MappaConti
  ) => {
    const m: MappaConti = {};
    const o: Record<string, OrigineClassificazione> = {};
    for (const c of elenco) {
      if (precedente[c.chiave]) {
        m[c.chiave] = precedente[c.chiave];
        o[c.chiave] = origine[c.chiave] ?? 'operatore';
      } else if (memoria[c.chiave]) {
        m[c.chiave] = memoria[c.chiave];
        o[c.chiave] = 'memoria';
      } else {
        const p = proponiCategoria(c.descrizione);
        m[c.chiave] = p?.categoria;
        o[c.chiave] = !p
          ? 'nessuna'
          : p.confidenza === ('bassa' as Confidenza)
            ? 'proposta_incerta'
            : 'proposta';
      }
    }
    setMappa(m);
    setOrigine(o);
  };

  const analizzaFoglio = async (r: unknown[][]) => {
    let col = riconosciColonne(r);
    const f = firmaIntestazione(r, col.rigaIntestazione);
    const ris = await ottieniTracciatoBilancinoAction(nomeSchema, aziendaId, f);
    const tr = ris.success ? ris.tracciato : null;
    if (!ris.success && ris.error) setErrore(ris.error);
    if (tr?.colonne) col = tr.colonne;
    else if (col.modo === 'saldo_dare_positivo') {
      const suggerito = suggerisciOrientamento(estraiConti(r, col));
      if (suggerito) col = { ...col, modo: suggerito };
    }
    setTracciato(tr);
    setColonne(col);
    classifica(estraiConti(r, col), tr?.mappa ?? {}, {});
  };

  React.useEffect(() => {
    (async () => {
      try {
        // CSV e testo: celle lette come stringhe, altrimenti «300.000,00»
        // diventerebbe 300 e il codice «01.01» il numero 1,01.
        const testuale = /\.(csv|txt|tsv)$/i.test(file.name);
        const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', raw: testuale });
        const letti = wb.SheetNames.map((nome) => ({
          nome,
          righe: XLSX.utils.sheet_to_json(wb.Sheets[nome], {
            header: 1,
            raw: true,
            blankrows: true,
            defval: null,
          }) as unknown[][],
        })).filter((f) => f.righe.length > 0);
        if (letti.length === 0) {
          setErrore('Il file non contiene fogli con dati.');
          return;
        }
        // Foglio proposto: quello con più righe.
        const indice = letti.reduce(
          (best, f, i) => (f.righe.length > letti[best].righe.length ? i : best),
          0
        );
        setFogli(letti);
        setFoglio(indice);
        await analizzaFoglio(letti[indice].righe);
      } catch (e: any) {
        setErrore(`Impossibile leggere il file: ${e.message || e}`);
      } finally {
        setCaricamento(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  const cambiaColonne = (modifica: Partial<ColonneBilancino>) => {
    if (!colonne) return;
    const nuove = { ...colonne, ...modifica };
    if (nuove.modo === 'dare_avere') nuove.saldo = null;
    else {
      nuove.dare = null;
      nuove.avere = null;
    }
    setColonne(nuove);
    classifica(estraiConti(righe, nuove), tracciato?.mappa ?? {}, mappa);
  };

  const cambiaCategoria = (chiave: string, id: string) => {
    setMappa((m) => ({ ...m, [chiave]: (id || undefined) as IdCategoria | undefined }));
    setOrigine((o) => ({ ...o, [chiave]: 'operatore' }));
  };

  const esito = useMemo(
    () => (colonne ? aggregaBilancino(conti, mappa, colonne.modo) : null),
    [conti, mappa, colonne]
  );

  const daControllare = conti.filter((c) => {
    const o = origine[c.chiave];
    return !mappa[c.chiave] || o === 'nessuna' || o === 'proposta_incerta';
  });
  const visibili = filtro === 'controllare' ? daControllare : conti;

  const numColonne = Math.max(0, ...righe.slice(0, 200).map((r) => (r || []).length));
  const intestazione =
    colonne && colonne.rigaIntestazione >= 0 ? righe[colonne.rigaIntestazione] || [] : [];
  const opzioniColonna = Array.from({ length: numColonne }, (_, i) => ({
    valore: i,
    etichetta: `${lettera(i)}${intestazione[i] ? ` — ${String(intestazione[i]).slice(0, 30)}` : ''}`,
  }));

  const handleApplica = async () => {
    if (!colonne || !esito) return;
    const avvertenze: string[] = [];
    if (esito.nonAssegnati.length > 0)
      avvertenze.push(
        `${esito.nonAssegnati.length} conti senza categoria non entrano nel calcolo.`
      );
    if (!esito.quadratura.ok)
      avvertenze.push(
        `Il bilancino non quadra: attivo ${euro(esito.quadratura.attivo)} €, passivo e netto ${euro(esito.quadratura.passivoENetto)} € (differenza ${euro(esito.quadratura.differenza)} €).`
      );
    if (esito.doppiaNaturaSenzaSegno.length > 0)
      avvertenze.push(
        `${esito.doppiaNaturaSenzaSegno.length} conti a doppia natura (banca, Erario, enti previdenziali) letti senza segno: il lato è quello predefinito e non è verificabile.`
      );
    const ok = await confermaApp(
      [
        `Porto nel prospetto le macro-voci di ${conti.length} conti del file «${file.name}».`,
        ...avvertenze,
        'Colonne e classificazione restano memorizzate per questa azienda. Dopo, controlla il prospetto e premi «Salva».',
      ].join('\n\n'),
      { titolo: 'Conferma dell’import del bilancino', etichettaConferma: 'Porta nel prospetto' }
    );
    if (!ok) return;
    setInCorso(true);
    setErrore(null);
    try {
      const mappaDaSalvare: Record<string, IdCategoria> = {};
      for (const [k, v] of Object.entries(mappa)) if (v) mappaDaSalvare[k] = v;
      const [salvaRis, impronta] = await Promise.all([
        salvaTracciatoBilancinoAction(nomeSchema, aziendaId, firma, colonne, mappaDaSalvare),
        improntaFile(file),
      ]);
      if (!salvaRis.success) {
        setErrore(salvaRis.error || 'Impossibile memorizzare il tracciato.');
        return;
      }
      const docRis = await registraDocumentoOrigineAction(
        nomeSchema,
        aziendaId,
        'BILANCINO',
        impronta
      );
      onApplica({
        dati: esito.dati,
        nomeFile: file.name,
        documentoId: docRis.success ? (docRis.documentoId ?? null) : null,
        dataRiferimento: dataDiRiferimento(righe, file.name),
        conti: conti.length,
        quadrata: esito.quadratura.ok,
      });
    } finally {
      setInCorso(false);
    }
  };

  const selectCls = 'p-1.5 text-xs border border-slate-200 rounded-lg bg-white text-slate-900';

  return (
    <div className="bg-white border-2 border-blue-200 rounded-xl p-5 space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <FileSpreadsheet className="w-4 h-4 text-blue-600 mt-0.5" />
          <div>
            <h3 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
              Import del bilancino — {file.name}
            </h3>
            <p className="text-[11px] text-slate-500 mt-1">
              Il file resta sul tuo computer: qui si leggono colonne e conti, poi passano al
              prospetto solo le macro-voci. Controlla le colonne riconosciute e la classificazione
              dei conti.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onChiudi}
          className="flex items-center gap-1 px-2.5 py-1.5 text-slate-500 hover:text-red-600 text-[10px] font-bold uppercase"
        >
          <X className="w-3.5 h-3.5" /> Annulla
        </button>
      </div>

      {errore && (
        <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <p>{errore}</p>
        </div>
      )}

      {caricamento && <p className="text-xs text-slate-400">Lettura del file…</p>}

      {!caricamento && colonne && (
        <>
          {tracciato && (
            <div className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
              {tracciato.origine === 'stessa_azienda'
                ? 'Formato già usato per questa azienda: colonne e classificazione dei conti riprese dal tracciato memorizzato. Controlla solo i conti nuovi.'
                : tracciato.origine === 'stessa_azienda_altro_formato'
                  ? 'Formato nuovo per questa azienda: colonne riconosciute di nuovo, classificazione ripresa per i conti già noti.'
                  : 'Formato già usato per un’altra azienda: colonne riprese; la classificazione dei conti è proposta di nuovo.'}
            </div>
          )}

          <div className="space-y-3">
            <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              1. Colonne del file
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
              {fogli.length > 1 && (
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] font-bold text-slate-500 uppercase">Foglio</span>
                  <select
                    className={selectCls}
                    value={foglio}
                    onChange={async (e) => {
                      const i = Number(e.target.value);
                      setFoglio(i);
                      await analizzaFoglio(fogli[i].righe);
                    }}
                  >
                    {fogli.map((f, i) => (
                      <option key={f.nome} value={i}>
                        {f.nome}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase">
                  Riga di intestazione
                </span>
                <select
                  className={selectCls}
                  value={colonne.rigaIntestazione}
                  onChange={(e) => cambiaColonne({ rigaIntestazione: Number(e.target.value) })}
                >
                  <option value={-1}>Nessuna intestazione</option>
                  {righe.slice(0, 40).map((r, i) => (
                    <option key={i} value={i}>
                      Riga {i + 1}
                      {r && r.some((c) => c !== null && c !== '')
                        ? ` — ${r
                            .filter((c) => c !== null && c !== '')
                            .slice(0, 3)
                            .join(' · ')
                            .slice(0, 40)}`
                        : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase">Codice conto</span>
                <select
                  className={selectCls}
                  value={colonne.codice ?? ''}
                  onChange={(e) =>
                    cambiaColonne({ codice: e.target.value === '' ? null : Number(e.target.value) })
                  }
                >
                  <option value="">Nessun codice</option>
                  {opzioniColonna.map((o) => (
                    <option key={o.valore} value={o.valore}>
                      {o.etichetta}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase">
                  Descrizione del conto
                </span>
                <select
                  className={selectCls}
                  value={colonne.descrizione}
                  onChange={(e) => cambiaColonne({ descrizione: Number(e.target.value) })}
                >
                  {opzioniColonna.map((o) => (
                    <option key={o.valore} value={o.valore}>
                      {o.etichetta}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase">Importi</span>
                <select
                  className={selectCls}
                  value={colonne.modo}
                  onChange={(e) => {
                    const modo = e.target.value as ModoImporti;
                    if (modo === 'dare_avere') {
                      const nuove = riconosciColonne(righe);
                      cambiaColonne({
                        modo,
                        dare: nuove.dare ?? colonne.saldo ?? 0,
                        avere: nuove.avere ?? Math.min((colonne.saldo ?? 0) + 1, numColonne - 1),
                      });
                    } else {
                      cambiaColonne({
                        modo,
                        saldo: colonne.saldo ?? colonne.avere ?? colonne.dare ?? 0,
                      });
                    }
                  }}
                >
                  {(Object.keys(ETICHETTE_MODO) as ModoImporti[]).map((m) => (
                    <option key={m} value={m}>
                      {ETICHETTE_MODO[m]}
                    </option>
                  ))}
                </select>
              </label>
              {colonne.modo === 'dare_avere' ? (
                <>
                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] font-bold text-slate-500 uppercase">
                      Colonna Dare
                    </span>
                    <select
                      className={selectCls}
                      value={colonne.dare ?? ''}
                      onChange={(e) => cambiaColonne({ dare: Number(e.target.value) })}
                    >
                      {opzioniColonna.map((o) => (
                        <option key={o.valore} value={o.valore}>
                          {o.etichetta}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] font-bold text-slate-500 uppercase">
                      Colonna Avere
                    </span>
                    <select
                      className={selectCls}
                      value={colonne.avere ?? ''}
                      onChange={(e) => cambiaColonne({ avere: Number(e.target.value) })}
                    >
                      {opzioniColonna.map((o) => (
                        <option key={o.valore} value={o.valore}>
                          {o.etichetta}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              ) : (
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] font-bold text-slate-500 uppercase">
                    Colonna del saldo
                  </span>
                  <select
                    className={selectCls}
                    value={colonne.saldo ?? ''}
                    onChange={(e) => cambiaColonne({ saldo: Number(e.target.value) })}
                  >
                    {opzioniColonna.map((o) => (
                      <option key={o.valore} value={o.valore}>
                        {o.etichetta}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            <p className="text-[11px] text-slate-500">
              Conti letti: <strong className="text-slate-800">{conti.length}</strong>. Si saltano le
              righe senza descrizione o senza importo (titoli di sezione, righe vuote).
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                2. Classificazione dei conti
              </h4>
              <div className="flex gap-1 text-[10px] font-bold uppercase">
                <button
                  type="button"
                  onClick={() => setFiltro('controllare')}
                  className={`px-2.5 py-1 rounded-lg ${filtro === 'controllare' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'}`}
                >
                  Da controllare ({daControllare.length})
                </button>
                <button
                  type="button"
                  onClick={() => setFiltro('tutti')}
                  className={`px-2.5 py-1 rounded-lg ${filtro === 'tutti' ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-600'}`}
                >
                  Tutti ({conti.length})
                </button>
              </div>
            </div>
            {filtro === 'controllare' && daControllare.length === 0 ? (
              <p className="text-xs text-emerald-700 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" /> Nessun conto da controllare: tutti classificati
                con certezza o dal tracciato memorizzato. Puoi rivederli in «Tutti».
              </p>
            ) : (
              <div className="max-h-96 overflow-y-auto border border-slate-200 rounded-lg">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-slate-100 text-[9px] font-bold text-slate-600 uppercase">
                    <tr>
                      <th className="p-2 text-left">Riga</th>
                      <th className="p-2 text-left">Conto</th>
                      <th className="p-2 text-right">Saldo (dare − avere)</th>
                      <th className="p-2 text-left">Categoria</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {visibili.map((c) => {
                      const o = origine[c.chiave];
                      return (
                        <tr key={c.chiave} className={!mappa[c.chiave] ? 'bg-amber-50' : ''}>
                          <td className="p-2 text-slate-400 font-mono">{c.riga}</td>
                          <td className="p-2 text-slate-800">
                            {c.codice && (
                              <span className="font-mono text-slate-500 mr-1.5">{c.codice}</span>
                            )}
                            {c.descrizione}
                          </td>
                          <td className="p-2 text-right font-mono text-slate-700">
                            {euro(c.saldo)}
                          </td>
                          <td className="p-2">
                            <select
                              className={`${selectCls} w-full`}
                              value={mappa[c.chiave] ?? ''}
                              onChange={(e) => cambiaCategoria(c.chiave, e.target.value)}
                            >
                              <option value="">— da scegliere —</option>
                              {GRUPPI.map((g) => (
                                <optgroup key={g} label={g}>
                                  {CATEGORIE.filter((k) => k.gruppo === g).map((k) => (
                                    <option key={k.id} value={k.id}>
                                      {k.etichetta}
                                    </option>
                                  ))}
                                </optgroup>
                              ))}
                            </select>
                            <span className="block text-[9px] text-slate-400 mt-0.5">
                              {o === 'memoria'
                                ? 'dal tracciato memorizzato'
                                : o === 'proposta'
                                  ? 'proposta dalla descrizione'
                                  : o === 'proposta_incerta'
                                    ? 'proposta incerta: verifica'
                                    : o === 'operatore'
                                      ? 'scelta tua'
                                      : 'nessuna proposta'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {esito && (
            <div className="space-y-3">
              <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                3. Riepilogo e quadratura
              </h4>
              <div
                className={`flex items-start gap-2 text-xs rounded-lg p-3 border ${
                  esito.quadratura.ok
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-red-50 border-red-200 text-red-800'
                }`}
              >
                <Scale className="w-4 h-4 shrink-0 mt-0.5" />
                <p>
                  {esito.quadratura.ok ? 'Il bilancino quadra' : 'Il bilancino non quadra'}: attivo{' '}
                  <strong>{euro(esito.quadratura.attivo)} €</strong>, passivo e netto (compreso il
                  risultato del periodo di {euro(esito.risultatoPeriodo)} €){' '}
                  <strong>{euro(esito.quadratura.passivoENetto)} €</strong>
                  {esito.quadratura.ok
                    ? '.'
                    : `, differenza ${euro(esito.quadratura.differenza)} €. Di solito è un conto senza categoria, un totale non escluso o il segno degli importi.`}
                  {esito.nonAssegnati.length > 0 &&
                    ` Conti senza categoria: ${esito.nonAssegnati.length}.`}
                </p>
              </div>
              {esito.doppiaNaturaSenzaSegno.length > 0 && (
                <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">
                  Importi senza segno: per{' '}
                  {esito.doppiaNaturaSenzaSegno.map((c) => c.descrizione).join(', ')} il lato
                  (credito o debito) è quello predefinito e non si può verificare.
                </p>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 text-xs">
                {(['CE', 'SP'] as const).map((g) => (
                  <table key={g} className="w-full">
                    <tbody className="divide-y divide-slate-100">
                      {CAMPI_POSIZIONE.filter((c) => c.gruppo === g).map((c) => (
                        <tr key={c.chiave}>
                          <td className="py-1 text-slate-600">{c.etichetta}</td>
                          <td className="py-1 text-right font-mono text-slate-900">
                            {euro(esito.dati[c.chiave])}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ))}
              </div>
              <p className="text-[10px] text-slate-500">
                Il passivo corrente comprende tutti i debiti tranne mutui e finanziamenti a
                medio-lungo termine: il bilancino non distingue le scadenze.
              </p>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onChiudi}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[10px] uppercase rounded-lg"
            >
              Annulla
            </button>
            <button
              type="button"
              onClick={handleApplica}
              disabled={inCorso || conti.length === 0}
              className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-bold text-[10px] uppercase rounded-lg"
            >
              {inCorso ? 'Memorizzazione…' : 'Porta nel prospetto'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
