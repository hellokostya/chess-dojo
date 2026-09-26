import { useRequirement } from '@/api/cache/requirements';
import { useAuth } from '@/auth/Auth';
import { TrainingPlanIcon } from '@/components/profile/trainingPlan/TrainingPlanIcon';
import { formatTime, RequirementCategory, ScoreboardDisplay } from '@/database/requirement';
import { TimelineEntry, TimelineSpecialRequirementId } from '@/database/timeline';
import Avatar from '@/profile/Avatar';
import CohortIcon from '@/scoreboard/CohortIcon';
import { CategoryColors } from '@/style/ThemeProvider';
import { ChatBubbleOutlineOutlined, Check, Edit } from '@mui/icons-material';
import { Box, Button, IconButton, LinearProgress, Stack, Tooltip, Typography } from '@mui/material';
import { useTranslations } from 'next-intl';
import GameNewsfeedItem from '../../app/[locale]/(scoreboard)/newsfeed/(detail)/[owner]/[id]/GameNewsfeedItem';
import GraduationNewsfeedItem from '../../app/[locale]/(scoreboard)/newsfeed/(detail)/[owner]/[id]/GraduationNewsfeedItem';
import CommentList from '../comments/CommentList';
import { Link } from '../navigation/Link';
import { useEntryDateTime } from './NewsfeedItemHeader';
import ReactionList from './ReactionList';

/** The size of the avatar column; the entry's content lines up to its right. */
export const AVATAR_SIZE = 36;
export const COLUMN_GAP = 1.5;

/** The author's name, cohort badge and the entry's time, stacked. */
function EntryByline({ entry }: { entry: TimelineEntry }) {
    const t = useTranslations('newsfeed');
    const dateTime = useEntryDateTime(entry);
    const cohort = entry.graduationInfo?.newCohort || entry.cohort;
    return (
        <Stack sx={{ minWidth: 0 }}>
            <Stack direction='row' sx={{ alignItems: 'center', gap: 0.5, minWidth: 0 }}>
                <Typography variant='body2' sx={{ fontWeight: 600 }} noWrap>
                    <Link href={`/profile/${entry.owner}`} sx={{ color: 'inherit' }}>
                        {entry.ownerDisplayName}
                    </Link>
                </Typography>
                <CohortIcon cohort={cohort} size={16} tooltip={t('memberOfCohort', { cohort })} />
            </Stack>
            <Typography variant='caption' sx={{ color: 'text.secondary', lineHeight: 1.3 }}>
                {dateTime}
            </Typography>
        </Stack>
    );
}

/** An entry's author and time beside their avatar. */
export function CompactEntryHeader({ entry }: { entry: TimelineEntry }) {
    return (
        <Stack direction='row' sx={{ alignItems: 'center', gap: COLUMN_GAP, minWidth: 0 }}>
            <Avatar
                username={entry.owner}
                displayName={entry.ownerDisplayName}
                size={AVATAR_SIZE}
            />
            <EntryByline entry={entry} />
        </Stack>
    );
}

/**
 * A newsfeed entry sized for a narrow column, laid out like a social feed: the
 * avatar on the left, and beside it who, what they worked on, and how far it
 * moved them. Reactions and comments sit quietly underneath.
 */
export function CompactNewsfeedItem({
    entry,
    onEdit,
    maxComments,
    onChangeActivity,
    hideCommentLink,
}: {
    entry: TimelineEntry;
    onEdit: (entry: TimelineEntry) => void;
    maxComments?: number;
    /** Hides the link to comment, where a comment box is already shown. */
    hideCommentLink?: boolean;
    /** When given, the owner of the entry gets a button to edit it. */
    onChangeActivity?: (entry: TimelineEntry) => void;
}) {
    const t = useTranslations('newsfeed');
    const { user } = useAuth();
    const link = `/newsfeed/${entry.owner}/${entry.id}`;

    const isGraduation = entry.requirementId === TimelineSpecialRequirementId.Graduation;
    const isGame = entry.requirementId === TimelineSpecialRequirementId.GameSubmission;

    return (
        <Stack
            direction='row'
            sx={{ gap: COLUMN_GAP, alignItems: 'flex-start' }}
            data-testid='compact-newsfeed-item'
        >
            <Avatar
                username={entry.owner}
                displayName={entry.ownerDisplayName}
                size={AVATAR_SIZE}
            />

            <Stack sx={{ gap: 1, flexGrow: 1, minWidth: 0 }}>
                <Box sx={{ mb: 0.75 }}>
                    <EntryByline entry={entry} />
                </Box>

                {isGraduation ? (
                    <GraduationNewsfeedItem entry={entry} />
                ) : isGame ? (
                    <GameNewsfeedItem entry={entry} />
                ) : (
                    <ProgressBody entry={entry} />
                )}

                <Stack
                    direction='row'
                    // Pulled left by the buttons' padding, so their icons line up with
                    // the text above.
                    sx={{ alignItems: 'center', gap: 0.5, ml: '-8px' }}
                >
                    <ReactionList
                        owner={entry.owner}
                        id={entry.id}
                        reactions={entry.reactions}
                        onEdit={onEdit}
                    />
                    {!hideCommentLink && (
                        <Button
                            href={link}
                            size='small'
                            color='inherit'
                            startIcon={
                                <ChatBubbleOutlineOutlined sx={{ fontSize: '1rem !important' }} />
                            }
                            sx={{ color: 'text.secondary', textTransform: 'none', minWidth: 0 }}
                            data-testid='compact-newsfeed-comment'
                        >
                            {entry.comments?.length ? entry.comments.length : t('comment')}
                        </Button>
                    )}
                    <Box sx={{ flexGrow: 1 }} />
                    {onChangeActivity && entry.owner === user?.username && (
                        <Tooltip title={t('editActivity')}>
                            <IconButton
                                size='small'
                                aria-label={t('editActivity')}
                                onClick={() => onChangeActivity(entry)}
                                sx={{ color: 'text.secondary' }}
                                data-testid='compact-newsfeed-edit'
                            >
                                <Edit sx={{ fontSize: '1rem' }} />
                            </IconButton>
                        </Tooltip>
                    )}
                </Stack>

                {Boolean(entry.comments?.length) && (
                    <CommentList
                        comments={entry.comments}
                        maxComments={maxComments}
                        viewCommentsLink={link}
                    />
                )}
            </Stack>
        </Stack>
    );
}

