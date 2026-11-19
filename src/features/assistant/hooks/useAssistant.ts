import { router, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo } from 'react';

import { getPlanner } from '@/features/today/plannerBridge';
import { localDate } from '@/features/today/logic/day';
import { useDbSnapshot } from '@/features/today/hooks/useDbSnapshot';
import { track } from '@/services/analytics';

import { visibleCards, type ShownCard } from '../logic/cardState';
import { evaluateRules, type CardAction, type RuleContext } from '../logic/rules';
import {
  cardsForDate,
  dismissCard,
  loadRuleContext,
  markCardApplied,
  materializeCards,
  rescheduleSession,
  setDeloadRequested,
  skipSession,
  snoozeCard,
} from '../repo';

const RULE_TABLES = ['sessions', 'sets', 'session_exercises', 'food_logs', 'cards', 'meals', 'profile'] as const;

export type AssistantInput = {
  enabled: boolean;
  today: string;
  hour: number;
  now: number;
  isPro: boolean;
  onboardedAt: number | null | undefined;
  protein: RuleContext['protein'];
};

export type AssistantModel = {
  cards: ShownCard[];
  apply: (card: ShownCard) => Promise<void>;
  dismiss: (card: ShownCard) => void;
  snooze: (card: ShownCard) => void;
};

/** What the primary action of a card does (S12 "Apply"). Navigation actions keep the card. */
export async function runCardAction(action: CardAction, today: string): Promise<{ keep: boolean }> {
  switch (action.type) {
    case 'reschedule':
      rescheduleSession(action.sessionId, action.toDate);
      return { keep: false };
    case 'skip_session':
    case 'rest_today':
      skipSession(action.sessionId);
      return { keep: false };
    case 'open_eat':
      router.push('/eat' as Href);
      return { keep: false };
    case 'open_checkin':
      router.push('/checkin' as Href);
      return { keep: true };
    case 'plan_deload': {
      setDeloadRequested(today);
      await getPlanner().requestDeload?.();
      return { keep: false };
    }
  }
}

/** Rule-triggered assistant cards for Today (RW-41, sheet 28). */
export function useAssistant(input: AssistantInput): AssistantModel {
  const { enabled, today, hour, isPro, onboardedAt, protein, now } = input;
  const proteinKey = protein ? `${protein.eaten}/${protein.target}` : '';
  const onboardedDate = onboardedAt ? localDate(onboardedAt) : null;

  const { data } = useDbSnapshot(
    RULE_TABLES,
    () => {
      if (!enabled) return { candidates: [], stored: [] };
      const ctx = loadRuleContext({ today, hour, onboardedAt, onboardedDate, protein });
      return { candidates: evaluateRules(ctx), stored: cardsForDate(today) };
    },
    [enabled, today, hour, proteinKey, onboardedDate],
  );

  const candidates = data?.candidates;
  useEffect(() => {
    if (!enabled || !candidates?.length) return;
    try {
      materializeCards(today, candidates, isPro);
    } catch {
      // cards are optional; never break Today
    }
  }, [enabled, candidates, today, isPro]);

  const cards = useMemo(
    () => (data ? visibleCards(data.candidates, data.stored, now, isPro) : []),
    [data, now, isPro],
  );

  const apply = useCallback(
    async (card: ShownCard) => {
      const action = card.candidate.action;
      track('assistant_card', { rule: card.ruleId, action: action?.type ?? 'none' });
      if (!action) {
        dismissCard(card.id);
        return;
      }
      const { keep } = await runCardAction(action, today);
      if (!keep) markCardApplied(card.id);
    },
    [today],
  );

  const dismiss = useCallback((card: ShownCard) => {
    track('assistant_card', { rule: card.ruleId, action: 'dismiss' });
    dismissCard(card.id);
  }, []);

  const snooze = useCallback(
    (card: ShownCard) => {
      track('assistant_card', { rule: card.ruleId, action: 'snooze' });
      snoozeCard(card.id, now);
    },
    [now],
  );

  return { cards, apply, dismiss, snooze };
}
