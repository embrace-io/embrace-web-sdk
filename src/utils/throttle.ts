export function throttle<F extends (...args: Parameters<F>) => ReturnType<F>>(
  this: ThisParameterType<F>,
  func: F,
  timeout: number = 1000
) {
  let isWaiting = false;
  return (...args: Parameters<F>) => {
    if (isWaiting) {
      return;
    }
    func.apply(this, args);
    setTimeout(() => {
      isWaiting = false;
    }, timeout);
    isWaiting = true;
  };
}
