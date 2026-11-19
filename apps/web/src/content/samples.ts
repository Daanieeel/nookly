import type { Locale } from "@/lib/i18n";

/// What the rebuilt app screens on the landing page show: a student's week, in the
/// shapes the desktop app gives tasks, notes, courses and Moodle.
const en = {
  space: "Studies",
  tasks: {
    title: "Tasks",
    groups: [
      {
        status: "in_progress" as const,
        name: "In Progress",
        items: [
          {
            key: "TSK-61",
            title: "Prepare for the Programming 1 mock exam",
            label: "Uni",
            due: "Nov 26",
            sub: "2/5",
          },
          {
            key: "TSK-65",
            title: "Read slides 04: Combinational circuits",
            label: "Uni",
            due: "Today",
          },
        ],
      },
      {
        status: "todo" as const,
        name: "Todo",
        items: [
          {
            key: "TSK-67",
            title: "Read the series transcript on Moodle",
            label: "Uni",
            due: "Today",
          },
          { key: "TSK-58", title: "Sign up for the hackathon", label: "Campus", due: "Fri" },
          { key: "TSK-68", title: "Check the new timetable", label: "Admin", due: "Mon" },
          { key: "TSK-70", title: "Water the plants", label: "Home", due: "Sun", repeat: true },
          { key: "TSK-69", title: "Decide on the startup programme application", label: "Campus" },
        ],
      },
      {
        status: "done" as const,
        name: "Done",
        items: [
          { key: "TSK-62", title: "Import the sequences slides and check the note", label: "Uni" },
          { key: "TSK-24", title: "Register for this semester's exams", label: "Admin" },
        ],
      },
    ],
  },
  note: {
    title: "Sequences and series",
    meta: "Edited 2 minutes ago",
    heading: "Geometric series",
    paragraphBefore: "A series converges when its partial sums settle on a limit. Needed for ",
    mention: "Sheet 6 (Series)",
    paragraphAfter: ".",
    checklist: [
      { done: true, text: "Compare with the lecture slides" },
      { done: false, text: "Prove the sum formula by induction" },
      { done: false, text: "Add the ratio test with an example" },
    ],
    code: "sum(q**k for k in range(n)) == (1 - q**n) / (1 - q)",
  },
  semester: {
    name: "Winter 2026/27",
    week: "This week",
    sessions: [
      {
        day: "Mon",
        time: "10:00",
        course: "Calculus",
        kind: "Lecture",
        room: "H 1.11",
        tone: "blue",
      },
      {
        day: "Tue",
        time: "10:00",
        course: "Programming 1",
        kind: "Exercise",
        room: "Lab 3.18",
        tone: "green",
      },
      {
        day: "Wed",
        time: "08:15",
        course: "Intro to Computer Science",
        kind: "Lecture",
        room: "H 1.09",
        tone: "purple",
      },
      {
        day: "Thu",
        time: "14:15",
        course: "Computer Architecture",
        kind: "Lecture",
        room: "H 1.24",
        tone: "blue",
      },
    ],
    exam: { course: "Calculus", in: "in 70 days", cards: "Flash cards learned", progress: 64 },
    grades: { label: "Average so far", value: "1.3", ects: "5 of 210 ECTS" },
  },
  moodle: {
    title: "Moodle",
    readOnly: "Read only",
    courses: [
      { name: "Calculus", detail: "Sheet 6 (Series) due Monday", badge: "2 new files" },
      {
        name: "Intro to Computer Science",
        detail: "Chapter 9 quiz due today",
        badge: "1 assignment",
      },
      {
        name: "Computer Architecture",
        detail: "Slides 04: Combinational circuits",
        badge: "3 new files",
      },
      { name: "Programming 1", detail: "Live coding code, week 5", badge: "1 new file" },
      { name: "English 1", detail: "New announcement", badge: "1 new post" },
    ],
  },
  terminal: {
    prompt: "~/nookly",
    lines: [
      { kind: "cmd", text: "nookly cli moodle_assignment list --course 4211" },
      { kind: "out", text: '[{ "name": "Sheet 6 (Series)", "dueDate": 1795474740 }]' },
      {
        kind: "cmd",
        text: 'nookly cli assignment create --space $STUDIES --title "Sheet 6 (Series)" --field courseId=CRS-2 --field dueDate=2026-11-23',
      },
      {
        kind: "out",
        text: '{ "key": "ASG-26", "status": "not_started", "dueDate": "2026-11-23" }',
      },
      { kind: "note", text: "✓ Added to Calculus, due Monday" },
    ],
  },
  devices: { server: "sync.nookly.work" },
};

