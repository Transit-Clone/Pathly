/**
 * Runs a web tap-on-release action (onPressOut, see PressableScale) once the browser has
 * delivered that tap's own click. Acting on release right away swapped the screen first, so the
 * click landed on whatever was now under the pointer: Set home, then the last search below it,
 * saved that search as Home.
 */
export function afterClick(action: () => void): void {
  setTimeout(action, 0);
}
