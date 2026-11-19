import { act, fireEvent, screen } from '@testing-library/react-native';

import { renderThemed, SCHEMES } from '../../../test/render';
import { SEARCH_DEBOUNCE_MS, SearchBar } from '../SearchBar';

describe.each(SCHEMES)('SearchBar (%s)', (scheme) => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('debounces onSearch and trims the query', async () => {
    const onSearch = jest.fn();
    const onChangeText = jest.fn();
    await renderThemed(
      <SearchBar
        placeholder="Search exercises"
        accessibilityLabel="Search exercises"
        onSearch={onSearch}
        onChangeText={onChangeText}
        testID="s"
      />,
      scheme,
    );
    const input = screen.getByLabelText('Search exercises');
    await fireEvent.changeText(input, 'be');
    await fireEvent.changeText(input, 'bench ');
    expect(onChangeText).toHaveBeenLastCalledWith('bench ');
    expect(onSearch).not.toHaveBeenCalled();
    await act(() => jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS));
    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onSearch).toHaveBeenCalledWith('bench');
  });

  it('search key flushes; clear fires immediately and cancels the pending query', async () => {
    const onSearch = jest.fn();
    await renderThemed(
      <SearchBar placeholder="Food" accessibilityLabel="Search food" onSearch={onSearch} />,
      scheme,
    );
    const input = screen.getByLabelText('Search food');
    await fireEvent.changeText(input, 'oats');
    await fireEvent(input, 'submitEditing');
    expect(onSearch).toHaveBeenLastCalledWith('oats');
    await fireEvent.changeText(input, 'oatm');
    await fireEvent.press(screen.getByRole('button', { name: 'Clear search' }));
    expect(onSearch).toHaveBeenLastCalledWith('');
    await act(() => jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS * 2));
    expect(onSearch).toHaveBeenLastCalledWith('');
    expect(screen.queryByRole('button', { name: 'Clear search' })).toBeNull();
  });

  it('filter button speaks the active count', async () => {
    const onOpenFilters = jest.fn();
    await renderThemed(
      <SearchBar
        placeholder="Search"
        accessibilityLabel="Search exercises"
        value=""
        onOpenFilters={onOpenFilters}
        filterCount={2}
      />,
      scheme,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Filters, 2 on' }));
    expect(onOpenFilters).toHaveBeenCalled();
    expect(screen.getByText('2')).toBeTruthy();
  });
});
