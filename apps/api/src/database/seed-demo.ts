import 'reflect-metadata';

import { hash } from '@node-rs/argon2';
import type { TenantRole } from '@starply/contracts';

import { createAppDataSource } from './data-source';
import { Membership, Tenant, User } from './entities';

/**
 * 开发环境演示数据。
 * 目前没有注册/建租户接口，本地联调用它写入一个 owner 账号；
 * 幂等执行：按 slug/email 查找，存在则更新角色、状态与密码哈希。
 * 运行方式：pnpm db:seed:demo（读取 .env 中的数据库配置）。
 */
const DEMO_TENANT = { slug: 'acme', name: 'Acme 演示租户' };
const DEMO_USER = {
  email: 'demo@starply.dev',
  password: 'Starply@2026',
  displayName: '演示管理员',
};
const DEMO_ROLE: TenantRole = 'owner';

export async function seedDemoData(): Promise<{ tenantId: string; userId: string }> {
  const dataSource = createAppDataSource();
  await dataSource.initialize();

  try {
    const tenants = dataSource.getRepository(Tenant);
    let tenant = await tenants.findOne({ where: { slug: DEMO_TENANT.slug } });
    if (tenant) {
      tenant.name = DEMO_TENANT.name;
      tenant.status = 'active';
      tenant = await tenants.save(tenant);
    } else {
      tenant = await tenants.save(
        tenants.create({
          slug: DEMO_TENANT.slug,
          name: DEMO_TENANT.name,
          status: 'active',
          defaultLanguage: 'zh-CN',
          defaultTimeZone: 'Asia/Shanghai',
        }),
      );
    }

    const users = dataSource.getRepository(User);
    const passwordHash = await hash(DEMO_USER.password);
    let user = await users.findOne({ where: { email: DEMO_USER.email } });
    if (user) {
      user.passwordHash = passwordHash;
      user.displayName = DEMO_USER.displayName;
      user.status = 'active';
      user = await users.save(user);
    } else {
      user = await users.save(
        users.create({
          email: DEMO_USER.email,
          passwordHash,
          displayName: DEMO_USER.displayName,
          status: 'active',
        }),
      );
    }

    const memberships = dataSource.getRepository(Membership);
    let membership = await memberships.findOne({
      where: { tenantId: tenant.id, userId: user.id },
    });
    if (membership) {
      membership.role = DEMO_ROLE;
      membership.status = 'active';
      membership = await memberships.save(membership);
    } else {
      membership = await memberships.save(
        memberships.create({
          tenantId: tenant.id,
          userId: user.id,
          role: DEMO_ROLE,
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
    console.log('演示数据已就绪：');
    console.log(`  租户 slug: ${DEMO_TENANT.slug}（${tenantId}）`);
    console.log(`  登录邮箱: ${DEMO_USER.email} / 密码: ${DEMO_USER.password}（${userId}）`);
  })
  .catch((error: unknown) => {
    console.error('演示数据写入失败', error);
    process.exitCode = 1;
  });
