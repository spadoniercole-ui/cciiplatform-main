import { beforeEach, describe, expect, it, vi } from 'vitest';

// Stato simulato: cookie del browser e righe del database.
const cookieJar = new Map<string, string>();
interface Sessione {
  token: string;
  ruolo: string;
  workspace_id: number | null;
  username: string | null;
  email: string | null;
}
let sessioni: Sessione[] = [];
const spazi = [
  {
    id: 1,
    codice: 'alfa',
    descrizione: 'Spazio Alfa',
    nome_schema: 'tenant_alfa',
    schema_provisionato: true,
    tipo_spazio: 'ENTE',
    giudicante: false,
  },
  {
    id: 2,
    codice: 'beta',
    descrizione: 'Spazio Beta',
    nome_schema: 'tenant_beta',
    schema_provisionato: true,
    tipo_spazio: 'NON_ENTE',
    giudicante: false,
  },
];
// Utenti per schema: admin e operatori.
const admin: Record<string, { id: number; username: string; email: string }[]> = {
  tenant_alfa: [{ id: 10, username: 'anna.admin', email: 'anna@alfa.it' }],
  tenant_beta: [{ id: 20, username: 'bruno.admin', email: 'bruno@beta.it' }],
};
const operatori: Record<string, { id: number; username: string; attivo: boolean }[]> = {
  tenant_alfa: [
    { id: 11, username: 'otto.operatore', attivo: true },
    { id: 12, username: 'dino.disabilitato', attivo: false },
  ],
  tenant_beta: [],
};
const permessi: Record<number, { modulo: string; livello: string }[]> = {
  11: [
    { modulo: 'scenari', livello: 'SCRITTURA' },
    { modulo: 'checklist', livello: 'LETTURA' },
  ],
};

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (nome: string) => (cookieJar.has(nome) ? { value: cookieJar.get(nome) } : undefined),
  }),
}));

vi.mock('@/db/ensureTables', () => ({ backfillUsernameSchema: async () => {} }));

vi.mock('@/lib/db', () => ({
  pool: {
    query: async (sql: string, params: unknown[] = []) => {
      const p0 = params[0];
      if (sql.includes('FROM sessioni')) {
        return { rows: sessioni.filter((s) => s.token === p0) };
      }
      if (sql.includes('FROM spazi WHERE id')) return { rows: spazi.filter((s) => s.id === p0) };
      if (sql.includes('FROM spazi WHERE codice'))
        return { rows: spazi.filter((s) => s.codice === p0) };
      if (sql.includes('FROM spazi WHERE nome_schema'))
        return { rows: spazi.filter((s) => s.nome_schema === p0) };
      const schema = /"(tenant_[a-z0-9_]+)"/.exec(sql)?.[1] ?? '';
      if (sql.includes('.admin_workspace')) {
        return {
          rows: (admin[schema] ?? [])
            .filter((a) => a.username === p0)
            .map((a) => ({ ...a, password_temporanea: null })),
        };
      }
      if (sql.includes('.utenti_spazio')) {
        return {
          rows: (operatori[schema] ?? [])
            .filter((u) => u.username === p0)
            .map((u) => ({ ...u, email: null, password_temporanea: null })),
        };
      }
      if (sql.includes('.permessi_utente')) return { rows: permessi[p0 as number] ?? [] };
      if (sql.includes('.utenti_aziende')) return { rows: [{ azienda_id: 7 }] };
      // Righe riconducibili a un'azienda: scenari 100 → azienda 7, 200 → azienda 8;
      // debiti_ente 5 → azienda 8; proposta_creditori 9 → scenario 100 (azienda 7).
      if (sql.includes('JOIN') && sql.includes('.proposta_creditori')) {
        return { rows: p0 === 9 ? [{ azienda_id: 7 }] : [] };
      }
      if (sql.includes('.scenari WHERE id')) {
        const mappa: Record<number, number> = { 100: 7, 200: 8 };
        return { rows: mappa[p0 as number] ? [{ azienda_id: mappa[p0 as number] }] : [] };
      }
      if (sql.includes('.debiti_ente WHERE id')) {
        return { rows: p0 === 5 ? [{ azienda_id: 8 }] : [] };
      }
      throw new Error(`Query non prevista nel test: ${sql}`);
    },
  },
}));

const {
  ErroreAutorizzazione,
  richiediAccessoSchema,
  richiediAccessoSpazio,
  richiediSuperadmin,
  risolviContestoSpazio,
  rifiutaSeNonAutorizzato,
  verificaAziendaConsentita,
  richiediAccessoAzienda,
  richiediAccessoScenario,
  verificaRigaConsentita,
  verificaFileDelloSpazio,
} = await import('./autorizzazione');

