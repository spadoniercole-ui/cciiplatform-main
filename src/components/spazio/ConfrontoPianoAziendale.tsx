'use client';

// CONFRONTO tra il piano dell'azienda e il piano automatico di settore
// (percorso Ricevente). Due colonne per anno — riferimento e azienda — e un
// semaforo per cella che guarda la direzione: verde se l'azienda è più
// prudente del riferimento o se ne discosta poco, giallo e rosso quando è
// più ottimista oltre le soglie dell'ente (Parametri di Spazio).

import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  Scale,
  Upload,
  FileText,
  Download,
  Trash2,
  Printer,
  Copy,
  AlertTriangle,
} from 'lucide-react';
import type { DatiPianoSviluppo } from '@/app/actions/pianoSviluppo';
import { salvaPianoSviluppoAction } from '@/app/actions/pianoSviluppo';
import {
  eliminaPianoAziendaleAction,
  ottieniConfrontoPianoAction,
  type DatiConfrontoPiano,
} from '@/app/actions/pianoAziendale';
import { calcolaPiano, ETICHETTA_RIGA, type IpotesiPiano } from '@/lib/piano/piano';
import { crescitaDiRiferimento, ipotesiAutomatiche } from '@/lib/piano/automatico';
import { confrontaPiani, type Luce } from '@/lib/piano/confronto';
import {
  RIGHE_AZIENDA,
  anniDelPiano,
  ipotesiDaPianoAzienda,
  type ValoriPianoAzienda,
} from '@/lib/piano/pianoAziendale';
import { ImportaPianoAziendale } from '@/components/spazio/ImportaPianoAziendale';
import { confermaApp } from '@/components/FinestreApp';
import { stampaHtml } from '@/lib/stampaTesto';

interface Props {
  nomeSchema: string;
  codice: string;
  scenarioId: number;
  aziendaId: number;
  dati: DatiPianoSviluppo;
  orizzonte: number;
  onVarianteCreata: (variante: string) => void;
  /** RICEVUTA: piano dell'azienda caricato; DA_DEFINIRE: autoverifica della variante sullo schermo. */
  lato: 'RICEVUTA' | 'DA_DEFINIRE';
  ipotesiCorrenti: IpotesiPiano;
  nomeVariante: string;
  /** Il contesto per l'elaborazione con l'AI, già calcolato qui: il genitore non lo rilegge. */
  onContesto?: (c: ContestoConfronto) => void;
  /** Ricevente: niente «copia nella variante», il cruscotto parte già dal piano dell'azienda. */
  senzaCopia?: boolean;
}

export interface ContestoConfronto {
  crescita: { tasso: number; descrizione: string };
  pianoAzienda: ValoriPianoAzienda | null;
  scostamenti: { voce: string; luce: 'giallo' | 'rosso'; ottimismoMassimo: number }[];
}

const fmt = (n: number) => Math.round(n).toLocaleString('it-IT');
const pct = (n: number) => n.toLocaleString('it-IT', { maximumFractionDigits: 1 });
const COLORE: Record<Luce, string> = {
  verde: 'bg-emerald-500',
  giallo: 'bg-amber-400',
  rosso: 'bg-red-500',
  nc: 'bg-slate-300',
};
const TESTO_LUCE: Record<Luce, string> = {
  verde: 'entro soglia o prudente',
  giallo: 'ottimista, sopra la soglia verde',
  rosso: 'ottimista, sopra la soglia gialla',
  nc: 'non confrontabile',
};

