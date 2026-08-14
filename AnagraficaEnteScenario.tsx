'use client';

// Relazione AI: ultimo passo dello Scenario, sbloccato solo quando il
// flusso è completo — non più un pulsante accanto all'acquisizione della
// proposta, ma un'azione a sé che dichiara visivamente cosa manca prima
// di poter generare. Stessa verifica viene rifatta anche lato server in
// generaRelazionePropostaAction: questo cruscotto è una comodità per
// l'utente, non l'unico controllo.
//
// Dopo la generazione (solo Ricevente), lo scenario si blocca in sola
// lettura — ma non è un vicolo cieco: l'Admin di Spazio può sbloccarlo,
// sempre con un motivo dichiarato e sempre tracciato. Ogni versione
// della relazione generata resta consultabile, mai sovrascritta.

import React, { useEffect, useState } from 'react';
import { Sparkles, Copy, CheckCircle2, Circle, Lock, Unlock, History, Printer } from 'lucide-react';
import {
  ottieniPropostaScenario,
  verificaRicevibilitaProposta,
  generaRelazionePropostaAction,
} from '@/app/actions/propostaScenario';
import { ottieniRisposteChecklist } from '@/app/actions/checklist';
import { ottieniStoricoXbrlAzienda } from '@/app/actions/xbrlAzienda';
import {
  sbloccaScenarioAction,
  ottieniStoricoSblocchi,
  ottieniStoricoRelazioni,
  type SbloccoScenario,
  type VersioneRelazione,
} from '@/app/actions/scenarioSblocco';
import { stampaTesto } from '@/lib/stampaTesto';

interface Props {
  nomeSchema: string;
  scenarioId: number;
  aziendaId: number;
  tipoProposta: 'RICEVUTA' | 'DA_DEFINIRE';
  eAdminSpazio: boolean;
  identitaUtente: string | null;
  bloccatoIl: string | null;
}

interface StatoPrerequisiti {
  proposta: boolean;
  checklist: boolean;
  xbrl: boolean;
}

