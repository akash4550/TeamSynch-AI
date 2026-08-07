import { render } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { FilterPanel } from '../FilterPanel';

/*
 * Bug #67 regression coverage: FilterPanel must normalize the date-range
 * picker's `to` (local midnight of the end day) to END-of-day
 * (23:59:59.999 local) before handing it to dashboards, which serialize it
 * to the API's `createdAt.lte`. Pre-fix, the entire selected end day was
 * silently excluded — and a same-day selection spanned zero seconds.
 */

let capturedOnValueChange: ((value: { from?: Date; to?: Date }) => void) | null = null;

vi.mock('@tremor/react', () => ({
  Card: ({ children }: any) => <div>{children}</div>,
  Select: ({ children }: any) => <div>{children}</div>,
  SelectItem: ({ children }: any) => <div>{children}</div>,
  DateRangePicker: ({ onValueChange }: any) => {
    capturedOnValueChange = onValueChange;
    return <div data-testid="date-range-picker" />;
  },
}));

describe('FilterPanel date-range normalization', () => {
  test('extends `to` to end-of-day so the selected end day is included', () => {
    const onDateChange = vi.fn();
    render(<FilterPanel onDateChange={onDateChange} />);

    expect(capturedOnValueChange).toBeTypeOf('function');

    // What Tremor emits for picking "Aug 4 2026 → Aug 4 2026": both at local midnight.
    const picked = new Date(2026, 7, 4, 0, 0, 0, 0);
    capturedOnValueChange!({ from: new Date(picked), to: new Date(picked) });

    expect(onDateChange).toHaveBeenCalledTimes(1);
    const { from, to } = onDateChange.mock.calls[0][0];

    // `from` stays at start-of-day (inclusive lower bound)…
    expect(from.getFullYear()).toBe(2026);
    expect(from.getMonth()).toBe(7);
    expect(from.getDate()).toBe(4);
    expect(from.getHours()).toBe(0);
    expect(from.getMinutes()).toBe(0);

    // …while `to` covers the whole end day in the user's timezone.
    expect(to.getFullYear()).toBe(2026);
    expect(to.getMonth()).toBe(7);
    expect(to.getDate()).toBe(4);
    expect(to.getHours()).toBe(23);
    expect(to.getMinutes()).toBe(59);
    expect(to.getSeconds()).toBe(59);
    expect(to.getMilliseconds()).toBe(999);

    // The/API window must therefore contain midday-of-the-end-day records.
    const middayOfEndDay = new Date(2026, 7, 4, 12, 0, 0, 0);
    expect(middayOfEndDay.getTime() <= to.getTime()).toBe(true);
    expect(middayOfEndDay.getTime() >= from.getTime()).toBe(true);
  });

  test('passes through an open range (no `to`) unchanged', () => {
    const onDateChange = vi.fn();
    render(<FilterPanel onDateChange={onDateChange} />);

    const from = new Date(2026, 7, 1, 0, 0, 0, 0);
    capturedOnValueChange!({ from, to: undefined });

    const payload = onDateChange.mock.calls[0][0];
    expect(payload.from).toBe(from);
    expect(payload.to).toBeUndefined();
  });
});
