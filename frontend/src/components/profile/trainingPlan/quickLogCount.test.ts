import { ScoreboardDisplay } from '@/database/requirement';
import { describe, expect, it } from 'vitest';
import { COHORT, makeTask } from './__fixtures__/tasks';
import { getQuickLogCount } from './quickLogCount';

const base = { cohort: COHORT, currentCount: 10, minutesSpentBefore: 45, minutes: 30 };

describe('getQuickLogCount', () => {
    it('leaves a counted task alone when no units are added', () => {
        expect(getQuickLogCount({ ...base, task: makeTask() })).toBe(10);
    });

    it('adds units to a counted task', () => {
        expect(getQuickLogCount({ ...base, task: makeTask(), countDelta: 3 })).toBe(13);
    });

    it('caps added units at the task total', () => {
        expect(getQuickLogCount({ ...base, task: makeTask(), countDelta: 500 })).toBe(100);
    });

    it('completes a checkbox task when asked', () => {
        const task = makeTask({
            scoreboardDisplay: ScoreboardDisplay.Checkbox,
            counts: { [COHORT]: 1 },
        });
        expect(getQuickLogCount({ ...base, currentCount: 0, task, markComplete: true })).toBe(1);
    });

    it('leaves a checkbox task incomplete when not asked', () => {
        const task = makeTask({
            scoreboardDisplay: ScoreboardDisplay.Checkbox,
            counts: { [COHORT]: 1 },
        });
        expect(getQuickLogCount({ ...base, currentCount: 0, task, markComplete: false })).toBe(0);
    });

    it('moves a minutes task by the time logged', () => {
        const task = makeTask({ scoreboardDisplay: ScoreboardDisplay.Minutes });
        expect(getQuickLogCount({ ...base, task })).toBe(75);
    });
});
