/** A task's leading verb, when it is one shown as an icon instead of a word. */
export type TaskVerb =
    'read' | 'watch' | 'solve' | 'study' | 'play' | 'spar' | 'annotate' | 'review';

const VERBS: TaskVerb[] = ['read', 'watch', 'solve', 'study', 'play', 'spar', 'annotate', 'review'];

const VERB_PATTERN = new RegExp(`^(${VERBS.join('|')})\\s+(?:(?:a|an|the)\\s+)?(.+)$`, 'i');

/**
 * Splits a task name into its leading verb and the rest, so the verb can be shown
 * as an icon: "Read How to Find a Training Partner" becomes read + "How to Find a
 * Training Partner", and "Annotate a Classical Game" becomes annotate + "Classical
 * Game". Names that don't start with a known verb, including names in other
 * languages, come back unchanged.
 * @param name The task's display name.
 */
export function splitTaskVerb(name: string): { verb?: TaskVerb; rest: string } {
    const match = VERB_PATTERN.exec(name.trim());
    if (!match) {
        return { rest: name };
    }
    const rest = match[2];
    return {
        verb: match[1].toLowerCase() as TaskVerb,
        rest: rest.charAt(0).toUpperCase() + rest.slice(1),
    };
}
