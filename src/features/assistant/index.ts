/**
 * assistant domain (S12, S28, sheet 28): rule-triggered cards and the weekly check-in.
 * Pure rules in logic/, card rows + check-in record in repo.ts.
 */
export { evaluateRules, type CardCandidate, type RuleContext, type RuleId } from './logic/rules';
export { latestCheckin, type CheckinRecord } from './repo';
