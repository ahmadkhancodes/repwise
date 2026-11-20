import { fireEvent, screen } from '@testing-library/react-native';

import { renderThemed, SCHEMES } from '../../../../test/render';

import { AssistantCard } from '../components/AssistantCard';
import type { ShownCard } from '../logic/cardState';

const card: ShownCard = {
  id: 'c1',
  ruleId: 'protein_low',
  candidate: {
    ruleId: 'protein_low',
    priority: 1,
    title: 'Protein is low',
    body: '60 g to go today',
    detail: 'detail',
    actionLabel: 'Open Eat',
    action: null,
  },
};

describe.each(SCHEMES)('AssistantCard (%s)', (scheme) => {
  it('body, dismiss and action are separate accessible elements (not nested)', async () => {
    const onOpen = jest.fn();
    const onAction = jest.fn();
    const onDismiss = jest.fn();
    await renderThemed(
      <AssistantCard card={card} index={0} onOpen={onOpen} onAction={onAction} onDismiss={onDismiss} />,
      scheme,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Protein is low. 60 g to go today' }));
    expect(onOpen).toHaveBeenCalledWith(card);
    await fireEvent.press(screen.getByRole('button', { name: 'Dismiss Protein is low' }));
    expect(onDismiss).toHaveBeenCalledWith(card);
    await fireEvent.press(screen.getByTestId('card-protein_low-action'));
    expect(onAction).toHaveBeenCalledWith(card);
  });

  it('exposes apply and dismiss as accessibility actions on the body', async () => {
    const onAction = jest.fn();
    const onDismiss = jest.fn();
    await renderThemed(
      <AssistantCard card={card} index={0} onOpen={jest.fn()} onAction={onAction} onDismiss={onDismiss} />,
      scheme,
    );
    const body = screen.getByTestId('card-protein_low');
    expect(body.props.accessibilityActions.map((a: { name: string }) => a.name)).toEqual(['apply', 'dismiss']);
    await fireEvent(body, 'accessibilityAction', { nativeEvent: { actionName: 'apply' } });
    await fireEvent(body, 'accessibilityAction', { nativeEvent: { actionName: 'dismiss' } });
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
