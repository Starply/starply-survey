import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthSessionService } from '@starply/auth-core';

import { AccessTokenGuard } from './access-token.guard';
import { readAccessTokenSecret } from './access-token-secret';
import { Argon2PasswordVerifier } from './argon2-password-verifier';
import { AuthController } from './auth.controller';
import { AuthRedisSessionStore } from './redis-session-store';
import { TypeormUserCredentialLookup } from './typeorm-user-credential-lookup';

/**
 * 认证模块：登录/刷新/登出与 Bearer 校验。
 * 会话 TTL 使用 @starply/auth-core 的默认策略（访问令牌 15 分钟、空闲 7 天、绝对 30 天）。
 */
@Module({
  controllers: [AuthController],
  providers: [
    Argon2PasswordVerifier,
    TypeormUserCredentialLookup,
    AuthRedisSessionStore,
    AccessTokenGuard,
    {
      provide: AuthSessionService,
      inject: [
        TypeormUserCredentialLookup,
        Argon2PasswordVerifier,
        AuthRedisSessionStore,
        ConfigService,
      ],
      useFactory: (
        users: TypeormUserCredentialLookup,
        passwords: Argon2PasswordVerifier,
        sessions: AuthRedisSessionStore,
        config: ConfigService,
      ): AuthSessionService =>
        new AuthSessionService(users, passwords, sessions, {
          accessTokenSecret: readAccessTokenSecret(config),
        }),
    },
  ],
  exports: [AuthSessionService, AccessTokenGuard],
})
export class AuthModule {}
