/** Resolve with fallback if promise does not settle within ms. */
export function withTimeout(promise, ms, fallback) {
  return Promise.race([
    promise,
    new Promise((resolve) => {
      setTimeout(() => resolve(fallback), ms);
    }),
  ]);
}

/** Reject if promise does not settle within ms. */
export function withTimeoutReject(promise, ms, message = 'timeout') {
  return Promise.race([
    promise,
    new Promise((_resolve, reject) => {
      setTimeout(() => reject(new Error(message)), ms);
    }),
  ]);
}