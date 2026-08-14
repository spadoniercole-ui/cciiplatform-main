# Checklist di validazione normativa — Indici di allerta CCII

Questo documento non certifica nulla: elenca, punto per punto, cosa un
professionista con competenza specifica in CCII/CNDCEC deve confermare o
correggere prima che questo strumento venga usato per un giudizio verso
terzi (organo di controllo, CdA, revisore). Il codice è tecnicamente
corretto (testato in `src/lib/xbrl/indici.test.ts`), ma i *valori* delle
soglie e le *formule* non sono mai stati verificati da chi in team ha
competenza normativa specifica.

## Dove si trovano oggi le formule e le soglie
Tutto in un unico file, come deve essere: `src/lib/xbrl/indici.ts`.
Se una soglia cambia, va cambiata solo lì.

## Punti da confermare con un commercialista

- [ ] **C1 — Sostenibilità dei debiti (Debiti / Ricavi), soglia `< 0.80`**
  Verificare che il denominatore corretto sia "Ricavi delle vendite e
  prestazioni" e non "Valore della produzione" — nella prassi CNDCEC
  esistono entrambe le varianti a seconda del settore.

- [ ] **C2 — Adeguatezza patrimoniale (Patrimonio Netto / Debiti), soglia `> 0.10`**
  Confermare se il Patrimonio Netto va usato "as-is" da bilancio o
  rettificato (es. per crediti verso soci per versamenti ancora dovuti).

- [ ] **C3 — Ritorno di liquidità su ricavi, soglia `> 0.02`**
  Verificare se "Disponibilità liquide" deve includere anche i
  depositi bancari vincolati o solo cassa/conti a vista.

- [ ] **C4 — Copertura oneri finanziari (Valore Produzione / Oneri Finanziari), soglia `> 2.00`**
  Nel codice, se il file XBRL non riporta un valore esplicito di "Valore
  della Produzione", questo viene sostituito con "Ricavi delle Vendite"
  (vedi `normalizzaPeriodo` in `src/lib/xbrl/index.ts`). Confermare che
  questa approssimazione sia accettabile o se in tal caso l'indice debba
  risultare "non calcolabile".

- [ ] **C5 — Indebitamento tributario/previdenziale su totale debiti, soglia `< 0.30`**
  Confermare la soglia (in alcune versioni delle Linee Guida CNDCEC è
  riportata diversamente) e se vanno inclusi anche i debiti scaduti da più
  di 90 giorni come voce a parte.

- [ ] **Step 1 (patrimonio netto) → Step 2 (indici) → severity**
  La logica attuale (`calcolaSeverity` in `indici.ts`): patrimonio netto
  negativo o ≥3 indici violati → RED; 1-2 indici violati → YELLOW; 0
  indici violati e patrimonio positivo → GREEN. Confermare che questa
  sequenza rispecchi l'art. 13 CCII e le Linee Guida CNDCEC più recenti,
  incluse eventuali soglie di "tolleranza" prima di far scattare l'obbligo
  di segnalazione.

- [ ] **Indici supplementari (ROE, ROI, rotazione attivo, incidenza
  indebitamento)** — dichiarati esplicitamente come "informativi", non
  normativi CCII. Nessuna soglia di allerta è associata: verificare che
  questa impostazione (mostrarli solo a fini di lettura, senza generare
  un semaforo) sia quella desiderata.

## Cosa NON è stato incluso, e perché
Il codice precedente (`engineCalcoloCCII.ts`, rimosso in questa sessione)
confrontava alcuni indici con "medie di settore ATECO" prese da tabelle
scritte a mano nel codice, presentate come dati ISTAT. Non essendo dati
reali verificati, non sono stati portati nel nuovo motore. Se il
benchmarking di settore è una funzionalità che volete offrire per davvero,
serve una fonte dati ISTAT ufficiale e aggiornabile, non una tabella
statica nel codice sorgente.

## Copertura del mapping tag
Il mapping tag XBRL → dato di bilancio (`src/db/sql/xbrl_tag_mappings.sql`)
copre le voci più comuni della tassonomia ITCC-CI, ma non è stato validato
su un campione ampio di bilanci reali di settori diversi. La tab
"Parificazione Tag" nell'interfaccia serve proprio a colmare le lacune
mano a mano che emergono da file reali — ma richiede che qualcuno la usi
sistematicamente nei primi mesi di utilizzo, non solo in caso di errore
evidente.
