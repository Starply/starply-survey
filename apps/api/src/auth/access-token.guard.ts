import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { verifyAccessToken, type AccessTokenClaims } from '@starply/auth-core';
import type { Request } from 'express';

import { readAccessTokenSecret } from './access-token-secret';

/** 通过 Bearer 校验后写入请求的访问令牌声明。 */
export interface AuthenticatedRequest extends Request {
  auth?: AccessTokenClaims;
}

/**
 * 访问令牌守卫：只校验签名与过期时间，不查会话。
 * 主动登出后访问令牌最长残留一个 TTL（15 分钟），需要立即失效的接口应另外校验会话。
 */
@Injectable()
export class AccessTokenGuard implements CanActivate {
  private readonly secret: string;

  constructor(config: ConfigService) {
    this.secret = readAccessTokenSecret(config);
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = readBearerToken(request.headers.authorization);
    if (!token) {
      throw new UnauthorizedException({ code: 'unauthorized', message: '缺少访问令牌' });
    }

    const verification = verifyAccessToken(token, this.secret, new Date());
    if (!verification.ok) {
      const expired = verification.reason === 'expired';
      throw new UnauthorizedException({
        code: expired ? 'token_expired' : 'unauthorized',
        message: expired ? '访问令牌已过期' : '访问令牌无效',
      });
    }

    request.auth = verification.claims;

    return true;
  }
}

/** 只接受 `Bearer {token}`；其他认证方案（含 Cookie）一律拒绝。 */
function readBearerToken(header: string | undefined): string | null {
  if (!header) {
    return null;
  }

  const parts = header.trim().split(/\s+/);
  if (parts.length !== 2) {
    return null;
  }

  const [scheme, token] = parts;
  if (scheme.toLowerCase() !== 'bearer' || token.length === 0) {
    return null;
  }

  return token;
}
