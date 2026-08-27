# Codice dismesso

Qui finisce il codice rimosso dal percorso di esecuzione ma conservato per
memoria storica. Nulla in questa cartella viene compilato o eseguito.

## `middleware.ts.dismesso` — rimosso in 0.109.31

Stava in `middleware.ts` alla radice del repository e descriveva
un'architettura di autenticazione che **non esiste più**:

- cookie `auth_token` con JWT firmato (`jose`, `JWT_SECRET`);
- rotte `/login`, `/dashboard`, `/smistamento`, `/dashboard/unauthorized`;
- ruolo `SUPER_ADMIN` come stringa nel payload del token.

L'autenticazione reale usa invece il cookie `session_token`, la tabella
`sessioni` in `public`, e le rotte `/`, `/spazio/[codice]`, `/superadmin`.
Nessuna delle rotte citate dal middleware esiste nell'applicazione.

**Perché non faceva danni.** Con la cartella `src/` presente, Next cerca il
middleware in `src/middleware.ts`; quello alla radice veniva semplicemente
ignorato. Era codice morto, non codice sbagliato in esecuzione.

**Perché è stato tolto comunque.** Bastava spostarlo dentro `src/` — o un
cambio di quella convenzione in una versione futura di Next — perché
entrasse in funzione e reindirizzasse *ogni* richiesta senza `auth_token`
verso `/login`, che non esiste: l'intera piattaforma inaccessibile, con una
modifica che a chi la fa sembra un riordino innocuo. Un file di controllo
d'accesso obsoleto lasciato accanto a quello vero è una trappola, non un
residuo.

La dipendenza `jose` era usata soltanto qui (verificato: nessun altro
`from 'jose'` né `auth_token` in `src/`). È rimasta in `package.json`: si
può togliere separatamente, con un passaggio dedicato alle dipendenze.
