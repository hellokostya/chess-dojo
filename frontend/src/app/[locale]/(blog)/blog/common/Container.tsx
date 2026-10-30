import { Container as MuiContainer } from '@mui/material';
import { ReactNode } from 'react';

export const Container = ({ children }: { children: ReactNode }) => {
    return (
        <MuiContainer
            maxWidth='md'
            sx={{
                py: { xs: 3, sm: 6 },
                maxWidth: '800px !important',
                // Legacy articles use MUI headings instead of the Markdown renderer.
                // Keep the title/subtitle in Header independent of article sections.
                '& :is(h2, h3, h4, h5, h6):not([data-testid="blog-header"] *)': {
                    color: 'text.primary',
                    fontWeight: 800,
                    lineHeight: 1.25,
                    letterSpacing: '-0.02em',
                    mt: 5,
                    mb: 2,
                    '& strong, & em, & a': { fontSize: 'inherit', fontWeight: 'inherit' },
                },
                '& :is(h2, h3):not([data-testid="blog-header"] *)': {
                    fontSize: { xs: '1.75rem', sm: '2rem' },
                    pb: 1.25,
                    borderBottom: '2px solid',
                    borderColor: 'divider',
                },
                '& :is(h4, h5, h6):not([data-testid="blog-header"] *)': {
                    fontSize: { xs: '1.4rem', sm: '1.6rem' },
                },
            }}
        >
            {children}
        </MuiContainer>
    );
};
