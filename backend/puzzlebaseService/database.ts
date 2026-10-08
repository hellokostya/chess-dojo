'use strict';

import {
    ConditionalCheckFailedException,
    DeleteItemCommand,
    GetItemCommand,
    PutItemCommand,
    QueryCommand,
    UpdateItemCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import {
    AdminAction,
    formatPuzzleId,
    PuzzlebaseContributor,
    PuzzlebasePuzzle,
    PuzzlebaseTaxonomy,
} from '@jackstenglein/chess-dojo-common/src/puzzlebase/api';
import { defaultTaxonomy } from '@jackstenglein/chess-dojo-common/src/puzzlebase/build';
import { PuzzleSuggestion } from '@jackstenglein/chess-dojo-common/src/puzzlebase/suggestions';
import { ApiError } from '../directoryService/api';
import { dynamo, getUser } from '../directoryService/database';

export { dynamo, getUser };

/**
 * The name of the DynamoDB table for the puzzlebase. It holds several kinds of item, told apart
 * by partition key:
 *
 * - `PUZZLE` / `<id>`: a puzzle.
 * - `CONTRIBUTOR` / `<username>`: a user who has applied to be a Puzzle Contributor, and their puzzle count.
 * - `META` / `TAXONOMY`: the buckets and themes.
 * - `META` / `COUNTER`: the number of the last puzzle id handed out.
 * - `SUGGESTION` / `<puzzleId>#<username>`: tags a member suggested for a puzzle, waiting for a
 *   Puzzle Contributor to accept or dismiss them. One per member per puzzle.
 * - `AUDIT` / `<ISO time>#<random>`: something a puzzle admin did, for the admin log.
 */
export const puzzlebaseTable = process.env.stage + '-puzzlebase';

const PUZZLE = 'PUZZLE';
const CONTRIBUTOR = 'CONTRIBUTOR';
const META = 'META';
const TAXONOMY = 'TAXONOMY';
const COUNTER = 'COUNTER';
const SUGGESTION = 'SUGGESTION';
const AUDIT = 'AUDIT';

/** The most puzzles that a single request may create. */
export const MAX_PUZZLES_PER_REQUEST = 100;

/**
 * Runs a function that throws plain Errors with user-facing messages (like the shared puzzle
 * parsing code) and turns them into 400 responses.
 */
export function userInput<T>(fn: () => T): T {
    try {
        return fn();
    } catch (err) {
        if (err instanceof Error && !(err instanceof ApiError)) {
            throw new ApiError({ statusCode: 400, publicMessage: err.message, cause: err });
        }
        throw err;
    }
}

/** Removes the DynamoDB key attributes from an item. */
function withoutKeys<T>(item: Record<string, any>): T {
    const { pk: _pk, sk: _sk, ...rest } = item;
    return rest as T;
}

/** Returns every item with the given partition key, following pagination. */
async function queryAll(pk: string): Promise<Record<string, any>[]> {
    const items: Record<string, any>[] = [];
    let startKey: Record<string, any> | undefined;

    do {
        const output = await dynamo.send(
            new QueryCommand({
                TableName: puzzlebaseTable,
                KeyConditionExpression: 'pk = :pk',
                ExpressionAttributeValues: marshall({ ':pk': pk }),
                ExclusiveStartKey: startKey,
            }),
        );
        items.push(...(output.Items ?? []).map((item) => unmarshall(item)));
        startKey = output.LastEvaluatedKey;
    } while (startKey);

    return items;
}

// ---------- Puzzles ----------

/** Returns every puzzle, oldest first. */
export async function listPuzzles(): Promise<PuzzlebasePuzzle[]> {
    const items = await queryAll(PUZZLE);
    return items.map((item) => withoutKeys<PuzzlebasePuzzle>(item));
}

/** Returns the puzzle with the given id, or undefined if there is none. */
export async function getPuzzle(id: string): Promise<PuzzlebasePuzzle | undefined> {
    const output = await dynamo.send(
        new GetItemCommand({
            TableName: puzzlebaseTable,
            Key: marshall({ pk: PUZZLE, sk: id }),
        }),
    );
    return output.Item ? withoutKeys<PuzzlebasePuzzle>(unmarshall(output.Item)) : undefined;
}

/**
 * Saves a puzzle. With `previousUpdatedAt`, the save only succeeds if the puzzle has not changed
 * since it was read, otherwise a 409 error is thrown. Without it, the puzzle must be new.
 */
export async function putPuzzle(puzzle: PuzzlebasePuzzle, previousUpdatedAt?: string) {
    try {
        await dynamo.send(
            new PutItemCommand({
                TableName: puzzlebaseTable,
                Item: marshall(
                    { pk: PUZZLE, sk: puzzle.id, ...puzzle },
                    { removeUndefinedValues: true },
                ),
                ConditionExpression:
                    previousUpdatedAt === undefined
                        ? 'attribute_not_exists(pk)'
                        : 'updatedAt = :previous',
                ExpressionAttributeValues:
                    previousUpdatedAt === undefined
                        ? undefined
                        : marshall({ ':previous': previousUpdatedAt }),
            }),
        );
    } catch (err) {
        if (err instanceof ConditionalCheckFailedException) {
            throw new ApiError({
                statusCode: 409,
                publicMessage:
                    previousUpdatedAt === undefined
                        ? `Puzzle ${puzzle.id} already exists`
                        : 'Someone else changed this puzzle. Reload it and try again.',
                cause: err,
            });
        }
        throw err;
    }
}

/**
 * Reserves the next `count` puzzle ids and returns them (001, 002, ...). The counter is atomic,
 * so ids are never handed out twice. An id is skipped, never reused, if saving its puzzle fails.
 */
export async function reservePuzzleIds(count: number): Promise<string[]> {
    const output = await dynamo.send(
        new UpdateItemCommand({
            TableName: puzzlebaseTable,
            Key: marshall({ pk: META, sk: COUNTER }),
            UpdateExpression: 'ADD lastNumber :count',
            ExpressionAttributeValues: marshall({ ':count': count }),
            ReturnValues: 'UPDATED_NEW',
        }),
    );
    const last = unmarshall(output.Attributes!).lastNumber as number;
    return Array.from({ length: count }, (_, i) => formatPuzzleId(last - count + 1 + i));
}

// ---------- Taxonomy ----------

/** The buckets and themes, and the version used to detect concurrent changes. */
export interface StoredTaxonomy {
    taxonomy: PuzzlebaseTaxonomy;
    /** 0 while the taxonomy has never been saved and the built-in defaults are in use. */
    version: number;
}

/** Returns the taxonomy, or the built-in defaults if no one has added a theme yet. */
export async function getTaxonomy(): Promise<StoredTaxonomy> {
    const output = await dynamo.send(
        new GetItemCommand({
            TableName: puzzlebaseTable,
            Key: marshall({ pk: META, sk: TAXONOMY }),
        }),
    );
    if (!output.Item) {
        return { taxonomy: defaultTaxonomy(), version: 0 };
    }
    const item = unmarshall(output.Item);
    return { taxonomy: { buckets: item.buckets }, version: item.version };
}

/**
 * Saves the taxonomy if it has not changed since `version` was read.
 * @returns False if someone else changed it first, in which case nothing was saved.
 */
export async function saveTaxonomy(
    taxonomy: PuzzlebaseTaxonomy,
    version: number,
): Promise<boolean> {
    try {
        await dynamo.send(
            new PutItemCommand({
                TableName: puzzlebaseTable,
                Item: marshall({
                    pk: META,
                    sk: TAXONOMY,
                    buckets: taxonomy.buckets,
                    version: version + 1,
                }),
                ConditionExpression:
                    version === 0 ? 'attribute_not_exists(pk)' : 'version = :version',
                ExpressionAttributeValues:
                    version === 0 ? undefined : marshall({ ':version': version }),
            }),
        );
        return true;
    } catch (err) {
        if (err instanceof ConditionalCheckFailedException) {
            return false;
        }
        throw err;
    }
}

// ---------- Contributors ----------

/** Returns the contributor record for a user, or undefined if they have never applied. */
export async function getContributor(username: string): Promise<PuzzlebaseContributor | undefined> {
    const output = await dynamo.send(
        new GetItemCommand({
            TableName: puzzlebaseTable,
            Key: marshall({ pk: CONTRIBUTOR, sk: username }),
        }),
    );
    return output.Item ? toContributor(unmarshall(output.Item)) : undefined;
}

/** Returns every contributor record, including pending applications. */
export async function listContributors(): Promise<PuzzlebaseContributor[]> {
    return (await queryAll(CONTRIBUTOR)).map(toContributor);
}

function toContributor(item: Record<string, any>): PuzzlebaseContributor {
    return { ...withoutKeys<PuzzlebaseContributor>(item), username: item.sk };
}

/** Creates a pending contributor record. Returns false if the user has already applied. */
export async function createContributor(contributor: PuzzlebaseContributor): Promise<boolean> {
    const { username, ...rest } = contributor;
    try {
        await dynamo.send(
            new PutItemCommand({
                TableName: puzzlebaseTable,
                Item: marshall(
                    { pk: CONTRIBUTOR, sk: username, ...rest },
                    { removeUndefinedValues: true },
                ),
                ConditionExpression: 'attribute_not_exists(pk)',
            }),
        );
        return true;
    } catch (err) {
        if (err instanceof ConditionalCheckFailedException) {
            return false;
        }
        throw err;
    }
}

/**
 * Approves a pending application.
 * @throws ApiError 404 if the user never applied.
 */
export async function approveContributor(username: string): Promise<PuzzlebaseContributor> {
    try {
        const output = await dynamo.send(
            new UpdateItemCommand({
                TableName: puzzlebaseTable,
                Key: marshall({ pk: CONTRIBUTOR, sk: username }),
                UpdateExpression: 'SET #status = :approved',
                ConditionExpression: 'attribute_exists(pk)',
                ExpressionAttributeNames: { '#status': 'status' },
                ExpressionAttributeValues: marshall({ ':approved': 'APPROVED' }),
                ReturnValues: 'ALL_NEW',
            }),
        );
        return toContributor(unmarshall(output.Attributes!));
    } catch (err) {
        if (err instanceof ConditionalCheckFailedException) {
            throw new ApiError({
                statusCode: 404,
                publicMessage: `${username} has not applied to be a Puzzle Contributor`,
                cause: err,
            });
        }
        throw err;
    }
}

/**
 * Denies a pending application. An approved contributor cannot be denied this way.
 * @throws ApiError 404 if the user has no pending application.
 */
export async function denyContributor(username: string): Promise<PuzzlebaseContributor> {
    try {
        const output = await dynamo.send(
            new UpdateItemCommand({
                TableName: puzzlebaseTable,
                Key: marshall({ pk: CONTRIBUTOR, sk: username }),
                UpdateExpression: 'SET #status = :denied',
                ConditionExpression: '#status = :pending',
                ExpressionAttributeNames: { '#status': 'status' },
                ExpressionAttributeValues: marshall({ ':denied': 'DENIED', ':pending': 'PENDING' }),
                ReturnValues: 'ALL_NEW',
            }),
        );
        return toContributor(unmarshall(output.Attributes!));
    } catch (err) {
        if (err instanceof ConditionalCheckFailedException) {
            throw new ApiError({
                statusCode: 404,
                publicMessage: `${username} has no pending application to be a Puzzle Contributor`,
                cause: err,
            });
        }
        throw err;
    }
}

/**
 * Takes away an approved contributor's access. Their puzzles stay.
 * @throws ApiError 404 if the user is not an approved contributor.
 */
export async function revokeContributor(username: string): Promise<PuzzlebaseContributor> {
    try {
        const output = await dynamo.send(
            new UpdateItemCommand({
                TableName: puzzlebaseTable,
                Key: marshall({ pk: CONTRIBUTOR, sk: username }),
                UpdateExpression: 'SET #status = :revoked',
                ConditionExpression: '#status = :approved AND attribute_not_exists(#role)',
                ExpressionAttributeNames: { '#status': 'status', '#role': 'role' },
                ExpressionAttributeValues: marshall({
                    ':revoked': 'REVOKED',
                    ':approved': 'APPROVED',
                }),
                ReturnValues: 'ALL_NEW',
            }),
        );
        return toContributor(unmarshall(output.Attributes!));
    } catch (err) {
        if (err instanceof ConditionalCheckFailedException) {
            throw new ApiError({
                statusCode: 404,
                publicMessage: `${username} is not a Puzzle Contributor`,
                cause: err,
            });
        }
        throw err;
    }
}

/**
 * Requires the caller to be allowed to add and edit puzzles: a Puzzle Contributor or a Dojo
 * admin.
 * @returns The caller's username and display name.
 * @throws ApiError 403 if the caller is not allowed.
 */
export async function requireContributor(
    username: string,
): Promise<{ username: string; displayName: string }> {
    const user = await getUser(username);
    if (!user.isAdmin) {
        const contributor = await getContributor(username);
        if (contributor?.status !== 'APPROVED') {
            throw new ApiError({
                statusCode: 403,
                publicMessage:
                    'You need to be a Puzzle Contributor to do this. You can apply from the puzzlebase.',
            });
        }
    }
    return { username: user.username, displayName: user.displayName };
}

/**
 * Lists a Dojo admin as an approved Puzzle Contributor, so they show up in the contributor list.
 * Keeps their puzzle count and any application they made. Safe to call on every visit.
 */
export async function ensureAdminContributor(who: { username: string; displayName: string }) {
    await dynamo.send(
        new UpdateItemCommand({
            TableName: puzzlebaseTable,
            Key: marshall({ pk: CONTRIBUTOR, sk: who.username }),
            UpdateExpression:
                'SET #status = :approved, #role = :admin, displayName = if_not_exists(displayName, :name), ' +
                'puzzleCount = if_not_exists(puzzleCount, :zero), createdAt = if_not_exists(createdAt, :now)',
            ExpressionAttributeNames: { '#status': 'status', '#role': 'role' },
            ExpressionAttributeValues: marshall({
                ':approved': 'APPROVED',
                ':admin': 'ADMIN',
                ':name': who.displayName,
                ':zero': 0,
                ':now': new Date().toISOString(),
            }),
        }),
    );
}

/**
 * Makes a user an approved Puzzle Contributor straight away, without an application. Works for
 * someone who never applied, and also approves someone who applied or was denied or removed. Keeps
 * their puzzle count.
 * @returns The contributor record.
 */
export async function addContributor(who: {
    username: string;
    displayName: string;
}): Promise<PuzzlebaseContributor> {
    const output = await dynamo.send(
        new UpdateItemCommand({
            TableName: puzzlebaseTable,
            Key: marshall({ pk: CONTRIBUTOR, sk: who.username }),
            UpdateExpression:
                'SET #status = :approved, displayName = if_not_exists(displayName, :name), ' +
                'puzzleCount = if_not_exists(puzzleCount, :zero), createdAt = if_not_exists(createdAt, :now)',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: marshall({
                ':approved': 'APPROVED',
                ':name': who.displayName,
                ':zero': 0,
                ':now': new Date().toISOString(),
            }),
            ReturnValues: 'ALL_NEW',
        }),
    );
    return toContributor(unmarshall(output.Attributes!));
}

/** Whether any signed-in member can train. Set with PUZZLEBASE_TRAINING_OPEN=true when deploying. */
export function trainingOpen(): boolean {
    return process.env.PUZZLEBASE_TRAINING_OPEN === 'true';
}

/**
 * Requires the caller to be allowed to train: anyone once training is open, otherwise only Puzzle
 * Contributors and admins.
 * @throws ApiError 403 if training is not open to the caller yet.
 */
export async function requireTrainingAccess(username: string) {
    if (trainingOpen()) {
        return;
    }
    try {
        await requireContributor(username);
    } catch {
        throw new ApiError({
            statusCode: 403,
            publicMessage: 'Training on the PuzzleBase is not open yet.',
        });
    }
}

/**
 * Requires the caller to be a puzzle admin: for now, a Dojo admin.
 * @returns The caller's username and display name.
 * @throws ApiError 403 if the caller is not an admin.
 */
export async function requireAdmin(
    username: string,
): Promise<{ username: string; displayName: string }> {
    const user = await getUser(username);
    if (!user.isAdmin) {
        throw new ApiError({
            statusCode: 403,
            publicMessage: 'You must be an admin to do this',
        });
    }
    return { username: user.username, displayName: user.displayName };
}

/**
 * Adds to a user's puzzle count for the leaderboard. Admins who add puzzles without applying get an
 * approved record created for them.
 */
export async function addToPuzzleCount(
    who: { username: string; displayName: string },
    count: number,
    now: string,
) {
    await dynamo.send(
        new UpdateItemCommand({
            TableName: puzzlebaseTable,
            Key: marshall({ pk: CONTRIBUTOR, sk: who.username }),
            UpdateExpression:
                'SET displayName = :displayName, #status = if_not_exists(#status, :approved), createdAt = if_not_exists(createdAt, :now) ADD puzzleCount :count',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: marshall({
                ':displayName': who.displayName,
                ':approved': 'APPROVED',
                ':now': now,
                ':count': count,
            }),
        }),
    );
}

// ---------- Tag suggestions ----------

/** Returns every pending tag suggestion, for every puzzle. */
export async function listSuggestions(): Promise<PuzzleSuggestion[]> {
    return (await queryAll(SUGGESTION)).map((item) => withoutKeys<PuzzleSuggestion>(item));
}

/** Returns the pending tag suggestions for one puzzle. */
export async function listSuggestionsFor(puzzleId: string): Promise<PuzzleSuggestion[]> {
    const items: Record<string, any>[] = [];
    let startKey: Record<string, any> | undefined;
    do {
        const output = await dynamo.send(
            new QueryCommand({
                TableName: puzzlebaseTable,
                KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
                ExpressionAttributeValues: marshall({
                    ':pk': SUGGESTION,
                    ':prefix': `${puzzleId}#`,
                }),
                ExclusiveStartKey: startKey,
            }),
        );
        items.push(...(output.Items ?? []).map((item) => unmarshall(item)));
        startKey = output.LastEvaluatedKey;
    } while (startKey);
    return items.map((item) => withoutKeys<PuzzleSuggestion>(item));
}

/** Saves a member's suggestion for a puzzle, replacing any earlier one of theirs. */
export async function putSuggestion(suggestion: PuzzleSuggestion) {
    await dynamo.send(
        new PutItemCommand({
            TableName: puzzlebaseTable,
            Item: marshall(
                {
                    pk: SUGGESTION,
                    sk: `${suggestion.puzzleId}#${suggestion.username}`,
                    ...suggestion,
                },
                { removeUndefinedValues: true },
            ),
        }),
    );
}

/** Removes a member's suggestion for a puzzle. Does nothing if there is none. */
export async function deleteSuggestion(puzzleId: string, username: string) {
    await dynamo.send(
        new DeleteItemCommand({
            TableName: puzzlebaseTable,
            Key: marshall({ pk: SUGGESTION, sk: `${puzzleId}#${username}` }),
        }),
    );
}

// ---------- Admin log ----------

/** Writes an entry to the admin log. */
export async function logAdminAction(
    who: { username: string; displayName: string },
    type: AdminAction['type'],
    summary: string,
): Promise<AdminAction> {
    const action: AdminAction = {
        at: new Date().toISOString(),
        username: who.username,
        displayName: who.displayName,
        type,
        summary,
    };
    await dynamo.send(
        new PutItemCommand({
            TableName: puzzlebaseTable,
            Item: marshall({
                pk: AUDIT,
                sk: `${action.at}#${Math.random().toString(36).slice(2, 8)}`,
                ...action,
            }),
        }),
    );
    return action;
}

/** Returns the admin log, newest first. */
export async function listAdminActions(): Promise<AdminAction[]> {
    return (await queryAll(AUDIT))
        .map((item) => withoutKeys<AdminAction>(item))
        .sort((a, b) => b.at.localeCompare(a.at));
}