export function ConfrontoPianoAziendale({
  nomeSchema,
  codice,
  scenarioId,
  aziendaId,
  dati,
  orizzonte,
  onVarianteCreata,
  lato,
  ipotesiCorrenti,
  nomeVariante,
  onContesto,
  senzaCopia,
}: Props) {
  const redigente = lato === 'DA_DEFINIRE';
  const chi = redigente ? 'piano' : 'azienda';
  const [conf, setConf] = useState<DatiConfrontoPiano | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);

  const carica = async () => {
    const r = await ottieniConfrontoPianoAction(nomeSchema, scenarioId, aziendaId);
    if (!r.success || !r.dati) return setErrore(r.error ?? 'Lettura non riuscita.');
    setConf(r.dati);
  };
  useEffect(() => {
    carica();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nomeSchema, scenarioId, aziendaId]);

  const base = dati.storico[0];
  const primoAnno = base.anno + 1;
  const anniPiano = Array.from({ length: orizzonte }, (_, i) => primoAnno + i);
  const rate = {
    ente: dati.rate.ente.slice(0, orizzonte),
    altri: dati.rate.altri.slice(0, orizzonte),
  };

  const calcolo = useMemo(() => {
    if (!conf) return null;
    const crescita = crescitaDiRiferimento(
      conf.settore.punti,
      conf.settore.descrizione,
      dati.storico
    );
    const auto = calcolaPiano(
      base,
      orizzonte,
      ipotesiAutomatiche(base, orizzonte, crescita.tasso),
      rate,
      dati.capitaleSociale
    );
    if (redigente) {
      const mio = calcolaPiano(base, orizzonte, ipotesiCorrenti, rate, dati.capitaleSociale);
      const esito = confrontaPiani(
        auto.anni,
        mio.anni,
        null,
        conf.soglie,
        undefined,
        'Sono le ipotesi da documentare prima di depositare il piano.'
      );
      return { crescita, auto, azienda: mio, esito, ipAz: null };
    }
    if (!conf.piano) return { crescita, auto, azienda: null, esito: null, ipAz: null };
    const ipAz = ipotesiDaPianoAzienda(conf.piano.valori, primoAnno, orizzonte);
    const azienda = calcolaPiano(base, orizzonte, ipAz, rate, dati.capitaleSociale);
    const anniConDati = new Set(anniDelPiano(conf.piano.valori));
    const esito = confrontaPiani(auto.anni, azienda.anni, ipAz, conf.soglie, anniConDati);
    return { crescita, auto, azienda, esito, ipAz };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conf, dati, orizzonte, redigente ? ipotesiCorrenti : null]);

  useEffect(() => {
    if (!calcolo || !onContesto) return;
    onContesto({
      crescita: { tasso: calcolo.crescita.tasso, descrizione: calcolo.crescita.descrizione },
      pianoAzienda: redigente ? null : (conf?.piano?.valori ?? null),
      scostamenti: redigente
        ? []
        : (calcolo.esito?.righe ?? [])
            .filter((r) => r.peggiore === 'giallo' || r.peggiore === 'rosso')
            .map((r) => ({
              voce: r.riga.etichetta,
              luce: r.peggiore as 'giallo' | 'rosso',
              ottimismoMassimo: Math.max(...r.celle.map((c) => c.ottimismo ?? 0)),
            })),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calcolo]);

  const scaricaModello = () => {
    const righe: (string | number)[][] = [
      [
        'Piano dell’azienda — valori in euro. Compila una colonna per anno; lascia vuote le righe non previste.',
      ],
      ['Voce', ...anniPiano],
      ...RIGHE_AZIENDA.map((r) => [ETICHETTA_RIGA[r]]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(righe);
    ws['!cols'] = [{ wch: 60 }, ...anniPiano.map(() => ({ wch: 16 }))];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Piano');
    XLSX.writeFile(wb, 'modello_piano_azienda.xlsx');
  };

  const elimina = async () => {
    if (
      !(await confermaApp('Eliminare il piano dell’azienda caricato per questo scenario?', {
        distruttiva: true,
        etichettaConferma: 'Elimina',
      }))
    )
      return;
    const r = await eliminaPianoAziendaleAction(codice, scenarioId);
    if (!r.success) return setErrore(r.error ?? 'Errore.');
    await carica();
  };

  const copiaInVariante = async () => {
    if (!calcolo?.ipAz) return;
    const r = await salvaPianoSviluppoAction(
      codice,
      scenarioId,
      'azienda',
      orizzonte,
      calcolo.ipAz,
      `Ipotesi del piano dell’azienda${conf?.piano?.nomeFile ? ` («${conf.piano.nomeFile}»)` : ''}, in valori assoluti. Modificabili per metterle alla prova.`
    );
    if (!r.success) return setErrore(r.error ?? 'Errore.');
    onVarianteCreata('azienda');
  };

  const stampa = () => {
    if (!calcolo?.esito || !conf) return;
    const intest = `<tr><th>Voce</th>${anniPiano.map((a) => `<th class="num">${a} rif.</th><th class="num">${a} ${chi}</th>`).join('')}</tr>`;
    const righe = calcolo.esito.righe
      .map(
        (r) =>
          `<tr><td>${r.riga.etichetta}${r.nonIndicata ? ' <em>(non indicata)</em>' : ''}</td>${r.celle
            .map(
              (c) =>
                `<td class="num">${fmt(c.automatico)}</td><td class="num">${fmt(c.azienda)} <span style="font-size:9px">[${c.luce === 'nc' ? 'n.c.' : `${c.luce}${c.ottimismo !== null && c.ottimismo > 0 ? ` +${pct(c.ottimismo)}%` : ''}`}]</span></td>`
            )
            .join('')}</tr>`
      )
      .join('');
    const corpo =
      `<p class="note">${calcolo.crescita.descrizione} Riferimento: margini costanti, crediti e fornitori proporzionali ai ricavi, investimenti pari agli ammortamenti. Soglie dell’ente: verde fino al ${conf.soglie.verde}%, giallo fino al ${conf.soglie.giallo}% di scostamento in senso favorevole all’azienda; lo scostamento prudente è sempre verde.</p>` +
      `<table><thead>${intest}</thead><tbody>${righe}</tbody></table>` +
      `<h2 style="font-size:14px">Sintesi</h2><p style="font-size:12px">${calcolo.esito.sintesi}</p>` +
      `<p class="note">Il confronto non è un giudizio sul piano: indica dove le ipotesi dell’azienda si discostano dal riferimento in senso favorevole, cioè dove chiederne conto.${conf.piano?.nomeFile ? ` Piano dell’azienda: «${conf.piano.nomeFile}».` : ''}</p>`;
    stampaHtml(
      redigente
        ? 'Autoverifica del piano sul piano di settore'
        : 'Confronto con il piano dell’azienda',
      corpo,
      redigente
        ? `Piano automatico di settore e variante «${nomeVariante}», calcolati con lo stesso motore`
        : 'Piano automatico di settore e piano dell’azienda, calcolati con lo stesso motore',
      conf.piano?.salvatoIl ?? null
    );
  };

  if (errore)
    return (
      <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
        {errore}
      </p>
    );
  if (!conf || !calcolo)
    return <p className="text-xs text-slate-500">Caricamento del confronto…</p>;

  const pulsanti = (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={scaricaModello}
        className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[10px] uppercase rounded-lg"
      >
        <Download className="w-3.5 h-3.5" /> Modello Excel
      </button>
      <label className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-[10px] uppercase rounded-lg cursor-pointer">
        <Upload className="w-3.5 h-3.5" /> Carica il piano (Excel)
        <input
          type="file"
          accept=".xlsx,.xls,.ods,.csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) setFile(f);
            e.target.value = '';
          }}
        />
      </label>
      <label className="flex items-center gap-1.5 px-3 py-2 bg-white border border-blue-300 hover:bg-blue-50 text-blue-700 font-bold text-[10px] uppercase rounded-lg cursor-pointer">
        <FileText className="w-3.5 h-3.5" /> Carica il piano (PDF, lettura con l’AI)
        <input
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) setFile(f);
            e.target.value = '';
          }}
        />
      </label>
    </div>
  );

  const bloccoEsito = (
    <>
      {calcolo.esito && (
        <>
          <div
            className={`text-xs rounded-lg p-3 border ${calcolo.esito.conteggio.rosso ? 'bg-red-50 border-red-200 text-red-900' : calcolo.esito.conteggio.giallo ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-emerald-50 border-emerald-200 text-emerald-900'}`}
          >
            {calcolo.esito.sintesi}
          </div>
          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-[9px] uppercase text-slate-500">
                <tr>
                  <th className="px-2 py-2 text-left font-bold min-w-56 sticky left-0 bg-slate-50">
                    Voce
                  </th>
                  {anniPiano.map((a) => (
                    <th key={a} className="px-2 py-2 text-center font-bold" colSpan={1}>
                      {a}
                      <span className="block font-normal normal-case text-[9px]">
                        riferimento / {chi}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {calcolo.esito.righe.map((r) => (
                  <tr key={String(r.riga.chiave)}>
                    <td className="px-2 py-2 text-slate-800 sticky left-0 bg-white">
                      <span
                        className={`inline-block w-2.5 h-2.5 rounded-full mr-1.5 ${COLORE[r.peggiore]}`}
                      />
                      {r.riga.etichetta}
                      <span className="block text-[9px] text-slate-400">
                        {r.nonIndicata
                          ? 'non indicata dall’azienda'
                          : r.riga.direzione === 'alto'
                            ? 'più alto = più favorevole'
                            : 'più basso = più favorevole'}
                      </span>
                    </td>
                    {r.celle.map((c) => (
                      <td
                        key={c.anno}
                        className="px-2 py-2 min-w-36"
                        title={`${TESTO_LUCE[c.luce]}${c.ottimismo !== null ? ` (${c.ottimismo > 0 ? '+' : ''}${pct(c.ottimismo)}% verso l’ottimismo)` : ''}`}
                      >
                        <div className="flex justify-between gap-2 tabular-nums">
                          <span className="text-slate-500">{fmt(c.automatico)}</span>
                          <span className="text-slate-900 font-bold">
                            {c.luce === 'nc' && r.nonIndicata ? '—' : fmt(c.azienda)}
                          </span>
                        </div>
                        <div className="mt-1 h-1.5 bg-slate-100 rounded">
                          <div
                            className={`h-1.5 rounded ${COLORE[c.luce]}`}
                            style={{
                              width: `${c.luce === 'nc' ? 100 : Math.max(8, Math.min(100, ((c.ottimismo ?? 0) > 0 ? (c.ottimismo as number) : 0) * 2))}%`,
                            }}
                          />
                        </div>
                        <span className="block text-[9px] text-slate-500 text-right">
                          {c.luce === 'nc'
                            ? 'n.c.'
                            : c.ottimismo !== null && c.ottimismo > 0
                              ? `+${pct(c.ottimismo)}%`
                              : 'prudente'}
                        </span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-slate-500 flex flex-wrap gap-3">
            {(['verde', 'giallo', 'rosso', 'nc'] as Luce[]).map((l) => (
              <span key={l} className="flex items-center gap-1">
                <span className={`inline-block w-2.5 h-2.5 rounded-full ${COLORE[l]}`} />
                {TESTO_LUCE[l]} ({calcolo.esito!.conteggio[l]})
              </span>
            ))}
            <span>
              Soglie dell’ente: {conf.soglie.verde}% e {conf.soglie.giallo}% (Parametri di Spazio).
            </span>
          </p>
          {calcolo.azienda && calcolo.azienda.vincoli.length > 0 && (
            <div className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-1">
              <p className="font-bold">Vincoli che scattano con le ipotesi dell’azienda</p>
              {calcolo.azienda.vincoli.map((v, i) => (
                <p key={i} className="flex gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  {v.testo}
                </p>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
      <div className="flex items-start gap-2">
        <Scale className="w-4 h-4 text-blue-600 mt-0.5" />
        <div>
          <h2 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
            {redigente
              ? 'Autoverifica: il piano a confronto con il piano di settore'
              : 'Confronto con il piano dell’azienda'}
          </h2>
          <p className="text-[11px] text-slate-600 mt-0.5">
            Riferimento: il piano automatico di settore. {calcolo.crescita.descrizione} Margini
            costanti, crediti e fornitori proporzionali ai ricavi, investimenti pari agli
            ammortamenti.{' '}
            {redigente
              ? `Si confronta la variante «${nomeVariante}» sullo schermo: dove il piano è più favorevole del riferimento oltre le soglie, le ipotesi vanno documentate prima del deposito.`
              : 'Il piano dell’azienda passa nello stesso motore: si confrontano grandezze calcolate allo stesso modo.'}
          </p>
          {conf.settore.motivo && calcolo.crescita.fonte !== 'settore' && (
            <p className="text-[10px] text-amber-800 mt-1">
              Dati di settore: {conf.settore.motivo}
            </p>
          )}
        </div>
      </div>

      {redigente ? (
        bloccoEsito
      ) : file ? (
        <ImportaPianoAziendale
          key={`${file.name}-${file.lastModified}`}
          nomeSchema={nomeSchema}
          codice={codice}
          scenarioId={scenarioId}
          aziendaId={aziendaId}
          file={file}
          abbinamentoMemorizzato={conf.abbinamento}
          unitaMemorizzata={conf.unita}
          anniPiano={anniPiano}
          onSalvato={async () => {
            setFile(null);
            await carica();
          }}
          onChiudi={() => setFile(null)}
        />
      ) : !conf.piano ? (
        <div className="space-y-3">
          <p className="text-xs text-slate-700">
            Nessun piano dell’azienda caricato. Carica il file ricevuto: da Excel in qualsiasi
            formato (voci in righe, anni in colonne) oppure da PDF, letto dall’AI. Prima di salvare
            vedrai sempre la tabella normalizzata.
          </p>
          {pulsanti}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] text-slate-600">
              Piano dell’azienda: <strong>{conf.piano.nomeFile ?? 'inserito a mano'}</strong>
              {conf.piano.origine === 'pdf' ? ' (letto dall’AI, confermato)' : ''}
              {conf.piano.salvatoIl
                ? ` — salvato il ${new Date(conf.piano.salvatoIl).toLocaleString('it-IT')}`
                : ''}
              .
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={stampa}
                className="flex items-center gap-1 px-3 py-2 bg-white border border-slate-300 text-slate-700 font-bold text-[10px] uppercase rounded-lg"
              >
                <Printer className="w-3.5 h-3.5" /> Stampa il confronto
              </button>
              {!senzaCopia && (
                <button
                  type="button"
                  onClick={copiaInVariante}
                  className="flex items-center gap-1 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[10px] uppercase rounded-lg"
                  title="Porta le ipotesi dell’azienda in una variante del piano, per metterle alla prova"
                >
                  <Copy className="w-3.5 h-3.5" /> Copia nella variante «azienda»
                </button>
              )}
              <button
                type="button"
                onClick={elimina}
                className="text-slate-400 hover:text-red-600 px-2"
                title="Elimina il piano dell’azienda"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {bloccoEsito}
          <div className="pt-2 border-t border-slate-100">
            <p className="text-[10px] text-slate-500 mb-2">
              Per sostituire il piano dell’azienda, carica un nuovo file.
            </p>
            {pulsanti}
          </div>
        </>
      )}
    </div>
  );
}
