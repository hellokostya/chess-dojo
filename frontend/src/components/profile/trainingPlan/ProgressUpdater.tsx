import { EventType, trackEvent } from '@/analytics/events';
import { useApi } from '@/api/Api';
import { RequestSnackbar, useRequest } from '@/api/Request';
import { useAuth } from '@/auth/Auth';
import { useTimelineContext } from '@/components/profile/activity/useTimeline';
import { TimerContext } from '@/components/timer/TimerContext';
import {
    CustomTask,
    Requirement,
    RequirementProgress,
    ScoreboardDisplay,
    formatTime,
    getCurrentCount,
    isRequirement,
} from '@/database/requirement';
import { TimeFormat } from '@/database/user';
import { Add, Remove } from '@mui/icons-material';
import {
    Alert,
    Button,
    Checkbox,
    Chip,
    DialogActions,
    DialogContent,
    DialogContentText,
    FormControlLabel,
    Grid,
    IconButton,
    Stack,
    TextField,
} from '@mui/material';
import { DateTimePicker } from '@mui/x-date-pickers-pro';
import { DateTime } from 'luxon';
import { useTranslations } from 'next-intl';
import { use, useState } from 'react';
import { InputSlider } from './InputSlider';
import { TaskDialogView } from './TaskDialog';

const NUMBER_REGEX = /^[0-9]*$/;
/** How much the −/+ buttons change the time by, in minutes. */
const TIME_STEP_MINUTES = 5;
const TIME_WARNING_THRESHOLD_MINS = 60 * 5;
/** The increments offered by the quick-add chips, in minutes. */
const QUICK_ADD_MINUTES = [15, 30, 60];
const SECONDS_PER_HOUR = 3600;

interface ProgressUpdaterProps {
    requirement: Requirement | CustomTask;
    progress?: RequirementProgress;
    cohort: string;
    onClose: () => void;
    setView?: (view: TaskDialogView) => void;
    /** Time to prefill when no timer is running for this task, in minutes. */
    initialMinutes?: number;
}

