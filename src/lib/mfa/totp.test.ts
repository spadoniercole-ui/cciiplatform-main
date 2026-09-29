import { describe, it, expect } from 'vitest';
import {
  base32Decode,
  base32Encode,
  codiceTotp,
  generaSegretoBase32,
  otpauthUri,
  verificaTotp,
} from './totp';

// Vettori di prova dell'RFC 6238, appendice B (SHA-1). Il segreto è la
// stringa ASCII "12345678901234567890"; i codici dell'RFC sono a 8 cifre, qui
// si confrontano le ultime 6 (il modulo genera codici a 6 cifre).
const SEGRETO_ASCII = '12345678901234567890';
const SEGRETO_RFC = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

const VETTORI_RFC6238: [secondi: number, codice: string][] = [
  [59, '287082'], // 94287082
  [1111111109, '081804'], // 07081804
  [1111111111, '050471'], // 14050471
  [1234567890, '005924'], // 89005924
  [2000000000, '279037'], // 69279037
  [20000000000, '353130'], // 65353130
];

describe('base32', () => {
  it('codifica il segreto dell’RFC 6238', () => {
    expect(base32Encode(Buffer.from(SEGRETO_ASCII, 'ascii'))).toBe(SEGRETO_RFC);
  });

  it('decodifica il segreto dell’RFC 6238', () => {
    expect(base32Decode(SEGRETO_RFC).toString('ascii')).toBe(SEGRETO_ASCII);
  });

  it('vettori dell’RFC 4648 (senza padding)', () => {
    const casi: [string, string][] = [
      ['', ''],
      ['f', 'MY'],
      ['fo', 'MZXQ'],
      ['foo', 'MZXW6'],
      ['foob', 'MZXW6YQ'],
      ['fooba', 'MZXW6YTB'],
      ['foobar', 'MZXW6YTBOI'],
    ];
    for (const [chiaro, codificato] of casi) {
      expect(base32Encode(Buffer.from(chiaro))).toBe(codificato);
      expect(base32Decode(codificato).toString()).toBe(chiaro);
    }
  });

  it('andata e ritorno su byte casuali di varie lunghezze', () => {
    for (let n = 0; n <= 40; n++) {
      const buf = Buffer.from(Array.from({ length: n }, (_, i) => (i * 37 + n * 11) & 0xff));
      expect(base32Decode(base32Encode(buf)).equals(buf)).toBe(true);
    }
  });

  it('la decodifica ignora minuscole, spazi e padding finale', () => {
    expect(base32Decode('gezd gnbv gy3t qojq gezd gnbv gy3t qojq').toString('ascii')).toBe(
      SEGRETO_ASCII
    );
    expect(base32Decode('MZXW6YQ=').toString()).toBe('foob');
  });
});

describe('codiceTotp — vettori RFC 6238 (SHA-1)', () => {
  for (const [secondi, atteso] of VETTORI_RFC6238) {
    it(`t = ${secondi} → ${atteso}`, () => {
      expect(codiceTotp(SEGRETO_RFC, secondi * 1000)).toBe(atteso);
    });
  }

  it('senza istante usa l’orologio corrente', () => {
    const adesso = Date.now();
    const codice = codiceTotp(SEGRETO_RFC);
    // A cavallo di un passo il codice può cambiare: si accetta il vicino.
    expect([codiceTotp(SEGRETO_RFC, adesso), codiceTotp(SEGRETO_RFC, adesso + 30_000)]).toContain(
      codice
    );
    expect(codice).toMatch(/^\d{6}$/);
  });
});

