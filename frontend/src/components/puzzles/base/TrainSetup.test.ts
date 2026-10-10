import { defaultTaxonomy } from '@jackstenglein/chess-dojo-common/src/puzzlebase/build';
import { describe, expect, it } from 'vitest';
import { focusOptions, focusQuery } from './TrainSetup';

const taxonomy = defaultTaxonomy();
const labels = (type: Parameters<typeof focusOptions>[1]) =>
    focusOptions(taxonomy, type).map((o) => `${o.kind}:${o.group}:${o.label}`);

describe('focusOptions', () => {
    it('offers all themes, the phases and the tactics themes for tactics', () => {
        const options = labels('Tactics');
        expect(options[0]).toBe('any:All puzzles:All Themes');
        expect(options).toContain('bucket:Endgame:Endgame');
        expect(options).toContain('theme:Tactics:Fork');
        expect(options).not.toContain('theme:Strategy:Outpost');
        expect(options.some((o) => o.startsWith('bucket:Tactics'))).toBe(false);
    });

    it('offers the strategy themes for strategy', () => {
        const options = labels('Strategy');
        expect(options).toContain('theme:Strategy:Outpost');
        expect(options).not.toContain('theme:Tactics:Fork');
    });

    it('offers the themes of both for a mix', () => {
        const options = labels('Mixed');
        expect(options).toContain('theme:Tactics:Fork');
        expect(options).toContain('theme:Strategy:Outpost');
    });
});

describe('focusQuery', () => {
    const anything = { kind: 'any' as const, label: 'All Themes', group: 'All puzzles' };

    it('asks for the type, with a phase or a theme if there is one', () => {
        expect(focusQuery('Tactics', anything)).toEqual({ bucket: 'Tactics' });
        expect(
            focusQuery('Strategy', { kind: 'bucket', label: 'Endgame', group: 'Endgame' }),
        ).toEqual({ bucket: 'Strategy,Endgame' });
        expect(focusQuery('Tactics', { kind: 'theme', label: 'Fork', group: 'Tactics' })).toEqual({
            bucket: 'Tactics',
            theme: 'Fork',
        });
    });

    it('asks for nothing in particular for a mix', () => {
        expect(focusQuery('Mixed', anything)).toEqual({});
        expect(focusQuery('Mixed', { kind: 'bucket', label: 'Opening', group: 'Opening' })).toEqual(
            { bucket: 'Opening' },
        );
    });
});