export const ProgressUpdater = ({
    requirement,
    progress,
    cohort,
    onClose,
    setView,
    initialMinutes,
}: ProgressUpdaterProps) => {
    const t = useTranslations('profile.trainingPlan.progressUpdater');
    const tCommon = useTranslations('profile.trainingPlan.common');
    const tTime = useTranslations('common');
    const { user } = useAuth();
    const api = useApi();
    const { entries, onNewEntry } = useTimelineContext();

    const totalCount = requirement.counts[cohort] || 0;
    const currentCount = getCurrentCount({ cohort, requirement, progress, timeline: entries });

    // Counts are edited as units done past the task's start, matching the card:
    // a task starting at puzzle #307 shows 0 until puzzle #307 is solved.
    const startCount = requirement.startCount || 0;
    const [value, setValue] = useState<number>(Math.max(currentCount - startCount, 0));
    const [subtract, setSubtract] = useState(false);
    const [markComplete, setMarkComplete] = useState(true);
    const [date, setDate] = useState<DateTime | null>(DateTime.now());

    const { task: timerTask, onClear: onClearTimer, timerSeconds } = use(TimerContext);
    let timerHours = Math.floor(timerSeconds / SECONDS_PER_HOUR);
    let timerMinutes = Math.floor((timerSeconds % SECONDS_PER_HOUR) / 60);
    if (timerTask && timerTask.id !== requirement.id) {
        timerHours = 0;
        timerMinutes = 0;
    }
    if (!timerHours && !timerMinutes && initialMinutes) {
        timerHours = Math.floor(initialMinutes / 60);
        timerMinutes = initialMinutes % 60;
    }
    const [hours, setHours] = useState(timerHours ? `${timerHours}` : '');
    const [minutes, setMinutes] = useState(timerMinutes ? `${timerMinutes}` : '');

    const [errors, setErrors] = useState<Record<string, string>>({});
    const [notes, setNotes] = useState('');
    const request = useRequest();

    const isCheckbox =
        requirement.scoreboardDisplay === ScoreboardDisplay.Hidden ||
        requirement.scoreboardDisplay === ScoreboardDisplay.Checkbox;
    const isSlider =
        requirement.scoreboardDisplay === ScoreboardDisplay.ProgressBar ||
        requirement.scoreboardDisplay === ScoreboardDisplay.Unspecified ||
        requirement.scoreboardDisplay === ScoreboardDisplay.Yearly;
    const isNonDojo = requirement.scoreboardDisplay === ScoreboardDisplay.NonDojo;
    const isMinutes = requirement.scoreboardDisplay === ScoreboardDisplay.Minutes;
    const useTwelveHourClock = user?.timeFormat !== TimeFormat.TwentyFourHour;

    const hoursInt = parseInt(hours) || 0;
    const minutesInt = parseInt(minutes) || 0;
    const previousTime = progress?.minutesSpent[cohort] ?? 0;
    const enteredTime = 60 * hoursInt + minutesInt;
    // Removing time can't take the task's total below zero.
    const addedTime = subtract ? -Math.min(enteredTime, previousTime) : enteredTime;
    const totalTime = previousTime + addedTime;

    /**
     * Changes the time being logged by the given number of minutes. Going below zero
     * removes time from the task instead, down to what has already been logged.
     */
    const onQuickAdd = (change: number) => {
        const signed = Math.max(addedTime + change, -previousTime);
        const magnitude = Math.abs(signed);
        const newHours = Math.floor(magnitude / 60);
        const newMinutes = magnitude % 60;
        setSubtract(signed < 0);
        setHours(newHours ? `${newHours}` : '');
        setMinutes(newMinutes ? `${newMinutes}` : '');
        setErrors({});
    };

    const onSubmit = () => {
        const errors: Record<string, string> = {};
        if (hours !== '') {
            if (!NUMBER_REGEX.test(hours)) {
                errors.hours = tCommon('mustBeNumeric');
            }
        }
        if (minutes !== '') {
            if (!NUMBER_REGEX.test(minutes)) {
                errors.minutes = tCommon('mustBeNumeric');
            }
        }
        setErrors(errors);

        if (Object.keys(errors).length > 0) {
            return;
        }

        let newCount = value + startCount;
        if (isMinutes) {
            newCount = totalTime;
        } else if (isNonDojo) {
            newCount = 0;
        } else if (isCheckbox) {
            if (markComplete) {
                newCount = totalCount;
            } else {
                newCount = 0;
            }
        }

        request.onStart();
        api.updateUserProgress({
            cohort,
            requirementId: requirement.id,
            previousCount: currentCount,
            newCount: newCount,
            incrementalMinutesSpent: addedTime,
            date,
            notes,
        })
            .then((resp) => {
                trackEvent(EventType.UpdateProgress, {
                    requirement_id: requirement.id,
                    requirement_name: requirement.name,
                    is_custom_requirement: !isRequirement(requirement),
                    dojo_cohort: cohort,
                    previous_count: currentCount,
                    new_count: newCount,
                    incremental_minutes: addedTime,
                });
                onNewEntry(resp.data.timelineEntry);
                onClose();
                setHours('');
                setMinutes('');
                request.reset();
                // Only clear the timer when it was tracking this task or not specific to a task.
                if (!timerTask || timerTask.id === requirement.id) {
                    onClearTimer();
                }
            })
            .catch((err) => {
                request.onFailure(err);
            });
    };

    return (
        <>
            <DialogContent>
                <Stack spacing={3} sx={{ mt: isMinutes || isNonDojo ? 1 : undefined }}>
                    {isSlider && (
                        <InputSlider
                            value={value}
                            setValue={setValue}
                            max={Math.max(totalCount - startCount, 0)}
                            min={0}
                            suffix={requirement.progressBarSuffix}
                        />
                    )}

                    {isCheckbox && (
                        <FormControlLabel
                            control={
                                <Checkbox
                                    checked={markComplete}
                                    onChange={(event) => setMarkComplete(event.target.checked)}
                                />
                            }
                            label={t('markComplete')}
                        />
                    )}

                    <TextField
                        label={tCommon('comments')}
                        placeholder={tCommon('commentsPlaceholder')}
                        multiline={true}
                        maxRows={3}
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                    />

                    <Stack spacing={2}>
                        <Stack
                            direction='row'
                            sx={{
                                flexWrap: 'wrap',
                                gap: 1,
                                alignItems: 'center',
                            }}
                        >
                            <IconButton
                                size='small'
                                aria-label={t('removeTime')}
                                disabled={addedTime <= -previousTime}
                                onClick={() => onQuickAdd(-TIME_STEP_MINUTES)}
                                sx={{ border: 1, borderColor: 'divider' }}
                                data-testid='task-updater-remove-time'
                            >
                                <Remove fontSize='small' />
                            </IconButton>
                            <IconButton
                                size='small'
                                aria-label={t('addTime')}
                                onClick={() => onQuickAdd(TIME_STEP_MINUTES)}
                                sx={{ border: 1, borderColor: 'divider', mr: 0.5 }}
                                data-testid='task-updater-add-time'
                            >
                                <Add fontSize='small' />
                            </IconButton>
                            {QUICK_ADD_MINUTES.map((quickMinutes) => (
                                <Chip
                                    key={quickMinutes}
                                    label={t('quickAdd', {
                                        time: formatTime(quickMinutes, tTime),
                                    })}
                                    size='small'
                                    variant='outlined'
                                    onClick={() => onQuickAdd(quickMinutes)}
                                    data-testid={`task-updater-quick-add-${quickMinutes}`}
                                />
                            ))}
                        </Stack>

                        <Grid
                            container
                            sx={{
                                width: 1,
                                gap: 2,
                            }}
                        >
                            <Grid size={{ xs: 12, sm: 'grow' }}>
                                <DateTimePicker
                                    label={tCommon('date')}
                                    disableFuture
                                    value={date}
                                    onChange={setDate}
                                    slotProps={{
                                        textField: {
                                            fullWidth: true,
                                        },
                                    }}
                                    ampm={useTwelveHourClock}
                                />
                            </Grid>
                            <Grid size={{ xs: 12, sm: 'grow' }}>
                                <TextField
                                    label={tCommon('hours')}
                                    value={hours}
                                    slotProps={{
                                        htmlInput: {
                                            inputMode: 'numeric',
                                            pattern: '[0-9]*',
                                        },
                                    }}
                                    onChange={(event) => setHours(event.target.value)}
                                    error={!!errors.hours}
                                    helperText={errors.hours}
                                    fullWidth
                                />
                            </Grid>
                            <Grid size={{ xs: 12, sm: 'grow' }}>
                                <TextField
                                    label={tCommon('minutes')}
                                    value={minutes}
                                    slotProps={{
                                        htmlInput: {
                                            inputMode: 'numeric',
                                            pattern: '[0-9]*',
                                        },
                                    }}
                                    onChange={(event) => setMinutes(event.target.value)}
                                    error={!!errors.minutes}
                                    helperText={
                                        errors.minutes || (subtract ? t('removingTime') : undefined)
                                    }
                                    fullWidth
                                />
                            </Grid>
                        </Grid>
                        <DialogContentText>
                            {t('totalTime', {
                                hours: Math.floor(totalTime / 60),
                                minutes: totalTime % 60,
                            })}
                        </DialogContentText>
                        {enteredTime > TIME_WARNING_THRESHOLD_MINS && (
                            <Alert severity='warning' variant='filled'>
                                {t('largeTimeWarning')}
                            </Alert>
                        )}
                    </Stack>
                </Stack>
            </DialogContent>
            <DialogActions sx={{ flexWrap: 'wrap' }}>
                <Button onClick={onClose} disabled={request.isLoading()}>
                    {tCommon('cancel')}
                </Button>
                {setView && (
                    <>
                        <Button
                            onClick={() => setView(TaskDialogView.Details)}
                            disabled={request.isLoading()}
                        >
                            {tCommon('taskDetails')}
                        </Button>
                        <Button
                            data-testid='task-updater-show-history-button'
                            onClick={() => setView(TaskDialogView.History)}
                            disabled={request.isLoading()}
                        >
                            {tCommon('showHistory')}
                        </Button>
                    </>
                )}
                <Button
                    data-testid='task-updater-save-button'
                    loading={request.isLoading()}
                    onClick={onSubmit}
                >
                    {tCommon('update')}
                </Button>
            </DialogActions>

            <RequestSnackbar request={request} />
        </>
    );
};