describe('verificaTotp', () => {
  const t = 1111111111 * 1000; // passo 37037037
  const passo = 30_000;

  it('accetta i vettori dell’RFC al loro istante', () => {
    for (const [secondi, codice] of VETTORI_RFC6238) {
      expect(verificaTotp(SEGRETO_RFC, codice, 1, secondi * 1000)).toBe(true);
    }
  });

  it('tolleranza di ±1 passo (30 s): accettati', () => {
    expect(verificaTotp(SEGRETO_RFC, codiceTotp(SEGRETO_RFC, t - passo), 1, t)).toBe(true);
    expect(verificaTotp(SEGRETO_RFC, codiceTotp(SEGRETO_RFC, t + passo), 1, t)).toBe(true);
  });

  it('±2 passi: rifiutati con la finestra predefinita', () => {
    const indietro = codiceTotp(SEGRETO_RFC, t - 2 * passo);
    const avanti = codiceTotp(SEGRETO_RFC, t + 2 * passo);
    // Precondizione: i codici dei passi vicini non coincidono per caso.
    const vicini = [-1, 0, 1].map((w) => codiceTotp(SEGRETO_RFC, t + w * passo));
    expect(vicini).not.toContain(indietro);
    expect(vicini).not.toContain(avanti);
    expect(verificaTotp(SEGRETO_RFC, indietro, undefined, t)).toBe(false);
    expect(verificaTotp(SEGRETO_RFC, avanti, undefined, t)).toBe(false);
  });

  it('la finestra predefinita è 1 passo', () => {
    const vicino = codiceTotp(SEGRETO_RFC, t + passo);
    expect(verificaTotp(SEGRETO_RFC, vicino, undefined, t)).toBe(true);
  });

  it('finestra 0: solo il passo corrente', () => {
    expect(verificaTotp(SEGRETO_RFC, codiceTotp(SEGRETO_RFC, t), 0, t)).toBe(true);
    expect(verificaTotp(SEGRETO_RFC, codiceTotp(SEGRETO_RFC, t + passo), 0, t)).toBe(false);
  });

  it('senza istante usa l’orologio corrente', () => {
    expect(verificaTotp(SEGRETO_RFC, codiceTotp(SEGRETO_RFC))).toBe(true);
  });

  it('codice sbagliato → rifiutato', () => {
    expect(verificaTotp(SEGRETO_RFC, '000000', 1, t)).toBe(false);
  });

  it('gli spazi nel codice sono tollerati (es. «050 471»)', () => {
    expect(verificaTotp(SEGRETO_RFC, '050 471', 1, t)).toBe(true);
    expect(verificaTotp(SEGRETO_RFC, ' 050471 ', 1, t)).toBe(true);
  });

  it('caratteri non numerici → rifiutato', () => {
    expect(verificaTotp(SEGRETO_RFC, '05047a', 1, t)).toBe(false);
    expect(verificaTotp(SEGRETO_RFC, '050-471', 1, t)).toBe(false);
    expect(verificaTotp(SEGRETO_RFC, '+50471', 1, t)).toBe(false);
  });

  it('lunghezza diversa da 6 → rifiutato', () => {
    expect(verificaTotp(SEGRETO_RFC, '50471', 1, t)).toBe(false);
    expect(verificaTotp(SEGRETO_RFC, '0504710', 1, t)).toBe(false);
    // Il codice a 8 cifre dell'RFC non vale: il modulo usa 6 cifre.
    expect(verificaTotp(SEGRETO_RFC, '14050471', 1, t)).toBe(false);
  });

  it('codice vuoto o assente → rifiutato', () => {
    expect(verificaTotp(SEGRETO_RFC, '', 1, t)).toBe(false);
    expect(verificaTotp(SEGRETO_RFC, '      ', 1, t)).toBe(false);
    expect(verificaTotp(SEGRETO_RFC, undefined as unknown as string, 1, t)).toBe(false);
    expect(verificaTotp(SEGRETO_RFC, null as unknown as string, 1, t)).toBe(false);
  });

  it('segreto vuoto → rifiutato anche con un codice ben formato', () => {
    const codiceSegretoVuoto = codiceTotp('', t);
    expect(verificaTotp('', codiceSegretoVuoto, 1, t)).toBe(false);
  });

  it('segreto senza alcun carattere Base32 valido → rifiutato', () => {
    const codice = codiceTotp('!!!!', t);
    expect(verificaTotp('!!!!', codice, 1, t)).toBe(false);
    expect(verificaTotp('0189', codiceTotp('0189', t), 1, t)).toBe(false);
  });

  it('segreto diverso → rifiutato', () => {
    const altro = base32Encode(Buffer.from('abcdefghijabcdefghij'));
    expect(verificaTotp(altro, '050471', 1, t)).toBe(false);
  });

  it('segreto con caratteri non Base32 frammisti → rifiutato', () => {
    // Prima «GEZD!GNBV…» era decodificato come «GEZDGNBV…» e accettato.
    const corrotto = SEGRETO_RFC.slice(0, 4) + '!' + SEGRETO_RFC.slice(4);
    expect(base32Decode(corrotto).length).toBe(0);
    expect(verificaTotp(corrotto, '050471', 1, t)).toBe(false);
    expect(verificaTotp(SEGRETO_RFC.replace('Z', '1'), '050471', 1, t)).toBe(false);
  });

  it('spazi, minuscole e padding restano accettati anche nel segreto', () => {
    const conSpazi = SEGRETO_RFC.toLowerCase().replace(/(.{4})/g, '$1 ') + '== ';
    expect(base32Decode(conSpazi).toString('ascii')).toBe(SEGRETO_ASCII);
    expect(verificaTotp(conSpazi, '050471', 1, t)).toBe(true);
  });
});

