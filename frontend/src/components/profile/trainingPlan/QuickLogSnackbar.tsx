import { CustomTask, formatTime, Requirement } from '@/database/requirement';
import { Button, Snackbar, Stack } from '@mui/material';
import { useTranslations } from 'next-intl';
import { QuickLoggedTask } from './useQuickLog';

/** The number of milliseconds the quick log confirmation stays on screen. */
const AUTO_HIDE_MS = 8000;

interface QuickLogSnackbarProps {
    /** The log to confirm, or undefined to hide the snackbar. */
    lastLog: QuickLoggedTask | undefined;
    /** Whether the undo is in progress. */
    isUndoing: boolean;
    /** Callback invoked to undo the log. */
    onUndo: () => void;
    /** Callback invoked to open the task for editing. */
    onEdit: (task: Requirement | CustomTask) => void;
    /** Callback invoked when the snackbar is dismissed. */
    onClose: () => void;
}

/**
 * Renders the confirmation shown after a task is logged in one tap, with controls
 * to undo the log or open the task to edit it.
 */
export function QuickLogSnackbar({
    lastLog,
    isUndoing,
    onUndo,
    onEdit,
    onClose,
}: QuickLogSnackbarProps) {
    const t = useTranslations('profile.trainingPlan.quickLog');
    const tTime = useTranslations('common');

    return (
        <Snackbar
            open={!!lastLog}
            autoHideDuration={AUTO_HIDE_MS}
            onClose={(_, reason) => {
                if (reason !== 'clickaway') {
                    onClose();
                }
            }}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            data-testid='quick-log-snackbar'
            message={
                lastLog
                    ? t('logged', {
                          time: formatTime(lastLog.minutes, tTime),
                          name: lastLog.displayName,
                      })
                    : undefined
            }
            action={
                lastLog && (
                    <Stack direction='row' spacing={1}>
                        <Button
                            size='small'
                            color='secondary'
                            loading={isUndoing}
                            onClick={onUndo}
                            data-testid='quick-log-undo'
                        >
                            {t('undo')}
                        </Button>
                        <Button
                            size='small'
                            color='secondary'
                            disabled={isUndoing}
                            onClick={() => onEdit(lastLog.task)}
                            data-testid='quick-log-edit'
                        >
                            {t('edit')}
                        </Button>
                    </Stack>
                )
            }
        />
    );
}
