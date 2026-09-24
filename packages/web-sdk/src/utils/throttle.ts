/** throttle wraps a function so it can only be called once, and then a time window must pass before it can be called again
 * any subsequent calls before the time window has passed will be ignored.
 *
 * If the wrapped function uses "this", the caller must bind it, because this wrapper does not bind it.
 * For this, we suggest you always pass functions declared as fat arrow functions, as they have their "this" lexically defined.
 * */
export const throttle = <F extends (...args: Parameters<F>) => ReturnType<F>>(
  func: F,
  timeout = 1000,
) => {
  let isWaiting = false;
  return (...args: Parameters<F>) => {
    if (isWaiting) {
      return;
    }
    func(...args);
    setTimeout(() => {
      isWaiting = false;
    }, timeout);
    isWaiting = true;
  };
};
