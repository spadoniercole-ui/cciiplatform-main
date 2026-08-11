'use client';

import { useState, useEffect } from 'react';

export const dynamic = 'force-dynamic';

interface DatiPrincipali {
  cognomeRagioneSociale: string;
  nome: string;
  codiceFiscale: string;
  citta: string;
  indirizzo: string;
  cap: string;
  flagSedeLegale: boolean;
}

interface ParametriLicenza {
  maxSpazi: number;
  maxAziende: number;
  maxUtenti: number;
  dataAttivazione: string;
  dataScadenza: string;
  sospendiFinoAl: string;
  flagDisattiva: boolean;
}

export default function LicenseManager() {
  const [activeTab, setActiveTab] = useState<'principale' | 'parametri' | 'codice'>('principale');
  const [isEditable, setIsEditable] = useState<boolean>(true);
  const [codiceLicenzaGenerato, setCodiceLicenzaGenerato] = useState<string>('');
  const [mostraReportStampa, setMostraReportStampa] = useState<boolean>(false);

  const [principali, setPrincipali] = useState<DatiPrincipali>({
    cognomeRagioneSociale: '',
    nome: '',
    codiceFiscale: '',
    citta: '',
    indirizzo: '',
    cap: '',
    flagSedeLegale: false,
  });

  const [parametri, setParametri] = useState<ParametriLicenza>({
    maxSpazi: 3,
    maxAziende: 5,
    maxUtenti: 10,
    dataAttivazione: new Date().toISOString().split('T')[0],
    dataScadenza: '2027-05-31',
    sospendiFinoAl: '',
    flagDisattiva: false,
  });

  const handleInputChangePrincipali = (field: keyof DatiPrincipali, value: any) => {
    if (!isEditable) return;
    setPrincipali((prev) => ({ ...prev, [field]: value }));
  };

  const handleInputChangeParametri = (field: keyof ParametriLicenza, value: any) => {
    if (!isEditable) return;
    setParametri((prev) => ({ ...prev, [field]: value }));
  };

  const eseguiGenerazioneLicenza = () => {
    if (!principali.cognomeRagioneSociale || !principali.codiceFiscale) {
      alert(
        'Impossibile generare la licenza: Cognome/Ragione Sociale e Codice Fiscale sono obbligatori.'
      );
      return;
    }
    const prefisso = principali.cognomeRagioneSociale.substring(0, 3).toUpperCase();
    const cfParziale = principali.codiceFiscale.substring(0, 4).toUpperCase();
    const randomGz = Math.floor(1000 + Math.random() * 9000);
    const codiceFinale = `GZ3-${prefisso}-${cfParziale}-${randomGz}`;

    setCodiceLicenzaGenerato(codiceFinale);
    setIsEditable(false);
  };

  const styles = {
    container: {
      backgroundColor: '#ffffff',
      borderRadius: '8px',
      border: '1px solid #edebe9',
      boxShadow: '0 4px 16px rgba(0, 0, 0, 0.04)',
      padding: '24px',
      maxWidth: '1000px',
      margin: '0 auto',
    },
    tabBar: {
      display: 'flex',
      borderBottom: '1px solid #edebe9',
      marginBottom: '24px',
      gap: '4px',
    },
    grid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(2, 1fr)',
      gap: '20px',
      marginBottom: '20px',
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
      color: '#323130',
      outline: 'none',
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
    checkboxContainer: {
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      padding: '12px',
      backgroundColor: '#faf9f8',
      borderRadius: '4px',
      border: '1px solid #edebe9',
      gridColumn: '1 / -1',
    },
    actionButtonPrimary: {
      backgroundColor: '#0078d4',
      color: '#ffffff',
      border: 'none',
      borderRadius: '4px',
      padding: '12px 24px',
      fontSize: '14px',
      fontWeight: 600,
      cursor: 'pointer',
      boxShadow: '0 2px 4px rgba(0, 120, 212, 0.2)',
    },
    actionButtonSecondary: {
      backgroundColor: '#ffffff',
      color: '#0078d4',
      border: '1px solid #0078d4',
      borderRadius: '4px',
      padding: '12px 24px',
      fontSize: '14px',
      fontWeight: 600,
      cursor: 'pointer',
    },
    summaryBox: {
      backgroundColor: '#f3f2f1',
      border: '1px solid #edebe9',
      borderRadius: '6px',
      padding: '16px',
      marginBottom: '24px',
    },
    reportContainer: {
      marginTop: '24px',
      padding: '24px',
      backgroundColor: '#faf9f8',
      borderLeft: '4px solid #0078d4',
      borderRadius: '4px',
      fontFamily: '"Courier New", Courier, monospace',
      fontSize: '14px',
      lineHeight: '1.6',
      color: '#323130',
      whiteSpace: 'pre-wrap' as const,
    },
  };

  const getTabButtonStyle = (isActive: boolean) => ({
    padding: '12px 20px',
    fontSize: '14px',
    fontWeight: isActive ? 600 : 400,
    color: isActive ? '#0078d4' : '#605e5c',
    backgroundColor: isActive ? '#ffffff' : 'transparent',
    border: 'none',
    borderBottom: isActive ? '3px solid #0078d4' : '3px solid transparent',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  });

  return (
    <div style={styles.container}>
      <div style={styles.tabBar}>
        <button
          style={getTabButtonStyle(activeTab === 'principale')}
          onClick={() => setActiveTab('principale')}
        >
          Anagrafica Intestatario
        </button>
        <button
          style={getTabButtonStyle(activeTab === 'parametri')}
          onClick={() => setActiveTab('parametri')}
        >
          Parametri Licenza
        </button>
        <button
          style={getTabButtonStyle(activeTab === 'codice')}
          onClick={() => setActiveTab('codice')}
        >
          Codifica & Report di Stampa
        </button>
      </div>

      {activeTab === 'principale' && (
        <div>
          <div style={styles.grid}>
            <div style={styles.formGroup}>
              <label style={styles.label}>Cognome o Ragione Sociale</label>
              <input
                type="text"
                style={isEditable ? styles.input : styles.inputDisabled}
                disabled={!isEditable}
                value={principali.cognomeRagioneSociale}
                onChange={(e) =>
                  handleInputChangePrincipali('cognomeRagioneSociale', e.target.value)
                }
                placeholder="Es. MOLÌA S.r.l."
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Nome</label>
              <input
                type="text"
                style={isEditable ? styles.input : styles.inputDisabled}
                disabled={!isEditable}
                value={principali.nome}
                onChange={(e) => handleInputChangePrincipali('nome', e.target.value)}
                placeholder="Es. Mario (se applicabile)"
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Codice Fiscale / Partita IVA</label>
              <input
                type="text"
                style={isEditable ? styles.input : styles.inputDisabled}
                disabled={!isEditable}
                value={principali.codiceFiscale}
                onChange={(e) => handleInputChangePrincipali('codiceFiscale', e.target.value)}
                placeholder="Codice Fiscale o P.IVA"
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Città Sede Legale</label>
              <input
                type="text"
                style={isEditable ? styles.input : styles.inputDisabled}
                disabled={!isEditable}
                value={principali.citta}
                onChange={(e) => handleInputChangePrincipali('citta', e.target.value)}
                placeholder="Es. Siracusa"
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Indirizzo</label>
              <input
                type="text"
                style={isEditable ? styles.input : styles.inputDisabled}
                disabled={!isEditable}
                value={principali.indirizzo}
                onChange={(e) => handleInputChangePrincipali('indirizzo', e.target.value)}
                placeholder="Es. Corso Gelone, 12"
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>C.A.P.</label>
              <input
                type="text"
                style={isEditable ? styles.input : styles.inputDisabled}
                disabled={!isEditable}
                value={principali.cap}
                onChange={(e) => handleInputChangePrincipali('cap', e.target.value)}
                placeholder="Es. 96100"
              />
            </div>
            <div style={styles.checkboxContainer}>
              <input
                type="checkbox"
                id="flagSedeLegale"
                disabled={!isEditable}
                checked={principali.flagSedeLegale}
                onChange={(e) => handleInputChangePrincipali('flagSedeLegale', e.target.checked)}
                style={{
                  width: '18px',
                  height: '18px',
                  cursor: isEditable ? 'pointer' : 'not-allowed',
                }}
              />
              <label
                htmlFor="flagSedeLegale"
                style={{ fontSize: '13px', color: '#323130', cursor: 'pointer' }}
              >
                <strong>Attivazione limitata esclusivamente presso Sede Legale</strong>
              </label>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
            {!isEditable && (
              <button style={styles.actionButtonSecondary} onClick={() => setIsEditable(true)}>
                🔓 Abilita Modifica Record
              </button>
            )}
          </div>
        </div>
      )}

      {activeTab === 'parametri' && (
        <div>
          <div style={styles.grid}>
            <div style={styles.formGroup}>
              <label style={styles.label}>Numero Massimo Spazi Attivi</label>
              <input
                type="number"
                style={isEditable ? styles.input : styles.inputDisabled}
                disabled={!isEditable}
                value={parametri.maxSpazi}
                onChange={(e) =>
                  handleInputChangeParametri('maxSpazi', parseInt(e.target.value) || 0)
                }
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Numero Massimo Aziende per Spazio</label>
              <input
                type="number"
                style={isEditable ? styles.input : styles.inputDisabled}
                disabled={!isEditable}
                value={parametri.maxAziende}
                onChange={(e) =>
                  handleInputChangeParametri('maxAziende', parseInt(e.target.value) || 0)
                }
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Numero Massimo Utenti per Spazio</label>
              <input
                type="number"
                style={isEditable ? styles.input : styles.inputDisabled}
                disabled={!isEditable}
                value={parametri.maxUtenti}
                onChange={(e) =>
                  handleInputChangeParametri('maxUtenti', parseInt(e.target.value) || 0)
                }
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Data Attivazione Licenza</label>
              <input
                type="date"
                style={isEditable ? styles.input : styles.inputDisabled}
                disabled={!isEditable}
                value={parametri.dataAttivazione}
                onChange={(e) => handleInputChangeParametri('dataAttivazione', e.target.value)}
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Data Scadenza Licenza</label>
              <input
                type="date"
                style={isEditable ? styles.input : styles.inputDisabled}
                disabled={!isEditable}
                value={parametri.dataScadenza}
                onChange={(e) => handleInputChangeParametri('dataScadenza', e.target.value)}
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Sospendi Licenza Fino Al</label>
              <input
                type="date"
                style={isEditable ? styles.input : styles.inputDisabled}
                disabled={!isEditable}
                value={parametri.sospendiFinoAl}
                onChange={(e) => handleInputChangeParametri('sospendiFinoAl', e.target.value)}
              />
            </div>
            <div style={styles.checkboxContainer}>
              <input
                type="checkbox"
                id="flagDisattiva"
                disabled={!isEditable}
                checked={parametri.flagDisattiva}
                onChange={(e) => handleInputChangeParametri('flagDisattiva', e.target.checked)}
                style={{
                  width: '18px',
                  height: '18px',
                  cursor: isEditable ? 'pointer' : 'not-allowed',
                }}
              />
              <label
                htmlFor="flagDisattiva"
                style={{ fontSize: '13px', color: '#a80000', cursor: 'pointer' }}
              >
                <strong>Disattiva Licenza Totale</strong>
              </label>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'codice' && (
        <div>
          <div style={styles.summaryBox}>
            <h4
              style={{
                margin: '0 0 12px 0',
                fontSize: '14px',
                color: '#0078d4',
                textTransform: 'uppercase',
              }}
            >
              Riepilogo Validazione Strutturale
            </h4>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '12px',
                fontSize: '13px',
                marginBottom: '16px',
              }}
            >
              <div>
                Intestatario: <strong>{principali.cognomeRagioneSociale || 'NON INSERITO'}</strong>
              </div>
              <div>
                Massimo Spazi: <strong>{parametri.maxSpazi}</strong>
              </div>
              <div>
                Utenti per Spazio: <strong>{parametri.maxUtenti}</strong>
              </div>
              <div>
                Codice Identificativo:{' '}
                <strong style={{ color: '#0078d4' }}>
                  {codiceLicenzaGenerato || 'DA GENERARE'}
                </strong>
              </div>
              <div>
                Aziende per Spazio: <strong>{parametri.maxAziende}</strong>
              </div>
              <div>
                Stato:{' '}
                <strong style={{ color: parametri.flagDisattiva ? '#a80000' : '#107c41' }}>
                  {parametri.flagDisattiva ? 'DISATTIVATO' : 'ATTIVO'}
                </strong>
              </div>
            </div>

            <hr style={{ border: 'none', borderTop: '1px solid #edebe9', margin: '12px 0' }} />

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
              <div style={styles.formGroup}>
                <label style={styles.label}>Data Scadenza Licenza</label>
                <input
                  type="date"
                  style={styles.input}
                  value={parametri.dataScadenza}
                  onChange={(e) =>
                    setParametri((prev) => ({ ...prev, dataScadenza: e.target.value }))
                  }
                />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>Stato Licenza</label>
                <select
                  style={styles.input}
                  value={parametri.flagDisattiva ? 'DISATTIVA' : 'ATTIVA'}
                  onChange={(e) =>
                    setParametri((prev) => ({
                      ...prev,
                      flagDisattiva: e.target.value === 'DISATTIVA',
                    }))
                  }
                >
                  <option value="ATTIVA">ATTIVO - Operatività Totale</option>
                  <option value="DISATTIVA">DISATTIVATO - Blocco Accessi</option>
                </select>
              </div>
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              gap: '16px',
              margin: '32px 0',
              flexDirection: 'column',
              alignItems: 'center',
            }}
          >
            <button
              style={{
                ...styles.actionButtonPrimary,
                width: '100%',
                maxWidth: '400px',
                fontSize: '16px',
                padding: '14px',
              }}
              onClick={eseguiGenerazioneLicenza}
            >
              ⚙️ GENERA LICENZA APPLICATIVA
            </button>
            {codiceLicenzaGenerato && (
              <button
                style={{ ...styles.actionButtonSecondary, width: '100%', maxWidth: '400px' }}
                onClick={() => setMostraReportStampa(true)}
              >
                🖨️ STAMPA LICENZA OPERATIVA
              </button>
            )}
          </div>

          {mostraReportStampa && codiceLicenzaGenerato && (
            <div style={styles.reportContainer}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  borderBottom: '1px dashed #a19f9d',
                  paddingBottom: '8px',
                  marginBottom: '12px',
                  fontSize: '11px',
                  color: '#605e5c',
                }}
              >
                <span>GROUND ZERO ERP SYSTEM - REPORT RILASCIO CHIAVE</span>
                <span>DATA EMISSIONE: {new Date().toLocaleDateString('it-IT')}</span>
              </div>
              {`Gentile ${principali.cognomeRagioneSociale} ${principali.nome}, grazie per aver scelto i nostri servizi e le nostre soluzioni software. 

In base agli accordi commerciali sottoscritti la licenza nr. ${codiceLicenzaGenerato} è operativa con scadenza il ${parametri.dataScadenza.split('-').reverse().join('/')} e prevede la possibilità di operare in ${parametri.maxSpazi} spazi operativi all'interno dei quali è possibile attivare ${parametri.maxAziende} aziende e ${parametri.maxUtenti} utenti.

Comunicheremo, subito dopo il setup e la configurazione del sistema, i parametri di accesso per l'amministratore dello spazio al quale è assegnato il compito di configurare lo spazio operativo. Restiamo a disposizione per il supporto necessario all'avviamento e al primo follow up della procedura.

Cordiali saluti`}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
