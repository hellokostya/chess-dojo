import { useRequirement } from '@/api/cache/requirements';
import { useAuth } from '@/auth/Auth';
import { CategoryLabel } from '@/components/profile/trainingPlan/daily/DailyCard';
import { formatTime, RequirementCategory, ScoreboardDisplay } from '@/database/requirement';
import { TimelineEntry, TimelineSpecialRequirementId } from '@/database/timeline';
import Avatar from '@/profile/Avatar';
import CohortIcon from '@/scoreboard/CohortIcon';
import { CategoryColors } from '@/style/ThemeProvider';
import { ChatBubbleOutlineOutlined, Edit } from '@mui/icons-material';
import { Box, Button, IconButton, LinearProgress, Stack, Tooltip, Typography } from '@mui/material';
import { useTranslations } from 'next-intl';
import GameNewsfeedItem from '../../app/[locale]/(scoreboard)/newsfeed/(detail)/[owner]/[id]/GameNewsfeedItem';
import GraduationNewsfeedItem from '../../app/[locale]/(scoreboard)/newsfeed/(detail)/[owner]/[id]/GraduationNewsfeedItem';
import CommentList from '../comments/CommentList';
import { Link } from '../navigation/Link';
import { useEntryDateTime } from './NewsfeedItemHeader';
import ReactionList from './ReactionList';

/** An entry's author, cohort badge and time, compactly. */
export function CompactEntryHeader({ entry }: { entry: TimelineEntry }) {
    const t = useTranslations('newsfeed');
    const dateTime = useEntryDateTime(entry);
    return (
        <Stack direction='row' sx={{ alignItems: 'center', gap: 1.25, minWidth: 0 }}>
            <Avatar username={entry.owner} displayName={entry.ownerDisplayName} size={36} />
            <Stack sx={{ minWidth: 0 }}>
                <Stack direction='row' sx={{ alignItems: 'center', gap: 0.75, minWidth: 0 }}>
                    <Typography variant='body2' sx={{ fontWeight: 600 }} noWrap>
                        <Link href={`/profile/${entry.owner}`}>{entry.ownerDisplayName}</Link>
                    </Typography>
                    <CohortIcon
                        cohort={entry.graduationInfo?.newCohort || entry.cohort}
                        size={18}
                        tooltip={t('memberOfCohort', {
                            cohort: entry.graduationInfo?.newCohort || entry.cohort,
                        })}
                    />
                </Stack>
                <Typography variant='caption' sx={{ color: 'text.secondary' }}>
                    {dateTime}
                </Typography>
            </Stack>
        </Stack>
    );
}

/**
 * Renders a newsfeed entry sized for a narrow sidebar: a small avatar and one line
 * of detail per fact, a slim progress bar, and a link to comment rather than a
 * full comment box on every entry.
 */
export function CompactNewsfeedItem({
    entry,
    onEdit,
    maxComments,
    onChangeActivity,
}: {
    entry: TimelineEntry;
    onEdit: (entry: TimelineEntry) => void;
    maxComments?: number;
    /** When given, the owner of the entry gets a button to edit it. */
    onChangeActivity?: (entry: TimelineEntry) => void;
}) {
    const t = useTranslations('newsfeed');
    const { user } = useAuth();
    const link = `/newsfeed/${entry.owner}/${entry.id}`;

    const isGraduation = entry.requirementId === TimelineSpecialRequirementId.Graduation;
    const isGame = entry.requirementId === TimelineSpecialRequirementId.GameSubmission;
    const category = isGame ? RequirementCategory.Games : entry.requirementCategory;

    return (
        <Stack spacing={1.25} data-testid='compact-newsfeed-item'>
            <Stack
                direction='row'
                sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 1 }}
            >
                <CompactEntryHeader entry={entry} />
                {!isGraduation && category && (
                    <Box sx={{ flexShrink: 0 }}>
                        <CategoryLabel category={category} />
                    </Box>
                )}
            </Stack>

            {isGraduation ? (
                <GraduationNewsfeedItem entry={entry} />
            ) : isGame ? (
                <GameNewsfeedItem entry={entry} />
            ) : (
                <CompactBody entry={entry} />
            )}

            <Stack direction='row' sx={{ alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                {onChangeActivity && entry.owner === user?.username && (
                    <Tooltip title={t('editActivity')}>
                        <IconButton
                            size='small'
                            aria-label={t('editActivity')}
                            onClick={() => onChangeActivity(entry)}
                            sx={{ color: 'text.secondary' }}
                            data-testid='compact-newsfeed-edit'
                        >
                            <Edit fontSize='small' />
                        </IconButton>
                    </Tooltip>
                )}
                <ReactionList
                    owner={entry.owner}
                    id={entry.id}
                    reactions={entry.reactions}
                    onEdit={onEdit}
                />
                <Box sx={{ flexGrow: 1 }} />
                <Button
                    href={link}
                    size='small'
                    color='inherit'
                    startIcon={<ChatBubbleOutlineOutlined sx={{ fontSize: '1rem !important' }} />}
                    sx={{ color: 'text.secondary', textTransform: 'none' }}
                    data-testid='compact-newsfeed-comment'
                >
                    {entry.comments?.length ? entry.comments.length : t('comment')}
                </Button>
            </Stack>

            {Boolean(entry.comments?.length) && (
                <CommentList
                    comments={entry.comments}
                    maxComments={maxComments}
                    viewCommentsLink={link}
                />
            )}
        </Stack>
    );
}

