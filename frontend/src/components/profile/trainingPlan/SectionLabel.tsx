import { Typography } from '@mui/material';

/** A form row's label, in the dialog's heading style. */
export function SectionLabel({ children }: { children: React.ReactNode }) {
    return (
        <Typography className='section-label' sx={{ fontSize: '1rem', fontWeight: 600 }}>
            {children}
        </Typography>
    );
}
