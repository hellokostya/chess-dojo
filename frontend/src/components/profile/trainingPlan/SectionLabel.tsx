import { Typography } from '@mui/material';

/** A small heading for a section of the form. */
export function SectionLabel({ children }: { children: React.ReactNode }) {
    return (
        <Typography
            variant='caption'
            sx={{
                color: 'text.secondary',
                fontWeight: 600,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
            }}
        >
            {children}
        </Typography>
    );
}
