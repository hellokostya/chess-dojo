import { useApi } from '@/api/Api';
import { TimelineEntry, TimelineSpecialRequirementId } from '@/database/timeline';
import { Box, Card, CardContent } from '@mui/material';
import CommentEditor from '../comments/CommentEditor';
import { AVATAR_SIZE, COLUMN_GAP, CompactNewsfeedItem } from './CompactNewsfeedItem';

export const isRestDayEntry = (entry: TimelineEntry) =>
    entry.requirementId === TimelineSpecialRequirementId.RestDay;

interface NewsfeedItemProps {
    entry: TimelineEntry;
    onEdit: (entry: TimelineEntry) => void;
    maxComments?: number;
    onChangeActivity?: (entry: TimelineEntry) => void;
}

/**
 * A newsfeed entry on the newsfeed page: the same entry as the profile's feed,
 * in its own card, with a box to comment on it directly.
 */
const NewsfeedItem: React.FC<NewsfeedItemProps> = ({
    entry,
    onEdit,
    maxComments,
    onChangeActivity,
}) => {
    const api = useApi();

    return (
        <Card variant='outlined'>
            <CardContent>
                <CompactNewsfeedItem
                    entry={entry}
                    onEdit={onEdit}
                    maxComments={maxComments}
                    onChangeActivity={onChangeActivity}
                    hideCommentLink
                />
                {/* Lined up with the entry's content, to the right of the avatar. */}
                <Box
                    sx={{
                        pl: `calc(${AVATAR_SIZE}px + ${COLUMN_GAP} * var(--mui-spacing, 8px))`,
                        mt: 1,
                    }}
                >
                    <CommentEditor
                        createFunctionProps={{ owner: entry.owner, id: entry.id }}
                        createFunction={api.createNewsfeedComment}
                        onSuccess={onEdit}
                    />
                </Box>
            </CardContent>
        </Card>
    );
};

export default NewsfeedItem;
