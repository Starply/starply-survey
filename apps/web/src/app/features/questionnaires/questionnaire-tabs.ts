import { Component, computed, inject, input } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import type { TabValue, TabsListItem } from '@tdesign-ng/components';
import { TTabs } from '@tdesign-ng/components';
import { filter, map } from 'rxjs/operators';

type SurveyTabValue = 'design' | 'stats' | 'collect' | 'responses';

/**
 * 单份问卷的上下文页签，使用 TDesign Tabs 的数据驱动模式承担导航。
 * 设计页是现有入口，只有精确匹配才高亮。
 */
@Component({
  selector: 'app-questionnaire-tabs',
  imports: [TTabs],
  templateUrl: './questionnaire-tabs.html',
  styleUrl: './questionnaire-tabs.less',
})
export class QuestionnaireTabs {
  private readonly router = inject(Router);

  readonly tenantSlug = input.required<string>();
  readonly questionnaireId = input.required<string>();

  protected readonly tabs: TabsListItem[] = [
    { value: 'design', label: '问卷设计' },
    { value: 'stats', label: '数据统计' },
    { value: 'collect', label: '答卷收集' },
    { value: 'responses', label: '原始数据' },
  ];

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  protected readonly activeTab = computed<SurveyTabValue>(() => {
    const path = this.url().split('?')[0]?.split('#')[0] ?? '';
    const base = `/t/${this.tenantSlug()}/questionnaires/${this.questionnaireId()}`;
    if (path === base) {
      return 'design';
    }
    for (const value of ['stats', 'collect', 'responses'] as const) {
      if (path === `${base}/${value}`) {
        return value;
      }
    }
    return 'design';
  });

  protected onTabChange(value: TabValue): void {
    const target = value === 'design' ? [] : [String(value)];
    void this.router.navigate([
      '/t',
      this.tenantSlug(),
      'questionnaires',
      this.questionnaireId(),
      ...target,
    ]);
  }
}
