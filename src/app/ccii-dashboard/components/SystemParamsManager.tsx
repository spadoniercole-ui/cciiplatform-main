'use client';

import { useState, useEffect } from 'react';

export const dynamic = 'force-dynamic';

interface ParametroValuta {
  valutaRiferimento: string;
  cambioUsd: number;
  cambioGbp: number;
  allineamentoAutomaticoBCE: boolean;
}

interface SogliaAllertaCCII {
  id: string;
  codiceIndice: string;
  denominazione: string;
  valoreLimite: number;
  operatoreLogico: '>' | '<' | '>=' | '<=';
  validoDa: string;
  validoA: string;
  stato: 'CORRENTE' | 'STORICO' | 'FUTURO';
}

export default function SystemParamsManager() {
  const [activeSubTab, setActiveSubTab] = useState<'generali' | 'soglie' | 'storico'>('generali');
  const [isEditable, setIsEditable] = useState<boolean>(false);

  const [monetari, setMonetari] = useState<ParametroValuta>({
    valutaRiferimento: 'EUR',
    cambioUsd: 1.09,
    cambioGbp: 0.85,
    allineamentoAutomaticoBCE: true,
  });

  const [soglie, setSoglie] = useState<SogliaAllertaCCII[]>([
    {
      id: 'SGL-001',
      codiceIndice: 'IND-01',
      denominazione: 'DSCR a 6 mesi (Debt Service Coverage Ratio)',
      valoreLimite: 1.0,
      operatoreLogico: '<',
      validoDa: '2024-01-01',
      validoA: '2026-12-31',
      stato: 'CORRENTE',
    },
    {
      id: 'SGL-002',
      codiceIndice: 'IND-02',
      denominazione: 'Patrimonio Netto / Mezzi Propri',
      valoreLimite: 0.0,
      operatoreLogico: '<=',
      validoDa: '2024-01-01',
      validoA: '2026-12-31',
      stato: 'CORRENTE',
    },
    {
      id: 'SGL-003',
      codiceIndice: 'IND-03',
      denominazione: 'Oneri Finanziari / Ricavi',
      valoreLimite: 0.05,
      operatoreLogico: '>',
      validoDa: '2024-01-01',
      validoA: '2025-12-31',
      stato: 'STORICO',
    },
    {
      id: 'SGL-004',
      codiceIndice: 'IND-04',
      denominazione: 'Attivo Tangibile / Debiti Totali',
      valoreLimite: 0.2,
      operatoreLogico: '<',
      validoDa: '2026-01-01',
      validoA: '2028-12-31',
      stato: 'FUTURO',
    },
  ]);

  const [nuovaSoglia, setNuovaSoglia] = useState<Partial<SogliaAllertaCCII>>({
    codiceIndice: '',
    denominazione: '',
    valoreLimite: 0,
    operatoreLogico: '>',
    validoDa: new Date().toISOString().split('T')[0],
    validoA: '2029-12-31',
  });

  const handleSaveGenerali = () => {
    setIsEditable(false);
    alert('Parametri monetari globali aggiornati con successo nel sistema.');
  };

  const handleAggiungiNuovaVersioneSoglia = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuovaSoglia.codiceIndice || !nuovaSoglia.denominazione) {
      alert('Tutti i campi sono obbligatori per garantire il tracciamento normativo.');
      return;
    }

    const recordCompleto: SogliaAllertaCCII = {
      id: `SGL-${Math.floor(100 + Math.random() * 900)}`,
      codiceIndice: nuovaSoglia.codiceIndice,
      denominazione: nuovaSoglia.denominazione,
      valoreLimite: nuovaSoglia.valoreLimite || 0,
      operatoreLogico: nuovaSoglia.operatoreLogico || '>',
      validoDa: nuovaSoglia.validoDa || '',
      validoA: nuovaSoglia.validoA || '',
      stato: 'FUTURO',
    };

    setSoglie((prev) => [...prev, recordCompleto]);
    setNuovaSoglia({
      codiceIndice: '',
      denominazione: '',
      valoreLimite: 0,
      operatoreLogico: '>',
      validoDa: new Date().toISOString().split('T')[0],
      validoA: '2029-12-31',
    });
    alert('Nuovo coefficiente temporale iniettato.');
  };

  const styles = {
    container: {
      backgroundColor: '#ffffff',
      borderRadius: '8px',
      border: '1px solid #edebe9',
      padding: '24px',
      maxWidth: '1000px',
      margin: '0 auto',
    },
    subTabBar: {
      display: 'flex',
      gap: '8px',
      borderBottom: '1px solid #edebe9',
      marginBottom: '20px',
    },
    infoBanner: {
      backgroundColor: '#f3f2f1',
      borderLeft: '4px solid #0078d4',
      padding: '12px 16px',
      fontSize: '13px',
      color: '#323130',
      marginBottom: '20px',
      lineHeight: '1.5',
    },
    grid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(2, 1fr)',
      gap: '20px',
      marginBottom: '24px',
    },
    formGroup: {
      display: 'flex',
      flexDirection: 'column' as const,
      gap: '6px',
    },
    label: {
      fontSize: '13px',
      fontWeight: 600,
      color: '#323130',
    },
    input: {
      padding: '8px 12px',
      fontSize: '14px',
      borderRadius: '4px',
      border: '1px solid #a19f9d',
      backgroundColor: '#ffffff',
    },
    inputDisabled: {
      padding: '8px 12px',
      fontSize: '14px',
      borderRadius: '4px',
      border: '1px solid #f3f2f1',
      backgroundColor: '#f3f2f1',
      color: '#a19f9d',
      cursor: 'not-allowed',
    },
    table: {
      width: '100%',
      borderCollapse: 'collapse' as const,
      marginTop: '12px',
      fontSize: '13px',
    },
    th: {
      backgroundColor: '#faf9f8',
      borderBottom: '2px solid #edebe9',
      padding: '10px',
      textAlign: 'left' as const,
      fontWeight: 600,
      color: '#323130',
    },
    td: {
      borderBottom: '1px solid #edebe9',
      padding: '10px',
      color: '#323130',
    },
    btnPrimary: {
      backgroundColor: '#0078d4',
      color: '#ffffff',
      border: 'none',
      borderRadius: '4px',
      padding: '10px 20px',
      fontWeight: 600,
      cursor: 'pointer',
    },
    btnSecondary: {
      backgroundColor: '#ffffff',
      color: '#323130',
      border: '1px solid #a19f9d',
      borderRadius: '4px',
      padding: '10px 20px',
      cursor: 'pointer',
    },
  };

  const getSubTabButtonStyle = (isActive: boolean) => ({
    padding: '8px 16px',
    fontSize: '13px',
    fontWeight: isActive ? 600 : 400,
    color: isActive ? '#0078d4' : '#323130',
    backgroundColor: isActive ? '#eff6fc' : 'transparent',
    border: 'none',
    borderRadius: '4px 4px 0 0',
    cursor: 'pointer',
  });

  const getBadgeStyle = (stato: 'CORRENTE' | 'STORICO' | 'FUTURO') => {
    const colors = {
      CORRENTE: { bg: '#dff6dd', text: '#107c41' },
      STORICO: { bg: '#fde7e9', text: '#a80000' },
      FUTURO: { bg: '#fff4ce', text: '#794100' },
    };
    return {
      padding: '2px 8px',
      borderRadius: '4px',
      fontSize: '11px',
      fontWeight: 600 as const,
      backgroundColor: colors[stato].bg,
      color: colors[stato].text,
    };
  };

  return (
    <div style={styles.container}>
      <div style={styles.subTabBar}>
        <button
          style={getSubTabButtonStyle(activeSubTab === 'generali')}
          onClick={() => setActiveSubTab('generali')}
        >
          Parametri Generali & Valuta
        </button>
        <button
          style={getSubTabButtonStyle(activeSubTab === 'soglie')}
          onClick={() => setActiveSubTab('soglie')}
        >
          Soglie di Allerta CCII Attive
        </button>
        <button
          style={getSubTabButtonStyle(activeSubTab === 'storico')}
          onClick={() => setActiveSubTab('storico')}
        >
          Iniezione Versioni Temporali (Effective Date)
        </button>
      </div>

      <div style={styles.infoBanner}>
        ℹ️ <strong>Direttiva Ground Zero 3.0:</strong> Le modifiche ai coefficienti e alle soglie
        normative non sovrascrivono i record usati nei vecchi scenari. Il sistema esegue una
        storicizzazione automatica basata sui campi <code>valido_da</code> e <code>valido_a</code>.
      </div>

      {activeSubTab === 'generali' && (
        <div>
          <div style={styles.grid}>
            <div style={styles.formGroup}>
              <label style={styles.label}>Valuta di Conto Principale</label>
              <input
                type="text"
                style={styles.inputDisabled}
                disabled={true}
                value={monetari.valutaRiferimento}
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Tasso di Cambio EUR / USD</label>
              <input
                type="number"
                step="0.001"
                style={isEditable ? styles.input : styles.inputDisabled}
                disabled={!isEditable}
                value={monetari.cambioUsd}
                onChange={(e) =>
                  setMonetari({ ...monetari, cambioUsd: parseFloat(e.target.value) || 0 })
                }
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Tasso di Cambio EUR / GBP</label>
              <input
                type="number"
                step="0.001"
                style={isEditable ? styles.input : styles.inputDisabled}
                disabled={!isEditable}
                value={monetari.cambioGbp}
                onChange={(e) =>
                  setMonetari({ ...monetari, cambioGbp: parseFloat(e.target.value) || 0 })
                }
              />
            </div>
            <div style={{ ...styles.formGroup, justifyContent: 'center' }}>
              <label
                style={{
                  ...styles.label,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  cursor: isEditable ? 'pointer' : 'not-allowed',
                }}
              >
                <input
                  type="checkbox"
                  disabled={!isEditable}
                  checked={monetari.allineamentoAutomaticoBCE}
                  onChange={(e) =>
                    setMonetari({ ...monetari, allineamentoAutomaticoBCE: e.target.checked })
                  }
                  style={{ width: '16px', height: '16px' }}
                />
                Aggiorna cambi automaticamente tramite web-service BCE al login
              </label>
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              gap: '10px',
              borderTop: '1px solid #edebe9',
              paddingTop: '16px',
            }}
          >
            {!isEditable ? (
              <button style={styles.btnPrimary} onClick={() => setIsEditable(true)}>
                Modifica Parametri Monetari
              </button>
            ) : (
              <>
                <button style={styles.btnPrimary} onClick={handleSaveGenerali}>
                  Salva Configurazioni
                </button>
                <button style={styles.btnSecondary} onClick={() => setIsEditable(false)}>
                  Annulla
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {activeSubTab === 'soglie' && (
        <div>
          <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#0078d4' }}>
            Soglie di Allerta Precoce (Artt. 12-13 Codice della Crisi)
          </h4>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Codice</th>
                <th style={styles.th}>Denominazione Indicatore</th>
                <th style={styles.th}>Logica</th>
                <th style={styles.th}>Valore Soglia</th>
                <th style={styles.th}>Validità Da</th>
                <th style={styles.th}>Validità A</th>
                <th style={styles.th}>Stato Temporale</th>
              </tr>
            </thead>
            <tbody>
              {soglie.map((s) => (
                <tr key={s.id}>
                  <td style={styles.td}>
                    <code>{s.codiceIndice}</code>
                  </td>
                  <td style={styles.td}>{s.denominazione}</td>
                  <td style={{ ...styles.td, fontWeight: 700, color: '#0078d4' }}>
                    {s.operatoreLogico}
                  </td>
                  <td style={styles.td}>
                    <strong>{s.valoreLimite}</strong>
                  </td>
                  <td style={styles.td}>{s.validoDa.split('-').reverse().join('/')}</td>
                  <td style={styles.td}>{s.validoA.split('-').reverse().join('/')}</td>
                  <td style={styles.td}>
                    <span style={getBadgeStyle(s.stato)}>{s.stato}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeSubTab === 'storico' && (
        <div>
          <h4 style={{ margin: '0 0 16px 0', fontSize: '14px', color: '#0078d4' }}>
            Inserimento Nuova Finestra Normativa di Validità Coefficienti
          </h4>
          <form
            onSubmit={handleAggiungiNuovaVersioneSoglia}
            style={{
              backgroundColor: '#faf9f8',
              padding: '20px',
              borderRadius: '6px',
              border: '1px solid #edebe9',
            }}
          >
            <div style={styles.grid}>
              <div style={styles.formGroup}>
                <label style={styles.label}>Codice Indice Target</label>
                <select
                  style={styles.input}
                  value={nuovaSoglia.codiceIndice}
                  onChange={(e) => setNuovaSoglia({ ...nuovaSoglia, codiceIndice: e.target.value })}
                >
                  <option value="">-- Seleziona Indice Ministeriale --</option>
                  <option value="IND-01">IND-01 - DSCR 6 Mesi</option>
                  <option value="IND-02">IND-02 - Patrimonio Netto</option>
                  <option value="IND-03">IND-03 - Oneri Finanziari / Ricavi</option>
                  <option value="IND-05">IND-05 - Cash Flow / Attivo</option>
                </select>
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>Descrizione Estesa Variante</label>
                <input
                  type="text"
                  style={styles.input}
                  value={nuovaSoglia.denominazione}
                  onChange={(e) =>
                    setNuovaSoglia({ ...nuovaSoglia, denominazione: e.target.value })
                  }
                  placeholder="Es. Nuova revisione"
                />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>Operatore di Allerta</label>
                <select
                  style={styles.input}
                  value={nuovaSoglia.operatoreLogico}
                  onChange={(e) =>
                    setNuovaSoglia({ ...nuovaSoglia, operatoreLogico: e.target.value as any })
                  }
                >
                  <option value=">">&gt; (Superiore)</option>
                  <option value="<">&lt; (Inferiore)</option>
                  <option value=">=">&gt;= (Maggiore o uguale)</option>
                  <option value="<=">&lt;= (Minore o uguale)</option>
                </select>
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>Valore Limite Matematico</label>
                <input
                  type="number"
                  step="0.01"
                  style={styles.input}
                  value={nuovaSoglia.valoreLimite}
                  onChange={(e) =>
                    setNuovaSoglia({
                      ...nuovaSoglia,
                      valoreLimite: parseFloat(e.target.value) || 0,
                    })
                  }
                />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>Inizio Validità Legislativa (Valido Da)</label>
                <input
                  type="date"
                  style={styles.input}
                  value={nuovaSoglia.validoDa}
                  onChange={(e) => setNuovaSoglia({ ...nuovaSoglia, validoDa: e.target.value })}
                />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>Fine Validità Legislativa (Valido A)</label>
                <input
                  type="date"
                  style={styles.input}
                  value={nuovaSoglia.validoA}
                  onChange={(e) => setNuovaSoglia({ ...nuovaSoglia, validoA: e.target.value })}
                />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="submit" style={styles.btnPrimary}>
                📥 Consolida Finestra Temporale nel DB
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
