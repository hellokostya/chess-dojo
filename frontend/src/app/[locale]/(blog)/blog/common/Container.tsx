import { Container as MuiContainer } from '@mui/material';
import { ReactNode } from 'react';

export const Container = ({ children }: { children: ReactNode }) => {
    return (
        <MuiContainer maxWidth='md' sx={{ py: { xs: 3, sm: 6 }, maxWidth: '800px !important' }}>
            {children}
        </MuiContainer>
    );
};
