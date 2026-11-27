import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/** 应用外壳：只负责渲染路由出口，页面按租户路由挂载。 */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.less',
})
export class App {}
