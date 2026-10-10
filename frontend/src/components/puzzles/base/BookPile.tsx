import { SvgIcon, SvgIconProps } from '@mui/material';

/**
 * A small pile of three books lying flat, one on top of the other, each a little off to the side,
 * with a band on the spine. The icon for strategy: study and plans.
 */
export function BookPile(props: SvgIconProps) {
    return (
        <SvgIcon {...props}>
            <path
                fillRule='evenodd'
                d={[
                    // Top book.
                    'M5 3h12a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z',
                    'M7 3v6h1V3Z',
                    // Middle book.
                    'M7 10h13a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1Z',
                    'M9 10v5h1v-5Z',
                    // Bottom book.
                    'M4 16h13a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1Z',
                    'M6 16v5h1v-5Z',
                ].join('')}
            />
        </SvgIcon>
    );
}
