'use client';

import { SAMPLE_PGNS } from '@jackstenglein/chess-dojo-common/src/puzzlebase/samplePgns';
import { ExpandMore } from '@mui/icons-material';
import {
    Accordion,
    AccordionDetails,
    AccordionSummary,
    Button,
    Stack,
    Typography,
} from '@mui/material';

const monoSx = { fontFamily: 'monospace', fontSize: '0.8rem' } as const;

const RULES: { marker: string; text: string }[] = [
    {
        marker: 'Main line',
        text: 'The moves in the main line are the solution. The solver plays the first move.',
    },
    {
        marker: '(variation)',
        text: 'A variation on an opponent move is another defense the solver must beat.',
    },
    {
        marker: 'SKIP',
        text: 'A defense whose comment starts with SKIP is left out of the puzzle. It still shows in the analysis.',
    },
    {
        marker: 'ALT',
        text: 'A variation on a solver move whose comment starts with ALT is another solution. The solver is not told the main move. They can try again, or play the alternate out, and missing a move in it counts like any other miss.',
    },
    {
        marker: 'ALT2',
        text: 'Starts a comment on a move that is good but not the best. The solver is told there is a better one and tries again, at no cost.',
    },
];

/** A short guide to writing a puzzle PGN, with examples that can be loaded into the field. */
export function PgnGuide({ onUse }: { onUse: (pgn: string) => void }) {
    return (
        <Accordion disableGutters variant='outlined' sx={{ '&::before': { display: 'none' } }}>
            <AccordionSummary expandIcon={<ExpandMore />} aria-controls='pgn-guide'>
                <Typography sx={{ fontWeight: 600 }}>How to write a puzzle PGN</Typography>
            </AccordionSummary>
            <AccordionDetails id='pgn-guide'>
                <Stack sx={{ gap: 2 }}>
                    <Stack sx={{ gap: 0.75 }}>
                        {RULES.map((rule) => (
                            <Typography key={rule.marker} variant='body2'>
                                <Typography
                                    component='span'
                                    variant='body2'
                                    sx={{ ...monoSx, fontWeight: 'bold' }}
                                >
                                    {rule.marker}
                                </Typography>
                                {' — '}
                                {rule.text}
                            </Typography>
                        ))}
                    </Stack>
                    {SAMPLE_PGNS.map((sample) => (
                        <Stack key={sample.title} sx={{ gap: 0.75 }}>
                            <Stack
                                direction='row'
                                sx={{ justifyContent: 'space-between', alignItems: 'center' }}
                            >
                                <Typography sx={{ fontWeight: 600 }}>{sample.title}</Typography>
                                <Button size='small' onClick={() => onUse(sample.pgn)}>
                                    Use this example
                                </Button>
                            </Stack>
                            <Typography variant='body2' color='text.secondary'>
                                {sample.lesson}
                            </Typography>
                            <Typography
                                component='pre'
                                sx={{
                                    ...monoSx,
                                    m: 0,
                                    p: 1.5,
                                    border: 1,
                                    borderColor: 'divider',
                                    borderRadius: 1,
                                    whiteSpace: 'pre-wrap',
                                    wordBreak: 'break-word',
                                    maxHeight: 180,
                                    overflowY: 'auto',
                                }}
                            >
                                {sample.pgn.split('\n\n').pop()}
                            </Typography>
                        </Stack>
                    ))}
                </Stack>
            </AccordionDetails>
        </Accordion>
    );
}
