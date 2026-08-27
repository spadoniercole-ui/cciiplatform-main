'use client';

// Posizione V.E.R.A. — importa il file INPS "DettaglioRichiesta" leggendo
// TUTTE le sezioni del foglio, ognuna con la natura data dal titolo (mappato
// una volta su una categoria). Mostra VERA raggruppata per categoria e la
// verifica CERTO-PER-CERTO contro la Situazione Debitoria contabilizzata:
// categoria per categoria, con il delta = il non contabilizzato.

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, ClipboardCheck, Scale, FileDown, Pencil, Trash2 } from 'lucide-react';
import {
  analizzaVera,
  estraiRigheVera,
  ETICHETTE_TRATTAMENTO,
  type SezioneVera,
  type RigaVera,
  type TrattamentoVera,
  type CombinazioneVera,
} from '@/lib/debitiEnte/veraImport';
import {
  ottieniMappaturaTitoliVera,
  salvaMappaturaTitoliVeraAction,
  ottieniDebitiVera,
  sostituisciDebitiVeraAction,
  ottieniTitoliVera,
  aggiornaTitoloVeraAction,
  dimenticaTitoloVeraAction,
  ottieniMappaturaTrattamentiVera,
  ottieniTrattamentiVera,
  salvaTrattamentiVeraAction,
  aggiornaTrattamentoVeraAction,
  dimenticaTrattamentoVeraAction,
  type RigaVeraSalvata,
  type TitoloVera,
  type TrattamentoVeraRiga,
} from '@/app/actions/posizioneVera';
import {
  ottieniCategorieTipoDebito,
  type CategoriaTipoDebito,
} from '@/app/actions/categorieTipoDebito';
import { ottieniDebitiEnte, type RigaDebitoEnte } from '@/app/actions/debitiEnte';
import { etichettaTipoDebito } from '@/lib/debitiEnte/tipoDebito';
import { stampaHtml } from '@/lib/stampaTesto';
import {
  calcolaConfrontoVera,
  type TrattamentoVeraRigaConfronto,
} from '@/lib/debitiEnte/confrontoVera';

interface Props {
  nomeSchema: string;
  aziendaId: number;
}

