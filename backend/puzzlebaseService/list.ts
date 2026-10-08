'use strict';

import { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { errToApiGatewayProxyResultV2, requireUserInfo, success } from '../directoryService/api';
import { listPuzzles, requireContributor } from './database';

/**
 * Handles requests to list every puzzle in the puzzlebase. The caller must be a Puzzle
 * Contributor or an admin: the puzzlebase is not visible to anyone else.
 *
 * All puzzles are returned in one response, and filtering happens in the browser, which is fine
 * while the puzzlebase holds a few thousand puzzles. Add pagination before it grows past that.
 */
export const handler: APIGatewayProxyHandlerV2 = async (event) => {
    try {
        console.log('Event: %j', event);
        await requireContributor(requireUserInfo(event).username);
        return success(await listPuzzles());
    } catch (err) {
        return errToApiGatewayProxyResultV2(err);
    }
};
