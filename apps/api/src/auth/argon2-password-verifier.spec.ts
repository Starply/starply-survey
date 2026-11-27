import { hashSync } from '@node-rs/argon2';
import { describe, expect, it } from 'vitest';

import { Argon2PasswordVerifier } from './argon2-password-verifier';

describe('Argon2PasswordVerifier', () => {
  const verifier = new Argon2PasswordVerifier();
  const password = 's3cret-password';
  const passwordHash = hashSync(password);

  it('默认算法为 Argon2id', () => {
    expect(passwordHash.startsWith('$argon2id$')).toBe(true);
  });

  it('密码正确时返回 true', async () => {
    await expect(verifier.verify(passwordHash, password)).resolves.toBe(true);
  });

  it('密码错误时返回 false', async () => {
    await expect(verifier.verify(passwordHash, 'another-password')).resolves.toBe(false);
  });

  it('哈希为空或格式非法时按校验失败处理', async () => {
    await expect(verifier.verify('', password)).resolves.toBe(false);
    await expect(verifier.verify('not-a-phc-hash', password)).resolves.toBe(false);
  });
});
