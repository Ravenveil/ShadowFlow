import { test, expect } from '@playwright/test';

declare global {
  interface Window {
    __emitSseEvent?: (type: string, payload: unknown) => void;
  }
}

test.describe('Gap detected modal', () => {
  test('J2 PhD journey can choose C and surface TODO placeholder output', async ({ page }) => {
    await page.addInitScript(() => {
      class MockEventSource {
        static instances: MockEventSource[] = [];
        onopen: ((event: Event) => void) | null = null;
        onerror: ((event: Event) => void) | null = null;
        onmessage: ((event: MessageEvent) => void) | null = null;
        private listeners = new Map<string, Array<(event: MessageEvent) => void>>();

        constructor(_url: string) {
          MockEventSource.instances.push(this);
          window.setTimeout(() => {
            this.onopen?.(new Event('open'));
          }, 0);
        }

        addEventListener(type: string, handler: (event: MessageEvent) => void) {
          const current = this.listeners.get(type) ?? [];
          current.push(handler);
          this.listeners.set(type, current);
        }

        removeEventListener(type: string, handler: (event: MessageEvent) => void) {
          const current = this.listeners.get(type) ?? [];
          this.listeners.set(
            type,
            current.filter((item) => item !== handler),
          );
        }

        close() {
          return undefined;
        }

        emit(type: string, payload: unknown) {
          const event = new MessageEvent(type, { data: JSON.stringify(payload) });
          for (const handler of this.listeners.get(type) ?? []) {
            handler(event);
          }
          if (type === 'message') {
            this.onmessage?.(event);
          }
        }
      }

      Object.defineProperty(window, 'EventSource', {
        configurable: true,
        writable: true,
        value: MockEventSource,
      });

      window.__emitSseEvent = (type: string, payload: unknown) => {
        for (const instance of MockEventSource.instances) {
          instance.emit(type, payload);
        }
      };
    });

    let capturedPayload: Record<string, unknown> | null = null;
    await page.route('**/workflow/runs/run-gap-smoke/gap_response', async (route) => {
      capturedPayload = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ accepted: true }),
      });
    });

    await page.goto('/editor/academic-paper?runId=run-gap-smoke');
    await page.waitForLoadState('domcontentloaded');
    await page.getByRole('button', { name: /run log/i }).click();

    await page.evaluate(() => {
      window.__emitSseEvent?.('agent.gap_detected', {
        type: 'agent.gap_detected',
        run_id: 'run-gap-smoke',
        node_id: 'section-generate',
        gap_type: 'incomplete_log',
        description: '实验日志缺少 baseline 数据。',
        choices: [
          { id: 'A', label: '补充数据', action: 'pause' },
          { id: 'B', label: '移除此对比', action: 'drop' },
          { id: 'C', label: '标记稍后更新', action: 'annotate' },
        ],
      });
    });

    await expect(page.getByTestId('gap-detected-modal')).toBeVisible();
    await expect(page.getByTestId('dashboard-node-section-generate')).toHaveAttribute('data-status', 'waiting_user');

    await page.getByTestId('gap-choice-C').click();

    await expect.poll(() => capturedPayload).not.toBeNull();
    expect(capturedPayload).toEqual({
      node_id: 'section-generate',
      gap_choice: 'C',
    });

    await expect(page.getByTestId('gap-detected-modal')).toBeHidden();
    await expect(page.getByTestId('dashboard-node-section-generate')).toHaveAttribute('data-status', 'running');

    await page.evaluate(() => {
      window.__emitSseEvent?.('node.succeeded', {
        type: 'node.succeeded',
        run_id: 'run-gap-smoke',
        node_id: 'section-generate',
        output_summary: '[TODO: will be updated] baseline comparison pending.',
        content_type: 'text/markdown',
      });
    });

    await expect(page.getByTestId('dashboard-node-section-generate')).toContainText('[TODO: will be updated]');
  });
});
