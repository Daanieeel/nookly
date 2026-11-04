import { createContext, useContext } from "react";

/// The same page on the Moodle website, for whatever is shown inside a `MoodleFrame`: a
/// problem on a page can offer to read it there instead.
export const MoodleWebUrlContext = createContext<string | null>(null);

export const useMoodleWebUrl = () => useContext(MoodleWebUrlContext);
