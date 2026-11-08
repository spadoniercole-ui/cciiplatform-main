# Specifica tecnica — Piano-ponte

**Stato:** bozza di specifica, non implementata.
**Perimetro:** spazi `ENTE`.
**Oggetto:** allineare la contabilità storica dell'azienda alla data della Verifica
amministrativa, senza riscrivere il bilancio depositato e senza sostituire il piano dello
Scenario.

---

## 1. Scopo

Il Piano-ponte è una proiezione economico-patrimoniale e finanziaria che parte dall'ultimo
bilancio XBRL disponibile e arriva alla data di riferimento della Verifica amministrativa.

Serve a mettere sullo stesso piano:

- il debito certo verso l'ente, rilevato dalla Verifica amministrativa;
- la situazione contabile storica, rilevata dalla Verifica contabile;
- una stima del debito totale e della capacità dell'azienda di sostenerlo alla data della
  verifica.

Il Piano-ponte **non** è:

- un nuovo bilancio depositato;
- una perizia o un parere legale;
- un piano aziendale ai sensi della normativa concorsuale;
- il `piano_sviluppo` dello Scenario;
- il `piano_aziendale` importato dall'azienda nello Scenario.

È un documento di lavoro dell'ente, versionato e verificabile, che alimenta la Sintesi
integrata e, se l'azienda accetta il confronto, lo Scenario di dialogo.

---

## 2. Decisioni acquisite

1. La funzione è disponibile **solo per gli spazi ENTE**, come l'attuale Screening.
2. Il Piano-ponte vive **a livello azienda**, non dentro uno Scenario.
3. La data di riferimento è **la data della Verifica amministrativa**, non la data odierna.
4. Il confronto finale usa **credito dell'ente + debito totale stimato + recupero**.
5. Le note integrative sono lette dal file XBRL. Il parser attuale non le legge: la capacità
   va costruita (vedi §5.4).
6. Il nome “Piano-ponte” evita la collisione con `piano_aziendale` e `piano_sviluppo`.
7. L'AI propone assunzioni e narrativa; i numeri sono calcolati da un motore deterministico.
8. Nessun numero può esistere senza provenienza, motivazione e versione.

---

## 3. Definizioni e invarianti

| Termine | Definizione |
|---|---|
| **Data verifica** | `aziende.verifica_riferita_al`. È il giorno a cui si riferiscono i conti amministrativi. |
| **Ultimo dato assumibile** | La riga più recente di `xbrl_storico_azienda` con `anno_bilancio` valorizzato e dati finanziari non vuoti. |
| **Ponte** | Proiezione dal giorno finale dell'ultimo bilancio alla Data verifica. |
| **Debito ente certo** | Esposizione verso l'ente risultante dalla Verifica amministrativa, al netto di duplicati, sospese e posizioni ignorate. |
| **Debito totale stimato** | Passività proiettate alla Data verifica: banche, fornitori, tributari, previdenziali, altri e fabbisogno finanziario dichiarato. |
| **Recupero ente** | Quota del credito dell'ente che si stima di incassare nello scenario considerato. |
| **Copertura** | Quanto i dati di input coprono il modello. Non è una probabilità di default. |
| **Assunzione** | Un valore o una regola di proiezione, con fonte, motivazione e intervallo. |

Invarianti non negoziabili:

1. Il bilancio XBRL non viene modificato dal Ponte.
2. Il Ponte non crea un “plug” di debito o di cassa per far quadrare il bilancio.
3. Il debito ente non viene contato due volte dentro il debito totale.
4. Ogni output è riproducibile dallo stesso `hash_input`.
5. Un Ponte confermato non si modifica: se ne crea una nuova versione.
6. Nessuna conclusione giuridica automatica: il Ponte misura, non qualifica la crisi.

---

## 4. Flusso e confini

```text
Verifica amministrativa
  ├── data di riferimento
  ├── debito ente certo
  └── Report di triage
          │
          ▼
Verifica contabile
  ├── ultimo XBRL + note integrative
  ├── visura e dati di settore
  └── Report di verifica contabile
          │
          ▼
Piano-ponte (azienda)
  ├── proiezione a Data verifica
  ├── riconciliazione debito ente / debito totale
  └── copertura, limiti, scenari
          │
          ▼
Sintesi integrata
  ├── credito ente
  ├── debito totale stimato
  └── recupero: trattativa, liquidazione, cram down, giudice
          │
          ▼
Scenario di dialogo
  ├── assunzioni AI (Piano-ponte)
  ├── assunzioni azienda (dati aggiornati)
  └── benchmark di settore
```

Il Ponte non richiede uno Scenario. Lo Scenario non può esistere senza una base contabile
tracciabile: può usare il Ponte o, se manca, dichiarare esplicitamente la base alternativa.

