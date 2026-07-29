import { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

interface VirtualizedListProps<T> {
  items: T[];
  height?: number | string;
  estimateSize?: number;
  overscan?: number;
  renderItem: (item: T, index: number) => React.ReactNode;
  emptyMessage?: string;
}

/**
 * High-Performance Virtualized List Wrapper powered by @tanstack/react-virtual:
 * Renders only visible items in DOM, handling thousands of records smoothly at 60fps.
 */
export function VirtualizedList<T>({
  items,
  height = '500px',
  estimateSize = 64,
  overscan = 5,
  renderItem,
  emptyMessage = 'No items found.',
}: VirtualizedListProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan,
  });

  if (items.length === 0) {
    return (
      <div className="p-8 text-center text-sm text-gray-500 dark:text-gray-400 bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div
      ref={parentRef}
      style={{ height, overflowY: 'auto' }}
      className="w-full bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 shadow-sm relative"
    >
      <div
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const item = items[virtualRow.index];
          return (
            <div
              key={virtualRow.key}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
              className="border-b border-gray-100 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors"
            >
              {renderItem(item, virtualRow.index)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
