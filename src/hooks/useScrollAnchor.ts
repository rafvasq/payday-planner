import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * Keeps a scroll container pinned to the bottom sentinel while the user is at the bottom,
 * including across container/content resize reflows (window resize, ribbon toggle, etc.).
 */
export function useScrollAnchor(
  scrollRef: React.RefObject<HTMLElement | null>,
  messagesEndRef: React.RefObject<HTMLElement | null>,
  dependencies: unknown[]
) {
  const [isAtBottom, setIsAtBottom] = useState(true);
  const isAtBottomRef = useRef(true);

  useEffect(() => {
    isAtBottomRef.current = isAtBottom;
  }, [isAtBottom]);

  // Track whether the bottom sentinel is visible
  useEffect(() => {
    const scrollEl = scrollRef.current;
    const sentinelEl = messagesEndRef.current;
    if (!scrollEl || !sentinelEl) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsAtBottom(entry.isIntersecting);
        isAtBottomRef.current = entry.isIntersecting;
      },
      { root: scrollEl, threshold: 0.05 }
    );
    observer.observe(sentinelEl);
    return () => observer.disconnect();
  }, [scrollRef, messagesEndRef]);

  // Re-anchor on container reflow
  useEffect(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl || typeof ResizeObserver === 'undefined') return;

    const ro = new ResizeObserver(() => {
      if (isAtBottomRef.current) {
        messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
      }
    });
    ro.observe(scrollEl);
    return () => ro.disconnect();
  }, [scrollRef, messagesEndRef]);

  // Auto-scroll when messages/streaming change
  useEffect(() => {
    if (isAtBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
    }
  }, dependencies); // eslint-disable-line react-hooks/exhaustive-deps

  const scrollToBottom = useCallback(
    (smooth = true) => {
      messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
    },
    [messagesEndRef]
  );

  return { isAtBottom, scrollToBottom };
}
