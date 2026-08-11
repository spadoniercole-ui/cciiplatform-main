'use client';

import { useState, useEffect } from 'react';

export const dynamic = 'force-dynamic';

// ==========================================
// INTERFACCE E TIPIZZAZIONE STRUTTURA DATI
// ==========================================
interface IndiceTargetCCII {
  codiceIndice: string;
  denominazione: string;
  normativaRiferimento: string;
  gruppoSoglia: 'LIQUIDITÀ' | 'PATRIMONIALE' | 'DEBITI_ISTITUZIONALI' | 'REDDITUALE';
  sogliaAllertaStandard: string;
  obbligatorio: boolean;
}

interface RegolaMappatura {
  id: string;
  codiceContoInterno: string; // Es. GPA 10031, GPA 1690, o codici mastri
  descrizioneConto: string;
  indiceTarget: string; // Chiave esterna su codiceIndice
  tipoSegno: 'INCREMENTA' | 'DECREMENTA' | 'SOGLIA_BLOCCO';
  valoreLimitePersonalizzato: number | null;
  statoRegola: 'ATTIVA' | 'BOZZA' | 'SOSPESA';
}

interface ValidazioneIntegrita {
  codice: string;
  severita: 'CRITICA' | 'WARNING' | 'OK';
  messaggio: string;
}

