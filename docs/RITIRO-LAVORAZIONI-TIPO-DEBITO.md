# Ritiro della tabella storica «lavorazioni per tipologia di debito» (0.156.0)

**Oggetto.** `lavorazioni_tipo_debito` — la configurazione che per ogni categoria di debito
diceva che lavorazione svolgere e a quale collega chiederla. Congelata in sola lettura nella
0.138.x, copiata nel catalogo delle TL nella 0.156.0. Questo documento dice **che cosa legge
ancora la tabella**, **come è avvenuta la migrazione** e **come si elimina senza perdere
niente**.

**Stato di questa consegna.** La tabella **non viene cancellata**. Viene svuotata di ruolo:
nessun percorso dell'applicazione la legge più, salvo la migrazione. L'eliminazione è un
passo successivo, con le condizioni del §5.

---

## 1. Perché una tabella nuova e non `materie_lavorazione`

`materie_lavorazione` è la configurazione **per materia**: la materia è la chiave dei titoli
di credito, e i codici che vi cadono si lavorano allo stesso modo. La riga storica non dice
in quale materia cade: dice una **categoria di debito**. Portarla in `materie_lavorazione`
avrebbe significato inventare una materia per ogni categoria e spostare i debiti su un ufficio
che nessuno ha scelto.

Il catalogo delle TL (`catalogo_tl`) tiene invece la stessa chiave del dato che sostituisce:

| colonna | significato | da dove viene |
|---|---|---|
| `codice` | il codice della TL | `lavorazioni_tipo_debito.categoria` |
| `descrizione` | che lavorazione è | `lavorazioni_tipo_debito.lavorazione` |
| `direttrice` | l'ufficio a cui si chiede | `lavorazioni_tipo_debito.destinatario`, agganciato alla direttrice |
| `attivo`, `ordine` | come nella tabella storica | invariati |

**La chiave è la coppia `(codice, descrizione)`**, con indice univoco, e **non il codice da
solo**: sotto una stessa tipologia di debito si svolgono più lavorazioni, e il catalogo deve
poterne tenere molte con lo stesso codice. Per associare una TL bastano davvero quei due
campi; l'ufficio è l'unica cosa che si aggiunge, e nel caso normale si aggancia da solo.

## 2. L'aggancio alla direttrice è automatico

Il destinatario della riga storica è il nome di un ufficio. Alla migrazione:

1. se il nome corrisponde a una **direttrice** dell'ente (confronto per chiave: maiuscole,
   accenti, apostrofi, punteggiatura e spazi non contano) si salva la grafia scritta nei
   Parametri — un ufficio, un nome;
2. se non corrisponde, **non si corregge e non si scarta**: resta scritto com'era, e il conto
   degli uffici fuori elenco è nel risultato della migrazione.

È automatico perché la categoria che si sta variando è già un prodotto dentro una direttrice:
il nome dell'ufficio esiste nei Parametri e non va riscritto a mano.

## 3. La migrazione

`srv/lib/migrazioni/catalogoTl.ts` (piano, puro) + `catalogoTlDb.ts` (database).

- **Quando**: alla prima lettura delle lavorazioni del triage
  (`ottieniLavorazioniTipoDebito`), e comunque prima di qualunque scrittura sul catalogo.
- **Che cosa legge**: le righe storiche con `migrata_il IS NULL`, le categorie dello spazio,
  le direttrici dell'ente.
- **Che cosa scrive**: solo `catalogo_tl`. Delle righe storiche tocca **una colonna sola**,
  `migrata_il`, che segna l'avvenuta copiatura.
- **Cosa non fa**: non cancella, non rinomina, non corregge destinatari. Una riga che non può
  diventare una TL (descrizione vuota, destinatario vuoto, categoria cancellata) si **scarta
  e si dichiara**, e viene marcata: non si riprova a ogni apertura.
- **Idempotenza**: `INSERT … ON CONFLICT (codice, descrizione) DO NOTHING`. Se il processo si
  interrompe fra gli inserimenti e le marcature, il giro successivo ritrova le stesse coppie,
  le salta e completa le marcature. Nessuna transazione necessaria.
- **Cancellazioni**: la marcatura impedisce il ritorno. Una TL cancellata a mano dal catalogo
  non ricompare — e una categoria cancellata non riporta in vita le sue TL (§4).

Il test end-to-end è `src/app/actions/lavorazioniTipoDebito.migrazione.test.ts`: uno spazio
che usa già la vecchia configurazione (cinque righe, tre categorie, un ufficio fuori elenco,
una categoria inesistente, un destinatario con spazi doppi) viene migrato su PGlite, si
verifica che le TL e i destinatari siano tutti nel catalogo, che la seconda apertura non
duplichi, che l'eliminazione di una categoria porti via i suoi collegamenti e che la rinomina
non ne lasci di orfani.

## 4. Cancellare o rinominare una categoria

| operazione | che cosa succede ai collegamenti |
|---|---|
| **rinomina** (etichetta) | niente da riscrivere: le TL sono legate al **codice**, e l'etichetta si legge sempre dall'elenco delle categorie. Nessun orfano, nessuna copia da tenere allineata. |
| **eliminazione** | `eliminaCategoriaTipoDebitoAction` toglie, in una transazione: la categoria, le sue TL dal catalogo, e segna come migrate le righe storiche che la nominano. La migrazione non le ricopia al caricamento successivo. |

Le righe storiche non si cancellano nell'eliminazione: sono l'archivio della configurazione
precedente, e spariranno con la tabella (§5). Cancellare una categoria con TL configurate è
un'operazione che si conferma a schermo, con il numero di collegamenti che si perdono.

## 5. Eliminazione sicura della tabella

