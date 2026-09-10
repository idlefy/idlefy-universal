/** Go's marker between the template call chain and the message a chart's `fail` actually produced. */
export const FAIL_MARK = 'error calling fail: ';

/**
 * The sentence the chart wrote, or the message unchanged when there is none. The *last* marker wins:
 * a nested `include` chain repeats it, and only the innermost text is the user-facing one. Schema
 * errors and YAML errors carry no marker and pass through untouched.
 */
export function failText(message: string): string {
  const i = message.lastIndexOf(FAIL_MARK);
  return i < 0 ? message : message.slice(i + FAIL_MARK.length).trim();
}
