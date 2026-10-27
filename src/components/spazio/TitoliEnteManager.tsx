'use client';

// Titoli di credito dell'ente — Parametri di Spazio. Una riga per codice di
// partita: atto, presupposto giuridico, riferimento interno (circolare),
// effetto sul calcolo. Al salvataggio la piattaforma riscontra norma e
// riferimento sulle sole fonti ufficiali; l'esito resta sulla riga.
//
// Accanto alla parte giuridica stanno la procedura con cui l'ufficio recupera il
// credito e la DIPENDENZA, cioè l'ufficio a cui indirizzare la comunicazione di
// pagamento all'azienda: sono le due metà di «come si incassa e a chi si
// scrive», e si salvano insieme senza passare dal riscontro sulle fonti.

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Scale,
  Plus,
  Save,
  Trash2,
  ExternalLink,
  AlertTriangle,
  Check,
  Upload,
  ClipboardList,
  RefreshCw,
} from 'lucide-react';
import { leggiCodiciDaExcel } from '@/lib/titoliEnte/anagraficaExcel';
import {
  eliminaTitoloEnteAction,
  ottieniTitoliEnteAction,
  importaAnagraficaCodiciAction,
  riscontraTitoloAction,
  salvaAttivitaRecuperoAction,
  salvaDominioEnteAction,
  salvaTitoloEnteAction,
} from '@/app/actions/titoliEnte';
import {
  MASSIMO_CARATTERI_ATTIVITA_RECUPERO,
  MASSIMO_CARATTERI_DIPENDENZA,
  passiAttivitaRecupero,
  riassuntoAttivitaRecupero,
} from '@/lib/titoliEnte/recupero';
import {
  AVVERTENZA_TITOLI_ENTE,
  ETICHETTA_ESITO,
  RISCONTRO_VUOTO,
  riscontroFermo,
  type RiscontroFonte,
  type TitoloEnte,
} from '@/lib/titoliEnte/titoli';
import { confermaApp } from '@/components/FinestreApp';
import { MaterieEnteManager } from '@/components/spazio/MaterieEnteManager';
import {
  ottieniMaterieEnteAction,
  assegnaMateriaCodiceAction,
  suggerisciMaterieCodiciAction,
} from '@/app/actions/titoliEnte';
import type { MateriaEnte } from '@/lib/titoliEnte/materie';
import {
  dipendenzaEffettiva,
  proceduraEffettiva,
  type LavorazioneMateria,
} from '@/lib/titoliEnte/lavorazioniMateria';
import { ottieniLavorazioniMateria } from '@/app/actions/materieLavorazione';
import {
  riscontroEffettivo,
  type MateriaPerRiscontro,
  type RiscontroEffettivo,
} from '@/lib/titoliEnte/riscontroMateria';
import { conRitorno } from '@/lib/navigazione/ritorno';

interface Props {
  nomeSchema: string;
  codice: string;
  /** La pagina da cui si è arrivati: si riporta nei rimandi fra le gestioni. */
  ritorno?: string;
}

const CLASSE_CAMPO =
  'w-full p-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 disabled:text-slate-500';

function classeEsito(esito: RiscontroFonte['esito']): string {
  switch (esito) {
    case 'CONFERMATO':
      return 'bg-emerald-100 text-emerald-800';
    case 'IN_CONTRASTO':
      return 'bg-red-100 text-red-800';
    case 'NON_VERIFICABILE':
      return 'bg-amber-100 text-amber-800';
    case 'IN_CORSO':
      return 'bg-sky-100 text-sky-800';
    default:
      return 'bg-slate-100 text-slate-500';
  }
}

/** Un esito compatto, per la tabella. */
function BadgeRiscontro({ r }: { r: RiscontroFonte }) {
  return (
    <span
      className={`inline-block font-bold uppercase rounded px-1.5 py-0.5 text-[9px] ${classeEsito(
        r.esito
      )}`}
    >
      {ETICHETTA_ESITO[r.esito]}
    </span>
  );
}

