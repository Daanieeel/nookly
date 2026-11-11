import * as React from "react";
import moodleMark from "../assets/moodle.svg";

/// Moodle's own mark: the orange M under a mortar board. A brand mark keeps its colors in both
/// themes, so it is a picture rather than an icon that takes the text color. Sized by its
/// class like any icon, `size-5` for example.
function MoodleIcon({ className, ...props }: Omit<React.ComponentProps<"img">, "src" | "alt">) {
  return (
    <img
      src={moodleMark}
      alt=""
      aria-hidden="true"
      draggable={false}
      data-slot="moodle-icon"
      className={className}
      {...props}
    />
  );
}

export { MoodleIcon };