---

## 5. Input

### 5.1 Ingressi obbligatori

| Input | Fonte | Regola |
|---|---|---|
| Data verifica | `aziende.verifica_riferita_al` | Obbligatoria. Se assente, il Ponte non parte. |
| Ultimo XBRL | `xbrl_storico_azienda` | Almeno un anno con `anno_bilancio` e `dati_finanziari` validi. |
| Debito ente certo | Perimetro della Verifica amministrativa: `debiti_vera` come fonte primaria, più le altre posizioni del triage se valorizzate | Snapshot alla data della verifica. Se non ci sono righe, serve una dichiarazione esplicita “debito ente assente”. |
| Parametri del modello | configurazione di spazio | Versione del modello e dei limiti. |

### 5.2 Ingressi facoltativi, ma tracciati

| Input | Fonte | Effetto se manca |
|---|---|---|
| Note integrative | `xbrl_storico_azienda.note_fatti` (nuovo) | Avviso `NOTE_ASSENTI`; copertura ridotta. |
| Fatti della visura | `azienda_screening.visura_fatti` | Avviso `VISURA_ASSENTE`; si usa l'anagrafica. |
| Dati di settore | `public.dati_settore_cache` | Avviso `SETTORE_ASSENTE`; fallback al CAGR aziendale. |
| Dati gestionali aggiornati | Scenario, non Ponte | Il Ponte resta sulla base storica; lo Scenario li confronta. |
| Provvedimento del giudice | `giudice/lettura.ts` | Il Ponte non lo usa; la Sintesi integrata sì. |

### 5.3 XBRL — contratto di lettura

Campi usati da `xbrl_storico_azienda`:

- `anno_bilancio`
- `dati_finanziari` (`DatiFinanziariPeriodo`)
- `indici`, `altri_indici`, `situazione_debitoria`, `severity`
- `documento_id`
- `note_fatti`, `note_impronta` (nuovi)

Regole:

1. L'anno di partenza è il più recente con dati non vuoti.
2. Se l'anno finale del bilancio è successivo o uguale alla Data verifica, il Ponte non serve:
   si restituisce `PONTE_NON_NECESSARIO`.
3. Se il gap supera 36 mesi, avviso `GAP_LUNGO`; oltre 60 mesi, blocco salvo conferma
   esplicita dell'operatore.
4. Il comparativo XBRL è uno storico, non un'ipotesi: non si usa per riempire il futuro.
5. I dati mancanti restano `null`; non si sostituiscono con zero.

### 5.4 Note integrative — capacità nuova

Il parser attuale (`src/lib/xbrl/parser.ts`) estrae solo fact numerici con `contextRef`. I fact
testuali vengono ignorati. La specifica richiede:

1. Estensione del parser con `FactTestuale`:
   - `tagPulito`, `tagOriginale`, `contextRef`, `testo`, `lingua`, `documentoId`.
2. Persistenza in `xbrl_storico_azienda.note_fatti` come array JSONB, con:
   - tag, testo, contesto, ordine, impronta del documento.
3. Estrazione delle sezioni rilevanti:
   - criteri di valutazione;
   - fatti di rilievo dopo la chiusura;
   - continuità aziendale;
   - impegni e passività potenziali;
   - parti correlate;
   - eventi straordinari;
   - piani e intenzioni dichiarate.
4. Citazione obbligatoria: ogni assunzione tratta dalle note deve riportare tag, sezione e
   frammento di testo.
5. Se il file non contiene fact testuali, il Ponte non si blocca: registra `NOTE_ASSENTI` e
   riduce la copertura. La UI deve dire “note non presenti nel file”, non “note assenti
   nell'azienda”.

La tassonomia italiana può collocare le note in documenti o tassonomie diverse. Il primo
test su un file reale deve verificare quali tag sono effettivamente presenti; la specifica non
presuppone che tutte le note siano sempre nello stesso formato.

### 5.5 Debito ente — perimetro

Non si somma il debito a mano. Si riusa la logica già adottata dal triage e dal report UO, con `debiti_vera` come fonte primaria e le altre posizioni del triage come integrazione:

- esclusione dei duplicati F24/denunce;
- esclusione delle posizioni `ignora` e delle sospese;
- inclusione delle posizioni contabilizzate e da contabilizzare secondo il perimetro della
  verifica;
- separazione tra contributi, sanzioni e crediti già affidati all'Agente.

Il risultato è un oggetto:

```ts
interface DebitoEnteSnapshot {
  dataRiferimento: string;
  totale: number;
  contributi: number;
  sanzioni: number;
  creditiAgente: number;
  righe: number;
  hash: string;
  esclusioni: string[];
}
```

Se il totale è zero, l'operatore deve confermarlo esplicitamente. Un file assente non equivale
a debito zero.

