// src/lib/visura/fatti.ts
//
// FATTI DELLA VISURA — estratti UNA volta, salvati, e poi passati all'AI come
// dati. Prima, l'AI rileggeva la visura a ogni generazione e coglieva fatti
// diversi ogni volta (l'affitto d'azienda, il trasferimento di sede, gli
// addetti c'erano alle 11:53 e non alle 18:58: rilievo di Libra).
//
// Il modulo e' logica pura: valida il JSON che arriva dall'estrazione, e
// produce gli avvisi deterministici. L'estrazione in se' e' ancora un
// compito dell'AI (la visura e' un PDF), ma con un contratto chiuso: campi
// fissi, «null» dove il dato non c'e', mai inventato. Ogni fatto porta il
// riferimento alla riga della visura da cui viene.

export interface ProceduraConcorsuale {
  tipo: string;
  /** AAAA-MM-GG o null. */
  data: string | null;
  stato: string | null;
  tribunale: string | null;
  riferimento: string | null;
}

export interface FattiVisura {
  denominazione: string | null;
  codiceFiscale: string | null;
  formaGiuridica: string | null;
  sedeLegale: string | null;
  dataCostituzione: string | null;
  durata: string | null;
  statoAttivita: string | null;
  capitaleSociale: number | null;
  addetti: { numero: number; riferimento: string | null } | null;
  oggettoSociale: string | null;
  amministratori: { nome: string; carica: string }[];
  procedureConcorsuali: ProceduraConcorsuale[];
  trasferimentiSede: { data: string | null; da: string | null; a: string | null }[];
  attiRilevanti: { data: string | null; descrizione: string }[];
  /** Data di riferimento della visura, se stampata. */
  dataVisura: string | null;
}

export const FATTI_VUOTI: FattiVisura = {
  denominazione: null,
  codiceFiscale: null,
  formaGiuridica: null,
  sedeLegale: null,
  dataCostituzione: null,
  durata: null,
  statoAttivita: null,
  capitaleSociale: null,
  addetti: null,
  oggettoSociale: null,
  amministratori: [],
  procedureConcorsuali: [],
  trasferimentiSede: [],
  attiRilevanti: [],
  dataVisura: null,
};

const str = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() && v.trim().toLowerCase() !== 'null' ? v.trim() : null;
const num = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v.replace(/[€\s.]/g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
  return null;
};
const data = (v: unknown): string | null => {
  const s = str(v);
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
};
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

/** Rende un JSON qualsiasi un FattiVisura ben formato: niente eccezioni, campi mancanti = null. */
export function normalizzaFattiVisura(grezzo: unknown): FattiVisura {
  const g = obj(grezzo);
  const addettiG = obj(g.addetti);
  const addettiN = num(addettiG.numero);
  return {
    denominazione: str(g.denominazione),
    codiceFiscale: str(g.codiceFiscale),
    formaGiuridica: str(g.formaGiuridica),
    sedeLegale: str(g.sedeLegale),
    dataCostituzione: data(g.dataCostituzione),
    durata: str(g.durata),
    statoAttivita: str(g.statoAttivita),
    capitaleSociale: num(g.capitaleSociale),
    addetti:
      addettiN === null ? null : { numero: addettiN, riferimento: str(addettiG.riferimento) },
    oggettoSociale: str(g.oggettoSociale),
    amministratori: arr(g.amministratori)
      .map(obj)
      .filter((a) => str(a.nome))
      .map((a) => ({ nome: str(a.nome)!, carica: str(a.carica) ?? 'carica non indicata' })),
    procedureConcorsuali: arr(g.procedureConcorsuali)
      .map(obj)
      .filter((p) => str(p.tipo))
      .map((p) => ({
        tipo: str(p.tipo)!,
        data: data(p.data),
        stato: str(p.stato),
        tribunale: str(p.tribunale),
        riferimento: str(p.riferimento),
      })),
    trasferimentiSede: arr(g.trasferimentiSede)
      .map(obj)
      .filter((t) => str(t.a) || str(t.da))
      .map((t) => ({ data: data(t.data), da: str(t.da), a: str(t.a) })),
    attiRilevanti: arr(g.attiRilevanti)
      .map(obj)
      .filter((a) => str(a.descrizione))
      .map((a) => ({ data: data(a.data), descrizione: str(a.descrizione)! })),
    dataVisura: data(g.dataVisura),
  };
}

/** Estrae il JSON da una risposta che potrebbe avere recinti o testo attorno. */
export function estraiJson(testo: string): unknown {
  const pulito = testo.replace(/```json|```/g, '').trim();
  const inizio = pulito.indexOf('{');
  const fine = pulito.lastIndexOf('}');
  if (inizio < 0 || fine <= inizio) return null;
  try {
    return JSON.parse(pulito.slice(inizio, fine + 1));
  } catch {
    return null;
  }
}

/** Una procedura e' «pendente» se lo stato non dice che e' chiusa. */
export function proceduraPendente(p: ProceduraConcorsuale): boolean {
  const s = (p.stato ?? '').toLowerCase();
  if (!s) return true; // stato non indicato: si segnala, non si presume chiusa
  return !/chius|conclus|revocat|cessat|estint|omologat[oa]\s+ed\s+eseguit|esecuzione\s+completat|archiviat/.test(
    s
  );
}

export interface AvvisoVisura {
  codice: 'PROCEDURA_PENDENTE' | 'STATO_ATTIVITA' | 'DATA_VISURA';
  testo: string;
}