/**
 * Lo stato dei riscontri di una riga, in tabella: è qui che si vede arrivare
 * l'esito della ricerca partita col salvataggio, senza riaprire la scheda.
 * Una ricerca rimasta appesa si può riprendere; un contrasto resta in vista
 * finché la riga non viene corretta.
 *
 * Quello che si legge è il riscontro EFFETTIVO: dove il codice non ha un esito
 * suo vale quello che la sua materia ha già ricevuto, e la riga lo dice. Una
 * ricerca automatica andata a vuoto («da riscontrare») non torna a chiedere un
 * lavoro che la materia ha già fatto e che una persona ha confermato.
 */
function RiscontriRiga({
  titolo,
  materie,
  onRiprendi,
  inCorso,
}: {
  titolo: TitoloEnte;
  materie: MateriaPerRiscontro[];
  onRiprendi: () => void;
  inCorso: boolean;
}) {
  const adesso = Date.now();
  const norma = riscontroEffettivo('norma', titolo, materie);
  const interno = riscontroEffettivo('interno', titolo, materie);
  const visibile = (r: RiscontroFonte) => r.esito !== 'NON_ESEGUITO';
  const daRiprendere =
    riscontroFermo(norma.riscontro, adesso) || riscontroFermo(interno.riscontro, adesso);
  const riga = (etichetta: string, eff: RiscontroEffettivo) =>
    visibile(eff.riscontro) && (
      <div className="flex items-center gap-1">
        <span className="text-[9px] text-slate-400 w-16 shrink-0">{etichetta}</span>
        <BadgeRiscontro r={eff.riscontro} />
        {eff.dallaMateria && (
          <span className="text-[9px] text-sky-700" title={eff.riscontro.motivo ?? undefined}>
            dalla materia «{eff.materia}»
          </span>
        )}
      </div>
    );
  return (
    <div className="space-y-0.5">
      {riga('Norma', norma)}
      {riga('Rif. interno', interno)}
      {!visibile(norma.riscontro) && !visibile(interno.riscontro) && (
        <span className="text-[10px] text-slate-400">non ancora riscontrato</span>
      )}
      {daRiprendere && (
        <button
          type="button"
          onClick={onRiprendi}
          disabled={inCorso}
          className="inline-flex items-center gap-1 text-[10px] font-bold uppercase text-sky-800 disabled:text-slate-400"
          title="La ricerca non è arrivata: riprendila ora"
        >
          <RefreshCw className="w-3 h-3" /> Riprendi
        </button>
      )}
    </div>
  );
}

function Esito({ r, etichetta }: { r: RiscontroFonte; etichetta: string }) {
  const verificatoIl = r.eseguitoIl ? new Date(r.eseguitoIl) : null;
  const dataVerifica =
    verificatoIl && !Number.isNaN(verificatoIl.getTime())
      ? verificatoIl.toLocaleDateString('it-IT')
      : null;
  const classe = classeEsito(r.esito);
  return (
    <div className="text-[10px] text-slate-600">
      <span className="text-slate-400 mr-1">{etichetta}:</span>
      <span className={`font-bold uppercase rounded px-1.5 py-0.5 ${classe}`}>
        {ETICHETTA_ESITO[r.esito]}
      </span>
      {r.motivo && r.esito !== 'IN_CORSO' && <span className="ml-1">{r.motivo}</span>}
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
      {dataVerifica && r.esito !== 'IN_CORSO' && (
        <span className="block text-slate-400">verificato il {dataVerifica}</span>
      )}
    </div>
  );
}

