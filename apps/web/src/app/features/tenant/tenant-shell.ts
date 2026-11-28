import { Component, inject, signal } from '@angular/core';
import {
  ActivatedRoute,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { TButton, TTag } from '@tdesign-ng/components';

import { AuthService } from '../../core/auth/auth.service';
import { AuthSessionStore } from '../../core/auth/auth-session.store';

/**
 * 租户管理端外壳：顶部菜单 + 下方内容区。
 * 当前用户信息只有 userId/email，角色由服务端按请求判定，前端不做权限猜测。
 */
@Component({
  selector: 'app-tenant-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, TButton, TTag],
  templateUrl: './tenant-shell.html',
  styleUrl: './tenant-shell.less',
})
export class TenantShell {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly store = inject(AuthSessionStore);

  protected readonly tenantSlug = this.route.snapshot.paramMap.get('tenantSlug') ?? '';
  protected readonly email = this.store.email;
  protected readonly loggingOut = signal(false);

  protected async logout(): Promise<void> {
    if (this.loggingOut()) {
      return;
    }

    this.loggingOut.set(true);
    try {
      await this.auth.logout();
    } finally {
      this.loggingOut.set(false);
      await this.router.navigate(['/t', this.tenantSlug, 'login']);
    }
  }
}
