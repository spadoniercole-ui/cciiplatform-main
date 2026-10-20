import { describe, expect, it } from 'vitest';
import {
  ambientiAttesi,
  ambientiNonAttesi,
  estraiVersioneDaHtml,
  normalizzaAmbiente,
  parseRemoteGit,
  shaBreve,
  statoCi,
  statoDeployment,
  trovaDeployment,
  valutaConsegna,
  versioneCoerente,
  versioneOnline,
  type DeploymentRemoto,
  type RunCi,
  type StatoDeployment,
} from './verifica';

const SHA = 'd610f043dbc68d1eacd8f27e588c9e7f0862078e';

function deployment(id: number, ambiente: string, sha = SHA): DeploymentRemoto {
  return { id, ambiente, sha };
}

function stato(id: number, state: string, url: string | null = null): StatoDeployment {
  return { id, state, environmentUrl: url };
}

function run(id: number, conclusion: string | null, status = 'completed'): RunCi {
  return { id, name: 'CI', status, conclusion, url: `https://github.com/run/${id}` };
}

describe('normalizzaAmbiente', () => {
  it('rende confrontabili i trattini lunghi di Vercel', () => {
    expect(normalizzaAmbiente('Preview – cciiplatform-main')).toBe('preview cciiplatform main');
    expect(normalizzaAmbiente('Preview - cciiplatform-main')).toBe('preview cciiplatform main');
    expect(normalizzaAmbiente('Production — cciiweb-40')).toBe('production cciiweb 40');
  });
});

describe('ambientiAttesi', () => {
  it('su un ramo di lavoro attende solo le anteprime', () => {
    expect(ambientiAttesi(['cciiplatform-main', 'cciiweb-40'], false)).toEqual([
      'Preview – cciiplatform-main',
      'Preview – cciiweb-40',
    ]);
  });

  it('su main attende prima le anteprime e poi le produzioni', () => {
    expect(ambientiAttesi(['cciiplatform-main', 'cciiweb-40'], true)).toEqual([
      'Preview – cciiplatform-main',
      'Preview – cciiweb-40',
      'Production – cciiplatform-main',
      'Production – cciiweb-40',
    ]);
  });
});

describe('trovaDeployment', () => {
  it('sceglie il deployment dell’ambiente e del commit giusti', () => {
    const elenco = [
      deployment(1, 'Preview – cciiplatform-main'),
      deployment(2, 'Production – cciiplatform-main'),
      deployment(3, 'Preview – cciiweb-40', 'ffffffffffffffff'),
    ];
    expect(trovaDeployment(elenco, 'Preview – cciiplatform-main', SHA)?.id).toBe(1);
    expect(trovaDeployment(elenco, 'Production – cciiplatform-main', SHA)?.id).toBe(2);
    expect(trovaDeployment(elenco, 'Preview – cciiweb-40', SHA)).toBeNull();
  });

  it('se lo stesso ambiente è ripubblicato conta l’ultimo', () => {
    const elenco = [
      deployment(10, 'Preview – cciiplatform-main'),
      deployment(12, 'Preview – cciiplatform-main'),
      deployment(11, 'Preview – cciiplatform-main'),
    ];
    expect(trovaDeployment(elenco, 'Preview – cciiplatform-main', SHA)?.id).toBe(12);
  });
});

describe('ambientiNonAttesi', () => {
  it('segnala un progetto con un nome diverso e ignora i commit altrui', () => {
    const elenco = [
      deployment(1, 'Preview – cciiplatform-main'),
      deployment(2, 'Preview – cciiweb-40'),
      deployment(3, 'Preview – progetto-sconosciuto'),
      deployment(4, 'Preview – altro-sconosciuto', 'ffffffffffff'),
    ];
    expect(
      ambientiNonAttesi(elenco, ['Preview – cciiplatform-main', 'Preview – cciiweb-40'], SHA)
    ).toEqual(['Preview – progetto-sconosciuto']);
  });
});

