import '@testing-library/jest-dom';
import { beforeEach, vi } from 'vitest';

// Polyfill ResizeObserver
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.ResizeObserver = MockResizeObserver as any;
globalThis.ResizeObserver = MockResizeObserver as any;

// Polyfill IntersectionObserver
class MockIntersectionObserver implements IntersectionObserver {
  readonly root: Element | Document | null = null;
  readonly rootMargin: string = '0px';
  readonly thresholds: ReadonlyArray<number> = [0];
  private callback: IntersectionObserverCallback;

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
  }

  observe(element: Element): void {
    this.callback([{ isIntersecting: true, target: element } as IntersectionObserverEntry], this);
  }

  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}
window.IntersectionObserver = MockIntersectionObserver as any;
globalThis.IntersectionObserver = MockIntersectionObserver as any;

// Polyfill scrollIntoView
if (typeof window !== 'undefined' && window.HTMLElement) {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
}

// Global isolation: clear localStorage before each test
beforeEach(() => {
  localStorage.clear();
});

// Polyfill pointer capture (absent in JSDOM)
if (typeof Element !== 'undefined') {
  Element.prototype.setPointerCapture = Element.prototype.setPointerCapture || vi.fn();
  Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture || vi.fn();
  Element.prototype.hasPointerCapture = Element.prototype.hasPointerCapture || vi.fn(() => false);
}