### 5.1 Che cosa legge ancora la tabella

Verificato sul codice della 0.156.0 con il test
`src/lib/migrazioni/ritiroLavorazioniTipoDebito.test.ts`, che cerca il nome della tabella in
tutto `src/` e ammette **un solo file**:

| lettore | uso | quando sparisce |
|---|---|---|
| `src/lib/migrazioni/catalogoTlDb.ts` | legge le righe non ancora migrate; aggiunge `migrata_il`; marca le righe delle categorie cancellate | con la tabella |

Non la leggono più: le azioni del triage e della pagina dei Parametri (leggono
`catalogo_tl`), le grafie degli uffici (`materieLavorazione.ts`), l'esportazione della
configurazione dello spazio (esporta `catalogo_tl`), il provisioning (non la crea più: uno
spazio nuovo non la riceve affatto). Il test fa fallire la CI se qualcuno reintroduce una
lettura.

### 5.2 Precondizioni

Tutte da verificare **prima** di toccare la tabella, su ogni schema `tenant_*`:

```sql
-- 1. Nessuna riga resta da migrare (0 su tutti gli schemi).
SELECT count(*) FROM tenant_xxx.lavorazioni_tipo_debito WHERE migrata_il IS NULL;

-- 2. Il catalogo ha le TL che la tabella storica aveva (conteggio per categoria).
SELECT categoria, count(*) FROM tenant_xxx.lavorazioni_tipo_debito
 WHERE migrata_il IS NOT NULL GROUP BY categoria ORDER BY categoria;
SELECT codice, count(*) FROM tenant_xxx.catalogo_tl
 GROUP BY codice ORDER BY codice;
```

La seconda coppia di conteggi non deve coincidere per forza: le righe scartate (categoria
cancellata, descrizione o destinatario vuoti) non diventano TL. Deve coincidere per le
categorie che esistono ancora.

```sql
-- 3. Le TL del catalogo hanno tutte un ufficio (colonna NOT NULL, ma vale la pena guardare).
SELECT count(*) FROM tenant_xxx.catalogo_tl WHERE btrim(direttrice) = '';
```

### 5.3 Procedura

In una release **successiva** alla 0.156.0, dopo che tutti gli spazi attivi hanno aperto il
triage almeno una volta:

1. **Rinomina in archivio** (nessun dato perso, nessuna rottura se un vecchio binario gira
   ancora su quel database):

   ```sql
   ALTER TABLE tenant_xxx.lavorazioni_tipo_debito
     RENAME TO lavorazioni_tipo_debito_archivio_0_156;
   ```

2. **Una release di osservazione.** Se qualcosa la cercava ancora, il test del §5.1 non l'ha
   visto (per esempio uno script esterno, un backup custom, un ripristino): il nome nuovo lo
   fa emergere subito, e si torna indietro con una rinomina inversa.
3. **Rimozione della migrazione**: togliere da `catalogoTlDb.ts` la lettura della tabella e
   il blocco che aggiunge `migrata_il`; il test del §5.1 passa ad ammettere **zero** file.
4. **Eliminazione**:

   ```sql
   DROP TABLE tenant_xxx.lavorazioni_tipo_debito_archivio_0_156;
   ```

   In cloud: su ogni schema `tenant_*`, da una sessione amministrativa, una tabella per volta.
   In portable l'utente ha un solo schema: lo fa `src/instrumentation.ts`? **No** — la
   portable si aggiorna con il pacchetto, e il DDL va eseguito all'avvio come per le altre
   tabelle ritirate (vedi `DROP TABLE IF EXISTS … simulazione_scenario` in `provision.ts`):
   la riga si aggiunge lì, con `IF EXISTS`, quando il passo 3 è fatto.
5. **Ripristino**: un backup precedente alla 0.156.0 ricrea la tabella con i dati; è
   innocuo, perché il codice del passo 3 non la legge più. Se invece si ripristina un
   backup **post**-migrazione su un binario **pre**-0.156.0, il catalogo non c'è e la
   vecchia configurazione è già stata copiata: si riapre il triage una volta, la migrazione
   ricrea il catalogo dalle righe non marcate. Per questo il passo 3 viene **dopo** una
   release di osservazione, non insieme.

### 5.4 Rollback

Fino al passo 4 il rollback è una rinomina inversa:

```sql
ALTER TABLE tenant_xxx.lavorazioni_tipo_debito_archivio_0_156
  RENAME TO lavorazioni_tipo_debito;
```

Il catalogo non si tocca: le TL sono già lì, e la tabella storica non serve al funzionamento
dell'applicazione. Dopo il passo 4 il rollback è il ripristino del backup.

---

## 6. Quello che resta aperto

- **Il catalogo non è ancora la configurazione modificabile**: `LAVORAZIONI_TIPO_DEBITO_SOLA_LETTURA`
  resta `true`. Il congelamento ora protegge una tabella che nessuno legge: riaprire la
  configurazione significa decidere chi può farlo e con quale traccia — è la questione P4
  dell'analisi `docs/ANALISI-LAVORAZIONI-TIPO-DEBITO.md`, ancora di prodotto.
- **Le due configurazioni convivono**: le TL per codice (`catalogo_tl`, per il triage) e le
  lavorazioni per materia (`materie_lavorazione`, per i titoli). È la stessa domanda — chi
  lavora il debito — posta su due chiavi. La 0.138.6 ha stabilito la precedenza (materia per
  l'instradamento, categoria come ripiego); unirle è un lavoro a sé, non un effetto del
  ritiro.
- **Gli uffici fuori elenco** non si correggono alla migrazione. Restano scritti com'erano e
  si vedono nella pagina delle direttrici, dove si riallineano a mano.
