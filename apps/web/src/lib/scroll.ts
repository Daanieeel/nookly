/// Takes the visitor back to the top of the page: smoothly, or at once when they prefer
/// reduced motion.
export function scrollToTop() {
  // jsdom, which the tests run in, has no `matchMedia`.
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
}
