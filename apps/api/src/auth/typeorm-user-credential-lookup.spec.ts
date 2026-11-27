import { describe, expect, it, vi } from 'vitest';

import type { DatabaseService } from '../database/database.service';
import { TypeormUserCredentialLookup } from './typeorm-user-credential-lookup';

const userRow = {
  id: 'user-1',
  email: 'admin@example.com',
  passwordHash: '$argon2id$v=19$m=19456,t=2,p=1$hash',
  status: 'active',
};

function createLookup(row: unknown): {
  lookup: TypeormUserCredentialLookup;
  findOne: ReturnType<typeof vi.fn>;
} {
  const findOne = vi.fn(async () => row);
  const getRepository = vi.fn(() => ({ findOne }));
  const database = {
    getDataSource: () => ({ getRepository }),
  } as unknown as DatabaseService;

  return { lookup: new TypeormUserCredentialLookup(database), findOne };
}

describe('TypeormUserCredentialLookup', () => {
  it('命中用户时映射为认证凭据', async () => {
    const { lookup, findOne } = createLookup(userRow);

    await expect(lookup.findByEmail('admin@example.com')).resolves.toEqual({
      id: 'user-1',
      email: 'admin@example.com',
      passwordHash: userRow.passwordHash,
      status: 'active',
    });
    expect(findOne).toHaveBeenCalledWith({
      where: { email: 'admin@example.com' },
      select: { id: true, email: true, passwordHash: true, status: true },
    });
  });

  it('未命中时返回 null', async () => {
    const { lookup } = createLookup(null);

    await expect(lookup.findByEmail('nobody@example.com')).resolves.toBeNull();
  });
});