/** The task worked on: its category icon in the category's colour, and its name. */
function TaskLine({ category, name }: { category: RequirementCategory; name: string }) {
    const color = CategoryColors[category];
    return (
        <Stack direction='row' sx={{ alignItems: 'center', gap: 0.75, minWidth: 0 }}>
            <TrainingPlanIcon category={category} sx={{ fontSize: '1.1rem', color }} />
            <Typography sx={{ fontWeight: 600, fontSize: '0.95rem', lineHeight: 1.3 }}>
                {name}
            </Typography>
        </Stack>
    );
}

/**
 * What the entry did to its task: the task, a bar showing where it now stands,
 * the change this entry made ("+5 exercises" or "Completed"), and the time logged.
 */
function ProgressBody({ entry }: { entry: TimelineEntry }) {
    const t = useTranslations('newsfeed');
    const tCommon = useTranslations('common');
    const { requirement } = useRequirement(entry.requirementId);

    const isTime = entry.scoreboardDisplay === ScoreboardDisplay.Minutes;
    const hasBar =
        entry.scoreboardDisplay === ScoreboardDisplay.ProgressBar ||
        entry.scoreboardDisplay === ScoreboardDisplay.Yearly ||
        entry.scoreboardDisplay === ScoreboardDisplay.Minutes ||
        entry.scoreboardDisplay === ScoreboardDisplay.Unspecified;
    const isComplete = entry.totalCount > 0 && entry.newCount >= entry.totalCount;

    // Counts are shown from the task's start, as on the training plan: a task
    // starting at puzzle #307 reads 0 until puzzle #307 is solved.
    const start = requirement?.startCount || 0;
    const current = Math.max(entry.newCount - start, 0);
    const total = Math.max(entry.totalCount - start, 0);
    const delta = isTime ? 0 : current - Math.max(entry.previousCount - start, 0);
    const percent = total > 0 ? Math.min(100, (100 * current) / total) : 0;
    const color = CategoryColors[entry.requirementCategory] ?? undefined;
    const unit = entry.progressBarSuffix?.toLowerCase() ?? '';

    return (
        <Stack spacing={0.75}>
            {entry.requirementCategory && (
                <TaskLine category={entry.requirementCategory} name={entry.requirementName} />
            )}

            {hasBar && total > 0 && (
                <Stack direction='row' sx={{ alignItems: 'center', gap: 1 }}>
                    <LinearProgress
                        variant='determinate'
                        value={percent}
                        sx={{
                            flexGrow: 1,
                            height: 6,
                            borderRadius: 3,
                            backgroundColor: 'action.hover',
                            '& .MuiLinearProgress-bar': { borderRadius: 3, backgroundColor: color },
                        }}
                    />
                    <Typography
                        variant='caption'
                        sx={{
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

            <Stack
                direction='row'
                sx={{ alignItems: 'center', columnGap: 1, flexWrap: 'wrap' }}
                data-testid='entry-deltas'
            >
                {isComplete ? (
                    <Typography
                        variant='caption'
                        sx={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 0.25,
                            fontWeight: 600,
                            color: 'success.main',
                        }}
                    >
                        <Check sx={{ fontSize: '0.9rem' }} />
                        {t('completed')}
                    </Typography>
                ) : (
                    delta !== 0 && (
                        <Typography
                            variant='caption'
                            sx={{
                                fontWeight: 600,
                                color: delta > 0 ? 'success.main' : 'warning.main',
                            }}
                        >
                            {`${delta > 0 ? '+' : '−'}${Math.abs(delta)} ${
                                Math.abs(delta) === 1 ? singularUnit(unit) : unit
                            }`.trim()}
                        </Typography>
                    )
                )}
                {entry.minutesSpent !== 0 && (
                    <Typography variant='caption' sx={{ color: 'text.secondary' }}>
                        {`${entry.minutesSpent > 0 ? '+' : '−'}${formatTime(
                            Math.abs(entry.minutesSpent),
                            tCommon,
                        )}`}
                    </Typography>
                )}
            </Stack>

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

/**
 * The singular of a task's unit, which the task data gives in the plural:
 * "games" becomes "game", "studies" becomes "study", "matches" becomes "match".
 */
export function singularUnit(unit: string): string {
    if (/ies$/i.test(unit)) {
        return unit.replace(/ies$/i, 'y');
    }
    if (/(ches|shes|sses|xes)$/i.test(unit)) {
        return unit.slice(0, -2);
    }
    if (/[^s]s$/i.test(unit)) {
        return unit.slice(0, -1);
    }
    return unit;
}
