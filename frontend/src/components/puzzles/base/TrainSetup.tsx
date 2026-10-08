'use client';

import { PuzzlebaseTaxonomy } from '@jackstenglein/chess-dojo-common/src/puzzlebase/api';
import { TrainQuery } from '@jackstenglein/chess-dojo-common/src/puzzlebase/runs';
import { History, PlayArrow } from '@mui/icons-material';
import {
    Alert,
    Autocomplete,
    Box,
    Button,
    Container,
    Paper,
    Slider,
    Stack,
    TextField,
    ToggleButton,
    ToggleButtonGroup,
    Typography,
} from '@mui/material';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { bucketColor } from './bucketStyle';
import { sortThemes } from './BucketThemeMenu';
import {
    ALL_RATINGS,
    defaultRatingWindow,
    PUZZLES_PER_BATCH,
    RATING_SLIDER_MAX,
    SESSION_MINUTES,
    SessionLength,
} from './trainingPuzzles';

/** One thing the member can choose to focus on: anything, a bucket, or one theme. */
interface FocusOption {
    kind: 'any' | 'bucket' | 'theme';
    label: string;
    /** The bucket the option is listed under. */
    group: string;
}

const ANYTHING: FocusOption = { kind: 'any', label: 'Anything', group: 'All puzzles' };

interface TrainSetupProps {
    taxonomy: PuzzlebaseTaxonomy;
    /** The member's own rating, which the default puzzle rating range is built around. */
    userRating: number;
    /** Whether puzzles are being fetched. */
    loading: boolean;
    /** Something to tell the member, such as that no puzzles matched. */
    message?: string;
    onStart: (query: TrainQuery, length: SessionLength) => void;
}

/**
 * Where a member chooses what to train on: how hard the puzzles are, whether to focus on one
 * bucket or theme, and for how long. The rating range starts as all ratings.
 */
