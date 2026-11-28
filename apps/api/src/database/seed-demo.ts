import 'reflect-metadata';

import { hash } from '@node-rs/argon2';
import type { TenantRole } from '@starply/contracts';
import { checkTenantSlug } from '@starply/tenancy-core';

import { readDefaultAccountConfig, type DefaultAccountConfig } from '../config/configuration';
import { createAppDataSource } from './data-source';
import { Membership, Tenant, User } from './entities';

/**
 * 开发环境演示数据。
 * 目前没有注册/建租户接口，本地联调用它写入一个 owner 账号；
 * 幂等执行：按 slug/email 查找，存在则更新角色、状态与密码哈希。
 * 账号信息来自集中的默认账号配置（DEFAULT_ACCOUNT_*，兼容旧版 DEMO_*），
 * 未配置时使用内置开发默认值，脚本内不保存生产凭据。
 * 运行方式：pnpm db:seed:demo（读取 .env）。
 */
export type DemoSeedConfig = DefaultAccountConfig;

export function readDemoSeedConfig(env: NodeJS.ProcessEnv = process.env): DemoSeedConfig {
  const account = readDefaultAccountConfig(env);

  const slug = checkTenantSlug(account.tenantSlug);
  if (!slug.ok) {
    throw new Error(
      `默认账号租户 slug 不合法（${slug.issue}），需为 3-63 位小写字母、数字或连字符`,
    );
  }

  const email = account.email.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('默认账号邮箱不合法，请检查 DEFAULT_ACCOUNT_EMAIL / DEMO_EMAIL');
  }

  if (account.password.length === 0) {
    throw new Error('默认账号密码不能为空，请检查 DEFAULT_ACCOUNT_PASSWORD / DEMO_PASSWORD');
  }

  return { ...account, tenantSlug: slug.slug, email };
}

export async function seedDemoData(
  config: DemoSeedConfig = readDemoSeedConfig(),
): Promise<{ tenantId: string; userId: string }> {
  const dataSource = createAppDataSource();
  await dataSource.initialize();

  try {
    const tenants = dataSource.getRepository(Tenant);
    let tenant = await tenants.findOne({ where: { slug: config.tenantSlug } });
    if (tenant) {
      tenant.name = config.tenantName;
      tenant.status = 'active';
      tenant = await tenants.save(tenant);
    } else {
      tenant = await tenants.save(
        tenants.create({
          slug: config.tenantSlug,
          name: config.tenantName,
          status: 'active',
          defaultLanguage: 'zh-CN',
          defaultTimeZone: 'Asia/Shanghai',
        }),
      );
    }

    const users = dataSource.getRepository(User);
    const passwordHash = await hash(config.password);
    let user = await users.findOne({ where: { email: config.email } });
    if (user) {
      user.passwordHash = passwordHash;
      user.displayName = config.displayName;
      user.status = 'active';
      user = await users.save(user);
    } else {
      user = await users.save(
        users.create({
          email: config.email,
          passwordHash,
          displayName: config.displayName,
          status: 'active',
        }),
      );
    }

    const memberships = dataSource.getRepository(Membership);
    const role: TenantRole = 'owner';
    let membership = await memberships.findOne({
      where: { tenantId: tenant.id, userId: user.id },
    });
    if (membership) {
      membership.role = role;
      membership.status = 'active';
      membership = await memberships.save(membership);
    } else {
      membership = await memberships.save(
        memberships.create({
          tenantId: tenant.id,
          userId: user.id,
          role,
          status: 'active',
        }),
      );
    }

    return { tenantId: tenant.id, userId: user.id };
  } finally {
    await dataSource.destroy();
  }
}

seedDemoData()
  .then(({ tenantId, userId }) => {
    const config = readDemoSeedConfig();
    console.log('演示数据已就绪：');
    console.log(`  租户 slug: ${config.tenantSlug}（${tenantId}）`);
    console.log(`  登录邮箱: ${config.email}（${userId}）`);
    console.log('  密码来自 DEFAULT_ACCOUNT_PASSWORD / DEMO_PASSWORD（未配置时为开发默认值）');
  })
  .catch((error: unknown) => {
    console.error('演示数据写入失败', error);
    process.exitCode = 1;
  });
