// Husky bootstrap, run from the root `prepare` script.
//
// Guarded because `prepare` fires on every `npm install`, including the ones
// where hooks are neither wanted nor installable:
//   • CI runners (`npm ci`) - nothing to commit there,
//   • production images built with `--omit=dev` - husky isn't in the tree.
// Failing there would break the install, so this exits 0 in both cases.
if (process.env.CI === 'true' || process.env.NODE_ENV === 'production' || process.env.HUSKY === '0') {
  process.exit(0);
}

try {
  const husky = (await import('husky')).default;
  process.stdout.write(husky());
} catch {
  // Dev dependencies aren't installed - skip silently.
  process.exit(0);
}