function login(token: string, ruolo: string, workspaceId: number | null, username: string) {
  sessioni.push({ token, ruolo, workspace_id: workspaceId, username, email: null });
  cookieJar.set('session_token', token);
}

beforeEach(() => {
  cookieJar.clear();
  sessioni = [];
});

describe('senza sessione', () => {
  it('rifiuta ogni accesso', async () => {
    await expect(richiediSuperadmin()).rejects.toBeInstanceOf(ErroreAutorizzazione);
    await expect(richiediAccessoSchema('tenant_alfa')).rejects.toBeInstanceOf(ErroreAutorizzazione);
    expect(await risolviContestoSpazio('alfa')).toBeNull();
  });

  it('rifiuta un token inesistente', async () => {
    cookieJar.set('session_token', 'inventato');
    await expect(richiediAccessoSchema('tenant_alfa')).rejects.toThrow();
  });

  it('le route API rispondono 401', async () => {
    const r = await rifiutaSeNonAutorizzato('SESSIONE');
    expect(r?.status).toBe(401);
  });
});

describe('isolamento fra spazi', () => {
  it("l'admin di alfa accede ad alfa", async () => {
    login('t-anna', 'USER', 1, 'anna.admin');
    const c = await richiediAccessoSchema('tenant_alfa');
    expect(c.modalita).toBe('ADMIN_SPAZIO');
    expect(c.nomeSchema).toBe('tenant_alfa');
  });

  it("l'admin di alfa NON accede a beta", async () => {
    login('t-anna', 'USER', 1, 'anna.admin');
    await expect(richiediAccessoSchema('tenant_beta')).rejects.toThrow(
      'Accesso allo spazio non consentito.'
    );
    await expect(richiediAccessoSpazio('beta')).rejects.toBeInstanceOf(ErroreAutorizzazione);
  });

  it('rifiuta nomi di schema non validi (SQL injection)', async () => {
    login('t-anna', 'USER', 1, 'anna.admin');
    await expect(richiediAccessoSchema('tenant_alfa"; DROP TABLE spazi; --')).rejects.toThrow(
      'Spazio non valido.'
    );
    await expect(richiediAccessoSchema('public')).rejects.toThrow('Spazio non valido.');
  });

  it('un utente non è Superadmin', async () => {
    login('t-anna', 'USER', 1, 'anna.admin');
    await expect(richiediSuperadmin()).rejects.toThrow('Operazione riservata al Superadmin.');
    expect((await rifiutaSeNonAutorizzato('SUPERADMIN'))?.status).toBe(403);
    expect(await rifiutaSeNonAutorizzato('SESSIONE')).toBeNull();
  });
});

describe('operatori', () => {
  it('non possono eseguire azioni riservate all’Admin', async () => {
    login('t-otto', 'USER', 1, 'otto.operatore');
    const c = await richiediAccessoSchema('tenant_alfa');
    expect(c.modalita).toBe('OPERATORE');
    await expect(richiediAccessoSchema('tenant_alfa', { soloAdmin: true })).rejects.toThrow(
      'Operazione riservata all’Admin di Spazio.'
    );
  });

  it('rispettano il livello di permesso per modulo', async () => {
    login('t-otto', 'USER', 1, 'otto.operatore');
    await expect(
      richiediAccessoSchema('tenant_alfa', { modulo: 'scenari', livello: 'SCRITTURA' })
    ).resolves.toBeTruthy();
    await expect(
      richiediAccessoSchema('tenant_alfa', { modulo: 'checklist', livello: 'LETTURA' })
    ).resolves.toBeTruthy();
    await expect(
      richiediAccessoSchema('tenant_alfa', { modulo: 'checklist', livello: 'SCRITTURA' })
    ).rejects.toThrow('serve il permesso di scrittura');
    await expect(richiediAccessoSchema('tenant_alfa', { modulo: 'xbrl' })).rejects.toThrow(
      'Nessun permesso sul modulo'
    );
  });

  it('solo le aziende assegnate', async () => {
    login('t-otto', 'USER', 1, 'otto.operatore');
    const c = await richiediAccessoSchema('tenant_alfa');
    expect(() => verificaAziendaConsentita(c, 7)).not.toThrow();
    expect(() => verificaAziendaConsentita(c, 8)).toThrow('Azienda non assegnata');
  });

  it('un utente disabilitato perde l’accesso', async () => {
    login('t-dino', 'USER', 1, 'dino.disabilitato');
    await expect(richiediAccessoSchema('tenant_alfa')).rejects.toThrow();
  });
});

