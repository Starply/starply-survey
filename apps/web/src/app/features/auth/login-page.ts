import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { checkTenantSlug, normalizeTenantSlug } from '@starply/tenancy-core';
import { TButton, TInput } from '@tdesign-ng/components';

import { describeApiError } from '../../core/api/api-error';
import { AuthService } from '../../core/auth/auth.service';
import { environment } from '../../../environments/environment';

/**
 * 登录页。
 * 同时服务 `/login`（手填租户标识）与 `/t/{slug}/login`（租户从路由带入）。
 * 登录成功后回到 returnUrl，或直接进入该租户的问卷列表。
 */
@Component({
  selector: 'app-login-page',
  imports: [TButton, TInput],
  templateUrl: './login-page.html',
  styleUrl: './login-page.less',
})
export class LoginPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);

  /** 仅开发构建带出默认账号；生产包中 defaultAccount 为 null。 */
  private readonly defaultAccount = environment.production ? null : environment.defaultAccount;

  protected readonly tenantSlug = signal(
    this.initialTenantSlug() || this.defaultAccount?.tenantSlug || '',
  );
  protected readonly email = signal(this.defaultAccount?.email ?? '');
  protected readonly password = signal(this.defaultAccount?.password ?? '');
  protected readonly usingDevAccount = this.defaultAccount !== null;
  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);

  protected onTenantSlugChange(value: string | number): void {
    this.tenantSlug.set(String(value));
  }

  protected onEmailChange(value: string | number): void {
    this.email.set(String(value));
  }

  protected onPasswordChange(value: string | number): void {
    this.password.set(String(value));
  }

  protected async submit(): Promise<void> {
    if (this.submitting()) {
      return;
    }

    this.error.set(null);
    const slug = checkTenantSlug(this.tenantSlug());
    if (!slug.ok) {
      this.error.set('租户标识需为 3-63 位小写字母、数字或连字符');
      return;
    }
    if (this.email().trim().length === 0 || this.password().length === 0) {
      this.error.set('请输入邮箱与密码');
      return;
    }

    this.submitting.set(true);
    try {
      await this.auth.login(this.email().trim(), this.password());
      await this.router.navigateByUrl(this.redirectTarget(slug.slug));
    } catch (error) {
      this.error.set(describeApiError(error));
    } finally {
      this.submitting.set(false);
    }
  }

  /** returnUrl 只接受租户内路径，避免登录后跳出应用或回到登录页。 */
  private redirectTarget(tenantSlug: string): string {
    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
    if (returnUrl && returnUrl.startsWith(`/t/${tenantSlug}`)) {
      return returnUrl;
    }

    return `/t/${tenantSlug}/questionnaires`;
  }

  private initialTenantSlug(): string {
    const fromRoute = this.route.snapshot.paramMap.get('tenantSlug');
    const fromQuery = this.route.snapshot.queryParamMap.get('tenant');

    return normalizeTenantSlug(fromRoute ?? fromQuery ?? '');
  }
}