### 5.6 Dati di settore

`public.dati_settore_cache` contiene oggi una serie ISTAT di crescita per gruppo ATECO. È un
driver, non un benchmark completo.

Regole:

1. Usare la serie solo se il gruppo ATECO è riconosciuto e il dato è in cache.
2. Non chiamare ISTAT automaticamente durante il calcolo.
3. Se la serie manca, usare il CAGR dei ricavi aziendali.
4. Se mancano entrambi, crescita zero e avviso `SETTORE_ASSENTE`.
5. Non presentare la crescita ISTAT come previsione dell'azienda: è un riferimento storico.

Per una versione successiva, il modello potrà accettare ulteriori driver di settore (margini,
giorni di incasso/pagamento, investimenti), ma solo se la fonte è disponibile e tracciata.

### 5.7 Dati aziendali aggiornati

Non sono input del Ponte. Appartengono allo Scenario di dialogo:

- `piano_aziendale` (documento dell'azienda);
- `piano_sviluppo` (varianti e ipotesi);
- `posizione_aggiornata` (dati infrannuali, oggi legata allo Scenario).

Lo Scenario confronta questi dati con il Ponte, non li incorpora silenziosamente.

---

## 6. Output

### 6.1 Contratto dati

```ts
interface PonteTemporale {
  id: number;
  aziendaId: number;
  dataRiferimento: string;       // AAAA-MM-GG
  esercizioPartenza: number;
  versione: number;
  stato: 'BOZZA' | 'CALCOLATO' | 'CONFERMATO' | 'SUPERATO' | 'ARCHIVIATO';
  fonti: FontiPonte;
  assunzioni: AssunzionePonte[];
  output: OutputPonte;
  confidenza: ConfidenzaPonte;
  hashInput: string;
  hashOutput: string;
  modello: string;
  promptVersione: string;
  sostituisceId: number | null;
  creatoDa: string;
  creatoIl: string;
  confermatoDa: string | null;
  confermatoIl: string | null;
}

interface OutputPonte {
  mesi: number;
  anni: AnnoPonte[];
  riconciliazione: RiconciliazionePonte;
  scenari: {
    base: ScenarioPonte;
    favorevole: ScenarioPonte;
    sfavorevole: ScenarioPonte;
  };
  vincoli: VincoloPonte[];
  limiti: string[];
}
```

`AnnoPonte` riusa la forma di `AnnoPiano` (`src/lib/piano/piano.ts`) e aggiunge:

- dettaglio mensile del primo e dell'ultimo anno;
- `fabbisognoSenzaFinanziamento`, distinto dal debito;
- `debitoEnte`, `debitoTotale`, `recuperoEnte`.

`RiconciliazionePonte`:

```ts
interface RiconciliazionePonte {
  debitoEnteCerto: number;
  debitoEnteNelBilancio: number;
  rettificaDebitoEnte: number;
  altriDebitiIniziali: number;
  nuoviDebiti: number;
  rimborsi: number;
  debitoTotaleStimato: number;
  cassaIniziale: number;
  flussoGestione: number;
  investimenti: number;
  fabbisognoSenzaFinanziamento: number;
  cassaFinale: number;
  patrimonioNettoIniziale: number;
  utilePonte: number;
  apporti: number;
  patrimonioNettoFinale: number;
  differenze: DifferenzaRiconciliazione[];
}
```

### 6.2 Report di verifica contabile

Il report HTML/PDF contiene, nell'ordine:

1. **Copertina**: azienda, Data verifica, ultimo bilancio, versione del Ponte, data di
   generazione, stato.
2. **Dati di partenza**: XBRL usati, note (con copertura), visura, settore, debito ente.
3. **Situazione storica**: stato patrimoniale, conto economico, indici, PFN.
4. **Assunzioni**: tabella con valore, fonte, motivazione, intervallo, provenienza.
5. **Proiezione**: CE, SP e flussi di cassa alla Data verifica; base, favorevole, sfavorevole.
6. **Riconciliazione**: dal bilancio al Ponte, voce per voce.
7. **Debito totale**: composizione e confronto con il debito ente.
8. **Copertura e limiti**: dati mancanti, note assenti, gap, affidabilità.
9. **Avvertenza**: il documento non qualifica la crisi e non sostituisce il giudizio
   dell'operatore o del tribunale.

### 6.3 UI

La pagina azienda della Verifica contabile espone una scheda **Piano-ponte**:

- stato e versione;
- pulsante “Genera” / “Ricalcola”;
- tabella assunzioni modificabile;
- tabella proiezione con toggle mensile/annuale;
- riquadro riconciliazione;
- riquadro copertura;
- pulsanti “Salva nuova versione”, “Conferma”, “Stampa report”.

La stessa scheda è raggiungibile dalla Sintesi integrata, in sola lettura.

---

## 7. Modello di calcolo

### 7.1 Unità e orizzonte

- Valuta: euro, due decimali.
- Granularità di calcolo: mensile.
- Roll-up: annuale per il report e per il confronto con il bilancio.
- Orizzonte massimo: 60 mesi; oltre, blocco salvo conferma.
- Il mese iniziale è il mese successivo alla chiusura dell'ultimo bilancio.
- Il mese finale è quello della Data verifica.

### 7.2 Motore deterministico

Il calcolo vive in `src/lib/ponte/motore.ts`, funzione pura:

```ts
calcolaPonte(input: InputPonte): OutputPonte
```

Regole:

1. Riusa i tipi e le definizioni di `src/lib/piano/piano.ts` (`EsercizioStorico`,
   `RigaInput`, `IpotesiPiano`).
2. Non duplica le formule di `calcolaPiano`: le formule comuni vanno estratte in un modulo
   puro condiviso, con test di equivalenza.
3. Non legge dal database e non chiama AI.
4. Ogni uscita deriva da un input o da una formula dichiarata.
5. I calcoli sono deterministici: stesso `hash_input`, stesso `hash_output`.

### 7.3 Identità contabili

Il motore verifica, a ogni mese:

```text
Attivo = Passivo + Patrimonio netto
Cassa finale = Cassa iniziale + Flusso di gestione − Investimenti − Rimborsi + Apporti
Patrimonio netto finale = Patrimonio netto iniziale + Utile + Apporti − Distribuzioni
Debito totale = Banche + Fornitori + Tributari + Previdenziali + Altri
```

Tolleranza: 1 € per arrotondamento. Una differenza superiore blocca il salvataggio e produce
`ERRORE_IDENTITA`.

### 7.4 Debito ente e debito totale

Il debito ente è certo; il debito totale è stimato. La riconciliazione deve separare:

1. `debitoEnteNelBilancio`: la quota già presente nell'ultimo XBRL (previdenziale o
   tributaria, secondo la categoria).
