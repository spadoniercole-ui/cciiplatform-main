'use client';

// VERIFICA AZIENDA — due verifiche, due riquadri, e la simulazione sopra di esse.
//
// La verifica amministrativa dice com'è l'azienda oggi e consegna il debito
// dell'ente; la contabile porta il dato storico depositato. Qui non si
// confondono: stanno in due box distinti, con i loro numeri e il collegamento
// alla pagina che li produce. Sotto i box c'è il flag che abilita la
// simulazione e il lancio; la simulazione unisce le due letture in una mappa a
// colonne affiancate.
//
// La simulazione scelta si può SALVARE COME BASE: diventa la base degli scenari
// di accordo transattivo. Liquidazione e cram down non la usano — partono dalla
// verifica amministrativa — e per questo il loro riquadro non sta più qui.

import { Fragment, useEffect, useState } from 'react';
import { ArrowRight, Calculator, CheckCircle2, Loader2, Printer } from 'lucide-react';
import {
  calcolaVerificaAziendaAction,
  impostaConfigVerificaAziendaAction,
  impostaSimulazioneAttivaAction,
  ottieniSimulazioneBaseAction,
  salvaSimulazioneBaseAction,
  type DebitoVerificaAzienda,
  type RisultatoVerificaAzienda,
} from '@/app/actions/verificaAzienda';
import {
  PROFILI,
  VOCI_MAPPA,
  type ColonnaVerificaAzienda,
  type ProfiloSimulazione,
} from '@/lib/verificaAzienda/simulazione';

const euro = (n: number | undefined) =>
  typeof n === 'number' && Number.isFinite(n) ? `${Math.round(n).toLocaleString('it-IT')} €` : '—';

const num = (n: unknown) =>
  typeof n === 'number' && Number.isFinite(n)
    ? n.toLocaleString('it-IT', { maximumFractionDigits: 2 })
    : 'n/d';

export interface RiepilogoAmministrativo {
  etichetta: string;
  esito: string;
  copertura: string;
  verificataIl: string | null;
  debitoTotale: number | null;
  debitoFonte: string | null;
  debitoIl: string | null;
}

export interface RiepilogoContabile {
  anniXbrl: number;
  visuraIl: string | null;
  parametriPresenti: boolean;
  completa: boolean;
}

