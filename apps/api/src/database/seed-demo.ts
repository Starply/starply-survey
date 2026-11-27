import 'reflect-metadata';

import { hash } from '@node-rs/argon2';
import type { TenantRole } from '@starply/contracts';
import { checkTenantSlug } from '@starply/tenancy-core';

import { createAppDataSource } from './data-source';
import { Membership, Tenant, User } from './entities';

/**
 * 开发环境演示数据。
 * 目前没有注册/建租户接口，本地联调用它写入一个 owner 账号；
 * 幂等执行：按 slug/email 查找，存在则更新角色、状态与密码哈希。
 * 账号信息全部来自环境变量，脚本内不保存任何凭据。
 * 运行方式：pnpm db:seed:demo（读取 .env）。
 */
export interface DemoSeedConfig {
  tenantSlug: string;
  tenantName: string;
  email: string;
  password: string;
  displayName: string;
}

export function readDemoSeedConfig(env: NodeJS.ProcessEnv = process.env): DemoSeedConfig {
  const rawSlug = env['DEMO_TENANT_SLUG']?.trim() ?? '';
  const email = env['DEMO_EMAIL']?.trim() ?? '';
  const password = env['DEMO_PASSWORD'] ?? '';

  const missing: string[] = [];
  if (rawSlug.length === 0) {
    missing.push('DEMO_TENANT_SLUG');
  }
  if (email.length === 0) {
    missing.push('DEMO_EMAIL');
  }
  if (password.length === 0) {
    missing.push('DEMO_PASSWORD');
  }
  if (missing.length > 0) {
    throw new Error(`缺少演示账号环境变量：${missing.join(', ')}（参考 apps/api/.env.example）`);
  }

  const slug = checkTenantSlug(rawSlug);
  if (!slug.ok) {
    throw new Error(`DEMO_TENANT_SLUG 不合法（${slug.issue}），需为 3-63 位小写字母、数字或连字符`);
  }

  return {
    tenantSlug: slug.slug,
    tenantName: env['DEMO_TENANT_NAME']?.trim() || `${slug.slug} 演示租户`,
    email,
    password,
    displayName: env['DEMO_DISPLAY_NAME']?.trim() || '演示管理员',
  };
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
    console.log(`  登录邮箱: ${config.email}（${userId}），密码取自 DEMO_PASSWORD`);
  })
  .catch((error: unknown) => {
    console.error('演示数据写入失败', error);
    process.exitCode = 1;
  });
