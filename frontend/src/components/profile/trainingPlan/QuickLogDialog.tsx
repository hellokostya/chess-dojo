import {
    CustomTask,
    formatTime,
    getTotalCount,
    Requirement,
    ScoreboardDisplay,
} from '@/database/requirement';
import { Add, Remove } from '@mui/icons-material';
import {
    Button,
    Checkbox,
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControlLabel,
    IconButton,
    InputBase,
    Stack,
    TextField,
    Typography,
} from '@mui/material';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

/** The increments offered by the quick-add chips, in minutes. */
const QUICK_ADD_MINUTES = [15, 30, 60];

/** How many minutes each tap of the minus and plus buttons changes the time by. */
const MINUTES_STEP = 5;

export interface QuickLogSubmission {
    minutes: number;
    markComplete?: boolean;
    countDelta?: number;
}

interface QuickLogDialogProps {
    open: boolean;
    onClose: () => void;
    /** The task being logged. */
    task: Requirement | CustomTask;
    /** The task's name, with placeholders already substituted. */
    displayName: string;
    /** The suggested minutes, used as the starting value. */
    suggestedMinutes: number;
    /** The user's current count for the task. */
    currentCount: number;
    /** The cohort the log applies to. */
    cohort: string;
    /** Whether the log is in flight. */
    isLoading: boolean;
    /** Invoked with the values to log. */
    onSubmit: (submission: QuickLogSubmission) => void;
}

/**
 * Renders the confirmation shown before logging a task from its card. It asks only
 * what the task actually needs: the time, plus whether a checkbox task is finished
 * or how many units were completed on a counted one.
 */