const de: typeof en = {
  space: "Studium",
  tasks: {
    title: "Aufgaben",
    groups: [
      {
        status: "in_progress",
        name: "In Arbeit",
        items: [
          {
            key: "TSK-61",
            title: "Probeklausur Programmieren 1 vorbereiten",
            label: "Uni",
            due: "26. Nov.",
            sub: "2/5",
          },
          { key: "TSK-65", title: "Folien 04 Schaltnetze lesen", label: "Uni", due: "Heute" },
        ],
      },
      {
        status: "todo",
        name: "Offen",
        items: [
          {
            key: "TSK-67",
            title: "Mitschrift Reihen aus Moodle lesen",
            label: "Uni",
            due: "Heute",
          },
          { key: "TSK-58", title: "Für den Hackathon anmelden", label: "Campus", due: "Fr" },
          { key: "TSK-68", title: "Neuen Stundenplan prüfen", label: "Verwaltung", due: "Mo" },
          { key: "TSK-70", title: "Pflanzen gießen", label: "Zuhause", due: "So", repeat: true },
          { key: "TSK-69", title: "Bewerbung fürs Gründungsprogramm entscheiden", label: "Campus" },
        ],
      },
      {
        status: "done",
        name: "Erledigt",
        items: [
          { key: "TSK-62", title: "Folien Folgen importieren und Notiz prüfen", label: "Uni" },
          { key: "TSK-24", title: "Prüfungsanmeldung durchführen", label: "Verwaltung" },
        ],
      },
    ],
  },
  note: {
    title: "Folgen und Reihen",
    meta: "Vor 2 Minuten bearbeitet",
    heading: "Geometrische Reihe",
    paragraphBefore:
      "Eine Reihe konvergiert, wenn sich ihre Partialsummen einem Grenzwert nähern. Gebraucht für ",
    mention: "Blatt 6 (Reihen)",
    paragraphAfter: ".",
    checklist: [
      { done: true, text: "Mit den Vorlesungsfolien abgleichen" },
      { done: false, text: "Summenformel per Induktion beweisen" },
      { done: false, text: "Quotientenkriterium mit Beispiel ergänzen" },
    ],
    code: "sum(q**k for k in range(n)) == (1 - q**n) / (1 - q)",
  },
  semester: {
    name: "Wintersemester 2026/27",
    week: "Diese Woche",
    sessions: [
      {
        day: "Mo",
        time: "10:00",
        course: "Analysis",
        kind: "Vorlesung",
        room: "H 1.11",
        tone: "blue",
      },
      {
        day: "Di",
        time: "10:00",
        course: "Programmieren 1",
        kind: "Übung",
        room: "Labor 3.18",
        tone: "green",
      },
      {
        day: "Mi",
        time: "08:15",
        course: "Grundlagen der Informatik",
        kind: "Vorlesung",
        room: "H 1.09",
        tone: "purple",
      },
      {
        day: "Do",
        time: "14:15",
        course: "Rechnerarchitekturen",
        kind: "Vorlesung",
        room: "H 1.24",
        tone: "blue",
      },
    ],
    exam: { course: "Analysis", in: "in 70 Tagen", cards: "Karteikarten gelernt", progress: 64 },
    grades: { label: "Schnitt bisher", value: "1,3", ects: "5 von 210 ECTS" },
  },
  moodle: {
    title: "Moodle",
    readOnly: "Nur lesend",
    courses: [
      { name: "Analysis", detail: "Blatt 6 (Reihen) fällig Montag", badge: "2 neue Dateien" },
      {
        name: "Grundlagen der Informatik",
        detail: "Moodle-Test Kapitel 9 heute fällig",
        badge: "1 Abgabe",
      },
      { name: "Rechnerarchitekturen", detail: "Folien 04 Schaltnetze", badge: "3 neue Dateien" },
      { name: "Programmieren 1", detail: "Live-Coding, Woche 5", badge: "1 neue Datei" },
      { name: "Englisch 1", detail: "Neue Ankündigung", badge: "1 neuer Beitrag" },
    ],
  },
  terminal: {
    prompt: "~/nookly",
    lines: [
      { kind: "cmd", text: "nookly cli moodle_assignment list --course 4211" },
      { kind: "out", text: '[{ "name": "Blatt 6 (Reihen)", "dueDate": 1795474740 }]' },
      {
        kind: "cmd",
        text: 'nookly cli assignment create --space $STUDIUM --title "Blatt 6 (Reihen)" --field courseId=CRS-2 --field dueDate=2026-11-23',
      },
      {
        kind: "out",
        text: '{ "key": "ASG-26", "status": "not_started", "dueDate": "2026-11-23" }',
      },
      { kind: "note", text: "✓ In Analysis angelegt, fällig Montag" },
    ],
  },
  devices: { server: "sync.nookly.work" },
};

export type Samples = typeof en;

export function samples(locale: Locale): Samples {
  return locale === "de" ? de : en;
}
