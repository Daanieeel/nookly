/// A graduation cap in Moodle's orange. Drawn for Nookly in the spirit of the Moodle mark,
/// not a copy of it.
export function MoodleLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
      <path d="M12 2.5 0.8 8.4 12 14.3l9.2-4.85V16.5h2V8.4L12 2.5Z" />
      <path d="M5.2 12.9v4.1c0 1.5 3.1 3.5 6.8 3.5s6.8-2 6.8-3.5v-4.1L12 16.5l-6.8-3.6Z" />
    </svg>
  );
}
