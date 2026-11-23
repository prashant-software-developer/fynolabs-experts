// Ending a script on Windows without the "Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)"
// crash: calling process.exit() while network connections are still closing can abort Node with a
// negative exit code, which .bat files can't see as an error. So: set the exit code, let open
// connections finish closing, and only force the exit if something keeps Node alive for 3 seconds.
export function finish(code: number): void {
  process.exitCode = code;
  setTimeout(() => process.exit(code), 3000).unref();
}