function CompactBody({ entry }: { entry: TimelineEntry }) {
    const t = useTranslations('newsfeed');
    const tCommon = useTranslations('common');
    const { requirement } = useRequirement(entry.requirementId);

    const isComplete = entry.newCount >= entry.totalCount;
    const hasProgress =
        entry.scoreboardDisplay === ScoreboardDisplay.ProgressBar ||
        entry.scoreboardDisplay === ScoreboardDisplay.Yearly ||
        entry.scoreboardDisplay === ScoreboardDisplay.Minutes ||
        entry.scoreboardDisplay === ScoreboardDisplay.Unspecified;

    const min = requirement?.startCount || 0;
    const current = Math.max(entry.newCount - min, 0);
    const total = Math.max(entry.totalCount - min, 0);
    const percent = total > 0 ? Math.min(100, (100 * current) / total) : 0;
    const isTime = entry.scoreboardDisplay === ScoreboardDisplay.Minutes;
    const color = CategoryColors[entry.requirementCategory] ?? undefined;

    return (
        <Stack spacing={0.75}>
            <Typography variant='body2'>
                {t.rich(isComplete ? 'completedRequirement' : 'updatedRequirement', {
                    name: entry.requirementName,
                    strong: (chunks) => <strong>{chunks}</strong>,
                })}
            </Typography>

            {entry.totalMinutesSpent > 0 && entry.minutesSpent > 0 && (
                <Typography variant='caption' sx={{ color: 'text.secondary' }}>
                    {t('totalTime')}{' '}
                    {formatTime(entry.totalMinutesSpent - entry.minutesSpent, tCommon)} →{' '}
                    {formatTime(entry.totalMinutesSpent, tCommon)}
                </Typography>
            )}

            {entry.dojoPoints > 0 && (
                <Typography variant='caption' sx={{ color: 'text.secondary' }}>
                    {t('dojoPoints')}{' '}
                    {Math.round(100 * (entry.totalDojoPoints - entry.dojoPoints)) / 100} →{' '}
                    {Math.round(100 * entry.totalDojoPoints) / 100}
                </Typography>
            )}

            {hasProgress && (
                <Stack direction='row' sx={{ alignItems: 'center', gap: 1 }}>
                    <LinearProgress
                        variant='determinate'
                        value={percent}
                        sx={{
                            flexGrow: 1,
                            height: 6,
                            borderRadius: 3,
                            backgroundColor: 'action.hover',
                            '& .MuiLinearProgress-bar': {
                                borderRadius: 3,
                                backgroundColor: color,
                            },
                        }}
                    />
                    <Typography
                        variant='caption'
                        sx={{
                            color: 'text.secondary',
                            fontWeight: 600,
                            fontVariantNumeric: 'tabular-nums',
                            whiteSpace: 'nowrap',
                        }}
                    >
                        {isTime
                            ? `${formatTime(current, tCommon)} / ${formatTime(total, tCommon)}`
                            : `${current} / ${total}`}
                    </Typography>
                </Stack>
            )}

            {entry.notes && (
                <Typography
                    variant='body2'
                    sx={{ whiteSpace: 'pre-line', color: 'text.secondary' }}
                >
                    {entry.notes}
                </Typography>
            )}
        </Stack>
    );
}
