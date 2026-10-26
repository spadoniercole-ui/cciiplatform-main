# «Lavorazioni per tipologia di debito» e le due uscite del triage — analisi

**Oggetto.** La configurazione `lavorazioni_tipo_debito` (oggi in sola lettura), le due
uscite che ne dipendono — comunicazioni ai colleghi e documenti per reparto — e il
registro delle consegne con la conferma d'invio.

**Versione analizzata.** 0.138.3 (commit `306e3a4`), con la configurazione congelata
dall'interruttore `LAVORAZIONI_TIPO_DEBITO_SOLA_LETTURA`.

**Esito.** In **0.138.4** sono stati corretti C1, C2, A1 (resa visibile), A2 (linguaggio),
A3, M1, M2, M3, M4, M5, M6, M7, M8 e B1, con i test che mancavano. Restano aperte — perché
sono decisioni di prodotto, non difetti — la riapertura della configurazione (P4) e il
rapporto fra destinatario per categoria e per materia (P8). Il §9 elenca cosa è stato
applicato e le misure fatte dopo gli interventi.

**Ruolo dell'analisi.** Sistemista (rotture, dati, integrità, concorrenza, ripristino) e
analista funzionale (coerenza delle promesse fatte a schermo, percorso dell'utente,
ridondanze, lacune).

**Metodo.** Lettura del codice di dominio (`src/lib/lavorazioni/*`, `src/lib/debitiEnte/
veraImport.ts`), delle server action (`lavorazioniTipoDebito.ts`, `consegneReparti.ts`),
del provisioning (`src/db/provision.ts`) e della scheda del triage
(`VerificaSaluteAzienda.tsx`); misure eseguite con un test temporaneo (Node 22, Vitest,
stessa macchina di sviluppo), poi rimosso. **Questa stesura descrive il difetto, non la
correzione**: le proposte sono nel §6 e §7, il cui esito è nel §9.

---

## 1. Il percorso come è costruito

La catena ha sette passaggi; ognuno ha un solo proprietario del dato.

| # | Passaggio | Dove | Che cosa produce |
|---|---|---|---|
| 1 | Configurazione: per ogni categoria di debito, la lavorazione e il destinatario | `lavorazioni_tipo_debito`, pagina `parametri/lavorazioni` | la sola fonte del destinatario |
| 2 | Lettura del V.E.R.A. in triage, senza chiedere mappature | `estraiRigheVera(..., triage = true)` | righe con `categoria` vuota se la sezione non è mappata |
| 3 | Raggruppamento per destinatario | `raggruppaPerReparto` (`comunicazioni.ts`) | gruppi ordinati, tipologie scoperte, righe senza categoria |
| 4 | Testo per il collega | `componiComunicazioniVera` | una comunicazione per destinatario, da copiare |
| 5 | Documento per reparto | `preparaDocumentiReparto` → `generaPdfReparto` (jsPDF, browser) | un PDF per destinatario, con impronta `versione` |
| 6 | Registro delle uscite | `registraConsegnaRepartoAction` → `consegne_reparti` | una riga per scaricamento (diario, non stato) |
| 7 | Dichiarazione d'invio | `confermaInvioConsegnaAction` | data, mezzo, note, firma di chi dichiara — una volta sola |

Il confronto fra la versione corrente del documento e l'ultima consegnata
(`statoConsegnaReparto`) produce i tre stati mostrati a schermo: **mai**, **allineata**,
**superata**.

**Scelte giuste, da non toccare.** Il raggruppamento è uno solo: le due uscite non possono
divergere su chi segue cosa. Lo scaricamento non dipende dal registro: un registro che non
risponde non impedisce di consegnare. La conferma d'invio è scrivibile una volta sola e
porta la firma di chi la fa. La versione identifica il *contenuto* e non l'istante di
stampa: lo stesso documento scaricato due volte resta la stessa versione.

---

## 2. Punti di caduta