const euro = (n: number) =>
  `€ ${n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function PosizioneVeraScenario({ nomeSchema, aziendaId }: Props) {
  const router = useRouter();
  const [categorie, setCategorie] = useState<CategoriaTipoDebito[]>([]);
  const [righeVera, setRigheVera] = useState<RigaVeraSalvata[]>([]);
  const [righeEnte, setRigheEnte] = useState<RigaDebitoEnte[]>([]);
  const [mappaturaTitoli, setMappaturaTitoli] = useState<Record<string, string>>({});
  const [titoli, setTitoli] = useState<TitoloVera[]>([]);
  const [correzione, setCorrezione] = useState<{ norm: string; categoria: string } | null>(null);
  const [mappaturaTrattamenti, setMappaturaTrattamenti] = useState<Record<string, TrattamentoVera>>(
    {}
  );
  const [trattamenti, setTrattamenti] = useState<TrattamentoVeraRiga[]>([]);
  const [correzioneTratt, setCorrezioneTratt] = useState<{
    chiave: string;
    trattamento: TrattamentoVera;
  } | null>(null);
  const [combinazioniDaMappare, setCombinazioniDaMappare] = useState<{
    sezioni: SezioneVera[];
    combinazioni: CombinazioneVera[];
    scelte: Record<string, TrattamentoVera>;
  } | null>(null);
  const [caricamento, setCaricamento] = useState(true);
  const [inElaborazione, setInElaborazione] = useState(false);
  const [esito, setEsito] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);

  // Mappatura titoli nuovi in sospeso (dopo un caricamento con titoli mai visti).
  const [titoliDaMappare, setTitoliDaMappare] = useState<{
    sezioni: SezioneVera[];
    titoli: { norm: string; label: string }[];
    scelte: Record<string, string>;
  } | null>(null);

  const categorieAttive = categorie.filter((c) => c.attivo);
  const mappaEtichette: Record<string, string> = Object.fromEntries(
    categorie.map((c) => [c.codice, c.etichetta])
  );

  const carica = async () => {
    setCaricamento(true);
    try {
      const [rCat, rVera, rEnte, rMap, rTit, rTrM, rTr] = await Promise.all([
        ottieniCategorieTipoDebito(nomeSchema),
        ottieniDebitiVera(nomeSchema, aziendaId),
        ottieniDebitiEnte(nomeSchema, aziendaId),
        ottieniMappaturaTitoliVera(nomeSchema),
        ottieniTitoliVera(nomeSchema),
        ottieniMappaturaTrattamentiVera(nomeSchema),
        ottieniTrattamentiVera(nomeSchema),
      ]);
      if (rCat.success) setCategorie(rCat.categorie);
      if (rVera.success) setRigheVera(rVera.righe);
      if (rEnte.success) setRigheEnte(rEnte.righe);
      if (rMap.success) setMappaturaTitoli(rMap.mappatura);
      if (rTit.success) setTitoli(rTit.titoli);
      if (rTrM.success) setMappaturaTrattamenti(rTrM.mappatura);
      if (rTr.success) setTrattamenti(rTr.trattamenti);
    } finally {
      setCaricamento(false);
    }
  };

  useEffect(() => {
    carica();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nomeSchema, aziendaId]);

  const importaSezioni = async (
    sezioni: SezioneVera[],
    titoliMap: Record<string, string>,
    trattMap: Record<string, TrattamentoVera>
  ) => {
    const { righe } = estraiRigheVera(sezioni, titoliMap, trattMap);
    const res = await sostituisciDebitiVeraAction(nomeSchema, aziendaId, righe as RigaVera[]);
    if (!res.success) {
      setErrore(res.error || 'Impossibile salvare la posizione VERA.');
      return;
    }
    await carica();
    router.refresh();
    setEsito(`Importate ${righe.length} righe VERA da ${sezioni.length} sezioni.`);
  };

  // Router dell'import: se mancano titoli → chiede i titoli; poi se mancano
  // combinazioni Natura+Stato → chiede i trattamenti; poi importa.
  const procediImport = async (
    sezioni: SezioneVera[],
    titoliMap: Record<string, string>,
    trattMap: Record<string, TrattamentoVera>
  ) => {
    const { titoliNonMappati, combinazioniNonMappate } = estraiRigheVera(
      sezioni,
      titoliMap,
      trattMap
    );
    if (titoliNonMappati.length > 0) {
      setTitoliDaMappare({ sezioni, titoli: titoliNonMappati, scelte: {} });
      return;
    }
    if (combinazioniNonMappate.length > 0) {
      setCombinazioniDaMappare({
        sezioni,
        combinazioni: combinazioniNonMappate,
        scelte: Object.fromEntries(combinazioniNonMappate.map((c) => [c.chiave, c.suggerito])),
      });
      return;
    }
    await importaSezioni(sezioni, titoliMap, trattMap);
  };

  const handleFile = async (file: File) => {
    setErrore(null);
    setEsito(null);
    setInElaborazione(true);
    try {
      const analisi = await analizzaVera(file);
      if (analisi.sezioni.length === 0) {
        setEsito('Nessuna sezione riconosciuta nel foglio Dettaglio Verifica.');
        return;
      }
      await procediImport(analisi.sezioni, mappaturaTitoli, mappaturaTrattamenti);
    } catch (err: any) {
      setEsito(`Impossibile leggere il file: ${err.message || err}`);
    } finally {
      setInElaborazione(false);
    }
  };

  const confermaMappaturaTitoli = async () => {
    if (!titoliDaMappare) return;
    const mancanti = titoliDaMappare.titoli.filter((t) => !titoliDaMappare.scelte[t.norm]);
    if (mancanti.length > 0) return;
    setInElaborazione(true);
    try {
      await salvaMappaturaTitoliVeraAction(
        nomeSchema,
        titoliDaMappare.titoli.map((t) => ({
          norm: t.norm,
          label: t.label,
          categoria: titoliDaMappare.scelte[t.norm],
        }))
      );
      const mappaturaAgg = { ...mappaturaTitoli, ...titoliDaMappare.scelte };
      setMappaturaTitoli(mappaturaAgg);
      const sezioni = titoliDaMappare.sezioni;
      setTitoliDaMappare(null);
      await procediImport(sezioni, mappaturaAgg, mappaturaTrattamenti);
    } finally {
      setInElaborazione(false);
    }
  };

  const confermaCombinazioni = async () => {
    if (!combinazioniDaMappare) return;
    setInElaborazione(true);
    try {
      await salvaTrattamentiVeraAction(
        nomeSchema,
        combinazioniDaMappare.combinazioni.map((c) => ({
          chiave: c.chiave,
          natura: c.natura,
          stato: c.stato,
          trattamento: combinazioniDaMappare.scelte[c.chiave],
        }))
      );
      const trattAgg = { ...mappaturaTrattamenti, ...combinazioniDaMappare.scelte };
      setMappaturaTrattamenti(trattAgg);
      const sezioni = combinazioniDaMappare.sezioni;
      setCombinazioniDaMappare(null);
      await procediImport(sezioni, mappaturaTitoli, trattAgg);
    } finally {
      setInElaborazione(false);
    }
  };

  const confermaCorrezioneTitolo = async () => {
    if (!correzione || !correzione.categoria) return;
    setInElaborazione(true);
    setErrore(null);
    try {
      const res = await aggiornaTitoloVeraAction(nomeSchema, correzione.norm, correzione.categoria);
      if (!res.success) {
        setErrore(res.error || 'Impossibile correggere la sezione.');
        return;
      }
      setCorrezione(null);
      await carica();
      router.refresh();
      setEsito(
        `Sezione corretta.` +
          (res.righeAggiornate
            ? ` Nuova categoria ri-applicata a ${res.righeAggiornate} righe già importate.`
            : '')
      );
    } finally {
      setInElaborazione(false);
    }
  };

  const dimenticaTitolo = async (t: TitoloVera) => {
    if (
      !window.confirm(
        `Dimenticare la sezione «${t.titolo}»? La mappatura verrà rimossa (al prossimo caricamento la richiederò di nuovo) e le sue righe VERA di questa azienda saranno eliminate.`
      )
    )
      return;
    setInElaborazione(true);
    try {
      const res = await dimenticaTitoloVeraAction(nomeSchema, t.norm, aziendaId);
      if (!res.success) setErrore(res.error || 'Impossibile dimenticare la sezione.');
      await carica();
      router.refresh();
    } finally {
      setInElaborazione(false);
    }
  };

  const confermaCorrezioneTratt = async () => {
    if (!correzioneTratt) return;
    setInElaborazione(true);
    setErrore(null);
    try {
      const res = await aggiornaTrattamentoVeraAction(
        nomeSchema,
        correzioneTratt.chiave,
        correzioneTratt.trattamento
      );
      if (!res.success) {
        setErrore(res.error || 'Impossibile correggere il trattamento.');
        return;
      }
      setCorrezioneTratt(null);
      await carica();
      router.refresh();
      setEsito(
        `Trattamento corretto.` +
          (res.righeAggiornate ? ` Ri-applicato a ${res.righeAggiornate} righe.` : '')
      );
    } finally {
      setInElaborazione(false);
    }
  };

  const dimenticaTratt = async (t: TrattamentoVeraRiga) => {
    if (
      !window.confirm(
        `Dimenticare la combinazione «${t.natura} / ${t.stato || 'nessuno stato'}»? Verrà richiesta di nuovo al prossimo caricamento e le sue righe VERA di questa azienda saranno eliminate.`
      )
    )
      return;
    setInElaborazione(true);
    try {
      const res = await dimenticaTrattamentoVeraAction(nomeSchema, t.chiave, aziendaId);
      if (!res.success) setErrore(res.error || 'Impossibile dimenticare la combinazione.');
      await carica();
      router.refresh();
    } finally {
      setInElaborazione(false);
    }
  };

  if (caricamento) return <p className="text-xs text-slate-400">Caricamento...</p>;

  const nonContribuisce = new Set(categorie.filter((c) => !c.contribuisce).map((c) => c.codice));

  // Il TRATTAMENTO (dalla catena Natura+Stato) decide se una riga vale come
  // importo. Solo contabilizzato e da_contabilizzare hanno un importo noto;
  // potenziale = importo ignoto (evidenza, fuori dai totali); ignora = escluso.
  const righeImporto = righeVera.filter(
    (r) => r.trattamento === 'contabilizzato' || r.trattamento === 'da_contabilizzare'
  );
  const righePotenziali = righeVera.filter((r) => r.trattamento === 'potenziale');

  // Confronto certo-per-certo per categoria: DEFINIZIONE UNICA in
  // src/lib/debitiEnte/confrontoVera.ts, la stessa che alimenta la griglia
  // delle soglie art. 25-novies in testata allo Screening. Qui non si
  // ricalcola: due copie della stessa regola finiscono per divergere, e
  // divergere qui significa mostrare due cifre diverse sulla stessa azienda.
  const confrontoVera = calcolaConfrontoVera(
    righeEnte.map((r) => ({ tipo: r.tipo, importo: r.importo })),
    righeVera.map((r) => ({
      categoria: r.categoria,
      importo: r.importo,
      trattamento: r.trattamento as TrattamentoVeraRigaConfronto,
    })),
    categorie.map((c) => ({ codice: c.codice, contribuisce: c.contribuisce !== false }))
  );
  const confronto = confrontoVera.perCategoria.map((x) => ({
    cod: x.codice,
    contab: x.contabilizzato,
    vera: x.vera,
    delta: x.delta,
    neutra: x.neutra,
  }));
  const totContab = confrontoVera.totaleContabilizzato;
  const totVera = confrontoVera.totaleVera;

  // VERA per categoria (solo importi noti).
  const codiciPresenti = confrontoVera.perCategoria.map((x) => x.codice);
  const veraPerCategoria = codiciPresenti
    .map((cod) => {
      const righe = righeImporto.filter((r) => r.categoria === cod);
      return { cod, numeroRighe: righe.length, totale: righe.reduce((a, r) => a + r.importo, 0) };
    })
    .filter((x) => x.numeroRighe > 0);

  // ESPOSIZIONE TOTALE verso l'ente = contabilizzato + da contabilizzare
  // (perimetro non neutro). I potenziali restano fuori (importo ignoto).
  const veraNonNeutra = righeImporto.filter((r) => !nonContribuisce.has(r.categoria));
  const espContab = veraNonNeutra
    .filter((r) => r.trattamento === 'contabilizzato')
    .reduce((a, r) => a + r.importo, 0);
  const espDaContab = veraNonNeutra
    .filter((r) => r.trattamento === 'da_contabilizzare')
    .reduce((a, r) => a + r.importo, 0);
  const espTotale = espContab + espDaContab;

  // Da contabilizzare (trattamento da_contabilizzare), raggruppato per dicitura di Stato.
  const righeNonContab = righeVera.filter((r) => r.trattamento === 'da_contabilizzare');
  const totContabVera = espContab;
  const totNonContabVera = righeNonContab.reduce((a, r) => a + r.importo, 0);
  const perDicitura = Array.from(
    righeNonContab.reduce((m, r) => {
      const k = r.stato || '(nessuno stato)';
      const cur = m.get(k) || { numero: 0, totale: 0 };
      cur.numero += 1;
      cur.totale += r.importo;
      m.set(k, cur);
      return m;
    }, new Map<string, { numero: number; totale: number }>())
  ).map(([dicitura, v]) => ({ dicitura, ...v }));

  // Potenziali a importo ignoto (trattamento potenziale), raggruppati per natura.
  const perNaturaPotenziale = Array.from(
    righePotenziali.reduce((m, r) => {
      m.set(r.voce, (m.get(r.voce) || 0) + 1);
      return m;
    }, new Map<string, number>())
  ).map(([natura, numero]) => ({ natura, numero }));

  const handleStampaPdf = () => {
    const esc = (s: string) => s.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const righeConfronto = confronto
      .map(
        (x) => `<tr${x.neutra ? ' style="color:#94a3b8"' : ''}>
        <td>${esc(etichettaTipoDebito(x.cod, mappaEtichette))}${x.neutra ? ' (neutra)' : ''}</td>
        <td class="num">${euro(x.contab)}</td>
        <td class="num">${euro(x.vera)}</td>
        <td class="num">${x.neutra ? '—' : euro(x.delta)}</td></tr>`
      )
      .join('');
    const corpo = `
      <p style="font-size:13px"><strong>Esposizione totale verso l'ente:</strong> ${euro(espTotale)} — di cui contabilizzato ${euro(espContab)} e da contabilizzare ${euro(espDaContab)}.</p>
      <table>
        <thead><tr><th>Categoria</th><th class="num">Contabilizzato (ente)</th><th class="num">VERA</th><th class="num">Delta (non contabilizzato)</th></tr></thead>
        <tbody>
          ${righeConfronto}
          <tr class="tot"><td>Totale</td><td class="num">${euro(totContab)}</td><td class="num">${euro(totVera)}</td><td class="num">${euro(totVera - totContab)}</td></tr>
        </tbody>
      </table>
      <p class="note">«Contabilizzato» = somma della Situazione Debitoria per categoria. «VERA» = somma del «Totale debito» (al netto del credito) del file di verifica per categoria. Le categorie neutre non alimentano i totali.</p>`;
    const bloccoNonContab =
      perDicitura.length > 0
        ? `<h1 style="font-size:15px;margin-top:28px">Debiti non ancora contabilizzati (da lavorare)</h1>
      <table>
        <thead><tr><th>Stato (dicitura)</th><th class="num">Voci</th><th class="num">Importo</th></tr></thead>
        <tbody>
          ${perDicitura.map((d) => `<tr><td>${esc(d.dicitura)}</td><td class="num">${d.numero}</td><td class="num">${euro(d.totale)}</td></tr>`).join('')}
          <tr class="tot"><td>Totale non contabilizzato</td><td class="num">${righeNonContab.length}</td><td class="num">${euro(totNonContabVera)}</td></tr>
        </tbody>
      </table>
      <p class="note">Righe con la colonna «Stato» valorizzata: debiti certi ma non ancora esigibili, da lavorare secondo la dicitura per renderli esigibili. Le righe con Stato vuoto sono già contabilizzate (${euro(totContabVera)}).</p>`
        : '';
    const bloccoPotenziali =
      perNaturaPotenziale.length > 0
        ? `<h1 style="font-size:15px;margin-top:28px">Potenziali a importo ignoto</h1>
      <table>
        <thead><tr><th>Natura</th><th class="num">Righe</th></tr></thead>
        <tbody>
          ${perNaturaPotenziale.map((p) => `<tr><td>${esc(p.natura)}</td><td class="num">${p.numero}</td></tr>`).join('')}
          <tr class="tot"><td>Totale posizioni potenziali</td><td class="num">${righePotenziali.length}</td></tr>
        </tbody>
      </table>
      <p class="note">Righe con natura ma senza importo: debiti potenziali di entità ignota (possibili passività future da quantificare). Fuori dai totali.</p>`
        : '';
    stampaHtml(
      'Verifica certo per certo — Posizione V.E.R.A.',
      corpo + bloccoNonContab + bloccoPotenziali,
      `Generato il ${new Date().toLocaleString('it-IT')}`
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
          Posizione V.E.R.A.
        </h2>
        <p className="text-[11px] text-slate-500 mt-1">
          La fotografia completa (contabilizzati e non) dal file di verifica INPS. Ogni sezione del
          foglio ha la sua natura, data dal titolo. Serve al confronto{' '}
          <strong>certo per certo</strong> con quanto l&apos;ente ha già contabilizzato: la
          differenza è il non contabilizzato che, in presenza di proposta, andrà contabilizzato.
        </p>
      </div>

      {errore && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          {errore}
        </div>
      )}
      {esito && (
        <div className="text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-3">
          {esito}
        </div>
      )}

      {/* Caricamento */}
      {!titoliDaMappare && !combinazioniDaMappare && (
        <label className="inline-flex items-center gap-1.5 px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-[10px] uppercase rounded-lg transition-colors cursor-pointer">
          <Upload className="w-3.5 h-3.5" />
          {inElaborazione
            ? 'Elaborazione...'
            : righeVera.length > 0
              ? 'Ricarica file VERA'
              : 'Carica file VERA'}
          <input
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            disabled={inElaborazione}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = '';
            }}
          />
        </label>
      )}

      {/* Catalogo sezioni VERA riconosciute — Correggi / Dimentica */}
      {!titoliDaMappare && !combinazioniDaMappare && titoli.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            Sezioni VERA riconosciute
          </span>
          {titoli.map((t) => (
            <div
              key={t.norm}
              className="flex items-center gap-2 flex-wrap border border-slate-200 rounded-lg px-3 py-2"
            >
              <span className="font-bold text-slate-700 text-xs flex-1 min-w-0 truncate">
                {t.titolo}
              </span>
              {correzione?.norm === t.norm ? (
                <>
                  <select
                    value={correzione.categoria}
                    onChange={(e) => setCorrezione({ ...correzione, categoria: e.target.value })}
                    className="p-1.5 text-xs border border-slate-200 rounded text-slate-900 bg-white"
                  >
                    {categorieAttive.map((c) => (
                      <option key={c.codice} value={c.codice}>
                        {c.etichetta}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={confermaCorrezioneTitolo}
                    disabled={inElaborazione}
                    className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white font-bold text-[10px] uppercase rounded"
                  >
                    Salva
                  </button>
                  <button
                    type="button"
                    onClick={() => setCorrezione(null)}
                    className="px-2 py-1 text-[10px] font-bold uppercase text-slate-400 hover:text-slate-700"
                  >
                    Annulla
                  </button>
                </>
              ) : (
                <>
                  <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-slate-100 text-slate-700">
                    {etichettaTipoDebito(t.categoria, mappaEtichette)}
                  </span>
                  <button
                    type="button"
                    onClick={() => setCorrezione({ norm: t.norm, categoria: t.categoria })}
                    className="flex items-center gap-1 px-2 py-1 text-[10px] font-bold uppercase text-blue-600 hover:bg-blue-50 rounded"
                  >
                    <Pencil className="w-3 h-3" /> Correggi
                  </button>
                  <button
                    type="button"
                    onClick={() => dimenticaTitolo(t)}
                    className="flex items-center gap-1 px-2 py-1 text-[10px] font-bold uppercase text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"
                  >
                    <Trash2 className="w-3 h-3" /> Dimentica
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Mappatura titoli di sezione nuovi */}
      {titoliDaMappare && (
        <div className="bg-white border border-amber-200 rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="w-4 h-4 text-amber-600" />
            <h3 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
              Sezioni nuove — assegna la natura
            </h3>
          </div>
          <p className="text-[11px] text-slate-500">
            Questo file contiene sezioni mai viste prima. Dì a quale categoria appartiene ciascuna:
            la scelta viene ricordata per i prossimi caricamenti.
          </p>
          <div className="space-y-1.5">
            {titoliDaMappare.titoli.map((t) => (
              <div key={t.norm} className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-slate-700 flex-1 min-w-0 truncate">
                  {t.label}
                </span>
                <select
                  value={titoliDaMappare.scelte[t.norm] || ''}
                  onChange={(e) =>
                    setTitoliDaMappare({
                      ...titoliDaMappare,
                      scelte: { ...titoliDaMappare.scelte, [t.norm]: e.target.value },
                    })
                  }
                  className="p-1.5 text-xs border border-slate-200 rounded text-slate-900 bg-white"
                >
                  <option value="">— categoria —</option>
                  {categorieAttive.map((c) => (
                    <option key={c.codice} value={c.codice}>
                      {c.etichetta}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setTitoliDaMappare(null)}
              className="px-4 py-2 text-xs font-bold uppercase text-slate-500 hover:text-slate-700"
            >
              Annulla
            </button>
            <button
              type="button"
              onClick={confermaMappaturaTitoli}
              disabled={
                inElaborazione ||
                titoliDaMappare.titoli.some((t) => !titoliDaMappare.scelte[t.norm])
              }
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white font-bold uppercase tracking-wider rounded-lg text-xs"
            >
              {inElaborazione ? 'Import...' : 'Salva e importa'}
            </button>
          </div>
        </div>
      )}

      {/* Mappatura combinazioni Natura+Stato nuove → trattamento */}
      {combinazioniDaMappare && (
        <div className="bg-white border border-amber-200 rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="w-4 h-4 text-amber-600" />
            <h3 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
              Combinazioni nuove — assegna il trattamento
            </h3>
          </div>
          <p className="text-[11px] text-slate-500">
            La catena <strong>Natura → Stato → Importo</strong> va letta insieme. Per ogni
            combinazione mai vista scegli come trattarla. Le righe con natura ma senza importo (es.
            «Denunce non trasmesse») sono debiti potenziali di entità ignota: vanno tenute come
            «Potenziale». La scelta viene ricordata per i prossimi caricamenti.
          </p>
          <div className="space-y-1.5">
            {combinazioniDaMappare.combinazioni.map((c) => (
              <div key={c.chiave} className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-slate-700 flex-1 min-w-0 truncate">
                  <span className="font-bold">{c.natura}</span>
                  <span className="text-slate-400"> / {c.stato || 'nessuno stato'}</span>
                </span>
                <select
                  value={combinazioniDaMappare.scelte[c.chiave] || ''}
                  onChange={(e) =>
                    setCombinazioniDaMappare({
                      ...combinazioniDaMappare,
                      scelte: {
                        ...combinazioniDaMappare.scelte,
                        [c.chiave]: e.target.value as TrattamentoVera,
                      },
                    })
                  }
                  className="p-1.5 text-xs border border-slate-200 rounded text-slate-900 bg-white"
                >
                  {(Object.keys(ETICHETTE_TRATTAMENTO) as TrattamentoVera[]).map((t) => (
                    <option key={t} value={t}>
                      {ETICHETTE_TRATTAMENTO[t]}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setCombinazioniDaMappare(null)}
              className="px-4 py-2 text-xs font-bold uppercase text-slate-500 hover:text-slate-700"
            >
              Annulla
            </button>
            <button
              type="button"
              onClick={confermaCombinazioni}
              disabled={
                inElaborazione ||
                combinazioniDaMappare.combinazioni.some(
                  (c) => !combinazioniDaMappare.scelte[c.chiave]
                )
              }
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white font-bold uppercase tracking-wider rounded-lg text-xs"
            >
              {inElaborazione ? 'Import...' : 'Salva e importa'}
            </button>
          </div>
        </div>
      )}

      {/* Catalogo combinazioni Natura+Stato → trattamento — Correggi / Dimentica */}
      {!titoliDaMappare && !combinazioniDaMappare && trattamenti.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            Combinazioni Natura+Stato riconosciute
          </span>
          {trattamenti.map((t) => (
            <div
              key={t.chiave}
              className="flex items-center gap-2 flex-wrap border border-slate-200 rounded-lg px-3 py-2"
            >
              <span className="text-xs text-slate-700 flex-1 min-w-0 truncate">
                <span className="font-bold">{t.natura}</span>
                <span className="text-slate-400"> / {t.stato || 'nessuno stato'}</span>
              </span>
              {correzioneTratt?.chiave === t.chiave ? (
                <>
                  <select
                    value={correzioneTratt.trattamento}
                    onChange={(e) =>
                      setCorrezioneTratt({
                        ...correzioneTratt,
                        trattamento: e.target.value as TrattamentoVera,
                      })
                    }
                    className="p-1.5 text-xs border border-slate-200 rounded text-slate-900 bg-white"
                  >
                    {(Object.keys(ETICHETTE_TRATTAMENTO) as TrattamentoVera[]).map((tt) => (
                      <option key={tt} value={tt}>
                        {ETICHETTE_TRATTAMENTO[tt]}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={confermaCorrezioneTratt}
                    disabled={inElaborazione}
                    className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white font-bold text-[10px] uppercase rounded"
                  >
                    Salva
                  </button>
                  <button
                    type="button"
                    onClick={() => setCorrezioneTratt(null)}
                    className="px-2 py-1 text-[10px] font-bold uppercase text-slate-400 hover:text-slate-700"
                  >
                    Annulla
                  </button>
                </>
              ) : (
                <>
                  <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-slate-100 text-slate-700">
                    {ETICHETTE_TRATTAMENTO[t.trattamento]}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setCorrezioneTratt({ chiave: t.chiave, trattamento: t.trattamento })
                    }
                    className="flex items-center gap-1 px-2 py-1 text-[10px] font-bold uppercase text-blue-600 hover:bg-blue-50 rounded"
                  >
                    <Pencil className="w-3 h-3" /> Correggi
                  </button>
                  <button
                    type="button"
                    onClick={() => dimenticaTratt(t)}
                    className="flex items-center gap-1 px-2 py-1 text-[10px] font-bold uppercase text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"
                  >
                    <Trash2 className="w-3 h-3" /> Dimentica
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Esposizione totale verso l'ente = contabilizzato + da contabilizzare */}
      {righeVera.length > 0 && (
        <div className="bg-slate-900 text-white rounded-xl p-4">
          <div className="text-[10px] uppercase tracking-wider text-slate-300 font-bold">
            Esposizione totale verso l&apos;ente
          </div>
          <div className="text-2xl font-black mt-1">{euro(espTotale)}</div>
          <div className="flex flex-wrap gap-x-6 gap-y-1 mt-2 text-[11px] text-slate-300">
            <span>
              Contabilizzato: <span className="font-bold text-white">{euro(espContab)}</span>
            </span>
            <span>
              + Da contabilizzare:{' '}
              <span className="font-bold text-amber-300">{euro(espDaContab)}</span>
            </span>
          </div>
          <p className="text-[10px] text-slate-400 mt-2">
            Il totale che l&apos;azienda deve all&apos;ente comprende sia i debiti già
            contabilizzati sia quelli ancora da contabilizzare (Stato valorizzato). Le categorie
            neutre non sono incluse.
          </p>
        </div>
      )}

      {/* Confronto certo-per-certo */}
      {(righeVera.length > 0 || righeEnte.length > 0) && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="p-3 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
            <Scale className="w-3.5 h-3.5 text-slate-500" />
            <h3 className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex-1">
              Verifica certo per certo
            </h3>
            <button
              type="button"
              onClick={handleStampaPdf}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[10px] uppercase rounded-lg transition-colors"
            >
              <FileDown className="w-3.5 h-3.5" /> Scarica PDF
            </button>
          </div>
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-[10px] uppercase text-slate-500 font-bold border-b border-slate-100">
                <th className="p-3">Categoria</th>
                <th className="p-3">Contabilizzato (ente)</th>
                <th className="p-3">VERA</th>
                <th className="p-3">Delta (non contabilizzato)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {confronto.map((x) => (
                <tr key={x.cod} className={x.neutra ? 'text-slate-400' : ''}>
                  <td className="p-3 font-bold text-slate-900" title={x.cod}>
                    {etichettaTipoDebito(x.cod, mappaEtichette)}
                    {x.neutra && (
                      <span className="ml-1.5 text-[9px] font-normal text-slate-400">
                        (neutra, non nel totale)
                      </span>
                    )}
                  </td>
                  <td className="p-3 text-slate-700">{euro(x.contab)}</td>
                  <td className="p-3 text-slate-700">{euro(x.vera)}</td>
                  <td
                    className={`p-3 font-bold ${
                      x.neutra
                        ? 'text-slate-400'
                        : Math.abs(x.delta) < 0.005
                          ? 'text-emerald-600'
                          : 'text-amber-600'
                    }`}
                  >
                    {x.neutra ? '—' : Math.abs(x.delta) < 0.005 ? '✓ allineato' : euro(x.delta)}
                  </td>
                </tr>
              ))}
              <tr className="bg-slate-50 font-black">
                <td className="p-3 text-slate-900">Totale</td>
                <td className="p-3 text-slate-900">{euro(totContab)}</td>
                <td className="p-3 text-slate-900">{euro(totVera)}</td>
                <td className="p-3 text-slate-900">{euro(totVera - totContab)}</td>
              </tr>
            </tbody>
          </table>
          <p className="text-[10px] text-slate-400 p-3 border-t border-slate-100">
            «Contabilizzato» = somma della Situazione Debitoria per categoria. «VERA» = somma del
            «Totale debito» del file di verifica per categoria. Il delta positivo è il debito che il
            file di verifica riporta oltre a quanto già contabilizzato.
          </p>
        </div>
      )}

      {/* Debiti non ancora contabilizzati (colonna Stato valorizzata) */}
      {righeNonContab.length > 0 && (
        <div className="bg-white border border-amber-300 rounded-xl overflow-hidden">
          <div className="p-3 border-b border-amber-100 bg-amber-50">
            <h3 className="text-[11px] font-bold text-amber-800 uppercase tracking-wider">
              Debiti non ancora contabilizzati — da lavorare
            </h3>
            <p className="text-[10px] text-amber-700 mt-1">
              Righe con la colonna «Stato» valorizzata: debiti certi ma non ancora esigibili, da
              lavorare secondo la dicitura per renderli esigibili. Le altre righe (Stato vuoto) sono
              già contabilizzate ({euro(totContabVera)}).
            </p>
          </div>
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-[10px] uppercase text-slate-500 font-bold border-b border-slate-100">
                <th className="p-3">Stato (dicitura)</th>
                <th className="p-3">Voci</th>
                <th className="p-3">Importo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {perDicitura.map((d) => (
                <tr key={d.dicitura}>
                  <td className="p-3 font-bold text-amber-800">{d.dicitura}</td>
                  <td className="p-3 text-slate-700">{d.numero}</td>
                  <td className="p-3 text-slate-700">{euro(d.totale)}</td>
                </tr>
              ))}
              <tr className="bg-amber-50 font-black">
                <td className="p-3 text-amber-900">Totale non contabilizzato</td>
                <td className="p-3 text-amber-900">{righeNonContab.length}</td>
                <td className="p-3 text-amber-900">{euro(totNonContabVera)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Potenziali a importo ignoto (trattamento potenziale) */}
      {righePotenziali.length > 0 && (
        <div className="bg-white border border-orange-300 rounded-xl overflow-hidden">
          <div className="p-3 border-b border-orange-100 bg-orange-50">
            <h3 className="text-[11px] font-bold text-orange-800 uppercase tracking-wider">
              Potenziali a importo ignoto
            </h3>
            <p className="text-[10px] text-orange-700 mt-1">
              Righe con natura ma senza importo (es. «Denunce non trasmesse»): debiti potenziali di
              cui, al momento, non si conosce l&apos;entità. Non entrano nei totali ma vanno tenuti
              d&apos;occhio — sono possibili passività future da quantificare.
            </p>
          </div>
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-[10px] uppercase text-slate-500 font-bold border-b border-slate-100">
                <th className="p-3">Natura</th>
                <th className="p-3">Righe</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {perNaturaPotenziale.map((p) => (
                <tr key={p.natura}>
                  <td className="p-3 font-bold text-orange-800">{p.natura}</td>
                  <td className="p-3 text-slate-700">{p.numero}</td>
                </tr>
              ))}
              <tr className="bg-orange-50 font-black">
                <td className="p-3 text-orange-900">Totale posizioni potenziali</td>
                <td className="p-3 text-orange-900">{righePotenziali.length}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* VERA per categoria */}
      {veraPerCategoria.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="p-3 border-b border-slate-100 bg-slate-50">
            <h3 className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
              VERA per categoria
            </h3>
          </div>
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-[10px] uppercase text-slate-500 font-bold border-b border-slate-100">
                <th className="p-3">Categoria</th>
                <th className="p-3">Righe</th>
                <th className="p-3">Totale</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {veraPerCategoria.map((x) => (
                <tr key={x.cod}>
                  <td className="p-3 font-bold text-slate-900">
                    {etichettaTipoDebito(x.cod, mappaEtichette)}
                  </td>
                  <td className="p-3 text-slate-700">{x.numeroRighe}</td>
                  <td className="p-3 text-slate-700">{euro(x.totale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {righeVera.length > 0 && (
        <details className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <summary className="p-3 bg-slate-50 text-[11px] font-bold text-slate-700 uppercase tracking-wider cursor-pointer">
            Dettaglio righe VERA ({righeVera.length})
          </summary>
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-[10px] uppercase text-slate-500 font-bold border-b border-slate-100">
                <th className="p-3">Sezione</th>
                <th className="p-3">Natura</th>
                <th className="p-3">Stato</th>
                <th className="p-3">Importo</th>
                <th className="p-3">Categoria</th>
                <th className="p-3">Trattamento</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {righeVera.map((r) => {
                const rigaClasse =
                  r.trattamento === 'potenziale'
                    ? 'bg-orange-50/50'
                    : r.trattamento === 'da_contabilizzare'
                      ? 'bg-amber-50/40'
                      : r.trattamento === 'ignora'
                        ? 'text-slate-400'
                        : '';
                const trattClasse =
                  r.trattamento === 'potenziale'
                    ? 'bg-orange-100 text-orange-800'
                    : r.trattamento === 'da_contabilizzare'
                      ? 'bg-amber-100 text-amber-800'
                      : r.trattamento === 'ignora'
                        ? 'bg-slate-100 text-slate-500'
                        : 'bg-emerald-100 text-emerald-700';
                return (
                  <tr key={r.id} className={rigaClasse}>
                    <td className="p-3 text-slate-500 text-[10px]">{r.sezione}</td>
                    <td className="p-3 text-slate-900">{r.voce}</td>
                    <td className="p-3 text-slate-500 text-[11px]">{r.stato || '—'}</td>
                    <td className="p-3 text-slate-700">
                      {r.trattamento === 'potenziale' ? 'ignoto' : euro(r.importo)}
                    </td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-slate-100 text-slate-700">
                        {etichettaTipoDebito(r.categoria, mappaEtichette)}
                      </span>
                    </td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${trattClasse}`}
                      >
                        {ETICHETTE_TRATTAMENTO[r.trattamento]}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </details>
      )}
    </div>
  );
}