describe('operatori: aziende, scenari e righe assegnate', () => {
  it('accede solo alle aziende assegnate', async () => {
    login('t-otto', 'USER', 1, 'otto.operatore');
    await expect(richiediAccessoAzienda('tenant_alfa', 7)).resolves.toBeTruthy();
    await expect(richiediAccessoAzienda('tenant_alfa', 8)).rejects.toThrow('Azienda non assegnata');
  });

  it("accede solo agli scenari dell'azienda assegnata", async () => {
    login('t-otto', 'USER', 1, 'otto.operatore');
    await expect(richiediAccessoScenario('tenant_alfa', 100)).resolves.toBeTruthy();
    await expect(richiediAccessoScenario('tenant_alfa', 200)).rejects.toThrow(
      'Azienda non assegnata'
    );
  });

  it('modifica solo righe di aziende assegnate (anche tramite lo scenario)', async () => {
    login('t-otto', 'USER', 1, 'otto.operatore');
    const c = await richiediAccessoSchema('tenant_alfa');
    await expect(verificaRigaConsentita(c, 'debiti_ente', 5)).rejects.toThrow(
      'Azienda non assegnata'
    );
    await expect(verificaRigaConsentita(c, 'proposta_creditori', 9)).resolves.toBeUndefined();
  });

  it("l'Admin non è ristretto dalle aziende assegnate", async () => {
    login('t-anna', 'USER', 1, 'anna.admin');
    await expect(richiediAccessoScenario('tenant_alfa', 200)).resolves.toBeTruthy();
    await expect(richiediAccessoAzienda('tenant_alfa', 8)).resolves.toBeTruthy();
  });

  it('basta il permesso su uno dei moduli elencati', async () => {
    login('t-otto', 'USER', 1, 'otto.operatore');
    await expect(
      richiediAccessoScenario('tenant_alfa', 100, {
        modulo: ['report', 'scenari'],
        livello: 'SCRITTURA',
      })
    ).resolves.toBeTruthy();
    await expect(
      richiediAccessoScenario('tenant_alfa', 100, {
        modulo: ['report', 'checklist'],
        livello: 'SCRITTURA',
      })
    ).rejects.toThrow('sola lettura');
  });
});

describe('file caricati', () => {
  it('accetta i file del proprio spazio e rifiuta quelli di un altro', async () => {
    login('t-anna', 'USER', 1, 'anna.admin');
    const c = await richiediAccessoSchema('tenant_alfa');
    const ok = [
      'https://abc.private.blob.vercel-storage.com/spazio-1-visura-XyZ123.pdf',
      'localblob:3f2a-9c__spazio-1-visura.pdf',
      // caricato prima della regola: senza prefisso, accettato
      'https://abc.private.blob.vercel-storage.com/visura-XyZ123.pdf',
    ];
    for (const u of ok) expect(() => verificaFileDelloSpazio(c, u)).not.toThrow();
    const ko = [
      'https://abc.private.blob.vercel-storage.com/spazio-2-visura-XyZ123.pdf',
      'localblob:3f2a-9c__spazio-2-visura.pdf',
      'localblob:../../dati/database.enc',
      'https://evil.example.com/spazio-1-visura.pdf',
      'http://abc.private.blob.vercel-storage.com/spazio-1-visura.pdf',
      '',
    ];
    for (const u of ko) expect(() => verificaFileDelloSpazio(c, u)).toThrow(ErroreAutorizzazione);
  });
});

describe('Superadmin e ispezione', () => {
  it('il Superadmin opera su qualunque spazio esistente', async () => {
    login('t-super', 'SUPERADMIN', null, 'superadmin');
    await expect(richiediSuperadmin()).resolves.toBeTruthy();
    const c = await richiediAccessoSchema('tenant_beta');
    expect(c.modalita).toBe('SALVAGENTE');
    await expect(richiediAccessoSchema('tenant_inesistente')).rejects.toThrow(
      'Spazio non trovato.'
    );
  });

  it('il cookie di ispezione vale solo con una sessione Superadmin', async () => {
    cookieJar.set('spazio_ispezione', '2');
    expect(await risolviContestoSpazio('beta')).toBeNull();

    login('t-anna', 'USER', 1, 'anna.admin');
    cookieJar.set('spazio_ispezione', '2');
    expect(await risolviContestoSpazio('beta')).toBeNull();
  });

  it('un cookie di ispezione falsificato (vecchio formato JSON) non porta i dati del cookie', async () => {
    login('t-super', 'SUPERADMIN', null, 'superadmin');
    cookieJar.set(
      'spazio_ispezione',
      JSON.stringify({ spazioId: 2, codice: 'beta', nomeSchema: 'public; DROP' })
    );
    const c = await risolviContestoSpazio('beta');
    expect(c?.modalita).toBe('SALVAGENTE');
    expect(c?.nomeSchema).toBe('tenant_beta');
  });
});