2. `rettificaDebitoEnte`: la differenza tra debito ente certo e quota storica.
3. `altriDebitiIniziali`: il resto del passivo.
4. `nuoviDebiti`: solo se un'assunzione li dichiara.
5. `rimborsi`: rate e rimborsi previsti.

Regole:

- Se `debitoEnteCerto > debitoEnteNelBilancio`, la differenza è **nuovo debito** o **minor
  pagamento**, e va spiegata.
- Se `debitoEnteCerto < debitoEnteNelBilancio`, la differenza è **pagamento** o **minor
  debito**, e va spiegata.
- Non si forza il totale a coincidere: si produce una `DifferenzaRiconciliazione`.
- Il fabbisogno finanziario non è debito finché un'assunzione non dice come viene coperto.

### 7.5 Scenari

Tre scenari, senza probabilità associate:

| Scenario | Regola |
|---|---|
| Base | Assunzioni centrali, fonti storiche e di settore. |
| Favorevole | Ricavi +X%, margine +Y pp, giorni di incasso −Z, giorni di pagamento +Z. |
| Sfavorevole | Simmetrico. |

X, Y e Z non sono arbitrari:

1. se esistono volatilità storica o intervallo di settore, si usano;
2. altrimenti si applica una convenzione dichiarata: ricavi ±10%, margine ±2 pp, circolante
   ±15 giorni;
3. la convenzione è scritta nel report e non viene presentata come previsione.

### 7.6 Copertura

```ts
interface ConfidenzaPonte {
  livello: 'ALTA' | 'MEDIA' | 'BASSA';
  copertura: number; // 0..1
  dimensioniMancanti: string[];
  noteCopertura: string;
  limiti: string[];
}
```

Pesi indicativi:

- XBRL completo: 0,35;
- debito ente: 0,25;
- note integrative: 0,20;
- visura: 0,10;
- settore: 0,10.

Soglie: `ALTA >= 0,80`, `MEDIA >= 0,50`, `BASSA < 0,50`. La copertura non è una probabilità
di default e non va mostrata come tale.

### 7.7 Regola anti-plug

Se la cassa proiettata diventa negativa:

1. non si aggiunge debito automaticamente;
2. si registra `fabbisognoSenzaFinanziamento`;
3. si aggiunge un vincolo `CASSA_NEGATIVA`;
4. il report dice che il Ponte non è finanziato e che serve una scelta dell'operatore o
   dell'azienda.

---

## 8. Assunzioni e provenienza

### 8.1 Struttura