describe('statoDeployment', () => {
  it('senza stati è ancora in corso', () => {
    const v = statoDeployment([]);
    expect(v.esito).toBe('IN_CORSO');
    expect(v.dettaglio).toContain('nessuno stato');
  });

  it('legge lo stato più recente, non il primo', () => {
    const v = statoDeployment([
      stato(1, 'success', 'https://a.vercel.app'),
      stato(2, 'in_progress', null),
    ]);
    expect(v.esito).toBe('IN_CORSO');
    expect(v.url).toBeNull();
  });

  it('successo e fallimento', () => {
    expect(statoDeployment([stato(1, 'success', 'https://x.vercel.app')])).toEqual({
      esito: 'PRONTO',
      dettaglio: 'pronto',
      url: 'https://x.vercel.app',
    });
    expect(statoDeployment([stato(1, 'failure')]).esito).toBe('FALLITO');
    expect(statoDeployment([stato(1, 'inactive')]).esito).toBe('FALLITO');
  });

  it('uno stato sconosciuto non è mai verde', () => {
    const v = statoDeployment([stato(1, 'strano')]);
    expect(v.esito).toBe('FALLITO');
    expect(v.dettaglio).toContain('strano');
  });
});

describe('statoCi', () => {
  it('senza run non è verde', () => {
    expect(statoCi([]).esito).toBe('ASSENTE');
  });

  it('conta in corso, rosse e verdi', () => {
    expect(statoCi([run(1, null, 'in_progress')]).esito).toBe('IN_CORSO');
    const rossa = statoCi([run(1, 'success'), run(2, 'failure')]);
    expect(rossa.esito).toBe('FALLITO');
    expect(rossa.dettaglio).toContain('failure');
    expect(statoCi([run(1, 'success')]).esito).toBe('PRONTO');
  });

  it('una run annullata non è verde', () => {
    expect(statoCi([run(1, 'cancelled')]).esito).toBe('FALLITO');
  });
});

describe('valutaConsegna', () => {
  const base = {
    sha: SHA,
    ramo: 'main',
    progetti: ['cciiplatform-main', 'cciiweb-40'],
    deployments: [
      deployment(1, 'Preview – cciiplatform-main'),
      deployment(2, 'Preview – cciiweb-40'),
      deployment(3, 'Production – cciiplatform-main'),
      deployment(4, 'Production – cciiweb-40'),
    ],
    stati: {
      1: [stato(11, 'success', 'https://preview-1.vercel.app')],
      2: [stato(12, 'success', 'https://preview-2.vercel.app')],
      3: [stato(13, 'success', 'https://prod-1.vercel.app')],
      4: [stato(14, 'success', 'https://prod-2.vercel.app')],
    } as Record<number, StatoDeployment[]>,
    run: [run(99, 'success')],
    ciAttesa: true,
  };

  it('è OK solo con anteprime, produzioni e CI verdi', () => {
    const v = valutaConsegna(base);
    expect(v.esito).toBe('OK');
    expect(v.mancanti).toEqual([]);
    expect(v.righe).toHaveLength(5);
    expect(v.righe[0]).toContain('Preview – cciiplatform-main: pronto');
  });

  it('su main la produzione mancante tiene la consegna in corso', () => {
    const v = valutaConsegna({
      ...base,
      deployments: base.deployments.filter((d) => !d.ambiente.startsWith('Production')),
    });
    expect(v.esito).toBe('IN_CORSO');
    expect(v.mancanti).toContain('Production – cciiplatform-main');
  });

  it('un deployment fallito chiude subito con FALLITO', () => {
    const v = valutaConsegna({
      ...base,
      stati: { ...base.stati, 3: [stato(13, 'failure')] },
    });
    expect(v.esito).toBe('FALLITO');
  });

  it('una CI rossa è FALLITO anche se i deployment sono pronti', () => {
    const v = valutaConsegna({ ...base, run: [run(99, 'failure')] });
    expect(v.esito).toBe('FALLITO');
    expect(v.righe.some((r) => r.includes('CI del commit'))).toBe(true);
  });

  it('su un ramo di lavoro senza pull request attende la sola anteprima', () => {
    const v = valutaConsegna({
      ...base,
      ramo: 'claude/prova',
      deployments: base.deployments.filter((d) => d.ambiente.startsWith('Preview')),
      run: [],
      ciAttesa: false,
    });
    expect(v.esito).toBe('OK');
    expect(v.righe.some((r) => r.includes('non prevista'))).toBe(true);
  });

  it('su un ramo di lavoro la CI già avviata e rossa resta un errore', () => {
    const v = valutaConsegna({
      ...base,
      ramo: 'claude/prova',
      deployments: base.deployments.filter((d) => d.ambiente.startsWith('Preview')),
      ciAttesa: false,
      run: [run(99, 'failure')],
    });
    expect(v.esito).toBe('FALLITO');
  });

  it('su main la CI assente tiene la consegna in corso', () => {
    const v = valutaConsegna({ ...base, run: [], ciAttesa: true });
    expect(v.esito).toBe('IN_CORSO');
    expect(v.mancanti).toContain('CI del commit');
  });

  it('senza deployment il verdetto resta in corso, non verde', () => {
    const v = valutaConsegna({
      ...base,
      deployments: [],
      stati: {},
      run: [],
      ramo: 'claude/prova',
      ciAttesa: false,
    });
    expect(v.esito).toBe('IN_CORSO');
    expect(v.mancanti).toHaveLength(2);
  });
});