Gravità: **C** = critico (documento sbagliato che esce dall'ufficio o dato perso),
**A** = alto (percorso che si rompe o tace), **M** = medio (attrito, incoerenza),
**B** = basso (rifinitura).

### C1 — Le posizioni «Ignora» finiscono nel documento consegnato al reparto

**Sintomo.** Il PDF (e il testo al collega) elencano fra i «debiti da lavorare» anche le
posizioni con trattamento `ignora` — tipicamente le partite **sospese** da un giudice — con
la colonna «Natura» che dice «Ignora», e **il loro importo entra nel totale** del documento.

**Causa.** In modalità triage `estraiRigheVera` non scarta nulla: assegna il trattamento
suggerito (`suggerisciTrattamento` restituisce `ignora` per gli stati che iniziano con
«sospes») e mette comunque la riga in `righe`. Né `raggruppaPerReparto` né
`preparaDocumentiReparto` filtrano per trattamento: filtrano solo `attivo`, categoria,
lavorazione e destinatario.

**Perché è critico.** Il documento dichiara di elencare i debiti *da lavorare* e chiede al
reparto di contabilizzarli. Una partita sospesa non va contabilizzata: il totale che il
reparto riceve non è confrontabile con quello che il triage usa per le soglie (che invece
esclude gli `ignora`), e la stessa azienda risulta avere due esposizioni diverse a seconda
della scheda guardata. È il tipo di scarto che, in un verbale, si nota dopo.

**Rimedio (P1).** Escludere `ignora` dalle due uscite e dichiararlo nel documento («N
posizioni sospese o fuori perimetro non sono elencate»), come già si fa per le tipologie
scoperte. Le potenziali (`potenziale`, importo ignoto) vanno decise: oggi compaiono con
«importo non determinato» e sommano zero — corretto come informazione, ambiguo dentro un
elenco di importi.

### C2 — La colonna «Periodo» del PDF è sempre vuota, benché il dato esista

**Sintomo.** Nel PDF la colonna «Periodo» stampa sempre `—`; nel testo al collega non
compare mai `(periodo …)`. L'ordinamento per periodo dentro il reparto non ordina nulla.

**Causa.** `RigaVera` non ha il campo `periodo` e `estraiRigheVera`, quando costruisce la
riga, non copia `r.periodo` che pure ha appena letto. `RigaVeraComunicazione.periodo` è
opzionale, quindi il tipo non segnala la mancanza: il valore è `undefined` sempre.

**Perché è critico.** Il periodo di competenza è l'informazione con cui il reparto decide
*quale* versamento regolarizzare, ed è già nel file e già usato altrove
(`ritardoDaVera` legge i periodi dalle sezioni). Il documento afferma una cosa falsa — «il
file non porta periodi» — e chi lo riceve deve tornare al V.E.R.A. a mano. In più
`versioneDocumentoReparto` include `p.periodo` nell'impronta: quando il difetto sarà
corretto, **tutte le versioni cambieranno** e ogni consegna registrata risulterà
«superata» (vedi M5).

**Rimedio (P2).** Portare `periodo` in `RigaVera` e copiarlo nell'estrazione; reso
obbligatorio nel tipo (`periodo?: string` → già tollerante) e test che verifichino che il
PDF/testo lo riportino.

### A1 — Una nuova tipologia di debito non può più avere un destinatario

**Sintomo.** L'Admin di spazio crea una categoria in `parametri/categorie-debito` (pagina
**non** congelata). Quella categoria non comparirà in nessun documento, e non esiste alcun
percorso per assegnarle una lavorazione. L'avviso «N tipologie restano fuori dai
documenti» compare solo se **esiste almeno una lavorazione attiva**: in uno spazio
configurato a metà, o dopo aver disattivato tutto, la nuova tipologia sparisce in silenzio.

**Causa.** Il congelamento riguarda solo le scritture di `lavorazioni_tipo_debito`. Le
categorie restano modificabili, e nulla collega le due cose.

**Perché è alto.** È una perdita *silenziosa e permanente* di funzionalità per lo spazio:
il triage continua a funzionare e a produrre documenti incompleti senza dire che manca
qualcosa di nuovo. Con il tempo la configurazione congela la fotografia di una tassonomia
che cambia.

**Rimedio (P4).** O si congela anche la creazione di categorie (e lo si dice), oppure si
consente all'Admin di spazio di riaprire la configurazione **con traccia** (chi, quando,
cosa ha cambiato). La seconda è preferibile: la questione aperta del §5.

### A2 — Il registro accetta qualunque versione e qualunque totale

**Sintomo.** `registraConsegnaRepartoAction` non ricalcola nulla: si fida di `versione`,
`righe`, `totale`, `posizioniDaContabilizzare`, `importoDaContabilizzare` inviati dal
browser. `validaConsegna` controlla solo la *forma* (versione `\d+-[0-9a-f]{8}`, totali
non negativi, coerenza fra posizioni e totale).

**Causa.** L'impronta nasce nel browser, insieme al PDF, per poter essere stampata sul
foglio e registrata nello stesso istante.

