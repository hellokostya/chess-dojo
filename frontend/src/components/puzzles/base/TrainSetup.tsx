'use client';

import { PuzzlebaseTaxonomy } from '@jackstenglein/chess-dojo-common/src/puzzlebase/api';
import {
    hasPuzzles,
    TrainingTagSet,
    TrainQuery,
} from '@jackstenglein/chess-dojo-common/src/puzzlebase/runs';
import { Bolt, History, PlayArrow } from '@mui/icons-material';
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
import { alpha } from '@mui/material/styles';
import Link from 'next/link';
import { ReactNode, useMemo, useState } from 'react';
import { BookPile } from './BookPile';
import { bucketColor } from './bucketStyle';
import { sortThemes } from './BucketThemeMenu';
import { CounterplayIcon } from './CounterplayIcon';
import {
    ALL_RATINGS,
    defaultRatingWindow,
    PUZZLES_PER_BATCH,
    RATING_SLIDER_MAX,
    SESSION_MINUTES,
    SessionLength,
} from './trainingPuzzles';

/** What kind of puzzles to train on: one type of puzzle, or both. */
export type TrainType = 'Tactics' | 'Strategy' | 'Mixed';

const TRAIN_TYPES: TrainType[] = ['Tactics', 'Strategy', 'Mixed'];

/** How each type looks on its button: an icon and a color deep enough for white text. */
const TYPE_STYLE: Record<TrainType, { color: string; icon: ReactNode }> = {
    Tactics: { color: '#2e7d32', icon: <Bolt /> },
    Strategy: { color: '#b88a00', icon: <BookPile /> },
    Mixed: { color: '#e65100', icon: <CounterplayIcon /> },
};

/** One thing the member can choose to focus on: anything, a phase of the game, or one theme. */
interface FocusOption {
    kind: 'any' | 'bucket' | 'theme';
    label: string;
    /** The bucket the option is listed under. */
    group: string;
}

const ANYTHING: FocusOption = { kind: 'any', label: 'All Themes', group: 'All puzzles' };

/** The buckets that say what kind of puzzle it is. The others are phases of the game. */
const TYPE_BUCKETS = new Set(['Tactics', 'Strategy']);

/**
 * What can be focused on for a type of puzzle: all themes, each phase of the game, and the themes.
 * The type itself is chosen with the big buttons, so it is not offered again, and with Tactics
 * chosen the themes that only belong to Strategy are left out, and the other way around.
 */
export function focusOptions(
    taxonomy: PuzzlebaseTaxonomy,
    type: TrainType,
    available?: TrainingTagSet[],
): FocusOption[] {
    // Only choices that find puzzles. Until we know what there is, everything is offered.
    const typeBuckets = type === 'Mixed' ? [] : [type];
    const found = (wanted: { buckets?: string[]; theme?: string }) =>
        available === undefined ||
        hasPuzzles(available, { ...wanted, buckets: [...typeBuckets, ...(wanted.buckets ?? [])] });

    const options: FocusOption[] = [ANYTHING];
    for (const [bucket, themes] of Object.entries(taxonomy.buckets)) {
        const isType = TYPE_BUCKETS.has(bucket);
        if (isType && type !== 'Mixed' && bucket !== type) continue;
        if (!isType && found({ buckets: [bucket] })) {
            options.push({ kind: 'bucket', label: bucket, group: bucket });
        }
        options.push(
            ...sortThemes(themes)
                .filter((theme) => found({ theme }))
                .map((theme) => ({ kind: 'theme' as const, label: theme, group: bucket })),
        );
    }
    return options;
}

/** The query for a type of puzzle and a focus: the buckets a puzzle must have, and its theme. */
export function focusQuery(
    type: TrainType,
    focus: FocusOption,
): Pick<TrainQuery, 'bucket' | 'theme'> {
    const buckets = [
        type === 'Mixed' ? undefined : type,
        focus.kind === 'bucket' ? focus.label : undefined,
    ].filter((bucket): bucket is string => bucket !== undefined);
    return {
        ...(buckets.length > 0 ? { bucket: buckets.join(',') } : {}),
        ...(focus.kind === 'theme' ? { theme: focus.label } : {}),
    };
}