```ts
type Provenienza =
  | 'CERTA'
  | 'DERIVATA'
  | 'STIMATA'
  | 'AZIENDA'
  | 'SETTORE'
  | 'GIUDICE';

type StatoAssunzione = 'PROPOSTA' | 'CONFERMATA' | 'RIFIUTATA';

interface FonteAssunzione {
  tipo: 'XBRL' | 'NOTA' | 'VISURA' | 'ISTAT' | 'DEBITO_ENTE' | 'GESTIONALE' | 'GIUDICE';
  riferimento: string;
  documentoId?: number | null;
  tag?: string | null;
  pagina?: number | null;
  impronta?: string | null;
}

interface AssunzionePonte {
  chiave: string;
  etichetta: string;
  valore: number;
  unita: 'EUR' | '%' | 'GIORNI' | 'MESI';
  tipo: 'PCT' | 'ASSOLUTO' | 'DRIVER';
  periodo: { dal: string; al: string };
  provenienza: Provenienza;
  stato: StatoAssunzione;
  fonte: FonteAssunzione;
  motivazione: string;
  intervallo: { min: number; max: number; confidenza: number } | null;
  impatto: 'ALTO' | 'MEDIO' | 'BASSO';
  validataDa: string | null;
  validataIl: string | null;
}
```

### 8.2 Regole di provenienza

1. `CERTA`: dato documentale, non stimato (es. debito ente, XBRL).
2. `DERIVATA`: calcolata da dati certi con formula dichiarata (es. DSO storico).
3. `STIMATA`: proposta dall'AI o dall'operatore, con motivazione.
4. `AZIENDA`: fornita dall'azienda nello Scenario.
5. `SETTORE`: benchmark o serie ISTAT.
6. `GIUDICE`: letta da un provvedimento.

Nessuna assunzione può avere:

- provenienza `CERTA` senza fonte documentale;
- provenienza `STIMATA` senza motivazione;
- valore fuori dall'intervallo dichiarato;
- periodo che va oltre la Data verifica.

### 8.3 Modifica

L'operatore può modificare un'assunzione. La modifica:

- crea una nuova versione del Ponte;
- conserva la precedente;
- registra `validataDa`, `validataIl` e la motivazione;
- non modifica un Ponte `CONFERMATO`.

### 8.4 Contratto AI

L'AI riceve un contesto compatto e restituisce solo assunzioni e narrativa.

Input:

- storico XBRL (massimo tre esercizi);
- note integrative, con citazioni;
- visura;
- debito ente;
- settore;
- limiti e vincoli del modello;
- versione del prompt.

Output:

```json
{
  "assunzioni": [
    {
      "chiave": "ricaviVendite",
      "valore": 2.5,
      "unita": "%",
      "motivazione": "…",
      "fonte": { "tipo": "NOTA", "tag": "…", "pagina": 12 }
    }
  ],
  "sintesi": "…",
  "datiMancanti": ["…"],
  "avvisi": ["…"]
}
```

Regole:

1. L'AI non produce CE, SP, cassa, debito totale, recupero o giudizi legali.
2. Ogni valore è validato per chiave, tipo, intervallo e periodo.
3. Le assunzioni senza fonte o motivazione vengono scartate e dichiarate.
4. Il modello e la versione del prompt sono salvati.
5. La chiamata passa da `consumaQuotaAi`.
6. Se l'AI non risponde, il Ponte resta in `BOZZA` e l'operatore può inserire le assunzioni a
   mano.
7. Il testo dell'AI passa dal lessico e non può contenere qualificazioni automatiche di crisi,
   insolvenza o cram down.

---

## 9. Versioning

### 9.1 Stati

```text
BOZZA
  └── CALCOLATO
        ├── CONFERMATO
        │     └── SUPERATO (quando nasce una nuova versione confermata)
        └── ARCHIVIATO
```

- `BOZZA`: input presenti, assunzioni incomplete.
- `CALCOLATO`: motore eseguito, output presente, non ancora confermato.
- `CONFERMATO`: immutabile, usato dalla Sintesi integrata.
- `SUPERATO`: conservato, non più corrente.
- `ARCHIVIATO`: ritirato per decisione dell'operatore.

### 9.2 Numerazione

- `versione` è progressiva per `(azienda_id, data_riferimento)`.
- Una sola versione `CONFERMATO` per coppia.
- La nuova versione confermata imposta la precedente a `SUPERATO`.
- `sostituisce_id` punta alla versione precedente.

### 9.3 Hash

`hash_input` = SHA-256 di JSON canonico con:

- righe XBRL usate: id, anno, dati finanziari, `note_impronta`;
- impronta della visura;
- hash dello snapshot `debiti_vera`;
- timestamp e contenuto della cache di settore;
- parametri del modello;
- versione del motore;
- modello e versione del prompt AI.

`hash_output` = SHA-256 dell'output normalizzato.

Se `hash_input` cambia:

