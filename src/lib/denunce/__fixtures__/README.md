# File reali per i test

Questa cartella non contiene file: i tracciati veri portano i dati di
un'azienda e non stanno nel repository.

`src/lib/denunce/lettura.reale.test.ts` li cerca qui e, se non ci sono, si
salta dichiarandolo. Per eseguirlo:

- copiare l'Elenco denunce del Cassetto Previdenziale come
  `elenco-denunce.xlsx` in questa cartella, oppure
- indicare un percorso qualsiasi con la variabile d'ambiente:

  ```bash
  ELENCO_DENUNCE_FILE=/percorso/elenco-denunce.xlsx npx vitest run src/lib/denunce/lettura.reale.test.ts
  ```

Il test verifica che i periodi si leggano tutti (niente righe perse in
silenzio) e che i contributi dovuti per anno siano la somma dei saldi del
file, senza anni aggiunti. Non conserva né stampa gli importi.