interface TrainSetupProps {
    taxonomy: PuzzlebaseTaxonomy;
    /** The tags the puzzles have, so only choices that find puzzles are offered. */
    available?: TrainingTagSet[];
    /** The member's own rating, which the default puzzle rating range is built around. */
    userRating: number;
    /** Whether puzzles are being fetched. */
    loading: boolean;
    /** Something to tell the member, such as that no puzzles matched. */
    message?: string;
    onStart: (query: TrainQuery, length: SessionLength) => void;
}

/**
 * Where a member chooses what to train on: tactics, strategy or a mix, whether to focus on one
 * phase or theme, how hard the puzzles are, and for how long. The rating range starts as all ratings.
 */
export function TrainSetup({
    taxonomy,
    available,
    userRating,
    loading,
    message,
    onStart,
}: TrainSetupProps) {
    const aroundYou = useMemo(() => defaultRatingWindow(userRating), [userRating]);
    const [range, setRange] = useState<[number, number]>(ALL_RATINGS);
    const [type, setType] = useState<TrainType>('Tactics');
    const [focus, setFocus] = useState<FocusOption>(ANYTHING);
    const [length, setLength] = useState<SessionLength>(20);
    const allRatings = range[0] === ALL_RATINGS[0] && range[1] === ALL_RATINGS[1];

    const options = useMemo(
        () => focusOptions(taxonomy, type, available),
        [taxonomy, type, available],
    );

    /** Picks a type of puzzle. A focus that does not belong to it is dropped. */
    const chooseType = (next: TrainType) => {
        setType(next);
        const stillThere = focusOptions(taxonomy, next, available).some(
            (o) => o.kind === focus.kind && o.label === focus.label && o.group === focus.group,
        );
        if (!stillThere) setFocus(ANYTHING);
    };

    const start = () =>
        onStart(
            {
                // All ratings leaves the range open, so puzzles above the slider are included.
                ...(allRatings ? {} : { minRating: range[0], maxRating: range[1] }),
                count: PUZZLES_PER_BATCH,
                ...focusQuery(type, focus),
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
                        <ToggleButtonGroup
                            exclusive
                            fullWidth
                            value={type}
                            onChange={(_, value: TrainType | null) => value && chooseType(value)}
                            aria-label='Type of puzzle'
                        >
                            {TRAIN_TYPES.map((option) => (
                                <ToggleButton
                                    key={option}
                                    value={option}
                                    sx={{
                                        // Square boxes with the name on top and the icon under it.
                                        aspectRatio: '1 / 1',
                                        flexDirection: 'column',
                                        gap: 1,
                                        fontSize: '1.15rem',
                                        fontWeight: 'bold',
                                        textTransform: 'none',
                                        color: 'text.primary',
                                        // Colored even when not selected: a tint and a colored edge.
                                        bgcolor: alpha(TYPE_STYLE[option].color, 0.34),
                                        borderColor: alpha(TYPE_STYLE[option].color, 0.6),
                                        '&:hover': {
                                            bgcolor: alpha(TYPE_STYLE[option].color, 0.48),
                                        },
                                        '& svg': {
                                            color: TYPE_STYLE[option].color,
                                            fontSize: '3.5rem',
                                        },
                                        // Selected, the box fills with the color.
                                        '&.Mui-selected, &.Mui-selected:hover': {
                                            bgcolor: TYPE_STYLE[option].color,
                                            color: '#fff',
                                            '& svg': { color: '#fff' },
                                        },
                                    }}
                                >
                                    {option}
                                    {TYPE_STYLE[option].icon}
                                </ToggleButton>
                            ))}
                        </ToggleButtonGroup>

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
                            renderInput={(params) => <TextField {...params} label='Themes' />}
                        />

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
