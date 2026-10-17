/**
 * Messages shown to the user – ONE place.
 *   showMessage(text)           -> normal message box
 *   showError(what, error)      -> friendly message box + full technical error in the browser console
 *   throwUserError(text)        -> used inside services when WE know what is wrong (e.g. a field is empty).
 *                                   The text is shown to the user exactly as written.
 * Nothing is shown on the page itself. To debug, open the browser console (F12) and look for "[SHIFT]".
 */

export function showMessage(text: string): void {
  window.alert(text);
}

/** Stop the work and show `text` to the user (our own, already friendly message). */
export function throwUserError(text: string): never {
  const error: any = new Error(text);
  error.isUserMessage = true;
  throw error;
}

/** Short, plain-language idea of what went wrong with a SharePoint / network error. */
function explain(error: any): string {
  const status = error && (error.status || (error.response && error.response.status));
  const text = String((error && error.message) || error || '').toLowerCase();

  if (status === 401 || status === 403 || text.indexOf('access denied') > -1) {
    return 'You do not have permission for this action.';
  }
  if (status === 404 || text.indexOf('does not exist') > -1) {
    return 'A SharePoint list, column or item was not found. Please check the list / column names.';
  }
  if (status === 400 || text.indexOf('does not exist on type') > -1 || text.indexOf('property') > -1) {
    return 'SharePoint did not accept the data. A column name or value may be wrong.';
  }
  if (status === 429 || status === 503) {
    return 'SharePoint is busy. Please wait a moment and try again.';
  }
  if (text.indexOf('failed to fetch') > -1 || text.indexOf('network') > -1) {
    return 'Network problem. Please check your connection and try again.';
  }
  return 'Unexpected problem.';
}

/**
 * Logs the full error in the console and shows a friendly message box.
 * `what` = what the user was trying to do, e.g. "Could not submit the request."
 */
export function showError(what: string, error: unknown): void {
  console.error('[SHIFT] ' + what, error);
  const e: any = error;
  if (e && e.isUserMessage) {
    window.alert(e.message);
    return;
  }
  window.alert(what + '\n\nWhat happened: ' + explain(e) + '\n\n(Details are in the browser console, press F12.)');
}