export function QuickLogDialog({
    open,
    onClose,
    task,
    displayName,
    suggestedMinutes,
    currentCount,
    cohort,
    isLoading,
    onSubmit,
}: QuickLogDialogProps) {
    const t = useTranslations('profile.trainingPlan.quickLog');
    const tCommon = useTranslations('profile.trainingPlan.common');
    const tUpdater = useTranslations('profile.trainingPlan.progressUpdater');
    const tTime = useTranslations('common');

    const [minutes, setMinutes] = useState(`${suggestedMinutes}`);
    const [markComplete, setMarkComplete] = useState(true);
    const [countDelta, setCountDelta] = useState(0);

    const isCheckbox =
        task.scoreboardDisplay === ScoreboardDisplay.Checkbox ||
        task.scoreboardDisplay === ScoreboardDisplay.Hidden;
    const isCounted =
        task.scoreboardDisplay === ScoreboardDisplay.ProgressBar ||
        task.scoreboardDisplay === ScoreboardDisplay.Unspecified ||
        task.scoreboardDisplay === ScoreboardDisplay.Yearly;

    const totalCount = getTotalCount(cohort, task, true);
    const remainingCount = Math.max(totalCount - currentCount, 0);

    const minutesInt = parseInt(minutes) || 0;
    const isValid = minutesInt > 0 || (isCheckbox && markComplete) || countDelta > 0;

    const suffix = task.progressBarSuffix.trim().toLowerCase();

    const onConfirm = () => {
        onSubmit({
            minutes: minutesInt,
            markComplete: isCheckbox ? markComplete : undefined,
            countDelta: isCounted ? countDelta : undefined,
        });
    };

    return (
        <Dialog open={open} onClose={isLoading ? undefined : onClose} maxWidth='xs' fullWidth>
            {/* The title is a div so the two lines below can be real headings;
                DialogTitle's default h2 cannot legally contain them. */}
            <DialogTitle component='div' sx={{ pb: 0.5 }}>
                <Typography variant='subtitle2' color='textSecondary' component='p'>
                    {t('dialogTitle')}
                </Typography>
                <Typography
                    variant='h6'
                    component='h2'
                    sx={{ fontWeight: 'bold', lineHeight: 1.3 }}
                >
                    {displayName}
                </Typography>
            </DialogTitle>

            <DialogContent>
                <Stack spacing={2.5} sx={{ mt: 1 }}>
                    <Stack spacing={1}>
                        <Stack direction='row' sx={{ alignItems: 'center', gap: 1 }}>
                            <IconButton
                                onClick={() =>
                                    setMinutes(`${Math.max(0, minutesInt - MINUTES_STEP)}`)
                                }
                                disabled={minutesInt <= 0}
                                aria-label={t('decrementMinutes')}
                                sx={{ border: 1, borderColor: 'divider' }}
                                data-testid='quick-log-minutes-decrement'
                            >
                                <Remove />
                            </IconButton>
                            <TextField
                                label={tCommon('minutes')}
                                value={minutes}
                                onChange={(e) => setMinutes(e.target.value.replace(/[^0-9]/g, ''))}
                                slotProps={{
                                    htmlInput: {
                                        inputMode: 'numeric',
                                        pattern: '[0-9]*',
                                        style: { textAlign: 'center' },
                                    },
                                }}
                                size='small'
                                fullWidth
                                autoFocus
                                data-testid='quick-log-minutes'
                            />
                            <IconButton
                                onClick={() => setMinutes(`${minutesInt + MINUTES_STEP}`)}
                                aria-label={t('incrementMinutes')}
                                sx={{ border: 1, borderColor: 'divider' }}
                                data-testid='quick-log-minutes-increment'
                            >
                                <Add />
                            </IconButton>
                        </Stack>
                        <Stack direction='row' sx={{ gap: 1, flexWrap: 'wrap' }}>
                            {QUICK_ADD_MINUTES.map((quick) => (
                                <Chip
                                    key={quick}
                                    size='small'
                                    variant='outlined'
                                    label={tUpdater('quickAdd', {
                                        time: formatTime(quick, tTime),
                                    })}
                                    onClick={() => setMinutes(`${minutesInt + quick}`)}
                                />
                            ))}
                        </Stack>
                    </Stack>

                    {isCheckbox && (
                        <FormControlLabel
                            control={
                                <Checkbox
                                    checked={markComplete}
                                    onChange={(e) => setMarkComplete(e.target.checked)}
                                    data-testid='quick-log-mark-complete'
                                />
                            }
                            label={tUpdater('markComplete')}
                        />
                    )}

                    {isCounted && remainingCount > 0 && (
                        <Stack spacing={0.75}>
                            <Typography variant='body2' color='textSecondary'>
                                {t('countCompleted', { suffix })}
                            </Typography>
                            <Stack direction='row' sx={{ alignItems: 'center' }}>
                                <IconButton
                                    size='small'
                                    disabled={countDelta <= 0}
                                    onClick={() => setCountDelta((v) => Math.max(0, v - 1))}
                                    aria-label={t('decrementCount')}
                                >
                                    <Remove fontSize='small' />
                                </IconButton>
                                <InputBase
                                    value={countDelta}
                                    onChange={(e) => {
                                        const v = parseInt(e.target.value.replace(/[^0-9]/g, ''));
                                        setCountDelta(Math.min(isNaN(v) ? 0 : v, remainingCount));
                                    }}
                                    inputProps={{
                                        'aria-label': t('countCompleted', { suffix }),
                                        style: { textAlign: 'center' },
                                    }}
                                    sx={{
                                        width: 64,
                                        border: 1,
                                        borderColor: 'divider',
                                        borderRadius: 1,
                                    }}
                                    data-testid='quick-log-count'
                                />
                                <IconButton
                                    size='small'
                                    disabled={countDelta >= remainingCount}
                                    onClick={() =>
                                        setCountDelta((v) => Math.min(remainingCount, v + 1))
                                    }
                                    aria-label={t('incrementCount')}
                                >
                                    <Add fontSize='small' />
                                </IconButton>
                            </Stack>
                        </Stack>
                    )}
                </Stack>
            </DialogContent>

            <DialogActions>
                <Button onClick={onClose} disabled={isLoading}>
                    {tCommon('cancel')}
                </Button>
                <Button
                    variant='contained'
                    disableElevation
                    onClick={onConfirm}
                    loading={isLoading}
                    disabled={!isValid}
                    data-testid='quick-log-confirm'
                >
                    {t('confirm')}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
