import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  effect,
  input,
  viewChild,
} from '@angular/core';
import type { EChartsOption } from 'echarts';
import type { EChartsType } from 'echarts/core';

/**
 * 轻量 ECharts 容器。
 * ECharts 通过动态 import 按需加载，只在统计页进入时拉取图表代码，避免增大初始包。
 */
@Component({
  selector: 'app-echart',
  template: '<div class="chart" #host></div>',
  styleUrl: './echart.less',
})
export class EChart implements AfterViewInit, OnDestroy {
  readonly option = input.required<EChartsOption>();

  private readonly host = viewChild.required<ElementRef<HTMLDivElement>>('host');
  private chart: EChartsType | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private destroyed = false;

  constructor() {
    effect(() => {
      const option = this.option();
      this.chart?.setOption(option, true);
    });
  }

  async ngAfterViewInit(): Promise<void> {
    const [{ init, use }, { BarChart }, { GridComponent, TooltipComponent }, { CanvasRenderer }] =
      await Promise.all([
        import('echarts/core'),
        import('echarts/charts'),
        import('echarts/components'),
        import('echarts/renderers'),
      ]);

    if (this.destroyed) {
      return;
    }

    use([BarChart, GridComponent, TooltipComponent, CanvasRenderer]);
    const element = this.host().nativeElement;
    this.chart = init(element);
    this.chart.setOption(this.option(), true);

    this.resizeObserver = new ResizeObserver(() => this.chart?.resize());
    this.resizeObserver.observe(element);
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.chart?.dispose();
    this.chart = null;
  }
}