export default function TabMappature() {
  // ==========================================
  // CONFIGURAZIONE DELLE ANCHOR NORMATIVE CCII
  // ==========================================
  const [indiciTarget] = useState<IndiceTargetCCII[]>([
    {
      codiceIndice: 'IDX-DSCR',
      denominazione: 'DSCR (Debt Service Coverage Ratio) a 6 mesi',
      normativaRiferimento: 'Art. 13 - Indici di sostenibilità',
      gruppoSoglia: 'LIQUIDITÀ',
      sogliaAllertaStandard: '< 1.00',
      obbligatorio: true,
    },
    {
      codiceIndice: 'IDX-PATR',
      denominazione: 'Patrimonio Netto / Totale Debiti Complessivi',
      normativaRiferimento: 'Art. 2484 c.c. / Indicatori di adeguatezza',
      gruppoSoglia: 'PATRIMONIALE',
      sogliaAllertaStandard: '< 0.10',
      obbligatorio: true,
    },
    {
      codiceIndice: 'IDX-INPS',
      denominazione: 'Debiti Contributivi INPS Scaduti ed Insoluti',
      normativaRiferimento: 'Art. 25-novies - Segnalazioni dei creditori pubblici',
      gruppoSoglia: 'DEBITI_ISTITUZIONALI',
      sogliaAllertaStandard: '> € 15.000 o oltre tempo limite',
      obbligatorio: true,
    },
    {
      codiceIndice: 'IDX-ADE',
      denominazione: 'Debiti Tributari Scaduti Agenzia delle Entrate',
      normativaRiferimento: 'Art. 25-novies c.1 lett. a)',
      gruppoSoglia: 'DEBITI_ISTITUZIONALI',
      sogliaAllertaStandard: '> 10% del fatturato o > € 25.000',
      obbligatorio: true,
    },
    {
      codiceIndice: 'IDX-OF-RIC',
      denominazione: 'Incidenza Oneri Finanziari su Ricavi Vendite',
      normativaRiferimento: "Modelli settoriali crisi d'impresa",
      gruppoSoglia: 'REDDITUALE',
      sogliaAllertaStandard: '> 8.5%',
      obbligatorio: false,
    },
  ]);

  // ==========================================
  // STATO DELLE REGOLE DI MAPPATURA ATTIVE
  // ==========================================
  const [mappature, setMappature] = useState<RegolaMappatura[]>([
    {
      id: 'MAP-001',
      codiceContoInterno: 'GPA_10031',
      descrizioneConto: 'Contributi previdenziali dovuti da datori di lavoro - Gestione Ordinaria',
      indiceTarget: 'IDX-INPS',
      tipoSegno: 'SOGLIA_BLOCCO',
      valoreLimitePersonalizzato: 15000,
      statoRegola: 'ATTIVA',
    },
    {
      id: 'MAP-002',
      codiceContoInterno: 'GPA_1690',
      descrizioneConto: 'Sanzioni civili ed oneri accessori per ritardato versamento contributivo',
      indiceTarget: 'IDX-INPS',
      tipoSegno: 'INCREMENTA',
      valoreLimitePersonalizzato: null,
      statoRegola: 'ATTIVA',
    },
    {
      id: 'MAP-003',
      codiceContoInterno: 'CONTO_BANCA_MUTUO',
      descrizioneConto: 'Quote capitali rate di mutuo a breve scadenza (entro 6 mesi)',
      indiceTarget: 'IDX-DSCR',
      tipoSegno: 'DECREMENTA',
      valoreLimitePersonalizzato: null,
      statoRegola: 'ATTIVA',
    },
    {
      id: 'MAP-004',
      codiceContoInterno: 'ERARIO_IVA_SCAD',
      descrizioneConto: 'Debito IVA cumulato risultante da liquidazioni periodiche non versate',
      indiceTarget: 'IDX-ADE',
      tipoSegno: 'SOGLIA_BLOCCO',
      valoreLimitePersonalizzato: 25000,
      statoRegola: 'ATTIVA',
    },
    {
      id: 'MAP-005',
      codiceContoInterno: 'PN_CAPITALE_SOC',
      descrizioneConto: 'Capitale Sociale nominale al netto dei decimi da richiamare',
      indiceTarget: 'IDX-PATR',
      tipoSegno: 'INCREMENTA',
      valoreLimitePersonalizzato: null,
      statoRegola: 'BOZZA',
    },
  ]);

  // Stato per la gestione della creazione di una nuova riga di mappatura
  const [nuovoConto, setNuovoConto] = useState('');
  const [nuovaDesc, setNuovaDesc] = useState('');
  const [nuovoTarget, setNuovoTarget] = useState('IDX-DSCR');
  const [nuovoSegno, setNuovoSegno] = useState<RegolaMappatura['tipoSegno']>('INCREMENTA');
  const [nuovoLimite, setNuovoLimite] = useState<string>('');

  // ==========================================
  // LOGICHE DI VALIDAZIONE E INTEGRITÀ REALE
  // ==========================================
  const eseguiControlliIntegrita = (): ValidazioneIntegrita[] => {
    const checkLog: ValidazioneIntegrita[] = [];

    // 1. Controlla se gli indici obbligatori per legge hanno almeno una regola attiva associata
    indiciTarget.forEach((ind) => {
      if (ind.obbligatorio) {
        const haMappaturaValida = mappature.some(
          (m) => m.indiceTarget === ind.codiceIndice && m.statoRegola === 'ATTIVA'
        );
        if (!haMappaturaValida) {
          checkLog.push({
            codice: `ERR-INTEG-${ind.codiceIndice}`,
            severita: 'CRITICA',
            messaggio: `Nessuna regola operativa attiva collegata all'indice obbligatorio [${ind.codiceIndice} - ${ind.denominazione}]. Il calcolo degli indici produrrà un output incompleto.`,
          });
        }
      }
    });

    // 2. Controlla la presenza di configurazioni ferme allo stato di Bozza
    const conteggioBozze = mappature.filter((m) => m.statoRegola === 'BOZZA').length;
    if (conteggioBozze > 0) {
      checkLog.push({
        codice: 'WRN-BOZZA-PRESENTE',
        severita: 'WARNING',
        messaggio: `Rilevate ${conteggioBozze} regole in stato 'BOZZA'. Queste logiche non verranno considerate dal motore di calcolo asincrono.`,
      });
    }

    if (checkLog.length === 0) {
      checkLog.push({
        codice: 'OK-COMPLIANT',
        severita: 'OK',
        messaggio:
          "Integrita dell'albero delle mappature verificata. Nessun conflitto logico rilevato.",
      });
    }

    return checkLog;
  };

  const recordValidazione = eseguiControlliIntegrita();

  // ==========================================
  // LOGICA DELLE FUNZIONI OPERATIVE
  // ==========================================
  const aggiungiNuovaMappatura = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuovoConto.trim() || !nuovaDesc.trim()) {
      alert('Inserire sia il codice del conto sorgente che la relativa descrizione tecnica.');
      return;
    }

    const nuovaRegola: RegolaMappatura = {
      id: `MAP-${Math.floor(100 + Math.random() * 900)}`,
      codiceContoInterno: nuovoConto.trim().replace(/\s+/g, '_').toUpperCase(),
      descrizioneConto: nuovaDesc.trim(),
      indiceTarget: nuovoTarget,
      tipoSegno: nuovoSegno,
      valoreLimitePersonalizzato: nuovoLimite ? parseFloat(nuovoLimite) : null,
      statoRegola: 'BOZZA',
    };

    setMappature([...mappature, nuovaRegola]);
    setNuovoConto('');
    setNuovaDesc('');
    setNuovoLimite('');
  };

  const eliminaMappatura = (id: string) => {
    if (confirm("Confermi la rimozione immediata di questa regola di mappatura dall'algoritmo?")) {
      setMappature(mappature.filter((m) => m.id !== id));
    }
  };

  const cambiaStatoRegola = (id: string, nuovoStato: RegolaMappatura['statoRegola']) => {
    setMappature(mappature.map((m) => (m.id === id ? { ...m, statoRegola: nuovoStato } : m)));
  };

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* 1. SEZIONE CRITERI NORMATIVI DI ALLERTA FISSI */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <div className="mb-4">
          <h4 className="text-sm font-bold text-slate-900">
            Dizionari di Destinazione ed Indici Standard di Allerta (CCII)
          </h4>
          <p className="text-xs text-slate-400 mt-0.5">
            Parametri e matrici di allerta fissati dal legislatore e dai decreti attuativi.
            Rappresentano i nodi su cui ancorare i flussi dei bilanci aziendali.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {indiciTarget.map((ind) => (
            <div
              key={ind.codiceIndice}
              className="border border-slate-200 bg-slate-50/50 p-4 rounded-xl flex flex-col justify-between"
            >
              <div>
                <div className="flex justify-between items-start gap-2">
                  <span className="font-mono text-[10px] font-bold px-2 py-0.5 bg-slate-200 text-slate-800 rounded border border-slate-300">
                    {ind.codiceIndice}
                  </span>
                  {ind.obbligatorio ? (
                    <span className="text-[9px] font-extrabold tracking-wider uppercase text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded">
                      Ex Lege Obbligatorio
                    </span>
                  ) : (
                    <span className="text-[9px] font-bold tracking-wider uppercase text-slate-400 bg-white border border-slate-200 px-1.5 py-0.5 rounded">
                      Facoltativo
                    </span>
                  )}
                </div>
                <h5 className="font-bold text-slate-900 text-xs mt-2 leading-tight">
                  {ind.denominazione}
                </h5>
                <span className="text-[10px] text-slate-400 block font-medium mt-1">
                  {ind.normativaRiferimento}
                </span>
              </div>
              <div className="mt-3 pt-2.5 border-t border-slate-200/60 flex justify-between items-center text-[11px]">
                <span className="text-slate-400 font-semibold uppercase text-[9px] tracking-wide">
                  Soglia Base:
                </span>
                <span className="font-mono font-black text-slate-700 bg-white px-2 py-0.5 rounded border border-slate-100 shadow-2xs">
                  {ind.sogliaAllertaStandard}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 2. CONSOLE DI SICUREZZA E DI VERIFICA LOGICA */}
      <div className="bg-slate-900 rounded-xl p-5 text-white border border-slate-800 shadow-md">
        <h4 className="text-xs font-bold uppercase tracking-widest text-slate-400 flex items-center gap-1.5 mb-3">
          <span>🛡️</span> Debugger Coerenza Mappature & Verifiche di Conformità
        </h4>
        <div className="space-y-2">
          {recordValidazione.map((rec, index) => (
            <div
              key={index}
              className={`p-3 rounded-lg flex items-start gap-3 border text-xs font-mono ${
                rec.severita === 'CRITICA'
                  ? 'bg-rose-950/40 border-rose-800/80 text-rose-200'
                  : rec.severita === 'WARNING'
                    ? 'bg-amber-950/40 border-amber-800/80 text-amber-200'
                    : 'bg-emerald-950/40 border-emerald-800/80 text-emerald-200'
              }`}
            >
              <span className="font-bold">[{rec.severita}]</span>
              <p className="font-sans leading-relaxed flex-1">{rec.messaggio}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 3. MATRICE PRINCIPALE DELLE MAPPATURE CONFIGURATE */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <h4 className="font-bold text-slate-900 text-sm">
            Regole di Associazione e Comportamento Conti
          </h4>
          <p className="text-xs text-slate-400 mt-0.5">
            Modifica l&apos;impatto algebrico di ciascuna stringa contabile o codice gestionale
            verso gli indici di destinazione.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                <th className="p-3">Codice Identificativo</th>
                <th className="p-3">Conto di Riferimento Interno</th>
                <th className="p-3 w-[25%]">Descrizione d&apos;Uso del Conto</th>
                <th className="p-3">Indice Destinazione</th>
                <th className="p-3">Azione Algebrica</th>
                <th className="p-3 text-right">Limite Alert Cap (€)</th>
                <th className="p-3">Stato Regola</th>
                <th className="p-3 text-center">Azioni</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {mappature.map((m) => (
                <tr key={m.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="p-3 font-mono text-slate-400 text-[11px]">{m.id}</td>
                  <td className="p-3">
                    <span className="font-mono font-bold text-slate-900 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded text-[11px]">
                      {m.codiceContoInterno}
                    </span>
                  </td>
                  <td className="p-3 text-slate-500 font-sans text-[11px] leading-tight">
                    {m.descrizioneConto}
                  </td>
                  <td className="p-3">
                    <span className="font-mono font-bold bg-blue-50 text-blue-700 border border-blue-100 px-2 py-0.5 rounded">
                      {m.indiceTarget}
                    </span>
                  </td>
                  <td className="p-3">
                    {m.tipoSegno === 'INCREMENTA' && (
                      <span className="text-emerald-700 font-bold">➕ Somma (+ Delta)</span>
                    )}
                    {m.tipoSegno === 'DECREMENTA' && (
                      <span className="text-rose-700 font-bold">➖ Sottrai (- Delta)</span>
                    )}
                    {m.tipoSegno === 'SOGLIA_BLOCCO' && (
                      <span className="text-amber-700 font-bold">🛑 Soglia di Blocco</span>
                    )}
                  </td>
                  <td className="p-3 text-right font-mono font-bold text-slate-700">
                    {m.valoreLimitePersonalizzato !== null ? (
                      `€ ${m.valoreLimitePersonalizzato.toLocaleString('it-IT')}`
                    ) : (
                      <span className="text-slate-300 font-normal">Nessuno</span>
                    )}
                  </td>
                  <td className="p-3">
                    <select
                      value={m.statoRegola}
                      onChange={(e) =>
                        cambiaStatoRegola(m.id, e.target.value as RegolaMappatura['statoRegola'])
                      }
                      className={`text-[11px] font-bold px-2 py-1 rounded border focus:outline-none ${
                        m.statoRegola === 'ATTIVA'
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                          : m.statoRegola === 'BOZZA'
                            ? 'bg-amber-50 border-amber-200 text-amber-800'
                            : 'bg-slate-100 border-slate-200 text-slate-500'
                      }`}
                    >
                      <option value="ATTIVA">ATTIVA</option>
                      <option value="BOZZA">BOZZA</option>
                      <option value="SOSPESA">SOSPESA</option>
                    </select>
                  </td>
                  <td className="p-3 text-center">
                    <button
                      onClick={() => eliminaMappatura(m.id)}
                      className="px-2 py-1 bg-white hover:bg-rose-50 text-rose-600 border border-slate-200 hover:border-rose-200 rounded font-semibold transition-all"
                    >
                      Elimina
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. FORM PER L'AGGIUNTA DI UNA NUOVA REGOLA DI RACCORDO */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-5">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block mb-3">
          ➕ Inserimento Nuova Regola di Raccordo Gestionale
        </span>
        <form
          onSubmit={aggiungiNuovaMappatura}
          className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end"
        >
          <div className="md:col-span-3">
            <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">
              Codice Conto / Chiave Registro
            </label>
            <input
              type="text"
              required
              placeholder="Es. GPA_10031 o MASTRO_BANCHE"
              value={nuovoConto}
              onChange={(e) => setNuovoConto(e.target.value)}
              className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono uppercase focus:outline-none focus:border-blue-600"
            />
          </div>

          <div className="md:col-span-4">
            <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">
              Descrizione d&apos;Uso del Capitolo Spesa/Entrata
            </label>
            <input
              type="text"
              required
              placeholder="Fornire indicazione chiara per asseverazione"
              value={nuovaDesc}
              onChange={(e) => setNuovaDesc(e.target.value)}
              className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs focus:outline-none focus:border-blue-600"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">
              Indice Obiettivo
            </label>
            <select
              value={nuovoTarget}
              onChange={(e) => setNuovoTarget(e.target.value)}
              className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold focus:outline-none focus:border-blue-600"
            >
              {indiciTarget.map((ind) => (
                <option key={ind.codiceIndice} value={ind.codiceIndice}>
                  {ind.codiceIndice}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-1">
            <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">
              Azione
            </label>
            <select
              value={nuovoSegno}
              onChange={(e) => setNuovoSegno(e.target.value as RegolaMappatura['tipoSegno'])}
              className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold focus:outline-none focus:border-blue-600"
            >
              <option value="INCREMENTA">+</option>
              <option value="DECREMENTA">-</option>
              <option value="SOGLIA_BLOCCO">Soglia</option>
            </select>
          </div>

          <div className="md:col-span-1">
            <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">
              Cap (€)
            </label>
            <input
              type="number"
              placeholder="Opzionale"
              value={nuovoLimite}
              onChange={(e) => setNuovoLimite(e.target.value)}
              className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono focus:outline-none focus:border-blue-600"
            />
          </div>

          <div className="md:col-span-1">
            <button
              type="submit"
              className="w-full px-3 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-lg text-xs transition-colors shadow-xs"
            >
              Traccia
            </button>
          </div>
        </form>
      </div>

      {/* FOOTER METADATI DB */}
      <div className="text-[11px] text-slate-400 text-right font-mono">
        Tabella Logica di Destinazione Consolidata:{' '}
        <span className="font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">
          tb_mappature_indici
        </span>
      </div>
    </div>
  );
}
