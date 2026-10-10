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
import { alpha, darken } from '@mui/material/styles';
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
    const isAroundYou = range[0] === aroundYou[0] && range[1] === aroundYou[1];

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
                            sx={{ gap: 1.5 }}
                        >
                            {TRAIN_TYPES.map((option) => {
                                const { color, icon } = TYPE_STYLE[option];
                                return (
                                    <ToggleButton
                                        key={option}
                                        value={option}
                                        sx={{
                                            // The group squares off its buttons; this makes them separate,
                                            // rounded cards. The doubled & wins over the group's rules.
                                            '&&': {
                                                m: 0,
                                                borderRadius: '18px',
                                                border: '2px solid',
                                                borderColor: alpha(color, 0.55),
                                            },
                                            // Square, with the name and the icon in the middle.
                                            aspectRatio: '1 / 1',
                                            flexDirection: 'column',
                                            justifyContent: 'center',
                                            gap: 1.5,
                                            textAlign: 'center',
                                            textTransform: 'none',
                                            color: 'text.primary',
                                            fontSize: { xs: '1.35rem', sm: '1.75rem' },
                                            fontWeight: 800,
                                            letterSpacing: 0.3,
                                            lineHeight: 1.1,
                                            // Colored even when not selected: a tint that fades down.
                                            background: `linear-gradient(160deg, ${alpha(color, 0.4)}, ${alpha(color, 0.14)})`,
                                            transition:
                                                'transform 150ms, box-shadow 150ms, background 150ms',
                                            '& svg': {
                                                color,
                                                fontSize: { xs: '3rem', sm: '4rem' },
                                                filter: `drop-shadow(0 2px 4px ${alpha(color, 0.35)})`,
                                            },
                                            '&:hover': {
                                                transform: 'translateY(-2px)',
                                                background: `linear-gradient(160deg, ${alpha(color, 0.52)}, ${alpha(color, 0.22)})`,
                                            },
                                            // Selected, the card fills with the color and lifts.
                                            '&.Mui-selected, &.Mui-selected:hover': {
                                                background: `linear-gradient(160deg, ${color}, ${darken(color, 0.28)})`,
                                                color: '#fff',
                                                transform: 'translateY(-3px)',
                                                boxShadow: `0 10px 24px ${alpha(color, 0.45)}`,
                                                '& svg': { color: '#fff', filter: 'none' },
                                            },
                                        }}
                                    >
                                        {option}
                                        {icon}
                                    </ToggleButton>
                                );
                            })}
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
                            <Stack direction='row' sx={{ justifyContent: 'center', mt: 1 }}>
                                <ToggleButtonGroup
                                    exclusive
                                    size='small'
                                    value={allRatings ? 'all' : isAroundYou ? 'around' : null}
                                    onChange={(_, value: 'all' | 'around' | null) => {
                                        if (value === 'all') setRange(ALL_RATINGS);
                                        if (value === 'around') setRange(aroundYou);
                                    }}
                                    aria-label='Rating range'
                                    sx={{
                                        '& .MuiToggleButton-root': {
                                            px: 3,
                                            textTransform: 'none',
                                            fontWeight: 600,
                                        },
                                        // The one in use is filled, so it is clear which it is.
                                        '& .Mui-selected, & .Mui-selected:hover': {
                                            bgcolor: 'primary.main',
                                            color: 'primary.contrastText',
                                        },
                                    }}
                                >
                                    <ToggleButton value='all'>All ratings</ToggleButton>
                                    {userRating > 0 && (
                                        <ToggleButton value='around'>Around my rating</ToggleButton>
                                    )}
                                </ToggleButtonGroup>
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
