import { Injectable } from '@nestjs/common';
import type { AuthUserCredential, UserCredentialLookup } from '@starply/auth-core';

import { DatabaseService } from '../database/database.service';
import { User } from '../database/entities';

/**
 * 登录所需的用户凭据查询。
 * 邮箱在服务层已归一化为小写，且 `user.email` 的排序规则 `utf8mb4_0900_ai_ci`
 * 本身不区分大小写，因此这里按原值等值查询。
 */
@Injectable()
export class TypeormUserCredentialLookup implements UserCredentialLookup {
  constructor(private readonly database: DatabaseService) {}

  async findByEmail(email: string): Promise<AuthUserCredential | null> {
    const repository = this.database.getDataSource().getRepository(User);
    const user = await repository.findOne({
      where: { email },
      select: { id: true, email: true, passwordHash: true, status: true },
    });

    if (!user) {
      return null;
    }

    return {
      id: user.id,
      email: user.email,
      passwordHash: user.passwordHash,
      status: user.status,
    };
  }
}
