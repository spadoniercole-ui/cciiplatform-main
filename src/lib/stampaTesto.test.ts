import { describe, it, expect, vi } from 'vitest';
import { improntaContenuto, logoSicuro, piedeDocumento } from './stampaTesto';
import { APP_VERSION } from './appVersion';

describe('piede dei documenti esportati', () => {
  it('l’impronta è la SHA-256 del contenuto', async () => {
    expect(await improntaContenuto('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );
  });
  it('il piede porta versione, date e impronta', async () => {
    const p = piedeDocumento(await improntaContenuto('x'), '2026-09-22T10:00:00Z');
    expect(p).toContain(`CCIIPlatform ${APP_VERSION}`);
    expect(p).toContain('contenuto generato il');
    expect(p).toMatch(/[0-9a-f]{64}/);
  });
});

describe('parametri di stampa', () => {
  it('impostaParametriStampa accetta null (torna ai predefiniti)', async () => {
    const { impostaParametriStampa, PARAMETRI_STAMPA_PREDEFINITI } = await import('./stampaTesto');
    expect(() => impostaParametriStampa(null)).not.toThrow();
    expect(PARAMETRI_STAMPA_PREDEFINITI.margini.alto).toBe(15);
  });
});

describe('finestre di stampa: niente HTML iniettato dai dati', () => {
  function finestraFinta() {
    const scritto: string[] = [];
    const finestra = {
      document: { write: (h: string) => scritto.push(h), close: () => {} },
      focus: () => {},
      print: () => {},
    };
    (globalThis as unknown as { window: unknown }).window = { open: () => finestra };
    return scritto;
  }

  it('titolo, sottotitolo e testo sono escapati', async () => {
    const { stampaHtml, stampaTesto } = await import('./stampaTesto');
    const maligno = 'Rossi <img src=x onerror=alert(1)> & C. "srl"';

    const html = finestraFinta();
    stampaHtml(`Screening — ${maligno}`, '<p>corpo</p>', maligno, null);
    await vi.waitFor(() => expect(html).toHaveLength(1));
    expect(html[0]).not.toContain('<img src=x');
    expect(html[0]).toContain('&lt;img src=x onerror=alert(1)&gt; &amp; C. &quot;srl&quot;');
    expect(html[0]).toContain('<p>corpo</p>');

    const testo = finestraFinta();
    stampaTesto(maligno, maligno, null);
    await vi.waitFor(() => expect(testo).toHaveLength(1));
    expect(testo[0]).not.toContain('<img src=x');
  });
});

describe('logoSicuro', () => {
  it("accetta solo data URL d'immagine in base64 puro", () => {
    expect(logoSicuro('data:image/png;base64,iVBORw0KGgo=')).toBe(true);
    expect(logoSicuro('data:image/png;base64,AAA"><img src=x onerror=alert(1)>')).toBe(false);
    expect(logoSicuro('javascript:alert(1)')).toBe(false);
    expect(logoSicuro('data:text/html;base64,PGI+')).toBe(false);
    expect(logoSicuro(null)).toBe(false);
  });
});
