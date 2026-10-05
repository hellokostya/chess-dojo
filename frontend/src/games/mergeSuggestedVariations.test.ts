import { Chess } from '@jackstenglein/chess';
import { describe, expect, it } from 'vitest';
import { removeEmptyVariations } from './mergeSuggestedVariations';

describe('removeEmptyVariations', () => {
    it('removes empty variation branches before PGN serialization', () => {
        const chess = new Chess({ pgn: '1. e4 e5 *' });
        chess.history()[0].variations.push([]);

        removeEmptyVariations(chess.history());

        const pgn = chess.renderPgn();
        expect(pgn).not.toContain('()');
        expect(() => new Chess({ pgn })).not.toThrow();
    });
});
