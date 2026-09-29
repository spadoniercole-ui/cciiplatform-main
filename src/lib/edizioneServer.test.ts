import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  cartellaArchivioLocale,
  cartellaBackupServer,
  edizioneServer,
  limiteUploadByte,
  sslDatabase,
} from './edizioneServer';

const env = (v: Record<string, string>) => v as NodeJS.ProcessEnv;

describe('edizioneServer', () => {
  it('attiva solo con EDIZIONE_SERVER=1', () => {
    expect(edizioneServer(env({}))).toBe(false);
    expect(edizioneServer(env({ EDIZIONE_SERVER: '1' }))).toBe(true);
    expect(edizioneServer(env({ EDIZIONE_SERVER: 'true' }))).toBe(false);
  });
});

describe('sslDatabase', () => {
  it('predefinito: TLS senza verifica (comportamento cloud storico)', () => {
    expect(sslDatabase(env({}))).toEqual({ rejectUnauthorized: false });
  });

  it('DATABASE_SSL=0 (e sinonimi) disattiva TLS', () => {
    for (const v of ['0', 'false', 'off', 'disable', ' NO ']) {
      expect(sslDatabase(env({ DATABASE_SSL: v }))).toBe(false);
    }
  });

  it('DATABASE_SSL=verify verifica il certificato', () => {
    expect(sslDatabase(env({ DATABASE_SSL: 'verify' }))).toEqual({ rejectUnauthorized: true });
  });
});

describe('cartellaArchivioLocale', () => {
  it('cloud senza ARCHIVIO_FILE_DIR: Vercel Blob', () => {
    expect(cartellaArchivioLocale(env({}))).toBeNull();
    expect(cartellaArchivioLocale(env({ ARCHIVIO_FILE_DIR: '  ' }))).toBeNull();
  });

  it('portable: cartella blobs dentro i dati, anche se ARCHIVIO_FILE_DIR è impostata', () => {
    expect(
      cartellaArchivioLocale(
        env({ PORTABLE: '1', PORTABLE_DATA_DIR: '/usb/dati', ARCHIVIO_FILE_DIR: '/x' })
      )
    ).toBe(path.join('/usb/dati', 'blobs'));
  });

  it('server: ARCHIVIO_FILE_DIR', () => {
    expect(cartellaArchivioLocale(env({ ARCHIVIO_FILE_DIR: '/srv/ccii/file' }))).toBe(
      path.resolve('/srv/ccii/file')
    );
  });
});

describe('cartellaBackupServer', () => {
  it('cloud: nessuna cartella (Vercel ha un filesystem effimero)', () => {
    expect(cartellaBackupServer(env({}))).toBeNull();
  });

  it('portable: PORTABLE_BACKUP_DIR o <dati>/backup', () => {
    expect(cartellaBackupServer(env({ PORTABLE: '1', PORTABLE_DATA_DIR: '/usb/dati' }))).toBe(
      path.join('/usb/dati', 'backup')
    );
    expect(cartellaBackupServer(env({ PORTABLE: '1', PORTABLE_BACKUP_DIR: '/b' }))).toBe('/b');
  });

  it('server: BACKUP_DIR', () => {
    expect(cartellaBackupServer(env({ BACKUP_DIR: '/backup' }))).toBe(path.resolve('/backup'));
  });
});

describe('limiteUploadByte', () => {
  it('4MB con Vercel Blob, 20MB con archivio su disco', () => {
    expect(limiteUploadByte(env({}))).toBe(4 * 1024 * 1024);
    expect(limiteUploadByte(env({ ARCHIVIO_FILE_DIR: '/srv/file' }))).toBe(20 * 1024 * 1024);
  });
});
