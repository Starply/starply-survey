import { ConfigService } from '@nestjs/config';

import type { AuthConfig } from '../config/configuration';

/**
 * 读取访问令牌签名密钥。
 * 缺失时直接抛错：宁可启动失败，也不要签发无法校验的令牌。
 */
export function readAccessTokenSecret(config: ConfigService): string {
  const secret = config.getOrThrow<AuthConfig>('auth').accessTokenSecret;
  if (!secret) {
    throw new Error('AUTH_ACCESS_TOKEN_SECRET 未配置：认证模块无法签发或校验访问令牌');
  }

  return secret;
}