export function TrainSetup({ taxonomy, userRating, loading, message, onStart }: TrainSetupProps) {
    const aroundYou = useMemo(() => defaultRatingWindow(userRating), [userRating]);
    const [range, setRange] = useState<[number, number]>(ALL_RATINGS);
    const [focus, setFocus] = useState<FocusOption>(ANYTHING);
    const [length, setLength] = useState<SessionLength>(20);
    const allRatings = range[0] === ALL_RATINGS[0] && range[1] === ALL_RATINGS[1];

    const options = useMemo<FocusOption[]>(
        () => [
            ANYTHING,
            ...Object.entries(taxonomy.buckets).flatMap(([bucket, themes]) => [
                { kind: 'bucket' as const, label: bucket, group: bucket },
                ...sortThemes(themes).map((theme) => ({
                    kind: 'theme' as const,
                    label: theme,
                    group: bucket,
                })),
            ]),
        ],
        [taxonomy],
    );

    const start = () =>
        onStart(
            {
                // All ratings leaves the range open, so puzzles above the slider are included.
                ...(allRatings ? {} : { minRating: range[0], maxRating: range[1] }),
                count: PUZZLES_PER_BATCH,
                ...(focus.kind === 'bucket' ? { bucket: focus.label } : {}),
                ...(focus.kind === 'theme' ? { theme: focus.label } : {}),
            },
            length,
        );

    return (
        <Container maxWidth='sm' sx={{ py: { xs: 4, md: 8 } }}>
            <Stack sx={{ gap: 3 }}>
                <Stack sx={{ gap: 0.5 }}>
                    <Typography variant='h4' sx={{ fontWeight: 'bold' }}>
                        Train
                    </Typography>
                    <Typography color='text.secondary'>
                        Puzzles from the Dojo PuzzleBase. Every move you try is saved to your Puzzle
                        Stats.
                    </Typography>
                </Stack>

                <Paper variant='outlined' sx={{ p: 3 }}>
                    <Stack sx={{ gap: 3 }}>
                        <Box>
                            <Typography
                                variant='overline'
                                sx={{ color: 'text.secondary', lineHeight: 1.4 }}
                            >
                                Puzzle rating
                            </Typography>
                            <Typography variant='h6' sx={{ fontWeight: 'bold' }}>
                                {allRatings ? 'All ratings' : `${range[0]}–${range[1]}`}
                            </Typography>
                            <Slider
                                value={range}
                                onChange={(_, value) => setRange(value as [number, number])}
                                min={0}
                                max={RATING_SLIDER_MAX}
                                step={50}
                                disableSwap
                                valueLabelDisplay='auto'
                                getAriaLabel={(index) =>
                                    index === 0 ? 'Lowest puzzle rating' : 'Highest puzzle rating'
                                }
                            />
                            <Stack
                                direction='row'
                                sx={{ alignItems: 'center', justifyContent: 'space-between' }}
                            >
                                <Typography variant='body2' color='text.secondary'>
                                    Drag the ends to train on harder or easier puzzles.
                                </Typography>
                                <Stack direction='row'>
                                    {userRating > 0 && (
                                        <Button
                                            size='small'
                                            color='inherit'
                                            onClick={() => setRange(aroundYou)}
                                            disabled={
                                                range[0] === aroundYou[0] &&
                                                range[1] === aroundYou[1]
                                            }
                                        >
                                            Around my rating
                                        </Button>
                                    )}
                                    <Button
                                        size='small'
                                        color='inherit'
                                        onClick={() => setRange(ALL_RATINGS)}
                                        disabled={allRatings}
                                    >
                                        All ratings
                                    </Button>
                                </Stack>
                            </Stack>
                        </Box>

                        <Autocomplete
                            options={options}
                            value={focus}
                            onChange={(_, value) => setFocus(value ?? ANYTHING)}
                            groupBy={(option) => option.group}
                            getOptionLabel={(option) => option.label}
                            // A theme listed under several buckets appears under each of them.
                            getOptionKey={(option) =>
                                `${option.group}|${option.kind}|${option.label}`
                            }
                            isOptionEqualToValue={(a, b) =>
                                a.kind === b.kind && a.label === b.label && a.group === b.group
                            }
                            disableClearable
                            renderOption={(props, option) => {
                                const { key, ...rest } = props as typeof props & { key: string };
                                return (
                                    <li key={key} {...rest}>
                                        <Typography
                                            sx={{
                                                fontWeight:
                                                    option.kind === 'theme' ? undefined : 'bold',
                                                pl: option.kind === 'theme' ? 2 : 0,
                                                color:
                                                    option.kind === 'bucket'
                                                        ? bucketColor(option.label)
                                                        : undefined,
                                            }}
                                        >
                                            {option.kind === 'bucket'
                                                ? `All ${option.label}`
                                                : option.label}
                                        </Typography>
                                    </li>
                                );
                            }}
                            renderInput={(params) => <TextField {...params} label='Focus on' />}
                        />

                        <Box>
                            <Typography
                                variant='overline'
                                sx={{ color: 'text.secondary', lineHeight: 1.4, display: 'block' }}
                            >
                                Session length
                            </Typography>
                            <ToggleButtonGroup
                                exclusive
                                size='small'
                                value={length}
                                onChange={(_, value: SessionLength | null) =>
                                    value && setLength(value)
                                }
                                aria-label='Session length'
                            >
                                {SESSION_MINUTES.map((minutes) => (
                                    <ToggleButton key={minutes} value={minutes} sx={{ px: 2 }}>
                                        {minutes} min
                                    </ToggleButton>
                                ))}
                                <ToggleButton value='unlimited' sx={{ px: 2 }}>
                                    Unlimited
                                </ToggleButton>
                            </ToggleButtonGroup>
                        </Box>
                    </Stack>
                </Paper>

                {message && <Alert severity='info'>{message}</Alert>}

                <Button
                    variant='contained'
                    size='large'
                    startIcon={<PlayArrow />}
                    disabled={loading}
                    onClick={start}
                    sx={{ py: 1.5, fontSize: '1.1rem', fontWeight: 'bold' }}
                >
                    {loading ? 'Finding puzzles…' : 'Start training'}
                </Button>
                <Button
                    component={Link}
                    href='/puzzles/train/history'
                    color='inherit'
                    startIcon={<History />}
                    sx={{ alignSelf: 'center' }}
                >
                    View past runs
                </Button>
            </Stack>
        </Container>
    );
}
