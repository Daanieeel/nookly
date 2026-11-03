import {
  ScrollProgressSearch,
  type ScrollProgressSearchProps,
  type ScrollProgressSection,
} from "@nookly/ui/components/scroll-progress-search";

export type { ScrollProgressSection };

/// The same props as `ScrollProgressSearch`, without its search field.
export type ScrollProgressProps = Omit<ScrollProgressSearchProps, "searchFrom">;

/// `ScrollProgressSearch` that never shows its search field. The two share one
/// implementation, so they cannot drift apart.
const ScrollProgress = (props: ScrollProgressProps) => (
  <ScrollProgressSearch {...props} searchFrom={Number.POSITIVE_INFINITY} />
);

export { ScrollProgress };
export default ScrollProgress;