- il Ponte corrente è “da ricalcolare”;
- la UI lo dichiara;
- non si aggiorna silenziosamente un Ponte confermato.

### 9.4 Invalidazione

Il Ponte diventa “da ricalcolare” quando:

- arriva un nuovo XBRL per un anno successivo;
- cambia l'impronta delle note;
- cambia la visura;
- cambia il debito ente;
- cambia la Data verifica;
- cambia la versione del motore o del prompt.

Un cambio di Data verifica non cancella il Ponte precedente: crea un nuovo Ponte per la nuova
data.

---

## 10. Modello dati

### 10.1 Tabella `ponte_temporale`

```sql
CREATE TABLE IF NOT EXISTS tenant_x.ponte_temporale (
  id SERIAL PRIMARY KEY,
  azienda_id INTEGER NOT NULL REFERENCES tenant_x.aziende(id) ON DELETE CASCADE,
  data_riferimento DATE NOT NULL,
  esercizio_partenza INTEGER NOT NULL,
  versione INTEGER NOT NULL,
  stato TEXT NOT NULL DEFAULT 'BOZZA'
    CHECK (stato IN ('BOZZA','CALCOLATO','CONFERMATO','SUPERATO','ARCHIVIATO')),
  fonti JSONB NOT NULL,
  assunzioni JSONB NOT NULL DEFAULT '[]'::jsonb,
  output JSONB NOT NULL DEFAULT '{}'::jsonb,
  confidenza JSONB NOT NULL DEFAULT '{}'::jsonb,
  hash_input TEXT NOT NULL,
  hash_output TEXT,
  modello TEXT,
  prompt_versione TEXT,
  sostituisce_id INTEGER REFERENCES tenant_x.ponte_temporale(id),
  creato_da TEXT NOT NULL,
  creato_il TIMESTAMP NOT NULL DEFAULT now(),
  confermato_da TEXT,
  confermato_il TIMESTAMP,
  UNIQUE (azienda_id, data_riferimento, versione)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ponte_confermato_unico
  ON tenant_x.ponte_temporale (azienda_id, data_riferimento)
  WHERE stato = 'CONFERMATO';
```

### 10.2 Tabella `ponte_temporale_eventi`

```sql
CREATE TABLE IF NOT EXISTS tenant_x.ponte_temporale_eventi (
  id SERIAL PRIMARY KEY,
  ponte_id INTEGER NOT NULL REFERENCES tenant_x.ponte_temporale(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  utente TEXT,
  creato_il TIMESTAMP NOT NULL DEFAULT now()
);
```

Eventi minimi:

- `CREATO`
- `CALCOLATO`
- `ASSUNZIONE_MODIFICATA`
- `CONFERMATO`
- `SUPERATO`
- `ARCHIVIATO`
- `ERRORE_CALCOLO`

### 10.3 Estensione XBRL

```sql
ALTER TABLE tenant_x.xbrl_storico_azienda
  ADD COLUMN IF NOT EXISTS note_fatti JSONB;

ALTER TABLE tenant_x.xbrl_storico_azienda
  ADD COLUMN IF NOT EXISTS note_impronta TEXT;

ALTER TABLE tenant_x.xbrl_storico_azienda
  ADD COLUMN IF NOT EXISTS note_estratte_il TIMESTAMP;
```

### 10.4 Compatibilità

- Tutte le DDL sono idempotenti, nello stile di `src/db/provision.ts`.
- Nessuna migrazione distruttiva.
- I tenant esistenti non devono avere Ponte pregressi.
- La tabella è per tenant, non globale: il Ponte contiene dati dell'azienda.

---

## 11. Contratti applicativi e moduli

### 11.1 Logica pura

```text
src/lib/ponte/
  modello.ts        tipi, schemi, normalizzazione
  motore.ts         calcolaPonte, identità contabili
  riconciliazione.ts
  confidenza.ts
  note.ts           normalizzazione e citazioni delle note
  report.ts         HTML del report
  motore.test.ts
  riconciliazione.test.ts
  note.test.ts
```

### 11.2 Server action

`src/app/actions/ponte.ts`:

- `ottieniPonteAction(nomeSchema, aziendaId, dataRiferimento?)`
- `generaPonteAction(nomeSchema, aziendaId, opzioni)`
- `salvaAssunzioniPonteAction(nomeSchema, ponteId, assunzioni)`
- `confermaPonteAction(nomeSchema, ponteId)`
- `archiviaPonteAction(nomeSchema, ponteId, motivo)`
- `ricalcolaPonteAction(nomeSchema, ponteId)`

Regole:

1. Prima istruzione: `richiediAccessoAzienda` con il modulo e il livello coerenti con lo
   Screening/XBRL.
