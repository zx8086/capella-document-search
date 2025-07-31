import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import SuggestedQueries from './SuggestedQueries.svelte';

describe('SuggestedQueries', () => {
  it('renders all four suggested queries', () => {
    const onQuerySelect = vi.fn();
    const { getByText } = render(SuggestedQueries, {
      props: { onQuerySelect }
    });

    expect(getByText('How does Tommy Hilfiger use Couchbase?')).toBeTruthy();
    expect(getByText('Why would Developers use Couchbase?')).toBeTruthy();
    expect(getByText('Are all my nodes healthy?')).toBeTruthy();
    expect(getByText('Do I have long running queries?')).toBeTruthy();
  });

  it('shows extended thinking icon only on developer query', () => {
    const onQuerySelect = vi.fn();
    const { container } = render(SuggestedQueries, {
      props: { onQuerySelect }
    });

    const sparkleIcons = container.querySelectorAll('svg path[d*="M9.813 15.904"]');
    expect(sparkleIcons).toHaveLength(1);
  });

  it('calls onQuerySelect with correct parameters when query is clicked', async () => {
    const onQuerySelect = vi.fn();
    const { getByText } = render(SuggestedQueries, {
      props: { onQuerySelect }
    });

    const devQuery = getByText('Why would Developers use Couchbase?');
    await fireEvent.click(devQuery.closest('button')!);

    expect(onQuerySelect).toHaveBeenCalledWith(
      'Why would Developers use Couchbase?',
      true
    );
  });

  it('calls onQuerySelect without extended thinking for other queries', async () => {
    const onQuerySelect = vi.fn();
    const { getByText } = render(SuggestedQueries, {
      props: { onQuerySelect }
    });

    const nodeQuery = getByText('Are all my nodes healthy?');
    await fireEvent.click(nodeQuery.closest('button')!);

    expect(onQuerySelect).toHaveBeenCalledWith(
      'Are all my nodes healthy?',
      false
    );
  });
});