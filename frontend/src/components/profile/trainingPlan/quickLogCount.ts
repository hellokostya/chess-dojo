import { CustomTask, getTotalCount, Requirement, ScoreboardDisplay } from '@/database/requirement';

/**
 * Returns a task's new count after a quick log. The count of a Minutes task is its
 * time spent, so the two move together. Otherwise the count only changes when the
 * user said so in the log form: completing a checkbox task, or adding units to a
 * counted one, capped at the task's total.
 */
export function getQuickLogCount({
    task,
    cohort,
    currentCount,
    minutesSpentBefore,
    minutes,
    markComplete,
    countDelta,
}: {
    task: Requirement | CustomTask;
    cohort: string;
    currentCount: number;
    minutesSpentBefore: number;
    minutes: number;
    markComplete?: boolean;
    countDelta?: number;
}): number {
    if (task.scoreboardDisplay === ScoreboardDisplay.Minutes) {
        return minutesSpentBefore + minutes;
    }
    if (markComplete !== undefined) {
        return markComplete ? getTotalCount(cohort, task, true) : currentCount;
    }
    if (countDelta) {
        return Math.min(currentCount + countDelta, getTotalCount(cohort, task, true));
    }
    return currentCount;
}
