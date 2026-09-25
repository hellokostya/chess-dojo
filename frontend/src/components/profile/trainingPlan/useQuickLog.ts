import { EventType, trackEvent } from '@/analytics/events';
import { useApi } from '@/api/Api';
import { Request, useRequest } from '@/api/Request';
import { useTimelineContext } from '@/components/profile/activity/useTimeline';
import {
    CustomTask,
    getCurrentCount,
    isRequirement,
    Requirement,
    RequirementProgress,
} from '@/database/requirement';
import { TimelineEntry } from '@/database/timeline';
import { DateTime } from 'luxon';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { getHistoryItems, getTimelineUpdate } from './progressHistoryEditor';
import { getQuickLogCount } from './quickLogCount';

/** The details of a completed quick log, used to offer an undo. */
export interface QuickLoggedTask {
    /** The task that was logged. */
    task: Requirement | CustomTask;
    /** The name of the task, with any placeholders already substituted. */
    displayName: string;
    /** The number of minutes that were logged. */
    minutes: number;
    /** The timeline entry created by the log. */
    entry: TimelineEntry;
}

export interface UseQuickLogResponse {
    /** The most recent quick log, or undefined if there is nothing to undo. */
    lastLog: QuickLoggedTask | undefined;
    /** Clears the most recent quick log without undoing it. */
    clearLastLog: () => void;
    /** The id of the task currently being logged, if any. */
    loadingTaskId: string | undefined;
    /** Whether an undo is in progress. */
    isUndoing: boolean;
    /** The request state, for rendering a RequestSnackbar. */
    request: Request;
    /** Logs the given number of minutes against the given task. */
    quickLog: (options: {
        task: Requirement | CustomTask;
        displayName: string;
        cohort: string;
        minutes: number;
        progress?: RequirementProgress;
        /** For checkbox tasks, whether to mark the task complete. */
        markComplete?: boolean;
        /** For counted tasks, how many units to add to the current count. */
        countDelta?: number;
    }) => Promise<void>;
    /** Undoes the most recent quick log. */
    undoLastLog: () => Promise<void>;
}

/**
 * Provides one-tap logging of time against a task, along with an undo of the most
 * recent log.
 *
 * Quick logs record time only. The task's count is left untouched, except for tasks
 * whose count *is* a number of minutes (ScoreboardDisplay.Minutes), where the two are
 * the same value. Recording units of progress is an assertion the user has to make
 * deliberately, so it stays in the task dialog.
 */
export function useQuickLog(): UseQuickLogResponse {
    const t = useTranslations('profile.trainingPlan.common');
    const api = useApi();
    const request = useRequest();
    const { entries, onNewEntry, onEditEntries, onDeleteEntries } = useTimelineContext();

    const [lastLog, setLastLog] = useState<QuickLoggedTask>();
    const [loadingTaskId, setLoadingTaskId] = useState<string>();
    const [isUndoing, setIsUndoing] = useState(false);

    const quickLog = async ({
        task,
        displayName,
        cohort,
        minutes,
        progress,
        markComplete,
        countDelta,
    }: {
        task: Requirement | CustomTask;
        displayName: string;
        cohort: string;
        minutes: number;
        progress?: RequirementProgress;
        markComplete?: boolean;
        countDelta?: number;
    }) => {
        if (loadingTaskId || (minutes <= 0 && !markComplete && !countDelta)) {
            return;
        }

        const currentCount = getCurrentCount({
            cohort,
            requirement: task,
            progress,
            timeline: entries,
        });

        const newCount = getQuickLogCount({
            task,
            cohort,
            currentCount,
            minutesSpentBefore: progress?.minutesSpent[cohort] ?? 0,
            minutes,
            markComplete,
            countDelta,
        });

        setLoadingTaskId(task.id);
        request.onStart();

        try {
            const response = await api.updateUserProgress({
                cohort,
                requirementId: task.id,
                previousCount: currentCount,
                newCount,
                incrementalMinutesSpent: minutes,
                date: DateTime.now(),
                notes: '',
            });

            trackEvent(EventType.UpdateProgress, {
                requirement_id: task.id,
                requirement_name: task.name,
                is_custom_requirement: !isRequirement(task),
                dojo_cohort: cohort,
                previous_count: currentCount,
                new_count: newCount,
                incremental_minutes: minutes,
                quick_log: true,
            });

            onNewEntry(response.data.timelineEntry);
            setLastLog({ task, displayName, minutes, entry: response.data.timelineEntry });
            request.onSuccess();
        } catch (err) {
            request.onFailure(err);
        } finally {
            setLoadingTaskId(undefined);
        }
    };

    const undoLastLog = async () => {
        if (!lastLog || isUndoing) {
            return;
        }

        // Rebuild the task's history with the new entry marked deleted, so that the
        // progress is recomputed exactly as the progress history editor would.
        const items = getHistoryItems(lastLog.task, entries).map((item) =>
            item.entry.id === lastLog.entry.id ? { ...item, deleted: true } : item,
        );
        const update = getTimelineUpdate(lastLog.task, items, t);

        if (update.deleted.length === 0) {
            // The entry is no longer in the timeline, so there is nothing to undo.
            setLastLog(undefined);
            return;
        }

        setIsUndoing(true);
        request.onStart();

        try {
            await api.updateUserTimeline({
                requirementId: lastLog.task.id,
                progress: update.progress,
                updated: update.updated,
                deleted: update.deleted,
            });

            onEditEntries(update.updated);
            onDeleteEntries(update.deleted);
            setLastLog(undefined);
            request.onSuccess();
        } catch (err) {
            request.onFailure(err);
        } finally {
            setIsUndoing(false);
        }
    };

    return {
        lastLog,
        clearLastLog: () => setLastLog(undefined),
        loadingTaskId,
        isUndoing,
        request,
        quickLog,
        undoLastLog,
    };
}
