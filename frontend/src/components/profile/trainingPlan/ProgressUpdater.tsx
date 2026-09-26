import { EventType, trackEvent } from '@/analytics/events';
import { useApi } from '@/api/Api';
import { RequestSnackbar, useRequest } from '@/api/Request';
import { useAuth } from '@/auth/Auth';
import { useTimelineContext } from '@/components/profile/activity/useTimeline';
import { TimerContext } from '@/components/timer/TimerContext';
import {
    CustomTask,
    formatTime,
    getCurrentCount,
    isRequirement,
    Requirement,
    RequirementProgress,
    ScoreboardDisplay,
} from '@/database/requirement';
import { TimeFormat } from '@/database/user';
import {
    Alert,
    Box,
    Button,
    Checkbox,
    DialogActions,
    DialogContent,
    Divider,
    FormControlLabel,
    Stack,
    TextField,
    Typography,
} from '@mui/material';
import { DateTimePicker } from '@mui/x-date-pickers-pro';
import { DateTime } from 'luxon';
import { useTranslations } from 'next-intl';
import { use, useState } from 'react';
import { SectionLabel } from './SectionLabel';
import { Stepper, STEPPER_WIDTH } from './Stepper';
import { TaskDialogView } from './TaskDialog';

const NUMBER_REGEX = /^[0-9]*$/;
/** How much the −/+ buttons change the time by, in minutes. */
const TIME_STEP_MINUTES = 5;
const TIME_WARNING_THRESHOLD_MINS = 60 * 5;
/** The preset times offered under the time stepper, in minutes. */
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
    const tSlider = useTranslations('profile.trainingPlan.inputSlider');
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
    const maxValue = Math.max(totalCount - startCount, 0);
    const [markComplete, setMarkComplete] = useState(true);
    const [date, setDate] = useState<DateTime | null>(
        // Rounded down to the hour, a tidier default than the current minute.
        DateTime.now().startOf('hour'),
    );

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

    // The minutes box only accepts digits, so errors are never shown; kept for
    // the validation in onSubmit.
    const [, setErrors] = useState<Record<string, string>>({});
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
    const onQuickAdd = (change: number) => onSetTime(Math.max(addedTime + change, -previousTime));

    /** Sets the time being logged; below zero removes time from the task. */
    const onSetTime = (signed: number) => {
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
            <DialogContent
                sx={{
                    // Two text styles only: labels are 1rem semibold (SectionLabel),
                    // everything else is this.
                    '& .MuiInputBase-root, & .MuiInputLabel-root, & .MuiButton-root, & .MuiTypography-root:not(.section-label)':
                        { fontSize: '1rem', fontWeight: 400 },
                }}
            >
                <Stack spacing={3} sx={{ pt: 1 }}>
                    {isSlider && (
                        <FormRow label={requirement.progressBarSuffix || tSlider('progressCount')}>
                            <Stepper
                                value={`${value}`}
                                onChange={(text) =>
                                    setValue(
                                        Math.min(parseInt(text.replace(/\D/g, '')) || 0, maxValue),
                                    )
                                }
                                onDecrement={() => setValue((v) => Math.max(v - 1, 0))}
                                onIncrement={() => setValue((v) => Math.min(v + 1, maxValue))}
                                decrementDisabled={value <= 0}
                                incrementDisabled={value >= maxValue}
                                unit={`/ ${maxValue}`}
                                label={requirement.progressBarSuffix || tSlider('count')}
                                decrementLabel={tSlider('decrement')}
                                incrementLabel={tSlider('increment')}
                                data-testid='task-updater-count'
                            />
                        </FormRow>
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

                    <FormRow
                        label={t('timeSpent')}
                        caption={
                            <Box
                                component='span'
                                sx={{ color: subtract ? 'warning.main' : undefined }}
                                data-testid='task-updater-total-time'
                            >
                                {t('totalTimeChange', {
                                    before: formatTime(previousTime, tTime),
                                    after: formatTime(totalTime, tTime),
                                })}
                            </Box>
                        }
                    >
                        <Stack spacing={0.75} sx={{ width: STEPPER_WIDTH }}>
                            <Stepper
                                value={subtract ? `-${enteredTime}` : `${enteredTime}`}
                                onChange={(text) => {
                                    const n = parseInt(text.replace(/[^0-9-]/g, '')) || 0;
                                    onSetTime(Math.max(n, -previousTime));
                                }}
                                onDecrement={() => onQuickAdd(-TIME_STEP_MINUTES)}
                                onIncrement={() => onQuickAdd(TIME_STEP_MINUTES)}
                                decrementDisabled={addedTime <= -previousTime}
                                unit={t('minutesShort')}
                                label={tCommon('minutes')}
                                decrementLabel={t('removeTime')}
                                incrementLabel={t('addTime')}
                                warning={subtract}
                                data-testid='task-updater-minutes'
                            />
                            <Stack direction='row' sx={{ gap: 0.75 }}>
                                {QUICK_ADD_MINUTES.map((quickMinutes) => (
                                    <Button
                                        key={quickMinutes}
                                        size='small'
                                        variant='outlined'
                                        color='inherit'
                                        onClick={() => onSetTime(quickMinutes)}
                                        sx={{
                                            flex: 1,
                                            minWidth: 0,
                                            borderRadius: 2,
                                            // The preset matching the time entered is outlined.
                                            borderColor:
                                                addedTime === quickMinutes
                                                    ? 'text.primary'
                                                    : 'divider',
                                            color: 'text.primary',
                                            textTransform: 'none',
                                        }}
                                        data-testid={`task-updater-quick-add-${quickMinutes}`}
                                    >
                                        {formatTime(quickMinutes, tTime)}
                                    </Button>
                                ))}
                            </Stack>
                        </Stack>
                    </FormRow>

                    {enteredTime > TIME_WARNING_THRESHOLD_MINS && (
                        <Alert severity='warning'>{t('largeTimeWarning')}</Alert>
                    )}

                    <Divider />

                    <DateTimePicker
                        label={tCommon('date')}
                        disableFuture
                        value={date}
                        onChange={setDate}
                        slotProps={{ textField: { fullWidth: true, size: 'small' } }}
                        ampm={useTwelveHourClock}
                    />

                    <TextField
                        label={tCommon('comments')}
                        placeholder={tCommon('commentsPlaceholder')}
                        multiline
                        size='small'
                        minRows={2}
                        maxRows={4}
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                    />
                </Stack>
            </DialogContent>
            <DialogActions
                sx={{
                    flexWrap: 'wrap',
                    px: 2,
                    pb: 2,
                    gap: 0.5,
                    '& .MuiButton-root': { fontSize: '1rem', fontWeight: 400 },
                }}
            >
                {setView && (
                    <>
                        <Button
                            color='inherit'
                            onClick={() => setView(TaskDialogView.Details)}
                            disabled={request.isLoading()}
                            sx={{ color: 'text.primary', textTransform: 'none', px: 1 }}
                        >
                            {tCommon('taskDetails')}
                        </Button>
                        <Button
                            color='inherit'
                            data-testid='task-updater-show-history-button'
                            onClick={() => setView(TaskDialogView.History)}
                            disabled={request.isLoading()}
                            sx={{ color: 'text.primary', textTransform: 'none', px: 1 }}
                        >
                            {tCommon('showHistory')}
                        </Button>
                    </>
                )}
                <Box sx={{ flexGrow: 1 }} />
                <Button
                    color='inherit'
                    onClick={onClose}
                    disabled={request.isLoading()}
                    sx={{ textTransform: 'none' }}
                >
                    {tCommon('cancel')}
                </Button>
                <Button
                    variant='contained'
                    disableElevation
                    data-testid='task-updater-save-button'
                    loading={request.isLoading()}
                    onClick={onSubmit}
                    sx={{
                        borderRadius: 999,
                        px: 2.5,
                        mr: 1,
                        textTransform: 'none',
                        fontWeight: '600 !important',
                    }}
                >
                    {tCommon('update')}
                </Button>
            </DialogActions>

            <RequestSnackbar request={request} />
        </>
    );
};

/**
 * One row of the form: a label (and optional caption) on the left, its control on
 * the right. Every row's control shares the right edge, and wraps under the
 * label on narrow screens.
 */
function FormRow({
    label,
    caption,
    children,
}: {
    label: string;
    caption?: React.ReactNode;
    children: React.ReactNode;
}) {
    return (
        <Stack
            direction='row'
            sx={{
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                flexWrap: 'wrap',
                columnGap: 3,
                rowGap: 1,
            }}
        >
            <Stack spacing={0.25} sx={{ minHeight: 40, justifyContent: 'center' }}>
                <SectionLabel>{label}</SectionLabel>
                {caption && (
                    <Typography sx={{ color: 'text.primary', fontVariantNumeric: 'tabular-nums' }}>
                        {caption}
                    </Typography>
                )}
            </Stack>
            {children}
        </Stack>
    );
}
