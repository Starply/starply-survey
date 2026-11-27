import { Injectable } from '@nestjs/common';
import { verify } from '@node-rs/argon2';
import type { PasswordVerifier } from '@starply/auth-core';

/**
 * Argon2id 密码校验。
 * 哈希串由注册流程写入（PHC 格式，参数随哈希自带），此处只做校验，不重算参数。
 */
@Injectable()
export class Argon2PasswordVerifier implements PasswordVerifier {
  async verify(passwordHash: string, plainPassword: string): Promise<boolean> {
    if (!passwordHash) {
      return false;
    }

    try {
      return await verify(passwordHash, plainPassword);
    } catch {
      // 历史数据哈希格式非法时按校验失败处理，避免把 500 与具体原因暴露给登录方。
      return false;
    }
  }
}
