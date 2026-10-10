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

describe('focusOptions with what there are puzzles for', () => {
    const available = [
        { buckets: ['Tactics', 'Endgame'], themes: ['Fork'], count: 3 },
        { buckets: ['Tactics', 'Middlegame'], themes: ['Pin'], count: 1 },
        { buckets: ['Strategy', 'Middlegame'], themes: ['Outpost'], count: 2 },
    ];
    const offered = (type: Parameters<typeof focusOptions>[1]) =>
        focusOptions(taxonomy, type, available).map((o) => `${o.kind}:${o.label}`);

    it('only offers themes that tactics puzzles have, for tactics', () => {
        const options = offered('Tactics');
        expect(options).toContain('theme:Fork');
        expect(options).toContain('theme:Pin');
        expect(options).not.toContain('theme:Skewer');
        expect(options).not.toContain('theme:Outpost');
    });

    it('only offers the phases that the type has puzzles in', () => {
        expect(offered('Tactics')).toEqual(
            expect.arrayContaining(['bucket:Endgame', 'bucket:Middlegame']),
        );
        expect(offered('Tactics')).not.toContain('bucket:Opening');
        expect(offered('Strategy')).toContain('bucket:Middlegame');
        expect(offered('Strategy')).not.toContain('bucket:Endgame');
    });

    it('offers the themes of every puzzle for a mix', () => {
        expect(offered('Mixed')).toEqual(
            expect.arrayContaining(['theme:Fork', 'theme:Pin', 'theme:Outpost']),
        );
    });

    it('offers nothing but All Themes when there are no puzzles', () => {
        expect(focusOptions(taxonomy, 'Mixed', []).map((o) => o.label)).toEqual(['All Themes']);
    });
});