describe('generaSegretoBase32', () => {
  it('di default 20 byte → 32 caratteri Base32', () => {
    const s = generaSegretoBase32();
    expect(s).toHaveLength(32);
    expect(s).toMatch(/^[A-Z2-7]+$/);
    expect(base32Decode(s)).toHaveLength(20);
  });

  it('lunghezza personalizzata: ceil(8·n/5) caratteri', () => {
    for (const n of [1, 5, 10, 16, 32]) {
      const s = generaSegretoBase32(n);
      expect(s).toHaveLength(Math.ceil((8 * n) / 5));
      expect(s).toMatch(/^[A-Z2-7]+$/);
      expect(base32Decode(s)).toHaveLength(n);
    }
  });

  it('due segreti generati sono diversi', () => {
    expect(generaSegretoBase32()).not.toBe(generaSegretoBase32());
  });

  it('il segreto generato produce codici verificabili', () => {
    const s = generaSegretoBase32();
    const t = 1_700_000_000_000;
    expect(verificaTotp(s, codiceTotp(s, t), 1, t)).toBe(true);
  });
});

describe('otpauthUri', () => {
  it('formato per l’app authenticator', () => {
    const uri = otpauthUri(SEGRETO_RFC, 'mario.rossi', 'CCIIplatform');
    expect(uri).toBe(
      `otpauth://totp/CCIIplatform%3Amario.rossi?secret=${SEGRETO_RFC}` +
        '&issuer=CCIIplatform&algorithm=SHA1&digits=6&period=30'
    );
  });

  it('codifica etichetta ed emittente con spazi e caratteri speciali', () => {
    const uri = otpauthUri(SEGRETO_RFC, 'mario@studio.it', 'Studio Rossi & C.');
    const url = new URL(uri);
    expect(url.protocol).toBe('otpauth:');
    expect(uri.startsWith('otpauth://totp/Studio%20Rossi%20%26%20C.%3Amario%40studio.it?')).toBe(
      true
    );
    expect(url.searchParams.get('issuer')).toBe('Studio Rossi & C.');
    expect(url.searchParams.get('secret')).toBe(SEGRETO_RFC);
    expect(url.searchParams.get('algorithm')).toBe('SHA1');
    expect(url.searchParams.get('digits')).toBe('6');
    expect(url.searchParams.get('period')).toBe('30');
  });

  it('l’etichetta decodificata è «emittente:account»', () => {
    const uri = otpauthUri(SEGRETO_RFC, 'utente è/àccentato', 'Ente ÷ Prova');
    const label = decodeURIComponent(uri.slice('otpauth://totp/'.length, uri.indexOf('?')));
    expect(label).toBe('Ente ÷ Prova:utente è/àccentato');
    expect(uri).not.toContain(' ');
  });
});