2. Verifica `tipoSpazio === 'ENTE'`.
3. `nomeSchema` sempre dalla sessione, mai dal browser.
4. Nessuna azione aggiorna un Ponte `CONFERMATO`.
5. La generazione AI usa `after()` se supera il tempo di risposta; la riga resta `BOZZA` o
   `CALCOLATO` con stato di avanzamento.

### 11.3 Route

- `/spazio/[codice]/verifica-contabile` — elenco aziende ENTE.
- `/spazio/[codice]/verifica-contabile/[aziendaId]` — scheda contabile.
- `/spazio/[codice]/verifica-contabile/[aziendaId]/ponte` — Piano-ponte.
- `/spazio/[codice]/verifica-amministrativa` — ex `verifica-salute`, con redirect dalla
  vecchia rotta.

La scheda Screening dentro l'azienda resta e punta alla stessa scheda contabile.

---

## 12. Autorizzazione e isolamento

1. Solo spazi `ENTE`.
2. Lettura: utente con accesso all'azienda e permesso di lettura sul modulo usato dallo
   Screening/XBRL.
3. Scrittura, ricalcolo e conferma: livello `SCRITTURA` sullo stesso modulo.
4. Operatori: l'azienda deve essere tra quelle assegnate.
5. Superadmin: passa, come nelle altre funzioni.
6. Nessun nuovo modulo di permesso nella prima versione: si riusano le guardie esistenti.
7. AI: quota per utente/spazio, come le altre funzioni a consumo.
8. Report e PDF: nessun URL pubblico permanente; download autorizzato.

---

## 13. Errori e casi limite

| Codice | Condizione | Comportamento |
|---|---|---|
| `DATA_VERIFICA_ASSENTE` | Manca `verifica_riferita_al` | Blocco, con invito a completare la Verifica amministrativa. |
| `XBRL_ASSENTE` | Nessun bilancio valido | Blocco. |
| `XBRL_ANNO_NULLO` | `anno_bilancio` nullo | Blocco. |
| `PONTE_NON_NECESSARIO` | Bilancio successivo o uguale alla Data verifica | Nessun Ponte; messaggio esplicito. |
| `GAP_LUNGO` | Gap > 36 mesi | Avviso; copertura ridotta. |
| `GAP_ESTREMO` | Gap > 60 mesi | Blocco salvo conferma. |
| `DEBITO_ENTE_ASSENTE` | Nessuna riga `debiti_vera` | Blocco salvo dichiarazione “debito zero”. |
| `NOTE_ASSENTI` | Nessun fact testuale | Avviso; copertura ridotta. |
| `VISURA_ASSENTE` | Nessun fatto di visura | Avviso; copertura ridotta. |
| `SETTORE_ASSENTE` | Nessuna serie ISTAT | Fallback CAGR; avviso. |
| `AI_NON_DISPONIBILE` | Timeout o errore | Resta `BOZZA`; inserimento manuale. |
| `AI_RISPOSTA_NON_VALIDA` | Schema o intervallo errati | Assunzioni scartate e dichiarate. |
| `ERRORE_IDENTITA` | Identità contabile oltre 1 € | Blocco del salvataggio. |
| `PONTE_CONFERMATO` | Modifica di un confermato | Nuova versione, non update. |

---

## 14. Criteri di accettazione

### Funzionali

1. Un utente ENTE può creare un Ponte per un'azienda con Data verifica e almeno un XBRL.
2. Un utente NON_ENTE non può accedere né via UI né via azione diretta.
3. Il Ponte non richiede uno Scenario.
4. La Data verifica usata è esattamente `aziende.verifica_riferita_al`.
5. Il report contiene CE, SP, flussi di cassa e riconciliazione.
6. Il debito ente è calcolato con la stessa logica del triage, senza duplicati.
7. Il debito totale è separato dal fabbisogno finanziario.
8. Le note integrative sono citate quando presenti; se assenti, il report lo dichiara.
9. Ogni assunzione ha provenienza, fonte, motivazione e stato.
10. L'operatore può correggere un'assunzione e creare una nuova versione.
11. Un Ponte confermato non è modificabile.
12. Un nuovo XBRL o una nuova Data verifica rendono il Ponte “da ricalcolare”.

### Numeriche

1. `Attivo = Passivo + Patrimonio netto` entro 1 €.
2. `Cassa finale` riconciliata entro 1 €.
3. `Debito totale = somma componenti` entro 1 €.
4. `Debito ente` coincide con l'esposizione amministrativa entro 1 €, oppure la differenza è
   elencata in `differenze`.
5. Nessun valore negativo non dichiarato.
6. Lo stesso `hash_input` produce lo stesso `hash_output`.
7. Le assunzioni fuori intervallo sono rifiutate e contate.

### Audit e provenienza

