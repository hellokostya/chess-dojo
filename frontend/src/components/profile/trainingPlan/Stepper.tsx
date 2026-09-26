import { Add, Remove } from '@mui/icons-material';
import { Box, IconButton, InputBase, Typography } from '@mui/material';

/** The width shared by every stepper, so stacked steppers line up. */
export const STEPPER_WIDTH = 224;

/**
 * A number with − and + buttons either side, in one outlined box. The unit sits
 * inside the box, after the number.
 */
export function Stepper({
    value,
    onChange,
    onDecrement,
    onIncrement,
    decrementDisabled,
    incrementDisabled,
    unit,
    label,
    decrementLabel,
    incrementLabel,
    warning,
    'data-testid': dataTestId,
}: {
    value: string;
    onChange: (text: string) => void;
    onDecrement: () => void;
    onIncrement: () => void;
    decrementDisabled?: boolean;
    incrementDisabled?: boolean;
    unit?: string;
    /** The accessible name of the number box. */
    label: string;
    decrementLabel: string;
    incrementLabel: string;
    /** Shows the number in the warning colour, e.g. when removing time. */
    warning?: boolean;
    'data-testid'?: string;
}) {
    const buttonSx = { width: 40, height: 40, borderRadius: 0, flexShrink: 0 };
    return (
        <Box
            sx={{
                display: 'flex',
                alignItems: 'center',
                width: STEPPER_WIDTH,
                height: 40,
                border: 1,
                borderColor: 'divider',
                borderRadius: 2,
                overflow: 'hidden',
                '&:focus-within': { borderColor: 'primary.main' },
            }}
        >
            <IconButton
                aria-label={decrementLabel}
                disabled={decrementDisabled}
                onClick={onDecrement}
                sx={{ ...buttonSx, borderRight: 1, borderColor: 'divider' }}
                data-testid={dataTestId && `${dataTestId}-decrement`}
            >
                <Remove fontSize='small' />
            </IconButton>
            <Box
                sx={{
                    flexGrow: 1,
                    display: 'flex',
                    alignItems: 'baseline',
                    justifyContent: 'center',
                    gap: 0.5,
                    minWidth: 0,
                }}
            >
                <InputBase
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    inputProps={{
                        inputMode: 'numeric',
                        'aria-label': label,
                        size: Math.max(value.length, 1),
                        style: { textAlign: 'center', padding: 0 },
                    }}
                    sx={{
                        fontWeight: 600,
                        fontVariantNumeric: 'tabular-nums',
                        color: warning ? 'warning.main' : undefined,
                        '& input': { width: `${Math.max(value.length, 1) + 0.5}ch` },
                    }}
                    data-testid={dataTestId}
                />
                {unit && (
                    <Typography
                        variant='body2'
                        sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}
                    >
                        {unit}
                    </Typography>
                )}
            </Box>
            <IconButton
                aria-label={incrementLabel}
                disabled={incrementDisabled}
                onClick={onIncrement}
                sx={{ ...buttonSx, borderLeft: 1, borderColor: 'divider' }}
                data-testid={dataTestId && `${dataTestId}-increment`}
            >
                <Add fontSize='small' />
            </IconButton>
        </Box>
    );
}
