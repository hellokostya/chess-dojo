import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import { Button, InputBase, Slider, Stack, Typography } from '@mui/material';
import { useTranslations } from 'next-intl';
import { useRef } from 'react';
import { SectionLabel } from './SectionLabel';

interface InputSliderProps {
    value: number;
    setValue: React.Dispatch<React.SetStateAction<number>>;
    max: number;
    min: number;
    suffix?: string;
}

export const InputSlider = ({ value, setValue, max, min, suffix }: InputSliderProps) => {
    const t = useTranslations('profile.trainingPlan.inputSlider');
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const handleSliderChange = (_: Event, newValue: number | number[]) => {
        setValue(newValue as number);
    };

    const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        let value = event.target.value === '' ? 0 : parseInt(event.target.value);
        if (isNaN(value)) {
            value = 0;
        }
        setValue(value);
    };

    const handleBlur = () => {
        if (value < min) {
            setValue(min);
        }
    };

    const stopRepeating = () => {
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }
    };

    const handleDecrement = () => {
        stopRepeating();
        setValue((prev) => Math.max(min, prev - 1));
        timerRef.current = setInterval(() => setValue((prev) => Math.max(min, prev - 1)), 200);
    };

    const handleIncrement = () => {
        stopRepeating();
        setValue((prev) => prev + 1);
        timerRef.current = setInterval(() => setValue((prev) => prev + 1), 200);
    };

    return (
        <Stack spacing={0.5} sx={{ width: 1 }}>
            <Stack
                direction='row'
                sx={{
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    columnGap: 2,
                    rowGap: 1,
                }}
            >
                <SectionLabel>{suffix ?? t('progressCount')}</SectionLabel>
                <Stack direction='row' sx={{ alignItems: 'center', gap: 1 }}>
                    <Stack direction='row' aria-label={suffix ?? t('progressCount')}>
                        <Button
                            data-testid='task-updater-decrement'
                            onPointerDown={handleDecrement}
                            onPointerUp={stopRepeating}
                            onPointerLeave={stopRepeating}
                            onPointerCancel={stopRepeating}
                            disabled={value <= min}
                            variant='outlined'
                            aria-label={t('decrement')}
                            sx={{ px: 1.5, minWidth: 40, borderRadius: '4px 0 0 4px' }}
                        >
                            <RemoveIcon fontSize='small' />
                        </Button>

                        <InputBase
                            data-testid='task-updater-count'
                            value={value}
                            onChange={handleInputChange}
                            onBlur={handleBlur}
                            inputProps={{
                                step: 1,
                                min: min,
                                'aria-label': suffix ?? t('count'),
                                style: {
                                    textAlign: 'center',
                                    MozAppearance: 'textfield',
                                },
                            }}
                            sx={{
                                width: 64,
                                border: 1,
                                borderColor: 'divider',
                                borderLeftWidth: 0,
                                borderRightWidth: 0,
                                '& input::-webkit-outer-spin-button, & input::-webkit-inner-spin-button':
                                    {
                                        WebkitAppearance: 'none',
                                        margin: 0,
                                    },
                            }}
                        />

                        <Button
                            data-testid='task-updater-increment'
                            onPointerDown={handleIncrement}
                            onPointerUp={stopRepeating}
                            onPointerLeave={stopRepeating}
                            onPointerCancel={stopRepeating}
                            variant='outlined'
                            aria-label={t('increment')}
                            sx={{ px: 1.5, minWidth: 40, borderRadius: '0 4px 4px 0' }}
                        >
                            <AddIcon fontSize='small' />
                        </Button>
                    </Stack>
                    <Typography
                        variant='body2'
                        sx={{
                            color: 'text.secondary',
                            fontVariantNumeric: 'tabular-nums',
                            whiteSpace: 'nowrap',
                        }}
                    >
                        / {max}
                    </Typography>
                </Stack>
            </Stack>
            <Slider
                value={typeof value === 'number' ? value : 0}
                onChange={handleSliderChange}
                aria-label={suffix ?? t('progressCount')}
                step={1}
                max={max}
                min={min}
            />
        </Stack>
    );
};