1. Ogni numero del report è riconducibile a una fonte o a una formula.
2. Il report elenca le fonti con documento, tag/pagina e impronta quando disponibili.
3. La versione del motore e del prompt è salvata.
4. Gli eventi di creazione, calcolo, modifica e conferma sono registrati.
5. Un revisore può ricostruire il Ponte da `fonti` + `assunzioni` + `hash_input`.

### UX

1. La scheda dice chiaramente “stimato” e “certo”.
2. La copertura è mostrata come copertura, non come probabilità.
3. I dati mancanti sono elencati, non nascosti.
4. Il report contiene l'avvertenza sui limiti e sull'assenza di qualificazione giuridica.
5. Il pulsante “Conferma” è distinto da “Salva nuova versione”.

### Prestazioni

1. Calcolo deterministico < 2 s per 60 mesi su un caso medio.
2. Report < 5 s.
3. La chiamata AI non blocca la pagina oltre il limite della route; se lunga, usa `after()` e
   stato di avanzamento.
4. Nessuna chiamata ISTAT automatica nel calcolo.

### Compatibilità

1. Cloud, portable e server on-premise.
2. Nessuna dipendenza nuova non già presente.
3. DDL idempotente su tenant esistenti.
4. Nessun dato di un tenant visibile a un altro.

---

## 15. Test

### Unitari

- `motore.test.ts`: identità contabili, proiezione, cassa, debito, nessun plug.
- `riconciliazione.test.ts`: debito ente dentro/fuori bilancio, differenze, doppio conteggio.
- `note.test.ts`: fact testuali, citazioni, file senza note.
- `confidenza.test.ts`: pesi, soglie, dimensioni mancanti.
- `versioning.test.ts`: nuova versione, conferma, immutabilità, hash.

### Database

- PGlite con schema tenant: creazione tabella, unicità del confermato, eventi.
- Test di compatibilità con tenant senza colonne nuove.

### Autorizzazione

- ENTE può leggere e scrivere.
- NON_ENTE è respinto.
- Operatore senza azienda assegnata è respinto.
- Modifica di un Ponte confermato è respinta.

### Report

- Snapshot HTML con un caso reale.
- Presenza di tutte le sezioni.
- Presenza delle fonti e delle avvertenze.
- Assenza di conclusioni giuridiche automatiche.

### File reale

- Un XBRL reale con note: estrazione, citazioni, Ponte.
- Un XBRL reale senza note: `NOTE_ASSENTI`, Ponte comunque prodotto.
- Un XBRL con anno nullo: blocco.

---

## 16. Fuori perimetro

- Qualificazione della crisi o dell'insolvenza.
- Dichiarazione automatica di applicabilità del cram down.
- Stima legale del recupero in liquidazione senza una percentuale documentata.
- Consolidato di gruppo, valute diverse dall'euro, bilanci non XBRL.
- Sostituzione del `piano_sviluppo` o del `piano_aziendale`.
- Dati gestionali aggiornati: appartengono allo Scenario.
- Invio automatico del report a soggetti esterni.
- Modifica del bilancio depositato.

---

## 17. Ordine di implementazione

1. **Lettura note XBRL** — parser, persistenza, citazioni, test su file reale.
2. **Modello dati** — `ponte_temporale`, eventi, colonne note, DDL idempotente.
3. **Motore puro** — `calcolaPonte`, riconciliazione, confidenza, test.
4. **Server action e autorizzazione** — ENTE, azienda, scrittura, conferma.
5. **UI** — scheda Piano-ponte, assunzioni, proiezione, riconciliazione.
6. **Report** — HTML/PDF con fonti e avvertenze.
7. **Sintesi integrata** — credito ente, debito totale, recupero, opzioni.
8. **Scenario di dialogo** — confronto AI/azienda/settore, varianti.

Il punto 1 è il prerequisito tecnico. Il punto 3 è il cuore. I punti 7 e 8 non devono
precedere la tracciabilità del Ponte.

---

## 18. Rischi e dipendenze

1. **Note integrative non uniformi.** La tassonomia può variare; il test su file reali è
   obbligatorio prima di considerare la copertura “alta”.
2. **Dati di settore limitati.** La cache ISTAT copre la crescita, non un benchmark completo.
   Il report deve dichiararlo.
3. **Debito ente e debito totale non coincidono.** È fisiologico: la riconciliazione deve
   spiegare la differenza, non nasconderla.
4. **AI e difendibilità.** Senza assunzioni tracciate, il Ponte non è utilizzabile in un
   confronto formale. La regola “AI propone, motore calcola” non è aggirabile.
5. **Doppio motore.** Se `calcolaPonte` duplica le formule di `calcolaPiano`, i due risultati
   divergeranno. Le formule comuni vanno estratte e testate una volta sola.
