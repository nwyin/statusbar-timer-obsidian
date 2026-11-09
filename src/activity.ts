import { countWords } from './stats';

/** Mobile webviews may report hasFocus=false while their visible app is active. */
export function shouldTrack(input: {
  mobile: boolean; visible: boolean; focused: boolean; suspended: boolean;
  paused: boolean; hasFile: boolean; inView: boolean;
}): boolean {
  return input.hasFile && input.inView && input.visible && !input.suspended && !input.paused
    && (input.mobile || input.focused);
}

/** Initial loads, external sync, and programmatic replacements are not typing. */
export function writtenWords(before: string, after: string, userEdit: boolean): number {
  return userEdit ? Math.max(0, countWords(after) - countWords(before)) : 0;
}
