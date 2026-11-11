import { describe, expect, it } from 'vitest';
import { chiaveTentativiPin, identitaKeyDaSessione, pinBenFormato } from '@/lib/mfa/pinIdentita';

describe('pinBenFormato', () => {
  it('accetta da 4 a 6 cifre, con spazi ai bordi', () => {
    expect(pinBenFormato('1234')).toBe(true);
    expect(pinBenFormato('123456')).toBe(true);
    expect(pinBenFormato(' 123456 ')).toBe(true);
  });

  it('rifiuta tutto il resto', () => {
    expect(pinBenFormato('123')).toBe(false);
    expect(pinBenFormato('1234567')).toBe(false);
    expect(pinBenFormato('12a456')).toBe(false);
    expect(pinBenFormato('')).toBe(false);
  });
});

describe('identitaKeyDaSessione', () => {
  it('usa le stesse chiavi del login', () => {
    expect(identitaKeyDaSessione({ ruolo: 'SUPERADMIN', username: 'root' })).toBe('SUPER:root');
    expect(identitaKeyDaSessione({ ruolo: 'USER', username: 'anna' })).toBe('USER:anna');
  });

  it('senza username non inventa un’identità', () => {
    expect(identitaKeyDaSessione({ ruolo: 'USER', username: null })).toBeNull();
    expect(identitaKeyDaSessione({ ruolo: 'USER', username: '   ' })).toBeNull();
  });
});

describe('chiaveTentativiPin', () => {
  it('non collide con quella dell’accesso', () => {
    expect(chiaveTentativiPin('USER:anna')).toBe('PIN_SCENARIO:USER:anna');
    expect(chiaveTentativiPin('USER:anna')).not.toBe('USER:anna');
  });
});
