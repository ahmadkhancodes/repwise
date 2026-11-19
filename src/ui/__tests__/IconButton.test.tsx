import { fireEvent, screen } from '@testing-library/react-native';
import { X } from 'lucide-react-native';

import { flat, renderThemed, SCHEMES } from '../../../test/render';
import { IconButton } from '../IconButton';

describe.each(SCHEMES)('IconButton (%s)', (scheme) => {
  it('is a labelled 48×48 button', async () => {
    const onPress = jest.fn();
    await renderThemed(
      <IconButton icon={X} accessibilityLabel="Close" onPress={onPress} />,
      scheme,
    );
    const btn = screen.getByRole('button', { name: 'Close' });
    const style = flat(btn.props.style);
    expect(style.width).toBe(48);
    expect(style.height).toBe(48);
    await fireEvent.press(btn);
    expect(onPress).toHaveBeenCalled();
  });

  it('disabled', async () => {
    await renderThemed(<IconButton icon={X} accessibilityLabel="Close" disabled />, scheme);
    expect(screen.getByRole('button', { name: 'Close' })).toBeDisabled();
  });
});
