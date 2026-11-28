import { Component, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

/**
 * 单份问卷的上下文页签。
 * 设计页是现有入口，用 exact 匹配避免在统计/收集/数据页也高亮设计页。
 */
@Component({
  selector: 'app-questionnaire-tabs',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './questionnaire-tabs.html',
  styleUrl: './questionnaire-tabs.less',
})
export class QuestionnaireTabs {
  readonly tenantSlug = input.required<string>();
  readonly questionnaireId = input.required<string>();
}