**Perché è alto.** Il registro è presentato come la prova che «quel foglio è uscito»; in
realtà è una **dichiarazione** dell'utente in sessione, con un contenuto non verificato.
Chi ha accesso all'azienda può registrare una consegna che non è avvenuta, o con totali
diversi. Non è una vulnerabilità (l'autorizzazione c'è, la riga è firmata dall'email), ma
va scritto dove si legge: oggi il registro non dice «dichiarato», dice «consegnato».

**Rimedio (P7).** Due strade, entrambe sane: (a) ricalcolare la versione sul server dalle
righe, così il registro non può contraddire i dati — costa una query e una copia della
logica; (b) lasciare la dichiarazione com'è e chiamarla con il suo nome in interfaccia e
nel PDF («autodichiarazione di scaricamento»). La (b) è coerente con il resto del prodotto:
costa una frase.

### A3 — Cancellare l'azienda cancella il diario delle consegne

**Sintomo.** `consegne_reparti.azienda_id REFERENCES aziende(id) ON DELETE CASCADE`: con
l'azienda spariscono tutte le righe, comprese le dichiarazioni d'invio già firmate. Le
righe non contengono la ragione sociale: se l'azienda viene cancellata, ciò che resta non
sarebbe comunque leggibile.

**Perché è alto.** Il registro serve a ricostruire «cosa è uscito dall'ufficio»; la
cancellazione dell'anagrafica — che è un'operazione di gestione ordinaria — ne azzera la
traccia senza avviso. Un diario che si cancella con l'oggetto a cui si riferisce non è un
diario.

**Rimedio (P6).** Salvare `ragione_sociale` (fotografia al momento della consegna) e
passare a `ON DELETE RESTRICT` oppure a una cancellazione logica dell'azienda. Minimo
indispensabile: la ragione sociale, che rende la riga autosufficiente.

### M1 — Il calcolo gira a ogni render, due volte

`componiComunicazioniVera` e `preparaDocumentiReparto` sono chiamate nel corpo del
componente (`VerificaSaluteAzienda.tsx:1066` e `:1079`), senza `useMemo`. Ogni cambio di
stato della scheda — la data della verifica, una nota d'invio digitata, l'apertura di un
`<details>`, il messaggio «copiato» che si spegne dopo due secondi — rifà **due**
raggruppamenti completi del V.E.R.A. e ricompone tutti i testi. Le misure del §3 dicono
quanto costa.

**Rimedio (PF1).** Un `useMemo` con dipendenze `[righeVera, lavorazioni, etichette,
ragioneSociale, dataVerifica]` e **un solo** raggruppamento condiviso fra le due uscite:
`preparaDocumentiReparto` oggi richiama `raggruppaPerReparto` per conto proprio, quindi il
lavoro è doppio per costruzione.

### M2 — `formattaImportoEuro` costruisce un `Intl.NumberFormat` per ogni importo

Misurato: 5.000 importi costano **356 ms** così, **27 ms** con un formatter creato una
volta (13×). La funzione è chiamata una volta per posizione in ogni comunicazione e di
nuovo nel PDF; nelle schede è chiamata anche nel JSX a ogni render.

**Rimedio (PF2).** Un `Intl.NumberFormat` di modulo (o due, con e senza raggruppamento).
Nessun cambio di comportamento: il formato resta identico.

### M3 — Il registro si legge per intero, senza limite

`ottieniConsegneRepartiAction` legge **tutte** le righe dell'azienda (`ORDER BY
consegnato_il DESC` senza `LIMIT`). Un'azienda seguita per mesi, con più uffici e più
scaricamenti, arriva a migliaia di righe: la scheda le scarica tutte a ogni cambio di fase,
e `riassumiConsegne` le riduce nel browser a una riga per reparto. Il dato che serve è
l'ultima consegna per reparto: 10–20 righe.

**Rimedio (PF3).** `LIMIT` per reparto con `DISTINCT ON (lower(reparto))` oppure keyset
sull'indice già esistente `(azienda_id, consegnato_il DESC)`, più `LIMIT` di sicurezza
sulla lettura grezza (es. 500) per il conteggio degli scaricamenti.

### M4 — Sei istruzioni DDL a ogni chiamata del registro

`assicuraTabellaConsegneReparti` esegue `CREATE TABLE`, cinque `ALTER TABLE … ADD COLUMN
IF NOT EXISTS` e `CREATE INDEX` **a ogni** `registra`, `ottieni`, `conferma`. Su Postgres
ogni `CREATE/ALTER` idempotente prende comunque un lock sulla tabella e produce un
`NOTICE`; su un triage con più operatori, il registro in scrittura si contendere il lock
con le letture. Lo stesso vale per `assicuraTabellaLavorazioniTipoDebito` a ogni lettura
della configurazione.

**Rimedio (PF4).** Una memo per processo (`Set` di schemi già garantiti) oppure lo
spostamento del DDL nell'avvio dello spazio, lasciando nelle azioni solo la garanzia
lazy di primo accesso.

### M5 — Cambiare la data della verifica rende «superate» tutte le consegne

`versioneDocumentoReparto` include `dataVerifica` e le etichette delle categorie. È
corretto (il documento cambia davvero) ma la conseguenza a schermo è un avviso ambra su
**ogni** reparto che dice «Riscarica il PDF e invia la nuova versione» senza dire *perché*
è cambiato. Con 8 reparti sono 8 avvisi identici, e chi legge pensa a un errore.

**Rimedio (P10).** Dire la causa quando è nota (data della verifica diversa, etichetta
cambiata, posizioni cambiate) e offrire «riscarica tutti» invece di ripetere il gesto per
reparto.

### M6 — Nessun test sulla guardia di sola lettura

Il rifiuto delle due server action (`salvaLavorazioneTipoDebitoAction`,
`eliminaLavorazioneTipoDebitoAction`) non ha un test: `src/app/actions/
lavorazioniTipoDebito.test.ts` non esiste. Il comportamento è la promessa centrale del
congelamento («una chiamata costruita a mano non trova una porta aperta») e oggi è protetto
solo dalla lettura del codice.

**Rimedio (P9).** Due test: con la costante a `true` le azioni rispondono con
`MESSAGGIO_LAVORAZIONI_SOLA_LETTURA` e **non** toccano il database; con `false`
funzionano. Se un giorno la costante diventa un permesso, i test vanno rifatti insieme alla
guardia.

### M7 — Nessuna integrità referenziale fra lavorazioni e categorie

`lavorazioni_tipo_debito.categoria` è testo libero; `categoriaEsiste` è controllata solo
in scrittura (oggi impossibile). Eliminare una categoria lascia le sue lavorazioni in
tabella: si leggono nella pagina congelata accanto a un codice che non esiste più, e non
producono nulla. Non è un errore visibile, è confusione permanente.

**Rimedio.** Una vista o un marcatore «categoria non più esistente» nella pagina di
lettura; oppure la pulizia alla cancellazione della categoria, quando la configurazione
tornerà modificabile.

### M8 — Il confronto delle categorie non normalizza la configurazione

`raggruppaPerReparto` normalizza il **destinatario** (`trim` + spazi collassati +
minuscole) ma usa `l.categoria` così com'è, mentre la riga è `trim()`ata. Una lavorazione
legacy con uno spazio finale non incontrerà mai le sue posizioni: la tipologia risulterebbe
«senza lavorazione» pur essendo configurata. Oggi le scritture erano già `trim`ate, quindi
il caso è teorico; diventa reale il giorno in cui la configurazione si riapre da un'altra
via (import, ripristino).

**Rimedio.** Normalizzare la chiave anche in lettura (una riga di codice).

### M9 — Due verità su «chi lavora il debito»

`lavorazioni_tipo_debito.destinatario` (per categoria di debito, usata dal triage) e
`materie_lavorazione.dipendenza` (per materia, mostrata nella posizione V.E.R.A., 0.138.0)
rispondono alla stessa domanda con chiavi diverse. Oggi non si contraddicono perché il
triage ignora la materia; domani, se la materia «prende il testimone», la stessa partita
avrà due uffici a seconda della schermata.

**Rimedio (P8).** Decidere il verso: la materia come predefinita e la categoria come
override (o viceversa), con una nota in interfaccia che dica da dove viene il destinatario
mostrato. Fino ad allora, non alimentare il triage dalla materia.

### B1 — Nomi file che possono sovrascriversi

`nomeFileReparto` riduce a slug: due destinatari con slug uguale («Città» / «Citta»)
producono lo stesso nome file, e il secondo scaricamento sovrascrive il primo nella
cartella dei download. Aggiungere un suffisso breve dalla versione.

### B2 — Scaricamento registrato solo se la scheda resta aperta

La registrazione avviene dopo `doc.save()`; se l'utente chiude la scheda mentre la action
è in volo, il PDF c'è e la riga no. Non recuperabile, ma il messaggio a schermo è corretto
quando la risposta arriva. Basso: nessun rimedio economico, va solo saputo.

---

## 3. Prestazioni — misure

Test temporaneo (poi rimosso), Node 22.23.3, Vitest, macchina di sviluppo. V.E.R.A.
sintetico con 5 categorie, 12 sezioni, 24 lavorazioni su 8 destinatari, una riga su 17
senza categoria. Tempi **per singola chiamata**, mediana di 10 giri dopo 3 di scaldata.

| righe | `raggruppaPerReparto` | `componiComunicazioniVera` | `preparaDocumentiReparto` | entrambe (come oggi, per render) |
|---|---|---|---|---|
| 300 | 6,7 ms | 77,1 ms | 5,7 ms | **77,3 ms** |
| 1.500 | 31,3 ms | 391,6 ms | 41,8 ms | **446,6 ms** |
| 5.000 | 136,5 ms | 1.240,9 ms | 143,6 ms | **1.406,7 ms** |

Altre due misure:

- 5.000 importi formattati: **356 ms** con `toLocaleString('it-IT', {…})` a ogni chiamata,
  **27 ms** con un `Intl.NumberFormat` riusato;
- ordinamento di 3.000 stringhe con `localeCompare(a, b, 'it-IT')`: 8,0 ms; con un
  `Intl.Collator` riusato: 6,5 ms (margine modesto qui, ma il collatore si crea a ogni
  confronto: su V.E.R.A. grandi il costo cresce con `n log n`).

**Lettura.** Il costo di `componi` domina e non è il raggruppamento: è la costruzione del
testo, in primo luogo la formattazione degli importi. Con 300 righe — un triage normale —
sono **77 ms per render**: digitare una nota d'invio in un campo controllato, con una
scheda di 2.100 righe e due calcoli indipendenti, significa un ritardo percepibile a ogni
tasto. Con 1.500 righe (enti con molte partite) il campo diventa inutilizzabile. Non ho
misurato il render React, solo il calcolo: il tempo si somma a quello del DOM.

**Cosa non è stato misurato.** Il tempo reale in browser, il costo di jsPDF (caricato solo
allo scaricamento, per scelta), il comportamento su portable (PGlite) e su server
on-premise. Le misure sono un ordine di grandezza, non una certificazione.

---

## 4. Rotture: scenari operativi

| Scenario | Cosa succede oggi | Esito |
|---|---|---|
| Spazio nuovo, nessuna configurazione | nessuna comunicazione e nessun documento, con spiegazione corretta | ok |
| Spazio configurato a metà | i documenti escono incompleti; l'avviso sulle tipologie scoperte c'è | ok, ma vedi A1 per le categorie nuove |
| Categoria aggiunta oggi | resta per sempre senza destinatario | **rotto (A1)** |
| Partita sospesa nel V.E.R.A. | finisce nel documento e nel totale | **rotto (C1)** |
| V.E.R.A. con periodi | il PDF stampa «—» | **dato perso (C2)** |
| Azienda cancellata | il diario delle consegne sparisce | **rotto (A3)** |
| Ripristino da backup | il registro torna com'era; le conferme d'invio pure | ok |
| Cambio della data di verifica dopo aver consegnato | tutti i reparti «superata», con avviso generico | attrito (M5) |
| Destinatario rinominato | le consegne vecchie restano sotto il vecchio nome ed escono dai documenti | ok (elencate a parte) |
| Lavorazione disattivata dopo la consegna | il reparto esce dai documenti, la consegna resta nello storico | ok |
| Due operatori scaricano insieme | due righe, entrambe corrette; la conferma d'invio è one-shot | ok |
| Sessione scaduta durante la registrazione | PDF scaricato, riga assente, messaggio esplicito | ok |
| Portable (PGlite) | `to_char` sulle date è già usato per evitare lo slittamento del giorno | ok, non riprovato qui |

---

## 5. La questione aperta

Riaprire la configurazione oggi è un intervento sul codice: la costante in
`solaLettura.ts:22`. Chi ha bisogno di indicare un nuovo destinatario non può farlo, e
nessuno può decidere di riaprirlo per un singolo spazio. Non è un difetto — è la scelta
che ha reso possibile congelare senza perdere dati — ma va decisa, perché A1 (categorie
nuove) la trasforma in una perdita progressiva.

Le tre domande, in ordine di importanza:

1. **Chi può riaprire**: un permesso dell'Admin di spazio (il modulo `parametri`) o una
   decisione del Superadmin, spazio per spazio?
2. **Con quale traccia**: senza una storia delle modifiche, riaprire significa che i
   destinatari possono cambiare senza che nessuno sappia chi e quando — e il registro delle
   consegne confronterà versioni senza poter dire perché sono cambiate. Serve una tabella
   di storico (prima/dopo, chi, quando) o almeno `aggiornato_il` e `aggiornato_da`.
3. **In che rapporto con la materia**: vedi M9. Prima di riaprire, conviene stabilire se il
   destinatario si configura per categoria (come oggi) o per materia (come la 0.138.0
   suggerisce), altrimenti si riapre una configurazione che potrebbe essere sostituita.

---

## 6. Proposte migliorative — funzionali

| ID | Proposta | Gravità risolta | Sforzo | Rischio |
|---|---|---|---|---|
| P1 | Escludere `ignora` dalle uscite e dichiarare le posizioni escluse; decidere esplicitamente il trattamento delle `potenziale` | C1 | basso | basso: cambia i totali mostrati (in meglio), test da aggiornare |
| P2 | Portare `periodo` in `RigaVera` e nell'estrazione, stamparlo su PDF e testo | C2 | basso | medio: cambia `versione` di ogni documento → tutte le consegne «superate» (annunciarlo) |
| P4 | Riapertura come permesso dell'Admin di spazio, con storico delle modifiche | A1, §5 | medio | medio: richiede tabella e guardie |
| P6 | Ragione sociale nel registro + niente `CASCADE` | A3 | basso | basso (colonna nuova, idempotente) |
| P7 | Chiamare il registro per quello che è (autodichiarazione) o ricalcolare la versione sul server | A2 | basso / medio | nullo / medio |
| P9 | Test delle guardie di sola lettura e del filtro `ignora` | M6, C1 | basso | nullo |
| P10 | Dire la causa di «superata» e «riscarica tutti» | M5 | basso | nullo |
| P8 | Decidere il rapporto fra lavorazioni per categoria e lavorazioni della materia | M9 | alto | alto: tocca la configurazione |

Ordine consigliato: **P1, P9, P6** (difetti che producono documenti sbagliati o tracce
perse), poi **P2** con un avviso esplicito sul cambio di versione, poi **M6/P10**, infine
**P4/P8** insieme alla decisione del §5.

---

## 7. Proposte di performance

| ID | Intervento | Effetto atteso | Sforzo |
|---|---|---|---|
| PF1 | `useMemo` sui due calcoli e **un solo** raggruppamento condiviso | da 2 calcoli per render a 0 quando nulla cambia; −50% quando cambia | basso |
| PF2 | `Intl.NumberFormat` riusato in `formattaImportoEuro` | −92% sul costo di formattazione (misurato) | molto basso |
| PF3 | `DISTINCT ON` / `LIMIT` nella lettura del registro | lettura costante al crescere dello storico | basso |
| PF4 | DDL fuori dal percorso caldo (memo per processo) | meno lock e meno latenza per chiamata | basso |
| PF5 | `Intl.Collator` riusato nei confronti | −20% sull'ordinamento, cresce con `n log n` | molto basso |
| PF6 | Comporre il testo solo quando la scheda è aperta (o su richiesta) | il calcolo esce dal render | medio |

Con PF1 + PF2 il costo di un render con 300 righe scenderebbe da ~77 ms a pochi
millisecondi nel caso frequente (niente è cambiato) e a ~30 ms quando cambia davvero; con
5.000 righe da 1,4 s a ~150 ms. Sono stime costruite sulle misure del §3, da confermare
con una misura dopo l'intervento.

---

## 8. Limiti di questa analisi

- Nessuna prova in browser né in produzione: i percorsi sono stati letti e misurati in
  Node, non cliccati.
- La misura non copre il render React, jsPDF, PGlite (portable) né il server on-premise.
- Non ho verificato il comportamento con un V.E.R.A. reale multi-sezione oltre i 12 titoli
  sintetici; il caso «stessa posizione su due lavorazioni dello stesso destinatario» è
  coperto dai test, non da un file reale.
- I riferimenti normativi non sono stati toccati: questa analisi non cambia formule, soglie
  né importi di legge.

---

## 9. Esito: cosa è stato applicato in 0.138.4

| ID | Intervento applicato | Dove |
|---|---|---|
| C1 | `ignora` escluso da raggruppamento, comunicazioni e documenti; posizioni escluse contate e dichiarate a schermo e nel PDF | `comunicazioni.ts`, `reparti.ts`, `pdfReparto.ts`, scheda del triage |
| C2 | `periodo` portato in `RigaVera` e copiato nell'estrazione; stampato nel PDF e nel testo al collega | `veraImport.ts`, `reparti.ts` |
| A1 | la pagina delle categorie dice che una tipologia creata ora non potrà avere un destinatario | `CategorieTipoDebitoManager.tsx` |
| A2 | il registro si presenta come autodichiarazione di scaricamento (interfaccia e PDF) | scheda del triage, `pdfReparto.ts` |
| A3 | `ragione_sociale` salvata sulla consegna (letta dal database) e chiave esterna `ON DELETE SET NULL` | `provision.ts`, `consegneReparti.ts`, `consegne.ts` |
| M1 | un solo raggruppamento, condiviso, memorizzato con `useMemo` | `VerificaSaluteAzienda.tsx` |
| M2 | `Intl.NumberFormat` riusato e `Intl.Collator` per gli ordinamenti | `comunicazioni.ts` |
| M3 | ultima consegna per reparto con conteggio, limite di sicurezza, niente diario intero | `consegneReparti.ts` |
| M4 | DDL eseguito una volta per processo e per schema, con dimenticanza esplicita su azzeramento, ripristino ed eliminazione dello spazio | `provision.ts`, `azzeraDatabase.ts`, `ripristinaDatabase.ts`, `spazi.ts` |
| M5 | causa del superamento accanto a ogni reparto e comando «Riscarica tutti» | `consegne.ts`, `VerificaSaluteAzienda.tsx` |
| M6 | test delle due guardie di sola lettura (con il database mai toccato) | `lavorazioniTipoDebito.test.ts` |
| M7 | lavorazioni che puntano a una categoria cancellata segnalate come tali | `LavorazioniTipoDebitoManager.tsx` |
| M8 | chiave della tipologia normalizzata anche in lettura | `comunicazioni.ts` |
| B1 | nome del file chiuso dalla versione del documento | `reparti.ts` |
| PF5 | `Intl.Collator` riusato | `comunicazioni.ts` |

**Resta aperto (decisione, non difetto).** P4 — chi può riaprire la configurazione e con quale
storia delle modifiche — e P8 — se il destinatario si configura per categoria o per materia.
Fino ad allora la configurazione resta congelata e il triage non legge la materia: nessuna
delle due scelte è stata fatta in silenzio.

**Non applicato, e perché.** PF6 (comporre il testo solo all'apertura della scheda) è
rimasto fuori: con PF1 il calcolo non si ripete quando nulla cambia, e rinviarlo
introdurrebbe uno stato «testo non ancora pronto» in una scheda che oggi è sincrona.

**Misure dopo gli interventi.** Stesso V.E.R.A. sintetico del §3, stessa macchina, mediana
di 10 giri dopo 3 di scaldata. La colonna «dopo» è il costo del percorso nuovo: un
raggruppamento solo, condiviso dalle due uscite.

| righe | `raggruppa` | **prima** (entrambe le uscite, per render) | **dopo** (raggruppa + due uscite) |
|---|---|---|---|
| 300 | 0,8 ms | 77,3 ms | **2,6 ms** |
| 1.500 | 6,0 ms | 446,6 ms | **9,7 ms** |
| 5.000 | 12,3 ms | 1.406,7 ms | **29,7 ms** |

Formattazione di 5.000 importi: **356 ms → 5,8 ms**. Con il `useMemo`, quando nulla cambia
(il caso di un tasto digitato in una nota d'invio) il costo è **zero**. Le misure restano
quelle di un V.E.R.A. sintetico in Node: non coprono il render React, jsPDF né PGlite.

---

## 10. Ripresa del triage e report per unità operativa (0.138.5)

### 10.1 Il difetto: la videata di esito viveva solo nel browser

Comunicazioni, documenti per i reparti, soglie e la decisione (procedere / non procedere)
erano **stato React**. Una ricarica, un crash, uno sbalzo di tensione chiudevano la
sessione e da lì non si tornava: la pagina ripartiva dalla visura, e la scheda azienda
offriva solo «Rifai la verifica» — che passa da `creaAziendaInVerificaAction`, apre un
ciclo nuovo e archivia il lavoro precedente. Due dati, inoltre, il database non li aveva:
il **periodo** delle posizioni (in `RigaVera` ma non in `debiti_vera`) e la **data di
riferimento della verifica** (diversa dall'istante di esecuzione).

**Applicato.**

| Intervento | Dove |
|---|---|
| `debiti_vera.periodo` (colonna idempotente, scritta e riletta) | `provision.ts`, `posizioneVera.ts` |
| `aziende.verifica_riferita_al DATE`, salvata con l'esito | `provision.ts`, `aziendaInVerifica.ts` |
| `ottieniVerificaDaRiprendereAction`: anagrafica, data (dichiarata o, per le verifiche precedenti, giorno dell'esecuzione), esito, stato della decisione | `aziendaInVerifica.ts` |
| `?azienda=<id>` sulla pagina: ricarica = riapertura; l'id entra nell'URL appena l'esito è calcolato | `verifica-salute/page.tsx`, `VerificaSaluteAzienda.tsx` |
| la riapertura ricalcola indicatore e soglie dai dati salvati e ricompone le tre uscite | `VerificaSaluteAzienda.tsx` |
| vie di ritorno: scheda azienda («Riprendi la verifica») e dashboard per le verifiche in sospeso; lo storico del triage porta alla ripresa, non alla scheda | `CruscottoAzienda.tsx`, `DashboardPannelli.tsx`, `VerificaSaluteAzienda.tsx` |
| una verifica già presa in carico o archiviata si consulta ma non si decide di nuovo | `VerificaSaluteAzienda.tsx` |

**Limite dichiarato.** Il riepilogo dei documenti letti non è ristampabile da una verifica
riaperta: i file caricati non ci sono più. La scheda lo dice e non offre il pulsante.
La ripresa torna all'esito, non alla conferma anagrafica con i file: quella richiederebbe
di caricare i documenti sul server a ogni passo, e non è stata fatta.

### 10.2 La seconda uscita: `reportUo.ts`

Un PDF per **dipendenza**, dentro il quale i debiti sono raggruppati per **codice di
partita** (e, quando la voce non ne porta uno, per **materia** — §10.4). Per ogni codice: materia, totale, inadempienze (voce, periodo, stato, importo) e
lavorazioni della materia con i passi e l'esito. Fonte dell'ufficio: `titoli_ente.dipendenza`
se c'è, altrimenti la prima lavorazione della materia che ne ha una — la stessa regola della
scheda dei titoli («il codice vince»). Fonte delle lavorazioni: `materie_lavorazione`.

Questo chiude **P8** nella direzione scelta: la materia/dipendenza dice chi lavora il
codice, la tipologia resta la chiave del documento per reparto. Le due uscite convivono e
non si contraddicono perché rispondono a due domande diverse.

Fuori perimetro, e dichiarato in ogni punto: posizioni «Ignora» (fuori dai totali), voci
senza codice di partita (contate), codici senza dipendenza (elencati a parte), codici senza
lavorazioni (il foglio lo scrive). Il registro delle consegne distingue i due documenti con
`tipo` (`reparto` | `dipendenza`), perché le impronte di versione non sono confrontabili.

Test aggiunti: 21 (dominio, PDF, registro su PGlite, riapertura su Postgres vero).

### 10.3 L'instradamento per materia (0.138.6) — P8 chiuso davvero

La §10.2 aveva chiuso P8 per la *seconda* uscita (report per unità operativa), ma non per le
prime due: comunicazioni ai colleghi e documenti per reparto continuavano a leggere la sola
`categoria`, cioè il codice della vecchia tabella in sola lettura. Con le materie configurate
— presupposti legali, codici indicativi, lavorazioni con l'ufficio e i passi — il triage
dichiarava «sezioni non mappate» e non produceva PDF, mentre la posizione una materia ce
l'aveva già (`ottieniDebitiVera` la risolve riga per riga).

**Come è risolto.** Un modulo puro, `src/lib/lavorazioni/instradamentoMateria.ts`, dà a ogni
riga la chiave della materia e costruisce le lavorazioni della materia come se fossero
«categorie»: il raggruppamento resta uno solo (`raggruppaPerReparto`), e le due uscite non
possono divergere. Precedenza: materia scelta a mano sulla sezione → materia già risolta
sulla riga → materia dedotta dal codice/descrizione → categoria vecchia. La chiave
`MATERIA:<id>` è interna; etichette e documenti mostrano il nome della materia.

**Anche il momento dell'import cambia.** `estraiRigheVera` accetta una sezione non mappata se
almeno una sua riga si riconduce a una materia: chiedere una categoria quando la materia
esiste era una domanda senza risposta utile. Resta invece chiesto per le sezioni che non si
riconducono, e lì il selettore offre le materie accanto alle categorie.

**Limite dichiarato.** Una posizione senza materia e senza categoria resta fuori dai
documenti: si conta e si scrive a schermo, come prima. Il report per unità operativa resta
per codice; le voci senza codice vi entrano per materia (§10.4).

### 10.4 Le voci senza codice nel report per unità operativa (0.138.7)

`reportUo.ts` raggruppava solo per codice di partita: una voce senza codice (un accessorio
della sezione, «interessi di mora», una riga che non porta «TS») restava fuori dal documento
e finiva in `senzaCodice`, un conteggio a schermo. Il foglio arrivava all'ufficio incompleto e
il totale non tornava con quello mostrato.

**Come è risolto.** Per una voce senza codice la materia si ricava con `materiaPerRigaVera`
— le stesse regole che `instradamentoMateria.ts` usa per le comunicazioni: materia del titolo,
codici indicativi, descrizione unita alla sezione. La voce entra nel documento del suo ufficio
(dipendenza effettiva della materia) sotto la materia stessa, senza codice inventato: `codice`
è `null`, il foglio la intitola «Senza codice di partita» e l'intestazione separa i codici
dalle voci senza codice. `senzaCodice` ora conta solo le voci prive sia di codice sia di
materia; una materia senza ufficio finisce in `senzaDipendenza` con `codice: null`.

`FORMATO_REPORT_UO` passa a `2`: la struttura del documento è cambiata e la versione serve a
distinguere due PDF con lo stesso contenuto ma impaginati diversamente.

### 10.5 Il triage dice dove si configura, e l'ufficio ha un nome solo (0.138.8)

Quattro cose emerse provando il percorso intero, tutte sullo stesso punto: il triage
produceva documenti ma non diceva né se erano pronti, né dove si correggeva la
configurazione, né con quale nome si sarebbe presentato l'ufficio.

**L'avviso sulle unità operative.** In fondo al triage c'erano le tre uscite — comunicazioni
ai colleghi, un PDF per reparto, un report per ufficio — e nessuna frase che dicesse «ci sono,
puoi mandarli». Un riquadro vuoto per configurazione incompleta era indistinguibile da uno
vuoto perché la verifica non aveva debiti. L'avviso ora dà i numeri (uffici, posizioni,
importo), porta ai due riquadri con un'ancora, e quando non si può procedere dice che cosa
manca — lavorazione assente, ufficio mancante, nessuna posizione riconducibile — con il link
alla materia da completare. L'elenco delle verifiche eseguite spiega che una verifica in
sospeso si riapre nel triage, che è da lì che si procede.

**Le soglie in una finestra.** Il pulsante «Apri le soglie di segnalazione» portava nella
scheda dell'azienda, cioè fuori dal triage e verso lo screening, senza che si capisse da dove
arrivassero matricola e codici CSC: sembravano valori rimasti in memoria. Ora apre una finestra
con il confronto riga per riga (parametro, soglia, importo confrontato, esito) e con gli
identificativi **salvati per quell'azienda** — `Anagrafica Ente`, con le etichette configurate
nello spazio, i soli campi attivi — e dice dove si caricano. La scheda resta raggiungibile in
fondo, come scelta.

**Il link che nomina la riga.** «Configura le lavorazioni» apriva i Parametri di Spazio e
lasciava l'operatore davanti a una pagina di cui doveva indovinare la materia. Le materie
scoperte si ricavano da ciò che resta fuori (`categorieSenzaLavorazione` con chiave
`MATERIA:<id>` e `senzaDipendenza`, che ora porta `materiaId`): il link le nomina e apre
`/parametri/materie-lavorazione?materia=<id>`, dove la materia arriva in evidenza — o, se non
ha ancora una lavorazione, il modulo con la materia già scelta. Lo stesso per le tipologie
senza lavorazione e per le voci senza ufficio del report.

**Un ufficio, un nome.** La dipendenza si scriveva in tre posti — lavorazione della materia,
titolo del codice, vecchia tabella per tipologia — e lo stesso ufficio finiva con tre nomi:
tre documenti, ognuno con una parte delle posizioni, e nessuno che se ne accorgesse. Ora:

- `src/lib/lavorazioni/dipendenze.ts` dà la chiave dell'ufficio (maiuscole, accenti,
  apostrofi, punteggiatura e spazi non contano) e il registro delle grafie già in uso;
- le due uscite raggruppano per chiave (`raggruppaPerReparto`, `componiReportUo`) e le
  consegne si registrano per ufficio, non per grafia;
- il salvataggio della lavorazione riusa la grafia già configurata, e il campo propone gli
  uffici esistenti;
- due nomi che restano diversi pur sembrando lo stesso ufficio (`dipendenzeSosia`, parole
  significative senza articoli) vengono **segnalati** nel triage e nella pagina delle
  lavorazioni, mai uniti d'ufficio: due sedi possono chiamarsi quasi uguale.

Test aggiunti: 15 (dominio delle dipendenze, raggruppamento unico nelle due uscite, avviso e
finestra delle soglie, link alla materia mancante nella riapertura dell'interfaccia).

### 10.6 Un solo ingresso: direttrici → lavorazioni → titoli (0.139.0)

Le direttrici erano nate per lo screening — le aree lungo cui l'AI genera il questionario — e
nella pratica erano già gli uffici dell'ente: «Presidio dei flussi informativi», «Gestione del
credito». Ma il loro nome si riscriveva a mano nel campo dipendenza delle lavorazioni, con la
grafia del momento, e lo stesso ufficio tornava a sdoppiarsi in tre documenti (§10.5).

**La catena, adesso.** Il nome di un ufficio si scrive in un punto solo, nelle direttrici:

1. le **direttrici** (`public.spazi.direttrici_ente_strutturate`) danno i nomi;
2. le **lavorazioni delle materie** (`materie_lavorazione`) scelgono uno di quei nomi come
   dipendenza — un elenco, non un testo libero, con gli uffici già in uso che non sono
   direttrici ancora scegliibili e, se non ce ne sono, il campo che torna testo libero;
3. i **titoli di credito** (`titoli_ente`) ereditano dipendenza e procedura dalla materia
   quando il codice non ne ha una propria, e da lì il nome arriva alle comunicazioni ai
   reparti, al report per unità operativa e al registro delle consegne.

**Un nome solo, davvero.** Il salvataggio riusa la grafia delle direttrici (confronto per
chiave: maiuscole, accenti, apostrofi, punteggiatura e spazi non contano), sia nelle
lavorazioni sia nel campo del titolo: non nascono più varianti che la catena aveva appena
unito. Se un nome non è una direttrice non viene inventato né corretto: resta com'è, e la
videata delle direttrici lo elenca tra quelli fuori elenco.

**La catena si guarda.** `componiCatenaDirettrici` (`src/lib/titoliEnte/direttrici.ts`) dice,
per ogni direttrice, quante lavorazioni la usano, quante materie e quanti codici ci arrivano
(con la dipendenza effettiva: quella del codice se c'è, altrimenti quella della materia) e che
cosa manca — direttrici che nessuna lavorazione usa, uffici in uso fuori elenco, lavorazioni e
codici senza destinatario. È il controllo che tiene in piedi il resto: senza, la catena funziona
e nessuno sa se è completa.

**L'ordine dei Parametri** segue la catena: direttrici (1), lavorazioni delle materie (2),
titoli di credito (3), numerati e prima degli altri parametri.

Test aggiunti: 14 (10 di dominio sulla catena e sui nomi, 2 sulla videata delle direttrici,
2 sul campo dipendenza, compreso il ritorno a testo libero senza direttrici).
