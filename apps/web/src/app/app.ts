import { Component, signal } from '@angular/core';
import { TButton, TInput } from '@tdesign-ng/components';
import { TIcon } from '@tdesign-ng/icons';

@Component({
  selector: 'app-root',
  imports: [TButton, TInput, TIcon],
  templateUrl: './app.html',
  styleUrl: './app.less',
})
export class App {
  protected readonly name = signal('');
  protected readonly count = signal(0);

  protected readonly displayName = () => this.name().trim() || '访客';

  protected onNameChange(value: string | number): void {
    this.name.set(String(value));
  }

  protected increment(): void {
    this.count.update((value) => value + 1);
  }
}
