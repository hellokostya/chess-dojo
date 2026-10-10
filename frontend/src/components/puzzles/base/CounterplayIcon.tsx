import { SvgIcon, SvgIconProps } from '@mui/material';

/**
 * The chess symbol for counterplay: two long arrows running in opposite directions, the top one to
 * the right and the bottom one to the left. The icon for mixed training, where both sides get play.
 */
export function CounterplayIcon(props: SvgIconProps) {
    return (
        <SvgIcon {...props}>
            <path
                d='M3 8h18M16.5 3.5 21 8l-4.5 4.5M21 16H3M7.5 11.5 3 16l4.5 4.5'
                fill='none'
                stroke='currentColor'
                strokeWidth={2.2}
                strokeLinecap='round'
                strokeLinejoin='round'
            />
        </SvgIcon>
    );
}