/** L'elenco numerato che vedrà l'operatore: lo stesso testo, letto una volta sola. */
export function AnteprimaPassi({ testo }: { testo: string }) {
  const passi = passiAttivitaRecupero(testo);
  if (passi.length === 0)
    return (
      <span className="text-[11px] text-slate-400">
        Nessun passo: la posizione resterà senza procedura.
      </span>
    );
  return (
    <ol className="list-decimal list-inside space-y-0.5 text-[11px] text-slate-700">
      {passi.map((p, i) => (
        <li key={i}>{p}</li>
      ))}
    </ol>
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

export function TitoliEnteManager({ nomeSchema, codice, ritorno }: Props) {
  const [titoli, setTitoli] = useState<TitoloEnte[]>([]);
  const [dominio, setDominio] = useState('');
  const [lottoInCorso, setLottoInCorso] = useState<{ id: string; inviatoIl: string | null } | null>(
    null
  );
  const [inModifica, setInModifica] = useState<TitoloEnte | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [inCorso, setInCorso] = useState(false);
  const [esitoImport, setEsitoImport] = useState<string | null>(null);
  /** Codice la cui verifica è stata ripresa a mano: gira dentro la richiesta. */
  const [riprendendo, setRiprendendo] = useState<number | null>(null);
  // Parte operativa in scrittura (procedura e dipendenza): una riga alla volta,
  // salvata a parte dal titolo (non passa dal riscontro sulle fonti).
  const [procedura, setProcedura] = useState<{
    id: number;
    codice: string;
    testo: string;
    dipendenza: string;
  } | null>(null);
  const [materie, setMaterie] = useState<MateriaEnte[]>([]);
  // Le lavorazioni della materia (0.138.0): dipendenza e procedura scritte una
  // volta sulla materia. Il codice che ne ha una sua la tiene; gli altri la
  // leggono da qui, senza che nessuno debba ricopiarla su ogni riga.
  const [lavorazioni, setLavorazioni] = useState<LavorazioneMateria[]>([]);
  const caricaMaterie = async () => {
    const [r, l] = await Promise.all([
      ottieniMaterieEnteAction(nomeSchema),
      ottieniLavorazioniMateria(nomeSchema),
    ]);
    if (r.success) setMaterie(r.materie);
    if (l.success) setLavorazioni(l.lavorazioni);
  };

  const carica = async () => {
    const r = await ottieniTitoliEnteAction(nomeSchema);
    if (r.success) {
      setTitoli(r.titoli);
      setDominio(r.dominioEnte ?? '');
      setLottoInCorso(r.lottoInCorso ?? null);
    } else setErrore(r.error ?? 'Lettura non riuscita.');
  };
  useEffect(() => {
    carica();
    caricaMaterie();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nomeSchema]);

  // LA RICERCA SULLE FONTI LAVORA DOPO IL SALVATAGGIO (0.133.4): finché una
  // riga è «in verifica» la scheda si aggiorna da sola, così l'esito arriva
  // sulla riga senza ricaricare la pagina. Il controllo si ferma quando non
  // c'è più nulla in corso, o quando la ricerca risulta interrotta — che è il
  // momento in cui si offre di riprenderla.
  const verificaInCorso = titoli.some(
    (t) =>
      (t.riscontroNorma.esito === 'IN_CORSO' && !riscontroFermo(t.riscontroNorma, Date.now())) ||
      (t.riscontroInterno.esito === 'IN_CORSO' && !riscontroFermo(t.riscontroInterno, Date.now()))
  );
  useEffect(() => {
    if (!verificaInCorso) return;
    const id = setInterval(() => {
      void ottieniTitoliEnteAction(nomeSchema).then((r) => {
        if (r.success) setTitoli(r.titoli);
      });
    }, 5000);
    return () => clearInterval(id);
  }, [verificaInCorso, nomeSchema]);

  const riprendi = async (id: number) => {
    setRiprendendo(id);
    setErrore(null);
    const r = await riscontraTitoloAction(codice, id);
    setRiprendendo(null);
    if (!r.success) setErrore(r.error ?? 'Verifica non riuscita.');
    await carica();
  };

  const salvaProcedura = async () => {
    if (!procedura) return;
    setInCorso(true);
    setErrore(null);
    const r = await salvaAttivitaRecuperoAction(
      codice,
      procedura.id,
      procedura.testo,
      procedura.dipendenza
    );
    setInCorso(false);
    if (!r.success) setErrore(r.error ?? 'Salvataggio non riuscito.');
    else {
      setProcedura(null);
      await carica();
    }
  };

  // Solo la procedura (o le note) sono da salvare? Allora il riscontro sulle
  // fonti non c'entra: si salva e basta. Il server fa lo stesso controllo sui
  // dati, così la decisione non dipende da quello che manda il browser.
  const soloTesto = (() => {
    if (!inModifica?.id) return false;
    const salvato = titoli.find((t) => t.id === inModifica.id);
    if (!salvato) return false;
    return (
      salvato.codice === inModifica.codice &&
      salvato.atto === inModifica.atto &&
      salvato.presuppostoGiuridico === inModifica.presuppostoGiuridico &&
      (salvato.riferimentoInterno ?? '') === (inModifica.riferimentoInterno ?? '')
    );
  })();

  // Il riscontro da mostrare nella scheda è quello SALVATO, non la copia in
  // modifica: se la ricerca in secondo piano arriva con la scheda aperta,
  // l'esito deve comparire anche lì.
  const archiviato =
    inModifica && inModifica.id !== null
      ? (titoli.find((t) => t.id === inModifica.id) ?? inModifica)
      : inModifica;
  const codiciInContrasto = titoli.filter(
    (t) =>
      riscontroEffettivo('norma', t, materie).riscontro.esito === 'IN_CONTRASTO' ||
      riscontroEffettivo('interno', t, materie).riscontro.esito === 'IN_CONTRASTO'
  );

  // Il salvataggio non aspetta più le fonti: la riga si scrive subito, la
  // ricerca parte dopo e chiude la riga quando la fonte risponde. Per questo
  // qui non ci sono più né il blocco sul contrasto né la conferma sul «da
  // riscontrare»: l'esito si legge sulla riga, non prima di salvarla.
  const salva = async () => {
    if (!inModifica) return;
    setInCorso(true);
    setErrore(null);
    const r = await salvaTitoloEnteAction(codice, inModifica);
    setInCorso(false);
    if (!r.success) {
      setErrore(r.error ?? 'Salvataggio non riuscito.');
      return;
    }
    setInModifica(null);
    setEsitoImport(
      r.inVerifica && (r.inVerifica.norma || r.inVerifica.interno)
        ? 'Riga salvata. La verifica sulle fonti è partita in secondo piano: l’esito comparirà su questa riga, anche se chiudi la pagina.'
        : null
    );
    await carica();
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
            La tabella giuridica su cui l’ente fonda il recupero. Il flusso: il sito istituzionale;
            le materie da riscontrare; la ricerca dell’AI in blocco, che propone per ogni materia
            presupposto giuridico e circolari; la conferma di una persona; i codici dell’anagrafica
            che cadono nella materia. Il titolo di una partita è quello della sua materia.
          </p>
          <p className="text-[11px] text-slate-600 mt-1">
            La ricerca sulle fonti ufficiali non tiene fermo il salvataggio: la riga si scrive e
            l’esito — confermato, da riscontrare o in contrasto — compare da solo sulla riga. Il
            riscontro che una materia ha già ricevuto vale anche per i codici che vi cadono: la riga
            lo dice, e nessun codice si vede chiedere una ricerca che è già stata fatta e
            confermata.
          </p>
          <p className="text-[11px] text-slate-600 mt-1">
            Accanto al titolo, ogni codice porta la <strong>procedura di recupero</strong>: i passi
            che l’ente segue per incassare quel credito (verificare la notifica, correggere il
            conto, controllare la proposta VIG, contabilizzare). Si scrive una volta qui; nella fase
            successiva al triage la piattaforma la mostra, partita per partita, all’operatore che la
            deve lavorare, che potrà adattarla a quella posizione.
          </p>
          <p className="text-[11px] text-slate-600 mt-1">
            Dipendenza e procedura si possono scrivere una volta sulla <strong>materia</strong> (
            <Link
              href={conRitorno(`/spazio/${codice}/parametri/materie-lavorazione`, ritorno)}
              className="font-bold text-sky-700 hover: underline"
            >
              Lavorazioni delle materie
            </Link>
            ): ogni codice della materia le eredita, e quello scritto sul singolo codice ha la
            precedenza. Dove il valore arriva dalla materia la riga lo dice.
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
        <label className="flex items-center gap-1 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[10px] uppercase rounded-lg cursor-pointer">
          <Upload className="w-3.5 h-3.5" /> Importa anagrafica dei codici (Excel)
          <input
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              setErrore(null);
              const r = await importaAnagraficaCodiciAction(codice, await leggiCodiciDaExcel(f));
              if (!r.success) setErrore(r.error ?? 'Importazione non riuscita.');
              else
                setEsitoImport(
                  `${r.inseriti} codici nuovi, ${r.aggiornati} aggiornati: completa presupposto giuridico e riferimento interno riga per riga.`
                );
              await carica();
            }}
          />
        </label>
        <button
          type="button"
          onClick={() => setInModifica({ ...NUOVO })}
          className="flex items-center gap-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-[10px] uppercase rounded-lg"
        >
          <Plus className="w-3.5 h-3.5" /> Nuovo codice
        </button>
      </div>

      <div className="border border-slate-200 rounded-xl p-4">
        <MaterieEnteManager
          nomeSchema={nomeSchema}
          codice={codice}
          dominioEnte={dominio || null}
          lottoInCorso={lottoInCorso}
          onCambiate={async () => {
            await caricaMaterie();
            await carica();
          }}
        />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <h3 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
          Codici dell’anagrafica
        </h3>
        <button
          type="button"
          onClick={async () => {
            const r = await suggerisciMaterieCodiciAction(codice);
            if (!r.success) setErrore(r.error ?? 'Errore.');
            else
              setEsitoImport(
                `${r.assegnati} codici assegnati a una materia dalla descrizione: controlla e sposta quelli che non tornano.`
              );
            await carica();
          }}
          className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[10px] uppercase rounded-lg"
        >
          Proponi la materia dei codici senza materia
        </button>
      </div>

      {esitoImport && (
        <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg p-2">
          {esitoImport}
        </p>
      )}
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
                Note dell’ente
              </label>
              <input
                value={inModifica.note ?? ''}
                onChange={(e) => setInModifica({ ...inModifica, note: e.target.value || null })}
                className={CLASSE_CAMPO}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div className="lg:col-span-2">
              <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">
                Attività di recupero — un passo per riga
              </label>
              <textarea
                value={inModifica.attivitaRecupero ?? ''}
                onChange={(e) => setInModifica({ ...inModifica, attivitaRecupero: e.target.value })}
                rows={7}
                placeholder={
                  '1. Verificare la notifica del provvedimento; se correttamente notificato passare al punto 2, altrimenti procedere alle attività di notifica\n' +
                  '2. Modificare il conto del lavoratore in base a quanto indicato in diffida\n' +
                  '3. Verificare la proposta VIG nel quantum, nel periodo e nel codice fiscale del lavoratore\n' +
                  '4. Confermare la proposta e contabilizzare il credito'
                }
                className={`${CLASSE_CAMPO} leading-relaxed`}
              />
            </div>
            <div>
              <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">
                Dipendenza
              </label>
              <input
                value={inModifica.dipendenza ?? ''}
                onChange={(e) =>
                  setInModifica({ ...inModifica, dipendenza: e.target.value || null })
                }
                className={CLASSE_CAMPO}
                placeholder="es. Ufficio Recupero Crediti — Sede di …"
              />
              <span className="block text-[10px] text-slate-500 mt-1">
                L’ufficio a cui indirizzare la comunicazione con cui si chiede all’azienda il
                pagamento del debito: sede, ufficio recupero crediti, ragioneria. È il recapito
                dell’operatore che lavora la partita.
              </span>
              <span
                className={`block text-[10px] mt-1 ${
                  (inModifica.dipendenza ?? '').length > MASSIMO_CARATTERI_DIPENDENZA
                    ? 'text-red-700 font-bold'
                    : 'text-slate-400'
                }`}
              >
                {(inModifica.dipendenza ?? '').length} / {MASSIMO_CARATTERI_DIPENDENZA}
              </span>
            </div>
          </div>
          <div>
            <div className="flex items-start gap-4 flex-wrap mt-2">
              <div className="flex-1 min-w-56">
                <span className="block text-[9px] font-bold text-slate-400 uppercase mb-1">
                  Come lo vedrà l’operatore
                </span>
                <AnteprimaPassi testo={inModifica.attivitaRecupero ?? ''} />
                <span className="block text-[10px] text-slate-500 mt-1">
                  La procedura non richiede riscontro normativo: si salva così com’è.
                </span>
                {(() => {
                  if (!inModifica.attivitaRecupero) {
                    const proc = proceduraEffettiva(inModifica, lavorazioni);
                    if (proc.dallaMateria)
                      return (
                        <span className="block text-[10px] text-sky-700 mt-1">
                          Vuota qui, viene dalla materia «{proc.tipologia}»: scrivendo in questa
                          casella il codice avrà una sua procedura.
                        </span>
                      );
                  }
                  return null;
                })()}
              </div>
              <span
                className={`text-[10px] ${
                  (inModifica.attivitaRecupero ?? '').length > MASSIMO_CARATTERI_ATTIVITA_RECUPERO
                    ? 'text-red-700 font-bold'
                    : 'text-slate-400'
                }`}
              >
                {(inModifica.attivitaRecupero ?? '').length} / {MASSIMO_CARATTERI_ATTIVITA_RECUPERO}
              </span>
            </div>
          </div>
          {/* Lo stato dei riscontri SALVATI, mentre si modifica la riga: un
              «da riscontrare» o un «in contrasto» che si ritrova qui viene da
              una ricerca precedente, non dal salvataggio appena fatto. */}
          {inModifica.id !== null && (
            <div className="bg-white border border-slate-200 rounded-lg p-3 space-y-1">
              <span className="block text-[9px] font-bold text-slate-400 uppercase">
                Riscontri sulle fonti
              </span>
              {(() => {
                const r = archiviato ?? inModifica;
                const norma = riscontroEffettivo('norma', r, materie);
                const interno = riscontroEffettivo('interno', r, materie);
                if (
                  norma.riscontro.esito === 'NON_ESEGUITO' &&
                  interno.riscontro.esito === 'NON_ESEGUITO'
                )
                  return (
                    <span className="text-[10px] text-slate-500">
                      Nessun riscontro ancora eseguito: la ricerca parte al salvataggio della parte
                      giuridica e l’esito compare qui da solo.
                    </span>
                  );
                return (
                  <>
                    <Esito r={norma.riscontro} etichetta="Norma" />
                    <Esito r={interno.riscontro} etichetta="Riferimento interno" />
                    {(norma.dallaMateria || interno.dallaMateria) && (
                      <span className="block text-[10px] text-sky-700">
                        L’esito qui sopra è quello eseguito una volta per la materia «
                        {norma.materia ?? interno.materia}»: vale per tutti i codici che vi cadono,
                        e il codice rifà la ricerca solo se ha un presupposto o un riferimento
                        interno suoi.
                      </span>
                    )}
                  </>
                );
              })()}
              <span className="block text-[10px] text-slate-400 pt-1">
                Restano com’erano finché atto, presupposto giuridico e riferimento interno non
                cambiano: correggere la sola procedura non li tocca. Salvando una modifica giuridica
                la verifica riparte, e questo riquadro si aggiorna da solo.
              </span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void salva()}
              disabled={inCorso}
              className="flex items-center gap-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-bold text-[10px] uppercase rounded-lg"
            >
              <Save className="w-3.5 h-3.5" /> {inCorso ? 'Salvataggio…' : 'Salva'}
            </button>
            <button
              type="button"
              onClick={() => {
                setInModifica(null);
                setErrore(null);
              }}
              className="px-3 py-2 text-[10px] font-bold uppercase text-slate-500"
            >
              Annulla
            </button>
            {!inCorso && !soloTesto && (
              <span className="text-[11px] text-slate-500">
                La verifica sulle fonti parte dopo il salvataggio e aggiorna la riga da sola: non
                serve aspettare qui. La ricerca è limitata a Gazzetta Ufficiale, Normattiva e al
                sito dell’ente.
              </span>
            )}
          </div>
        </div>
      )}

      {codiciInContrasto.length > 0 && (
        <p className="text-xs text-red-800 bg-red-50 border border-red-200 rounded-lg p-2 flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>
            {codiciInContrasto.length === 1
              ? 'Un codice è in contrasto con le fonti ufficiali'
              : `${codiciInContrasto.length} codici sono in contrasto con le fonti ufficiali`}
            : il passo trovato è nella scheda. Correggere la parte giuridica (o il riferimento
            interno) fa ripartire la verifica da sola.
          </span>
        </p>
      )}

      <div className="overflow-x-auto border border-slate-200 rounded-lg">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 text-[9px] uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2 font-bold">Codice</th>
              <th className="px-3 py-2 font-bold">Atto o flusso</th>
              <th className="px-3 py-2 font-bold">Materia (titolo della partita)</th>
              <th className="px-3 py-2 font-bold">Attività di recupero e dipendenza</th>
              <th className="px-3 py-2 font-bold">Riscontro sulle fonti</th>
              <th className="px-3 py-2 font-bold"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {titoli.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-4 text-slate-500">
                  Nessun codice configurato: importa l’anagrafica dei codici dell’ente (Excel con
                  colonne Codice e Descrizione), poi completa ogni riga.
                </td>
              </tr>
            )}
            {titoli.map((t) => (
              <React.Fragment key={t.id ?? t.codice}>
                <tr className="align-top">
                  <td className="px-3 py-2 font-bold text-slate-900">{t.codice}</td>
                  <td className="px-3 py-2 text-slate-800">
                    {t.atto}
                    {t.note && <span className="block text-[10px] text-slate-500">{t.note}</span>}
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={t.materiaId ?? ''}
                      onChange={async (e) => {
                        const v = e.target.value ? Number(e.target.value) : null;
                        const r = await assegnaMateriaCodiceAction(codice, t.id!, v);
                        if (!r.success) setErrore(r.error ?? 'Errore.');
                        await carica();
                      }}
                      className={`${CLASSE_CAMPO} ${t.materiaId ? '' : 'border-amber-400'}`}
                    >
                      <option value="">— da assegnare —</option>
                      {materie.map((m) => (
                        <option key={m.id} value={m.id!}>
                          {m.nome}
                          {m.stato === 'CONFERMATA' ? ' ✓' : ''}
                        </option>
                      ))}
                    </select>
                    {(() => {
                      const m = materie.find((x) => x.id === t.materiaId);
                      return m?.presuppostoGiuridico ? (
                        <span className="block text-[10px] text-slate-500 mt-0.5">
                          {m.presuppostoGiuridico}
                        </span>
                      ) : null;
                    })()}
                  </td>
                  <td className="px-3 py-2 text-slate-700">
                    {(() => {
                      const proc = proceduraEffettiva(t, lavorazioni);
                      const dip = dipendenzaEffettiva(t, lavorazioni);
                      return (
                        <>
                          {riassuntoAttivitaRecupero(proc.valore) || (
                            <span className="text-amber-700">da scrivere</span>
                          )}
                          {proc.dallaMateria && (
                            <span className="block text-[9px] text-sky-700">
                              dalla materia «{proc.tipologia}»
                            </span>
                          )}
                          <span
                            className={`block text-[10px] ${
                              dip.valore
                                ? dip.dallaMateria
                                  ? 'text-sky-700'
                                  : 'text-slate-500'
                                : 'text-amber-700'
                            }`}
                          >
                            {dip.valore
                              ? `→ ${dip.valore}${dip.dallaMateria ? ' (dalla materia)' : ''}`
                              : 'dipendenza da indicare'}
                          </span>
                        </>
                      );
                    })()}
                  </td>
                  <td className="px-3 py-2">
                    <RiscontriRiga
                      titolo={t}
                      materie={materie}
                      inCorso={riprendendo === t.id}
                      onRiprendi={() => {
                        if (t.id) void riprendi(t.id);
                      }}
                    />
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => setInModifica(t)}
                      className="text-[10px] font-bold uppercase text-blue-700 mr-2"
                    >
                      Modifica
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!t.id) return;
                        setProcedura((prev) =>
                          prev?.id === t.id
                            ? null
                            : {
                                id: t.id!,
                                codice: t.codice,
                                // Se il codice non ha una sua procedura si parte
                                // da quella della materia: modificandola qui il
                                // codice se ne scosta, e la materia resta com'è.
                                testo: proceduraEffettiva(t, lavorazioni).valore ?? '',
                                dipendenza: dipendenzaEffettiva(t, lavorazioni).valore ?? '',
                              }
                        );
                        setErrore(null);
                      }}
                      className="text-[10px] font-bold uppercase text-slate-700 mr-2 inline-flex items-center gap-1"
                      title="La procedura che gli operatori seguono per recuperare questo credito"
                    >
                      <ClipboardList className="w-3.5 h-3.5" /> Attività
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
                {procedura && t.id !== null && procedura.id === t.id && (
                  <tr className="bg-slate-50">
                    <td colSpan={6} className="px-3 py-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <ClipboardList className="w-3.5 h-3.5 text-slate-500" />
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-700">
                          Attività di recupero — codice {t.codice}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500">
                        Un passo per riga, nell’ordine in cui l’ufficio li esegue. È il testo che la
                        fase successiva al triage mostrerà all’operatore: qui si configura una
                        volta, poi si adatta sulla singola posizione.
                      </p>
                      {(() => {
                        const salvato = titoli.find((x) => x.id === procedura.id);
                        const proc = salvato ? proceduraEffettiva(salvato, lavorazioni) : null;
                        if (!proc?.dallaMateria) return null;
                        return (
                          <p className="text-[10px] text-sky-700">
                            Il testo qui sotto è quello della materia «{proc.tipologia}»: salvandolo
                            il codice avrà una sua procedura e la materia resta com’è.
                          </p>
                        );
                      })()}
                      <div className="max-w-xl">
                        <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">
                          Dipendenza — ufficio a cui indirizzare la comunicazione
                        </label>
                        <input
                          value={procedura.dipendenza}
                          onChange={(e) =>
                            setProcedura({ ...procedura, dipendenza: e.target.value })
                          }
                          className={CLASSE_CAMPO}
                          placeholder="es. Ufficio Recupero Crediti — Sede di …"
                        />
                        <span className="block text-[10px] text-slate-500 mt-1">
                          Dove va indirizzata la comunicazione con cui si chiede all’azienda il
                          pagamento del debito. Senza destinatario la procedura non si può eseguire.
                        </span>
                      </div>
                      <textarea
                        value={procedura.testo}
                        onChange={(e) => setProcedura({ ...procedura, testo: e.target.value })}
                        rows={8}
                        placeholder={
                          '1. Verificare la notifica del provvedimento; se correttamente notificato passare al punto 2, altrimenti procedere alle attività di notifica\n' +
                          '2. Modificare il conto del lavoratore in base a quanto indicato in diffida\n' +
                          '3. Verificare la proposta VIG nel quantum, nel periodo e nel codice fiscale del lavoratore\n' +
                          '4. Confermare la proposta e contabilizzare il credito'
                        }
                        className={`${CLASSE_CAMPO} leading-relaxed`}
                      />
                      <div className="flex items-start gap-4 flex-wrap">
                        <div className="flex-1 min-w-56">
                          <span className="block text-[9px] font-bold text-slate-400 uppercase mb-1">
                            Come lo vedrà l’operatore
                          </span>
                          <AnteprimaPassi testo={procedura.testo} />
                        </div>
                        <span
                          className={`text-[10px] ${
                            procedura.testo.length > MASSIMO_CARATTERI_ATTIVITA_RECUPERO
                              ? 'text-red-700 font-bold'
                              : 'text-slate-400'
                          }`}
                        >
                          {procedura.testo.length} / {MASSIMO_CARATTERI_ATTIVITA_RECUPERO}
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => void salvaProcedura()}
                            disabled={inCorso}
                            className="flex items-center gap-1 px-3 py-2 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white font-bold text-[10px] uppercase rounded-lg"
                          >
                            <Save className="w-3.5 h-3.5" /> Salva procedura
                          </button>
                          <button
                            type="button"
                            onClick={() => setProcedura(null)}
                            className="px-3 py-2 text-[10px] font-bold uppercase text-slate-500"
                          >
                            Annulla
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-slate-400 flex items-center gap-1">
        <Check className="w-3 h-3" /> Un riscontro confermato resta sulla riga finché norma o
        riferimento non cambiano. Il riscontro che la materia ha già ricevuto vale per i codici che
        vi cadono: la riga lo dice, e il codice rifà la ricerca solo se ha un presupposto o un
        riferimento interno suoi. La verifica parte dopo il salvataggio: le righe «in verifica» si
        aggiornano da sole, senza ricaricare la pagina.
      </p>
    </div>
  );
}