export function RelazioneAiScenario({
  nomeSchema,
  scenarioId,
  aziendaId,
  tipoProposta,
  eAdminSpazio,
  identitaUtente,
  bloccatoIl: bloccatoIlIniziale,
}: Props) {
  const [prerequisiti, setPrerequisiti] = useState<StatoPrerequisiti | null>(null);
  const [caricamento, setCaricamento] = useState(true);

  const [generazioneInCorso, setGenerazioneInCorso] = useState(false);
  const [relazione, setRelazione] = useState<string | null>(null);
  const [erroreRelazione, setErroreRelazione] = useState<string | null>(null);

  const [bloccatoIl, setBloccatoIl] = useState(bloccatoIlIniziale);
  const [sblocchi, setSblocchi] = useState<SbloccoScenario[]>([]);
  const [versioni, setVersioni] = useState<VersioneRelazione[]>([]);
  const [motivoSblocco, setMotivoSblocco] = useState('');
  const [sbloccoInCorso, setSbloccoInCorso] = useState(false);
  const [erroreSblocco, setErroreSblocco] = useState<string | null>(null);
  const [mostraFormSblocco, setMostraFormSblocco] = useState(false);

  const caricaStoricoSbloccoEVersioni = async () => {
    const [sblocchiRis, versioniRis] = await Promise.all([
      ottieniStoricoSblocchi(nomeSchema, scenarioId),
      ottieniStoricoRelazioni(nomeSchema, scenarioId),
    ]);
    if (sblocchiRis.success) setSblocchi(sblocchiRis.sblocchi);
    if (versioniRis.success) setVersioni(versioniRis.versioni);
  };

  useEffect(() => {
    (async () => {
      setCaricamento(true);
      if (tipoProposta === 'RICEVUTA') {
        const [esitoRis, xbrlRis] = await Promise.all([
          verificaRicevibilitaProposta(nomeSchema, scenarioId, 'ENTE'),
          ottieniStoricoXbrlAzienda(nomeSchema, aziendaId),
        ]);
        setPrerequisiti({
          proposta: esitoRis.success && esitoRis.esito?.datiDisponibili !== false,
          checklist: true,
          xbrl: xbrlRis.success && xbrlRis.storico.length > 0,
        });
        await caricaStoricoSbloccoEVersioni();
      } else {
        const [propostaRis, checklistRis, xbrlRis] = await Promise.all([
          ottieniPropostaScenario(nomeSchema, scenarioId),
          ottieniRisposteChecklist(nomeSchema, scenarioId),
          ottieniStoricoXbrlAzienda(nomeSchema, aziendaId),
        ]);
        setPrerequisiti({
          proposta: propostaRis.success && propostaRis.righe.length > 0,
          checklist: checklistRis.success && checklistRis.risposte.length > 0,
          xbrl: xbrlRis.success && xbrlRis.storico.length > 0,
        });
        const versioniRis = await ottieniStoricoRelazioni(nomeSchema, scenarioId);
        if (versioniRis.success) setVersioni(versioniRis.versioni);
      }
      setCaricamento(false);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    })();
  }, [nomeSchema, scenarioId, aziendaId, tipoProposta]);

  const pronto = prerequisiti
    ? prerequisiti.proposta && prerequisiti.checklist && prerequisiti.xbrl
    : false;
  const bloccato = !!bloccatoIl;

  const handleGeneraRelazione = async () => {
    setGenerazioneInCorso(true);
    setErroreRelazione(null);
    setRelazione(null);
    try {
      const risultato = await generaRelazionePropostaAction(nomeSchema, scenarioId);
      if (!risultato.success || !risultato.relazione) {
        setErroreRelazione(risultato.error || 'Impossibile generare la relazione.');
        return;
      }
      setRelazione(risultato.relazione);
      if (tipoProposta === 'RICEVUTA') setBloccatoIl(new Date().toISOString());
      await caricaStoricoSbloccoEVersioni();
    } finally {
      setGenerazioneInCorso(false);
    }
  };

  const handleSblocca = async () => {
    if (!motivoSblocco.trim()) {
      setErroreSblocco('Indica un motivo per lo sblocco.');
      return;
    }
    setSbloccoInCorso(true);
    setErroreSblocco(null);
    const risultato = await sbloccaScenarioAction(
      nomeSchema,
      scenarioId,
      motivoSblocco,
      identitaUtente
    );
    if (!risultato.success) {
      setErroreSblocco(risultato.error || 'Impossibile sbloccare.');
      setSbloccoInCorso(false);
      return;
    }
    setBloccatoIl(null);
    setMotivoSblocco('');
    setMostraFormSblocco(false);
    await caricaStoricoSbloccoEVersioni();
    setSbloccoInCorso(false);
  };

  if (caricamento) return <p className="text-xs text-slate-400">Caricamento...</p>;

  const ultimoSblocco = sblocchi[0] || null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-bold text-slate-900 uppercase text-xs tracking-wider flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-purple-600" /> Relazione finale (AI)
        </h2>
        <p className="text-slate-500 text-[11px] mt-1">
          {tipoProposta === 'RICEVUTA'
            ? 'Legge insieme Proposta (documenti analizzati) e Indici/XBRL. Si sblocca solo quando entrambi sono pronti — una relazione parziale non aiuta nessuno.'
            : 'Legge insieme Proposta, Check List e Indici/XBRL. Si sblocca solo quando tutti e tre sono stati almeno avviati — una relazione parziale non aiuta nessuno.'}
        </p>
        <p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2 mt-2">
          Output automatico basato sui parametri configurati in Parametri di Spazio — non
          costituisce un giudizio professionale. Spetta al professionista incaricato valutarla nel
          merito e decidere se asseverarla.
        </p>
      </div>

      {tipoProposta === 'RICEVUTA' && bloccato && (
        <div className="bg-slate-100 border border-slate-300 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-slate-500 shrink-0" />
            <p className="text-xs text-slate-700">
              <span className="font-bold">Sola lettura permanente</span> — la Relazione è già stata
              generata
              {bloccatoIl && ` il ${new Date(bloccatoIl).toLocaleString('it-IT')}`}.
            </p>
          </div>
          {eAdminSpazio && !mostraFormSblocco && (
            <button
              type="button"
              onClick={() => setMostraFormSblocco(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold text-[10px] uppercase rounded-lg transition-colors"
            >
              <Unlock className="w-3.5 h-3.5" /> Sblocca per rigenerare
            </button>
          )}
          {eAdminSpazio && mostraFormSblocco && (
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block">
                Motivo dello sblocco (obbligatorio, resta in cronologia)
              </label>
              <textarea
                value={motivoSblocco}
                onChange={(e) => setMotivoSblocco(e.target.value)}
                placeholder="Es. errore nell'importo estratto, da correggere e rigenerare..."
                rows={2}
                className="w-full p-2 text-xs bg-white border border-slate-300 rounded-lg outline-none focus:border-blue-500 text-slate-900"
              />
              {erroreSblocco && <p className="text-[11px] text-red-600">{erroreSblocco}</p>}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleSblocca}
                  disabled={sbloccoInCorso}
                  className="flex items-center gap-1.5 px-3 py-2 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white font-bold text-[10px] uppercase rounded-lg transition-colors"
                >
                  <Unlock className="w-3.5 h-3.5" />
                  {sbloccoInCorso ? 'Sblocco...' : 'Conferma sblocco'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMostraFormSblocco(false);
                    setErroreSblocco(null);
                  }}
                  className="px-3 py-2 text-slate-500 hover:text-slate-700 font-bold text-[10px] uppercase"
                >
                  Annulla
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {tipoProposta === 'RICEVUTA' && !bloccato && ultimoSblocco && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-[11px] text-amber-800">
          <span className="font-bold">Sbloccato per rigenerazione</span> — {ultimoSblocco.motivo}
          {ultimoSblocco.sbloccatoDa && ` — da ${ultimoSblocco.sbloccatoDa}`}
          {` il ${new Date(ultimoSblocco.sbloccatoIl).toLocaleString('it-IT')}`}.
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
        <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
          Prerequisiti
        </h3>
        <div className="space-y-2">
          <RigaPrerequisito
            fatto={prerequisiti?.proposta ?? false}
            label="Proposta acquisita"
            dettaglio={
              tipoProposta === 'RICEVUTA'
                ? 'Proposta di cram down caricata e analizzata.'
                : 'Almeno una riga per categoria di creditore.'
            }
          />
          {tipoProposta !== 'RICEVUTA' && (
            <RigaPrerequisito
              fatto={prerequisiti?.checklist ?? false}
              label="Check List avviata"
              dettaglio="Almeno una domanda con risposta."
            />
          )}
          <RigaPrerequisito
            fatto={prerequisiti?.xbrl ?? false}
            label="Bilancio XBRL caricato"
            dettaglio="Almeno un bilancio salvato nello storico dell'azienda."
          />
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
            Genera relazione
          </h3>
          <button
            type="button"
            onClick={handleGeneraRelazione}
            disabled={generazioneInCorso || !pronto || bloccato}
            title={
              bloccato
                ? 'Scenario bloccato — sblocca sopra prima di rigenerare.'
                : !pronto
                  ? 'Completa i prerequisiti sopra prima di generare la relazione.'
                  : ''
            }
            className="flex items-center gap-1.5 px-3 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-300 text-white font-bold text-[10px] uppercase rounded-lg transition-colors"
          >
            {generazioneInCorso ? 'Generazione...' : 'Genera Relazione AI'}
          </button>
        </div>

        {erroreRelazione && (
          <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 mb-3">
            {erroreRelazione}
          </div>
        )}

        {relazione ? (
          <div className="relative">
            <div className="absolute top-0 right-0 flex gap-2">
              <button
                type="button"
                onClick={() => stampaTesto('Relazione', relazione, null)}
                className="text-slate-400 hover:text-blue-600"
                title="Stampa / PDF"
              >
                <Printer className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(relazione)}
                className="text-slate-400 hover:text-blue-600"
                title="Copia"
              >
                <Copy className="w-4 h-4" />
              </button>
            </div>
            <pre className="whitespace-pre-wrap text-xs text-slate-700 font-sans leading-relaxed">
              {relazione}
            </pre>
          </div>
        ) : (
          <p className="text-xs text-slate-400">
            {bloccato
              ? 'Scenario bloccato — vedi la versione più recente nella cronologia qui sotto, o sblocca per rigenerare.'
              : pronto
                ? 'Nessuna relazione generata. Premi "Genera Relazione AI".'
                : 'Completa i prerequisiti sopra per sbloccare la generazione.'}
          </p>
        )}
      </div>

      {versioni.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <History className="w-4 h-4 text-slate-400" />
            <h3 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
              Cronologia versioni ({versioni.length})
            </h3>
          </div>
          <div className="space-y-2">
            {versioni.map((v) => (
              <details key={v.numeroVersione} className="border border-slate-200 rounded-lg p-3">
                <summary className="cursor-pointer text-xs font-bold text-slate-700 flex items-center justify-between">
                  <span>
                    Versione {v.numeroVersione} — {new Date(v.generataIl).toLocaleString('it-IT')}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      stampaTesto(
                        `Relazione — versione ${v.numeroVersione}`,
                        v.testo,
                        v.generataIl
                      );
                    }}
                    className="text-slate-400 hover:text-blue-600 shrink-0 ml-2"
                    title="Stampa / PDF"
                  >
                    <Printer className="w-3.5 h-3.5" />
                  </button>
                </summary>
                <pre className="whitespace-pre-wrap text-[11px] text-slate-600 font-sans leading-relaxed mt-2">
                  {v.testo}
                </pre>
              </details>
            ))}
          </div>
        </div>
      )}

      {sblocchi.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h3 className="font-bold text-slate-900 uppercase text-xs tracking-wider mb-3">
            Cronologia sblocchi ({sblocchi.length})
          </h3>
          <div className="space-y-2">
            {sblocchi.map((s, i) => (
              <div
                key={i}
                className="text-[11px] text-slate-600 border-b border-slate-100 pb-2 last:border-0"
              >
                <span className="font-bold text-slate-800">
                  {new Date(s.sbloccatoIl).toLocaleString('it-IT')}
                </span>
                {s.sbloccatoDa && <span className="text-slate-400"> — {s.sbloccatoDa}</span>}
                <p className="mt-0.5">{s.motivo}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function RigaPrerequisito({
  fatto,
  label,
  dettaglio,
}: {
  fatto: boolean;
  label: string;
  dettaglio: string;
}) {
  return (
    <div className="flex items-start gap-2">
      {fatto ? (
        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
      ) : (
        <Circle className="w-4 h-4 text-slate-300 shrink-0 mt-0.5" />
      )}
      <div>
        <span className={`text-xs font-bold ${fatto ? 'text-slate-900' : 'text-slate-400'}`}>
          {label}
        </span>
        <p className="text-[11px] text-slate-400">{dettaglio}</p>
      </div>
    </div>
  );
}
