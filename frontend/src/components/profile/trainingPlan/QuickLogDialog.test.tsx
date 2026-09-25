import { ScoreboardDisplay } from '@/database/requirement';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '../../../../messages/en.json';
import { COHORT, makeTask } from './__fixtures__/tasks';
import { QuickLogDialog } from './QuickLogDialog';

function renderDialog(props: Partial<React.ComponentProps<typeof QuickLogDialog>> = {}) {
    const onSubmit = vi.fn();
    render(
        <NextIntlClientProvider locale='en' messages={messages}>
            <QuickLogDialog
                open
                onClose={vi.fn()}
                task={makeTask()}
                displayName='Solve Puzzles'
                suggestedMinutes={30}
                currentCount={10}
                cohort={COHORT}
                isLoading={false}
                onSubmit={onSubmit}
                {...props}
            />
        </NextIntlClientProvider>,
    );
    return { onSubmit };
}

describe('QuickLogDialog', () => {
    afterEach(cleanup);

    it('starts with the suggested minutes', () => {
        renderDialog();
        expect(screen.getByLabelText('Minutes')).toHaveValue('30');
    });

    it('asks how many units were done on a counted task, and submits them', () => {
        const { onSubmit } = renderDialog();
        expect(screen.queryByTestId('quick-log-mark-complete')).not.toBeInTheDocument();

        fireEvent.click(screen.getByLabelText('Increase count'));
        fireEvent.click(screen.getByLabelText('Increase count'));
        fireEvent.click(screen.getByTestId('quick-log-confirm'));

        expect(onSubmit).toHaveBeenCalledWith({
            minutes: 30,
            markComplete: undefined,
            countDelta: 2,
        });
    });

    it('offers to complete a checkbox task, checked by default', () => {
        const { onSubmit } = renderDialog({
            task: makeTask({
                scoreboardDisplay: ScoreboardDisplay.Checkbox,
                counts: { [COHORT]: 1 },
            }),
            currentCount: 0,
        });
        expect(screen.queryByLabelText('Increase count')).not.toBeInTheDocument();

        fireEvent.click(screen.getByTestId('quick-log-confirm'));
        expect(onSubmit).toHaveBeenCalledWith({
            minutes: 30,
            markComplete: true,
            countDelta: undefined,
        });
    });

    it('asks only for time on a time-only task', () => {
        renderDialog({ task: makeTask({ scoreboardDisplay: ScoreboardDisplay.Minutes }) });
        expect(screen.queryByTestId('quick-log-mark-complete')).not.toBeInTheDocument();
        expect(screen.queryByLabelText('Increase count')).not.toBeInTheDocument();
    });

    it('adds time with the quick-add chips', () => {
        const { onSubmit } = renderDialog();
        fireEvent.click(screen.getByText('+15m'));
        fireEvent.click(screen.getByTestId('quick-log-confirm'));
        expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ minutes: 45 }));
    });

    it('will not submit when nothing would be recorded', () => {
        const { onSubmit } = renderDialog({ suggestedMinutes: 0 });
        fireEvent.click(screen.getByTestId('quick-log-confirm'));
        expect(onSubmit).not.toHaveBeenCalled();
    });
});

describe('QuickLogDialog minute buttons', () => {
    afterEach(cleanup);

    it('changes the time by 5 minutes a tap', () => {
        renderDialog();
        fireEvent.click(screen.getByLabelText('Increase minutes'));
        expect(screen.getByLabelText('Minutes')).toHaveValue('35');
        fireEvent.click(screen.getByLabelText('Decrease minutes'));
        fireEvent.click(screen.getByLabelText('Decrease minutes'));
        expect(screen.getByLabelText('Minutes')).toHaveValue('25');
    });

    it('does not go below zero', () => {
        renderDialog({ suggestedMinutes: 5 });
        fireEvent.click(screen.getByLabelText('Decrease minutes'));
        expect(screen.getByLabelText('Minutes')).toHaveValue('0');
        expect(screen.getByLabelText('Decrease minutes')).toBeDisabled();
    });
});
