import { RequirementCategory, ScoreboardDisplay } from '@/database/requirement';
import { TimelineEntry } from '@/database/timeline';
import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/auth/Auth', () => ({
    useAuth: () => ({ user: { timezoneOverride: undefined, timeFormat: undefined } }),
}));

vi.mock('@/profile/Avatar', () => ({
    default: () => <div data-testid='avatar' />,
}));

vi.mock('@/scoreboard/CohortIcon', () => ({
    default: () => <div data-testid='cohort-icon' />,
}));

vi.mock('../navigation/Link', () => ({
    Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));

import NewsfeedItemHeader from './NewsfeedItemHeader';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const allMessages = require('../../../messages/en.json') as Record<string, Record<string, unknown>>;
const messages = { newsfeed: allMessages.newsfeed };

function renderWithIntl(ui: React.ReactElement) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { NextIntlClientProvider } = require('next-intl') as {
        NextIntlClientProvider: React.FC<{
            locale: string;
            messages: Record<string, unknown>;
            children: React.ReactNode;
        }>;
    };
    return render(
        <NextIntlClientProvider locale='en' messages={messages}>
            {ui}
        </NextIntlClientProvider>,
    );
}

function baseEntry(overrides: Partial<TimelineEntry> = {}): TimelineEntry {
    return {
        owner: 'testuser',
        id: 'entry1',
        ownerDisplayName: 'Test User',
        cohort: '1500-1600',
        requirementId: 'games-and-analysis',
        requirementName: 'Games + Analysis',
        requirementCategory: RequirementCategory.Games,
        scoreboardDisplay: ScoreboardDisplay.ProgressBar,
        progressBarSuffix: '',
        totalCount: 100,
        previousCount: 0,
        newCount: 30,
        dojoPoints: 1,
        totalDojoPoints: 1,
        minutesSpent: 30,
        totalMinutesSpent: 30,
        createdAt: new Date().toISOString(),
        notes: '',
        comments: [],
        reactions: {},
        ...overrides,
    };
}

describe('NewsfeedItemHeader', () => {
    afterEach(() => {
        cleanup();
    });

    it('does not render the Auto badge for a manually-logged entry', () => {
        renderWithIntl(<NewsfeedItemHeader entry={baseEntry()} />);
        expect(screen.queryByText('Auto')).not.toBeInTheDocument();
    });

    it('renders the Auto badge for an auto-logged entry', () => {
        renderWithIntl(
            <NewsfeedItemHeader
                entry={baseEntry({
                    gameInfo: { id: 'game1', headers: {}, autoLogged: true, source: 'lichess' },
                })}
            />,
        );
        expect(screen.getByText('Auto')).toBeInTheDocument();
    });

    it('does not render the Auto badge when gameInfo has no autoLogged flag', () => {
        renderWithIntl(
            <NewsfeedItemHeader
                entry={baseEntry({
                    gameInfo: { id: 'game1', headers: {} },
                })}
            />,
        );
        expect(screen.queryByText('Auto')).not.toBeInTheDocument();
    });
});