/**
 * Avvisi deterministici. Formule di Libra: la piattaforma RILEVA un fatto
 * della visura; il suo peso giuridico (es. coesistenza di un concordato in
 * esecuzione con una composizione negoziata: art. 390 CCII e legge
 * fallimentare per i procedimenti anteriori) e' di livello 4 e spetta al
 * professionista.
 */
export function avvisiDaFattiVisura(f: FattiVisura, oggi: string): AvvisoVisura[] {
  const avvisi: AvvisoVisura[] = [];
  const pendenti = f.procedureConcorsuali.filter(proceduraPendente);
  for (const p of pendenti) {
    const quando = p.data ? ` del ${p.data.split('-').reverse().join('/')}` : '';
    const dove = p.tribunale ? ` (${p.tribunale})` : '';
    avvisi.push({
      codice: 'PROCEDURA_PENDENTE',
      testo: `Procedura concorsuale risultante dalla visura: ${p.tipo}${quando}${dove}, stato «${p.stato ?? 'non indicato'}». Il dato è rilevato, non accertato: la coesistenza con lo strumento in esame (adempimento, risoluzione, disciplina applicabile per data del procedimento) va valutata professionalmente prima di ogni altra istruttoria.`,
    });
  }
  if (f.statoAttivita && /liquidaz|cessat|sciolt|cancellat|inattiv|sospes/i.test(f.statoAttivita)) {
    avvisi.push({
      codice: 'STATO_ATTIVITA',
      testo: `Stato dell’attività risultante dalla visura: «${f.statoAttivita}». Rilevato, non accertato.`,
    });
  }
  if (f.dataVisura) {
    const giorni = Math.floor((Date.parse(oggi) - Date.parse(f.dataVisura)) / 86_400_000);
    if (giorni > 90) {
      avvisi.push({
        codice: 'DATA_VISURA',
        testo: `La visura è riferita al ${f.dataVisura.split('-').reverse().join('/')} (${giorni} giorni fa): i fatti sono aggiornati a quella data, non a oggi.`,
      });
    }
  }
  return avvisi;
}

/** I fatti in forma di testo, per il prompt: dati, non interpretazioni. */
export function fattiVisuraPerPrompt(f: FattiVisura): string {
  const righe: string[] = [];
  const r = (etichetta: string, v: string | number | null) => {
    if (v !== null && v !== '') righe.push(`- ${etichetta}: ${v}`);
  };
  r('Denominazione', f.denominazione);
  r('Codice fiscale', f.codiceFiscale);
  r('Forma giuridica', f.formaGiuridica);
  r('Sede legale', f.sedeLegale);
  r('Costituzione', f.dataCostituzione);
  r('Durata', f.durata);
  r('Stato attività', f.statoAttivita);
  r('Capitale sociale (€)', f.capitaleSociale);
  if (f.addetti)
    r(
      'Addetti',
      `${f.addetti.numero}${f.addetti.riferimento ? ` (${f.addetti.riferimento})` : ''}`
    );
  r('Oggetto sociale', f.oggettoSociale);
  for (const a of f.amministratori) righe.push(`- Organo: ${a.nome} — ${a.carica}`);
  for (const p of f.procedureConcorsuali)
    righe.push(
      `- Procedura concorsuale: ${p.tipo}${p.data ? ` del ${p.data}` : ''}${p.tribunale ? `, ${p.tribunale}` : ''} — stato ${p.stato ?? 'non indicato'}`
    );
  for (const t of f.trasferimentiSede)
    righe.push(
      `- Trasferimento di sede${t.data ? ` del ${t.data}` : ''}: ${t.da ?? '?'} → ${t.a ?? '?'}`
    );
  for (const a of f.attiRilevanti)
    righe.push(`- Atto${a.data ? ` del ${a.data}` : ''}: ${a.descrizione}`);
  r('Data della visura', f.dataVisura);
  return righe.length ? righe.join('\n') : '- (nessun fatto estratto)';
}

export const PROMPT_ESTRAZIONE_VISURA = `Leggi la visura camerale allegata ed estrai SOLO i fatti che vi compaiono, in questo JSON e nient'altro (nessun testo prima o dopo, nessun recinto di codice):
{
  "denominazione": string|null,
  "codiceFiscale": string|null,
  "formaGiuridica": string|null,
  "sedeLegale": string|null,
  "dataCostituzione": "AAAA-MM-GG"|null,
  "durata": string|null,
  "statoAttivita": string|null,
  "capitaleSociale": number|null,
  "addetti": {"numero": number, "riferimento": string|null}|null,
  "oggettoSociale": string|null,
  "amministratori": [{"nome": string, "carica": string}],
  "procedureConcorsuali": [{"tipo": string, "data": "AAAA-MM-GG"|null, "stato": string|null, "tribunale": string|null, "riferimento": string|null}],
  "trasferimentiSede": [{"data": "AAAA-MM-GG"|null, "da": string|null, "a": string|null}],
  "attiRilevanti": [{"data": "AAAA-MM-GG"|null, "descrizione": string}],
  "dataVisura": "AAAA-MM-GG"|null
}
Regole: un dato che non c'è è null, mai inventato né dedotto. "procedureConcorsuali" comprende concordati, liquidazioni giudiziali, fallimenti, accordi di ristrutturazione, composizioni negoziate, amministrazioni straordinarie, liquidazioni coatte: riporta tipo, data e STATO esattamente come scritti nella visura. "attiRilevanti": affitti o cessioni d'azienda, fusioni, scissioni, trasformazioni, riduzioni di capitale, scioglimenti. Nessuna valutazione, nessun giudizio.`;