export function VerificaAziendaScheda({
  nomeSchema,
  aziendaId,
  ragioneSociale,
  annualitaIniziale,
  codice,
  simulazioneAttivaIniziale = false,
  amministrativa = null,
  contabile = null,
  indiciAbilitati = [],
}: {
  nomeSchema: string;
  aziendaId: number;
  ragioneSociale: string;
  annualitaIniziale: number;
  /** Codice dello spazio: serve ai collegamenti alle due verifiche. */
  codice?: string;
  simulazioneAttivaIniziale?: boolean;
  amministrativa?: RiepilogoAmministrativo | null;
  contabile?: RiepilogoContabile | null;
  /** Codici degli indici abilitati nello spazio: la mappa mostra questi. */
  indiciAbilitati?: string[];
}) {
  const [profilo, setProfilo] = useState<ProfiloSimulazione>('STANDARD');
  const [annualita, setAnnualita] = useState(annualitaIniziale);
  const [annualitaSalvata, setAnnualitaSalvata] = useState(annualitaIniziale);
  const [risultato, setRisultato] = useState<RisultatoVerificaAzienda | null>(null);
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [messaggio, setMessaggio] = useState<string | null>(null);

  // Il flag è dello spazio, non della singola scheda: abilitata la simulazione,
  // il lancio resta disponibile tornando qui. Salvarlo sul server evita che
  // ogni apertura riparta da spento.
  const [simulazioneAttiva, setSimulazioneAttiva] = useState(simulazioneAttivaIniziale);
  const [salvataggioFlag, setSalvataggioFlag] = useState(false);
  const [mostraSimulazione, setMostraSimulazione] = useState(false);

  const [baseId, setBaseId] = useState<number | null>(null);
  const [salvataggioBase, setSalvataggioBase] = useState(false);

  useEffect(() => {
    void ottieniSimulazioneBaseAction(nomeSchema, aziendaId)
      .then((r) => {
        if (r.success && r.base) setBaseId(r.base.id);
      })
      .catch(() => undefined);
  }, [nomeSchema, aziendaId]);

  const calcola = async (p: ProfiloSimulazione) => {
    setInCorso(true);
    setErrore(null);
    setMessaggio(null);
    const r = await calcolaVerificaAziendaAction(nomeSchema, aziendaId, p, annualitaSalvata);
    setInCorso(false);
    if (!r.success) {
      setErrore(r.error ?? 'Simulazione non riuscita.');
      return;
    }
    setRisultato(r);
  };

  const cambiaFlag = async (attiva: boolean) => {
    setSalvataggioFlag(true);
    setErrore(null);
    const r = await impostaSimulazioneAttivaAction(nomeSchema, attiva);
    setSalvataggioFlag(false);
    if (!r.success) {
      setErrore(r.error ?? 'Impossibile salvare il flag della simulazione.');
      return;
    }
    setSimulazioneAttiva(attiva);
    if (!attiva) {
      setMostraSimulazione(false);
    } else {
      setMessaggio('Simulazione abilitata per questo spazio: il lancio è qui sotto.');
    }
  };

  const lancia = async () => {
    setMostraSimulazione(true);
    if (!risultato) await calcola(profilo);
  };

  const colonne: ColonnaVerificaAzienda[] = risultato?.esito?.colonne ?? [];
  const debito: DebitoVerificaAzienda | null = risultato?.debito ?? null;

  const scegliProfilo = async (p: ProfiloSimulazione) => {
    setProfilo(p);
    await calcola(p);
  };

  const salvaAnnualita = async () => {
    const r = await impostaConfigVerificaAziendaAction(nomeSchema, annualita);
    if (!r.success) {
      setErrore(r.error ?? 'Annualità non salvate.');
      return;
    }
    setAnnualitaSalvata(r.annualita);
    setAnnualita(r.annualita);
    setMessaggio(
      `Annualità di proiezione impostate a ${r.annualita} per tutte le aziende dello spazio.`
    );
    await calcola(profilo);
  };

  const salvaBase = async () => {
    if (!risultato?.simulazioneId) return;
    setSalvataggioBase(true);
    setErrore(null);
    const r = await salvaSimulazioneBaseAction(nomeSchema, aziendaId, risultato.simulazioneId);
    setSalvataggioBase(false);
    if (!r.success) {
      setErrore(r.error ?? 'Base non salvata.');
      return;
    }
    setBaseId(risultato.simulazioneId);
    setMessaggio('Questa simulazione è la base degli scenari di accordo transattivo.');
  };

  const primaProiezione = colonne.findIndex((c) => c.tipo === 'PROIEZIONE');
  // Gli indici da mostrare sono quelli abilitati nello spazio (Parametri di
  // Spazio → Indici), non i primi cinque che il motore calcola. Vuoto = ripiego
  // sugli indici della colonna, così la tabella non resta mai senza righe.
  const indiciBase = colonne[0]?.indici ?? [];
  const codiciIndici =
    indiciAbilitati.length > 0 ? indiciAbilitati : indiciBase.map((i) => i.codice);
  const indiciVisibili = codiciIndici
    .map((codice) => indiciBase.find((x) => x.codice === codice))
    .filter((x): x is NonNullable<typeof x> => Boolean(x));
  const ritornoQui = codice ? `/spazio/${codice}/verifica-azienda/${aziendaId}` : null;
  // Il «di cui» dei costi parla del debito che la verifica amministrativa ha
  // consegnato: senza quello non c’è nulla da leggere dentro i costi.
  const mostraDebitoNeiCosti = Boolean(debito);

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
        <h1 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <Calculator className="w-4 h-4 text-blue-600" />
          Verifica azienda — {ragioneSociale}
        </h1>
        <p className="text-xs text-slate-500 leading-relaxed max-w-3xl">
          Le due verifiche restano due letture distinte: il dato attuale dell’amministrativa e il
          dato storico della contabile. La simulazione, se abilitata, le unisce in una mappa a
          colonne e si può salvare come base degli scenari di accordo transattivo.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
              Verifica amministrativa
            </h2>
            {amministrativa && (
              <span
                className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                  amministrativa.esito === 'ROSSO'
                    ? 'bg-red-50 text-red-700'
                    : amministrativa.esito === 'GIALLO'
                      ? 'bg-amber-50 text-amber-800'
                      : 'bg-emerald-50 text-emerald-700'
                }`}
              >
                {amministrativa.etichetta}
              </span>
            )}
          </div>
          {amministrativa ? (
            <>
              <p className="text-[11px] text-slate-500">
                Copertura {amministrativa.copertura}
                {amministrativa.verificataIl
                  ? ` · verificata il ${new Date(amministrativa.verificataIl).toLocaleDateString('it-IT')}`
                  : ''}
              </p>
              <p className="text-xs text-slate-700">
                Debito dell’ente:{' '}
                <strong className="text-base tabular-nums">
                  {euro(amministrativa.debitoTotale ?? undefined)}
                </strong>
                {amministrativa.debitoFonte ? (
                  <span className="block text-[10px] text-slate-500 mt-0.5">
                    {amministrativa.debitoFonte}
                    {amministrativa.debitoIl ? ` · memorizzato il ${amministrativa.debitoIl}` : ''}
                  </span>
                ) : (
                  <span className="block text-[10px] text-amber-800 mt-0.5">
                    Nessun debito memorizzato: la verifica amministrativa non è ancora chiusa.
                  </span>
                )}
              </p>
            </>
          ) : (
            <p className="text-[11px] text-slate-400">
              Nessun esito disponibile: la verifica amministrativa non è ancora stata eseguita.
            </p>
          )}
          {codice && (
            <a
              href={`/spazio/${codice}/verifica-salute/${aziendaId}${
                ritornoQui ? `?ritorno=${encodeURIComponent(ritornoQui)}` : ''
              }`}
              className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-blue-700 hover:text-blue-800"
            >
              Apri l’esito <ArrowRight className="w-3 h-3" />
            </a>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
          <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
            Verifica contabile
          </h2>
          {contabile ? (
            <>
              <p className="text-[11px] text-slate-500">
                {contabile.anniXbrl > 0
                  ? `${contabile.anniXbrl} ${contabile.anniXbrl === 1 ? 'annualità XBRL' : 'annualità XBRL'}`
                  : 'Nessun bilancio XBRL caricato'}
                {contabile.visuraIl ? ` · visura ${contabile.visuraIl}` : ' · visura da acquisire'}
              </p>
              <p className="text-[11px] text-slate-600">
                Parametri ente:{' '}
                <span className="font-bold">
                  {contabile.parametriPresenti ? 'compilati' : 'da compilare'}
                </span>
              </p>
              <p
                className={`text-[10px] font-bold uppercase tracking-wider ${
                  contabile.completa ? 'text-emerald-700' : 'text-amber-800'
                }`}
              >
                {contabile.completa ? 'Dato storico completo' : 'Dato storico da completare'}
              </p>
            </>
          ) : (
            <p className="text-[11px] text-slate-400">
              Nessun dato storico disponibile: visura, parametri e bilanci si acquisiscono nella
              verifica contabile.
            </p>
          )}
          {codice && (
            <a
              href={`/spazio/${codice}/verifica-contabile/${aziendaId}${
                ritornoQui ? `?ritorno=${encodeURIComponent(ritornoQui)}` : ''
              }`}
              className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-blue-700 hover:text-blue-800"
            >
              Apri la verifica contabile <ArrowRight className="w-3 h-3" />
            </a>
          )}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <label className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer">
          <input
            type="checkbox"
            checked={simulazioneAttiva}
            disabled={salvataggioFlag}
            onChange={(e) => void cambiaFlag(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            <span className="font-bold">Abilita la simulazione</span>
            <span className="block text-[10px] text-slate-500 mt-0.5">
              Con il flag attivo compare il lancio della simulazione: le due verifiche diventano una
              mappa a colonne, con il debito dell’ente nella prima annualità proiettata. Il flag
              vale per tutto lo spazio.
            </span>
          </span>
        </label>
        {simulazioneAttiva && (
          <button
            type="button"
            onClick={() => void lancia()}
            disabled={inCorso}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {inCorso ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Calculator className="w-3 h-3" />
            )}
            Lancia la simulazione
          </button>
        )}
      </div>

      {errore && (
        <p className="text-xs font-bold text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          {errore}
        </p>
      )}
      {messaggio && (
        <p className="text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
          {messaggio}
        </p>
      )}

      {mostraSimulazione && (
        <>
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Profilo della simulazione
            </p>
            <div className="grid sm:grid-cols-3 gap-2">
              {PROFILI.map((p) => (
                <button
                  key={p.codice}
                  type="button"
                  onClick={() => void scegliProfilo(p.codice)}
                  disabled={inCorso}
                  className={`text-left rounded-lg border p-3 transition-colors disabled:opacity-60 ${
                    profilo === p.codice
                      ? 'border-blue-400 bg-blue-50 text-blue-900'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                  }`}
                >
                  <span className="text-xs font-bold">{p.etichetta}</span>
                  <span className="block text-[10px] text-slate-500 mt-0.5 leading-relaxed">
                    {p.descrizione}
                  </span>
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-end gap-2 pt-1 border-t border-slate-100">
              <label className="text-[10px] text-slate-600">
                Annualità di proiezione
                <input
                  type="number"
                  min={1}
                  max={8}
                  value={annualita}
                  onChange={(e) => setAnnualita(Number(e.target.value))}
                  className="mt-0.5 w-24 rounded border border-slate-300 px-2 py-1 text-xs"
                />
              </label>
              <button
                type="button"
                onClick={salvaAnnualita}
                disabled={inCorso || annualita === annualitaSalvata}
                className="rounded-lg bg-slate-900 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white hover:bg-slate-800 disabled:opacity-40"
              >
                Salva per lo spazio
              </button>
              <span className="text-[10px] text-slate-400">
                Vale per tutte le aziende: stesso orizzonte, confronti possibili.
              </span>
            </div>
            {risultato?.esito && (
              <p className="text-[10px] text-slate-500">
                Crescita storica composta: {risultato.esito.crescitaStoricaPct ?? 'non calcolabile'}
                % · crescita applicata ai ricavi: {risultato.esito.crescitaApplicataPct}%
              </p>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Debito dell’ente — dato certo della simulazione
            </p>
            {debito ? (
              <p className="text-xs text-slate-700">
                <strong className="text-base tabular-nums">{euro(debito.totale)}</strong>{' '}
                <span className="text-slate-500">
                  dalla verifica amministrativa
                  {debito.memorizzatoIl ? ` del ${debito.memorizzatoIl}` : ''} — {debito.fonte}
                </span>
              </p>
            ) : (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                Nessun debito memorizzato: la simulazione non iscrive alcun debito dell’ente. Chiudi
                la verifica amministrativa, oppure rinnova il dato dalla sua scheda.
              </p>
            )}
          </div>

          {risultato?.esito?.motivo && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
              {risultato.esito.motivo}
            </p>
          )}
          {risultato?.esito?.avvertenze.map((a, i) => (
            <p
              key={i}
              className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5"
            >
              {a}
            </p>
          ))}

          {colonne.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Mappa a sezioni affiancate
                </p>
                <div className="flex items-center gap-2">
                  {inCorso && <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />}
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-blue-700 hover:text-blue-800"
                  >
                    <Printer className="w-3 h-3" /> Stampa
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="text-[9px] uppercase text-slate-400 border-b border-slate-200">
                      <th className="text-left py-1.5 pr-2">Voce</th>
                      {colonne.map((c) => (
                        <th key={c.anno} className="text-right py-1.5 px-1 whitespace-nowrap">
                          {c.anno}
                          <span
                            className={`block text-[8px] font-normal ${
                              c.tipo === 'PROIEZIONE' ? 'text-blue-600' : 'text-slate-400'
                            }`}
                          >
                            {c.tipo === 'PROIEZIONE' ? 'proiezione' : 'storico'}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {VOCI_MAPPA.map((v) => (
                      <Fragment key={v.chiave}>
                        <tr className={v.forte ? 'bg-slate-50/60' : undefined}>
                          <td
                            className={`py-1 pr-2 ${v.forte ? 'font-bold text-slate-800' : 'text-slate-600'}`}
                          >
                            {v.etichetta}
                          </td>
                          {colonne.map((c) => (
                            <td
                              key={c.anno}
                              className={`py-1 px-1 text-right tabular-nums ${
                                v.forte ? 'font-bold text-slate-900' : 'text-slate-700'
                              }`}
                            >
                              {euro(c.dati[v.chiave] as number | undefined)}
                            </td>
                          ))}
                        </tr>
                        {/* Il debito dell’ente è un «di cui» dei costi della
                            produzione: si legge nell’anno in cui entra, non come
                            una riga a sé che sembra un’altra voce di bilancio. */}
                        {v.chiave === 'costiProduzione' && mostraDebitoNeiCosti && (
                          <tr className="bg-slate-50/40">
                            <td className="py-1 pr-2 pl-3 italic text-slate-500">
                              di cui debito dell’ente
                            </td>
                            {colonne.map((c) => (
                              <td
                                key={c.anno}
                                className="py-1 px-1 text-right tabular-nums text-slate-500"
                              >
                                {c.debitoEnteInserito > 0 ? euro(c.debitoEnteInserito) : '—'}
                              </td>
                            ))}
                          </tr>
                        )}
                      </Fragment>
                    ))}
                    <tr className="border-t-2 border-slate-200">
                      <td className="py-1 pr-2 font-bold text-slate-800">
                        Posizione finanziaria netta
                      </td>
                      {colonne.map((c) => (
                        <td
                          key={c.anno}
                          className="py-1 px-1 text-right tabular-nums font-bold text-slate-900"
                        >
                          {euro(c.dati.debitiBanche - c.dati.disponibilitaLiquide)}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
              {primaProiezione > 0 && (
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  Il debito dell’ente entra come «di cui» dei costi della produzione nella prima
                  annualità proiettata ({colonne[primaProiezione].anno}) e da lì resta nel passivo.
                  Gli anni storici sono quelli depositati, senza modifiche.
                </p>
              )}

              <div className="overflow-x-auto pt-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Indici per colonna
                </p>
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="text-[9px] uppercase text-slate-400 border-b border-slate-200">
                      <th className="text-left py-1.5 pr-2">Indice</th>
                      <th className="text-right py-1.5 px-1">Soglia</th>
                      {colonne.map((c) => (
                        <th key={c.anno} className="text-right py-1.5 px-1">
                          {c.anno}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {indiciVisibili.map((ind) => (
                      <tr key={ind.codice}>
                        <td className="py-1 pr-2 text-slate-700">
                          <span className="font-mono text-[9px] text-slate-400 mr-1">
                            {ind.codice}
                          </span>
                          {ind.nome.replace(new RegExp(`^${ind.codice}\\s*[—-]\\s*`), '')}
                        </td>
                        <td className="py-1 px-1 text-right text-slate-500 text-[10px]">
                          {ind.soglia}
                        </td>
                        {colonne.map((c) => {
                          const v = c.indici.find((x) => x.codice === ind.codice);
                          return (
                            <td
                              key={c.anno}
                              title={v?.note}
                              className={`py-1 px-1 text-right tabular-nums ${
                                v?.esito === 'VIOLATO'
                                  ? 'text-red-700 font-bold'
                                  : v?.esito === 'OK'
                                    ? 'text-emerald-700'
                                    : 'text-slate-400'
                              }`}
                            >
                              {v ? num(v.valore) : '—'}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Base degli scenari
            </p>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              La simulazione scelta diventa la base degli scenari di{' '}
              <strong>accordo transattivo</strong>. Liquidazione giudiziale e cram down partono
              dalla verifica amministrativa, non da questa mappa.
            </p>
            <button
              type="button"
              onClick={() => void salvaBase()}
              disabled={
                salvataggioBase || !risultato?.simulazioneId || baseId === risultato?.simulazioneId
              }
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white hover:bg-blue-800 disabled:opacity-50"
            >
              {salvataggioBase ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <CheckCircle2 className="w-3 h-3" />
              )}
              {baseId === risultato?.simulazioneId
                ? 'Base per la proposta'
                : 'Salva come base per la proposta'}
            </button>
            {!risultato?.simulazioneId && (
              <p className="text-[10px] text-slate-400">
                Serve una mappa calcolata: senza annualità non c’è una base da salvare.
              </p>
            )}
          </div>
        </>
      )}

      <p className="text-[11px] text-slate-500 leading-relaxed">
        Il documento è messo a disposizione della direzione dell’ente per le valutazioni del caso.
        La simulazione è un’ipotesi dichiarata su un dato storico; la verifica amministrativa resta
        il dato attuale. Nessuna conclusione giuridica.
      </p>
    </div>
  );
}
