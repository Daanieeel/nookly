export type ProblemKind =
  | "offline"
  | "signed-out"
  | "grades-hidden"
  | "denied"
  | "unreadable"
  | "other";

export interface MoodleProblem {
  kind: ProblemKind;
  title: string;
  description: string;
  /// Moodle's own words, for the person who wants to know more.
  details: string;
  /// Whether reading the same page on the Moodle website is a way around it.
  offerWebsite: boolean;
}

const RULES: { match: RegExp; problem: Omit<MoodleProblem, "details"> }[] = [
  {
    match: /couldn't reach|took too long/i,
    problem: {
      kind: "offline",
      title: "Can't reach Moodle",
      description:
        "Check your connection and try again. Nookly shows the last answer it got when it has one.",
      offerWebsite: false,
    },
  },
  {
    match: /sign in (expired|is gone)|isn't connected/i,
    problem: {
      kind: "signed-out",
      title: "Your sign in ran out",
      description:
        "Moodle asks you to sign in again from time to time. Sign out and connect again.",
      offerWebsite: false,
    },
  },
  {
    // The course hides its gradebook from students: nothing is wrong with Nookly or the site.
    match: /nopermissiontoviewgrades/i,
    problem: {
      kind: "grades-hidden",
      title: "Grades aren't shown for this course",
      description:
        "Your teachers have hidden the gradebook from students here. If you can see your grades on Moodle, you can still open them there.",
      offerWebsite: true,
    },
  },
  {
    match: /doesn't allow|service turned off/i,
    problem: {
      kind: "denied",
      title: "Your Moodle keeps this to itself",
      description:
        "Your university has switched this part off for apps like Nookly. You can still read it on Moodle.",
      offerWebsite: true,
    },
  },
  {
    match: /can't read|something unexpected/i,
    problem: {
      kind: "unreadable",
      title: "Moodle sent something Nookly can't read",
      description:
        "Your Moodle answers a little differently from the standard one. You can read this part on Moodle for now.",
      offerWebsite: true,
    },
  },
];

/// What went wrong with a Moodle request, in words for the person reading, with Moodle's own
/// message kept as the details. The backend sends the message; its wording is matched here.
export function describeMoodleProblem(message: string): MoodleProblem {
  const rule = RULES.find((r) => r.match.test(message));
  return {
    ...(rule?.problem ?? {
      kind: "other",
      title: "Something went wrong",
      description: "Nookly couldn't finish this. Try again, or read it on Moodle.",
      offerWebsite: true,
    }),
    details: message,
  };
}
