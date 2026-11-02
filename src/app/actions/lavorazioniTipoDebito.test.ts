import { beforeEach, describe, expect, it, vi } from 'vitest';

// LA GUARDIA DEL CONGELAMENTO, PROVATA DA FUORI.
//
// La promessa centrale della configurazione in sola lettura non è la schermata
// senza pulsanti — quella si aggira aprendo la console — ma il rifiuto nelle
// due server action, che sono endpoint pubblici. Qui si chiamano direttamente,
// come farebbe un browser manomesso, e si verifica che non tocchino il
// database.
//
// L'interruttore è finto (e pilotabile) perché il test deve coprire anche il
// caso opposto: con la configurazione modificabile, la stessa chiamata passa la
// guardia e arriva alle sue validazioni. Se un giorno l'interruttore diventa un
// permesso, questi due test vanno rifatti insieme alla guardia: è il loro
// scopo.

const stato = { sola: true };

vi.mock('@/lib/lavorazioni/solaLettura', () => ({
  get LAVORAZIONI_TIPO_DEBITO_SOLA_LETTURA() {
    return stato.sola;
  },
  MESSAGGIO_LAVORAZIONI_SOLA_LETTURA:
    'La configurazione delle lavorazioni per tipologia di debito è in sola lettura: si consulta, non si modifica.',
}));

const query = vi.fn(async (..._args: unknown[]) => ({ rows: [], rowCount: 0 }));
vi.mock('@/lib/db', () => ({ pool: { query: (...args: unknown[]) => query(...args) } }));

const richiediAccessoSchema = vi.fn(async () => ({
  modalita: 'ADMIN_SPAZIO' as const,
  email: 'anna@alfa.it',
}));
vi.mock('@/lib/autorizzazione', () => ({ richiediAccessoSchema }));

// Il DDL del tenant non serve qui: le azioni rifiutano (o validano) prima di
// toccare le tabelle, e comunque nessuna tabella vera deve essere creata.
vi.mock('@/db/provision', () => ({
  assicuraTabellaCategorieTipoDebito: async () => {},
  assicuraTabellaLavorazioniTipoDebito: async () => {},
}));

const { salvaLavorazioneTipoDebitoAction, eliminaLavorazioneTipoDebitoAction } =
  await import('./lavorazioniTipoDebito');

const SCHEMA = 'tenant_alfa';
const MESSAGGIO =
  'La configurazione delle lavorazioni per tipologia di debito è in sola lettura: si consulta, non si modifica.';

const input = {
  categoria: 'DEBITO',
  lavorazione: 'Contabilizzare',
  destinatario: 'Mario Rossi',
  attivo: true,
};

beforeEach(() => {
  stato.sola = true;
  query.mockClear();
  richiediAccessoSchema.mockClear();
});

describe('configurazione in sola lettura', () => {
  it('il salvataggio risponde con il motivo e non scrive nulla', async () => {
    const esito = await salvaLavorazioneTipoDebitoAction(SCHEMA, input);

    expect(esito.success).toBe(false);
    expect(esito.error).toBe(MESSAGGIO);
    expect(query).not.toHaveBeenCalled();
    // La guardia di accesso resta la prima istruzione: nessuna azione parte
    // senza sapere chi la chiama.
    expect(richiediAccessoSchema).toHaveBeenCalledWith(SCHEMA, { soloAdmin: true });
  });

  it('l’eliminazione risponde con il motivo e non cancella righe', async () => {
    const esito = await eliminaLavorazioneTipoDebitoAction(SCHEMA, 7);

    expect(esito.success).toBe(false);
    expect(esito.error).toBe(MESSAGGIO);
    expect(query).not.toHaveBeenCalled();
  });

  it('anche un id assurdo viene rifiutato dal congelamento, non dal database', async () => {
    const esito = await eliminaLavorazioneTipoDebitoAction(SCHEMA, 0);

    expect(esito.success).toBe(false);
    expect(esito.error).toBe(MESSAGGIO);
    expect(query).not.toHaveBeenCalled();
  });
});

describe('configurazione modificabile', () => {
  it('la stessa chiamata passa la guardia e arriva alle sue validazioni', async () => {
    stato.sola = false;

    // Nessuna categoria nel database e nessun codice legacy: la tipologia non
    // è riconosciuta. È un errore DIVERSO dal congelamento, ed è la prova che
    // la strada oltre la guardia è aperta quando la configurazione lo è.
    const esito = await salvaLavorazioneTipoDebitoAction(SCHEMA, {
      ...input,
      categoria: 'NON_ESISTE',
    });

    expect(esito.success).toBe(false);
    expect(esito.error).not.toBe(MESSAGGIO);
    expect(esito.error).toContain('non riconosciuta');
    expect(query).toHaveBeenCalled();
  });

  it('senza lavorazione o destinatario non salva nemmeno con la configurazione aperta', async () => {
    stato.sola = false;

    expect(
      (await salvaLavorazioneTipoDebitoAction(SCHEMA, { ...input, lavorazione: '  ' })).error
    ).toBe('Indica la lavorazione da svolgere.');
    expect(
      (await salvaLavorazioneTipoDebitoAction(SCHEMA, { ...input, destinatario: '' })).error
    ).toBe('Indica il collega a cui inviare la comunicazione.');
  });
});
