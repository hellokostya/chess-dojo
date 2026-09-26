import { CustomTask, getTotalCount, Requirement } from '@/database/requirement';
import { ANNOTATE_GAMES_TASK_ID } from './suggestedTasks';

/** Tasks that keep their full name on the daily and weekly plans. */
const FULL_NAME_TASK_IDS = [ANNOTATE_GAMES_TASK_ID];

/**
 * Returns the display name for a task, without the suggested time. The time is
 * already shown by the card's log button and progress chip, so repeating it in
 * the title ("Solve Polgar M2s - 30m") only adds noise.
 * @param task The task to get the name for.
 * @param cohort The cohort used to fill in any {{count}} placeholder.
 */
export function taskDisplayName({
    task,
    cohort,
}: {
    task: Requirement | CustomTask;
    cohort: string;
}): string {
    const totalCount = getTotalCount(cohort, task, true);
    const name = FULL_NAME_TASK_IDS.includes(task.id) ? task.name : task.dailyName || task.name;
    return name
        .replace(/\s*[-–—:]?\s*\{\{time\}\}/g, '')
        .replaceAll('{{count}}', `${totalCount}`)
        .trim();
}
