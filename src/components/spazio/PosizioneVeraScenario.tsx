'use client';

// Posizione V.E.R.A. — importa il file INPS "DettaglioRichiesta" leggendo
// TUTTE le sezioni del foglio, ognuna con la natura data dal titolo (mappato
// una volta su una categoria). Mostra VERA raggruppata per categoria e la
// verifica CERTO-PER-CERTO contro la Situazione Debitoria contabilizzata:
// categoria per categoria, con il delta = il non contabilizzato.

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, ClipboardCheck, Scale, FileDown } from 'lucide-react';
import {
  analizzaVera,
  estraiRigheVera,
  type SezioneVera,
  type RigaVera,
} from '@/lib/debitiEnte/veraImport';
import {
  ottieniMappaturaTitoliVera,
  salvaMappaturaTitoliVeraAction,
  ottieniDebitiVera,
  sostituisciDebitiVeraAction,
  type RigaVeraSalvata,
} from '@/app/actions/posizioneVera';
import {
  ottieniCategorieTipoDebito,
  type CategoriaTipoDebito,
} from '@/app/actions/categorieTipoDebito';
import { ottieniDebitiEnte, type RigaDebitoEnte } from '@/app/actions/debitiEnte';
import { etichettaTipoDebito } from '@/lib/debitiEnte/tipoDebito';
import { stampaHtml } from '@/lib/stampaTesto';

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
      const [rCat, rVera, rEnte, rMap] = await Promise.all([
        ottieniCategorieTipoDebito(nomeSchema),
        ottieniDebitiVera(nomeSchema, aziendaId),
        ottieniDebitiEnte(nomeSchema, aziendaId),
        ottieniMappaturaTitoliVera(nomeSchema),
      ]);
      if (rCat.success) setCategorie(rCat.categorie);
      if (rVera.success) setRigheVera(rVera.righe);
      if (rEnte.success) setRigheEnte(rEnte.righe);
      if (rMap.success) setMappaturaTitoli(rMap.mappatura);
    } finally {
      setCaricamento(false);
    }
  };

  useEffect(() => {
    carica();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nomeSchema, aziendaId]);

  const importaSezioni = async (sezioni: SezioneVera[], mappatura: Record<string, string>) => {
    const { righe } = estraiRigheVera(sezioni, mappatura);
    const res = await sostituisciDebitiVeraAction(nomeSchema, aziendaId, righe as RigaVera[]);
    if (!res.success) {
      setErrore(res.error || 'Impossibile salvare la posizione VERA.');
      return;
    }
    await carica();
    router.refresh();
    setEsito(`Importate ${righe.length} righe VERA da ${sezioni.length} sezioni.`);
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
      const { titoliNonMappati } = estraiRigheVera(analisi.sezioni, mappaturaTitoli);
      if (titoliNonMappati.length > 0) {
        setTitoliDaMappare({
          sezioni: analisi.sezioni,
          titoli: titoliNonMappati,
          scelte: {},
        });
      } else {
        await importaSezioni(analisi.sezioni, mappaturaTitoli);
      }
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
      await importaSezioni(titoliDaMappare.sezioni, mappaturaAgg);
      setTitoliDaMappare(null);
    } finally {
      setInElaborazione(false);
    }
  };

  if (caricamento) return <p className="text-xs text-slate-400">Caricamento...</p>;

  // Confronto certo-per-certo per categoria.
  const codiciPresenti = Array.from(
    new Set<string>([
      ...categorie.map((c) => c.codice),
      ...righeEnte.map((r) => r.tipo),
      ...righeVera.map((r) => r.categoria),
    ])
  );
  const nonContribuisce = new Set(categorie.filter((c) => !c.contribuisce).map((c) => c.codice));
  const confronto = codiciPresenti
    .map((cod) => {
      const contab = righeEnte.filter((r) => r.tipo === cod).reduce((a, r) => a + r.importo, 0);
      const vera = righeVera.filter((r) => r.categoria === cod).reduce((a, r) => a + r.importo, 0);
      return { cod, contab, vera, delta: vera - contab, neutra: nonContribuisce.has(cod) };
    })
    .filter((x) => x.contab !== 0 || x.vera !== 0);
  // Le categorie neutre non alimentano i totali né il delta complessivo.
  const totContab = confronto.filter((x) => !x.neutra).reduce((a, x) => a + x.contab, 0);
  const totVera = confronto.filter((x) => !x.neutra).reduce((a, x) => a + x.vera, 0);

  // VERA per categoria (dettaglio importo).
  const veraPerCategoria = codiciPresenti
    .map((cod) => {
      const righe = righeVera.filter((r) => r.categoria === cod);
      return { cod, numeroRighe: righe.length, totale: righe.reduce((a, r) => a + r.importo, 0) };
    })
    .filter((x) => x.numeroRighe > 0);

  // Dentro VERA: righe con "Stato" valorizzato = NON contabilizzate (certe ma
  // non ancora esigibili, da lavorare). Cella Stato vuota = contabilizzato.
  const righeNonContab = righeVera.filter((r) => r.stato && r.stato.trim() !== '');
  const totContabVera = righeVera
    .filter((r) => !r.stato || r.stato.trim() === '')
    .reduce((a, r) => a + r.importo, 0);
  const totNonContabVera = righeNonContab.reduce((a, r) => a + r.importo, 0);
  const perDicitura = Array.from(
    righeNonContab.reduce((m, r) => {
      const cur = m.get(r.stato) || { numero: 0, totale: 0 };
      cur.numero += 1;
      cur.totale += r.importo;
      m.set(r.stato, cur);
      return m;
    }, new Map<string, { numero: number; totale: number }>())
  ).map(([dicitura, v]) => ({ dicitura, ...v }));

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
    stampaHtml(
      'Verifica certo per certo — Posizione V.E.R.A.',
      corpo + bloccoNonContab,
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
      {!titoliDaMappare && (
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
                <th className="p-3">Voce</th>
                <th className="p-3">Importo</th>
                <th className="p-3">Categoria</th>
                <th className="p-3">Stato</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {righeVera.map((r) => {
                const nonContab = !!(r.stato && r.stato.trim() !== '');
                return (
                  <tr key={r.id} className={nonContab ? 'bg-amber-50/40' : ''}>
                    <td className="p-3 text-slate-500 text-[10px]">{r.sezione}</td>
                    <td className="p-3 text-slate-900">{r.voce}</td>
                    <td className="p-3 text-slate-700">{euro(r.importo)}</td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-slate-100 text-slate-700">
                        {etichettaTipoDebito(r.categoria, mappaEtichette)}
                      </span>
                    </td>
                    <td className="p-3">
                      {nonContab ? (
                        <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-amber-100 text-amber-800">
                          {r.stato}
                        </span>
                      ) : (
                        <span className="text-[9px] text-emerald-600 font-bold uppercase">
                          contabilizzato
                        </span>
                      )}
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