describe('parseRemoteGit', () => {
  it('riconosce SSH, HTTPS e ssh://', () => {
    expect(parseRemoteGit('git@github.com:spadoniercole-ui/cciiplatform-main.git')).toBe(
      'spadoniercole-ui/cciiplatform-main'
    );
    expect(parseRemoteGit('https://github.com/spadoniercole-ui/cciiplatform-main.git')).toBe(
      'spadoniercole-ui/cciiplatform-main'
    );
    expect(parseRemoteGit('https://github.com/spadoniercole-ui/cciiplatform-main/')).toBe(
      'spadoniercole-ui/cciiplatform-main'
    );
    expect(parseRemoteGit('ssh://git@github.com/spadoniercole-ui/cciiplatform-main')).toBe(
      'spadoniercole-ui/cciiplatform-main'
    );
  });

  it('rifiuta un remote che non è GitHub', () => {
    expect(parseRemoteGit('https://gitlab.com/a/b.git')).toBeNull();
    expect(parseRemoteGit('/percorso/locale')).toBeNull();
  });
});

describe('shaBreve', () => {
  it('taglia a sette cifre', () => {
    expect(shaBreve(SHA)).toBe('d610f04');
  });
});

describe('estraiVersioneDaHtml', () => {
  it('preferisce l’attributo data-versione', () => {
    const html = '<span data-versione="0.133.6">v0.133.5</span>';
    expect(estraiVersioneDaHtml(html)).toEqual({
      versione: '0.133.6',
      fonte: 'attributo data-versione',
    });
  });

  it('su una pagina vecchia legge il piè di pagina', () => {
    const html = '<span class="font-mono">v0.133.5</span><span>Azienda di prova v1.2.3</span>';
    expect(estraiVersioneDaHtml(html)).toEqual({
      versione: '0.133.5',
      fonte: 'piè di pagina del login',
    });
  });

  it('senza versioni dice che non c’è', () => {
    expect(estraiVersioneDaHtml('<html>login</html>').versione).toBeNull();
  });
});

describe('versioneOnline', () => {
  it('è OK quando il login mostra la versione del commit', () => {
    const v = versioneOnline('0.133.6', '<span data-versione="0.133.6">v0.133.6</span>');
    expect(v.esito).toBe('OK');
    expect(v.dettaglio).toContain('0.133.6');
  });

  it('segnala la release precedente ancora online', () => {
    const v = versioneOnline('0.133.6', '<span class="font-mono">v0.133.5</span>');
    expect(v.esito).toBe('DIVERSA');
    expect(v.dettaglio).toContain('0.133.5');
    expect(v.dettaglio).toContain('0.133.6');
  });

  it('una pagina senza versione non è un verdetto', () => {
    expect(versioneOnline('0.133.6', '<html></html>').esito).toBe('ASSENTE');
  });
});

describe('versioneCoerente', () => {
  it('chiede che le tre fonti coincidano', () => {
    expect(versioneCoerente('0.133.5', '0.133.5', '0.133.5')).toEqual({
      coerente: true,
      dettaglio: 'versione 0.133.5',
    });
    const v = versioneCoerente('0.133.5', '0.133.4', '0.133.5');
    expect(v.coerente).toBe(false);
    expect(v.dettaglio).toContain('0.133.4');
  });
});
