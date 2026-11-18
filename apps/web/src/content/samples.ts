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
          { key: "TSK-84", title: "Hand in problem set 4", label: "Uni", due: "Fri", sub: "2/3" },
          { key: "TSK-82", title: "Prepare the Databases talk", label: "Uni", due: "Mon" },
        ],
      },
      {
        status: "todo" as const,
        name: "Todo",
        items: [
          { key: "TSK-85", title: "Book a library slot", label: "Uni", due: "Tomorrow" },
          { key: "TSK-81", title: "Call grandma", label: "Family", due: "Sun", repeat: true },
          { key: "TSK-86", title: "Renew student ID", label: "Admin" },
        ],
      },
      {
        status: "done" as const,
        name: "Done",
        items: [{ key: "TSK-79", title: "Pay the rent", label: "Home" }],
      },
    ],
  },
  note: {
    title: "Algorithms, week 6",
    meta: "Edited 2 minutes ago",
    heading: "Dynamic programming",
    paragraphBefore: "Split the problem, remember what you solved. Needed for ",
    mention: "Problem set 4",
    paragraphAfter: ".",
    checklist: [
      { done: true, text: "Watch the recording" },
      { done: false, text: "Redo exercise 2" },
      { done: false, text: "Summary for the exam" },
    ],
    code: "dp[i] = min(dp[i - 1], dp[i - 2]) + cost[i]",
  },
  semester: {
    name: "Winter 2026/27",
    week: "This week",
    sessions: [
      {
        day: "Mon",
        time: "10:00",
        course: "Algorithms",
        kind: "Lecture",
        room: "H 1.12",
        tone: "blue",
      },
      {
        day: "Tue",
        time: "14:00",
        course: "Databases",
        kind: "Lab",
        room: "B 2.04",
        tone: "green",
      },
      {
        day: "Thu",
        time: "08:15",
        course: "Linear Algebra",
        kind: "Tutorial",
        room: "A 0.03",
        tone: "purple",
      },
    ],
    exam: { course: "Algorithms", in: "in 42 days", cards: "Flash cards learned", progress: 64 },
    grades: { label: "Average so far", value: "1.7", ects: "48 of 210 ECTS" },
  },
  moodle: {
    title: "Moodle",
    readOnly: "Read only",
    courses: [
      { name: "Algorithms", detail: "Problem set 4 due Friday", badge: "3 new files" },
      { name: "Databases", detail: "Lab report due Dec 2", badge: "1 assignment" },
      { name: "Linear Algebra", detail: "New announcement", badge: "1 new post" },
    ],
  },
  terminal: {
    prompt: "~/nookly",
    lines: [
      { kind: "cmd", text: "nookly cli moodle_assignment list --course 4211" },
      { kind: "out", text: '[{ "name": "Problem set 4", "dueDate": 1764370740 }]' },
      { kind: "cmd", text: 'nookly cli assignment create --course CRS-3 --title "Problem set 4"' },
      {
        kind: "out",
        text: '{ "key": "ASG-12", "status": "not_started", "dueDate": "2026-11-27" }',
      },
      { kind: "note", text: "✓ Added to Algorithms, due Friday" },
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
          { key: "TSK-84", title: "Übungsblatt 4 abgeben", label: "Uni", due: "Fr", sub: "2/3" },
          { key: "TSK-82", title: "Datenbanken Referat vorbereiten", label: "Uni", due: "Mo" },
        ],
      },
      {
        status: "todo",
        name: "Offen",
        items: [
          { key: "TSK-85", title: "Platz in der Bibliothek buchen", label: "Uni", due: "Morgen" },
          { key: "TSK-81", title: "Oma anrufen", label: "Familie", due: "So", repeat: true },
          { key: "TSK-86", title: "Studierendenausweis verlängern", label: "Verwaltung" },
        ],
      },
      {
        status: "done",
        name: "Erledigt",
        items: [{ key: "TSK-79", title: "Miete überweisen", label: "Zuhause" }],
      },
    ],
  },
  note: {
    title: "Algorithmen, Woche 6",
    meta: "Vor 2 Minuten bearbeitet",
    heading: "Dynamische Programmierung",
    paragraphBefore: "Problem zerlegen, Gelöstes merken. Gebraucht für ",
    mention: "Übungsblatt 4",
    paragraphAfter: ".",
    checklist: [
      { done: true, text: "Aufzeichnung ansehen" },
      { done: false, text: "Aufgabe 2 nochmal rechnen" },
      { done: false, text: "Zusammenfassung für die Prüfung" },
    ],
    code: "dp[i] = min(dp[i - 1], dp[i - 2]) + cost[i]",
  },
  semester: {
    name: "Wintersemester 2026/27",
    week: "Diese Woche",
    sessions: [
      {
        day: "Mo",
        time: "10:00",
        course: "Algorithmen",
        kind: "Vorlesung",
        room: "H 1.12",
        tone: "blue",
      },
      {
        day: "Di",
        time: "14:00",
        course: "Datenbanken",
        kind: "Praktikum",
        room: "B 2.04",
        tone: "green",
      },
      {
        day: "Do",
        time: "08:15",
        course: "Lineare Algebra",
        kind: "Übung",
        room: "A 0.03",
        tone: "purple",
      },
    ],
    exam: { course: "Algorithmen", in: "in 42 Tagen", cards: "Karteikarten gelernt", progress: 64 },
    grades: { label: "Schnitt bisher", value: "1,7", ects: "48 von 210 ECTS" },
  },
  moodle: {
    title: "Moodle",
    readOnly: "Nur lesend",
    courses: [
      { name: "Algorithmen", detail: "Übungsblatt 4 fällig Freitag", badge: "3 neue Dateien" },
      { name: "Datenbanken", detail: "Praktikumsbericht fällig 2. Dez.", badge: "1 Abgabe" },
      { name: "Lineare Algebra", detail: "Neue Ankündigung", badge: "1 neuer Beitrag" },
    ],
  },
  terminal: {
    prompt: "~/nookly",
    lines: [
      { kind: "cmd", text: "nookly cli moodle_assignment list --course 4211" },
      { kind: "out", text: '[{ "name": "Übungsblatt 4", "dueDate": 1764370740 }]' },
      { kind: "cmd", text: 'nookly cli assignment create --course CRS-3 --title "Übungsblatt 4"' },
      {
        kind: "out",
        text: '{ "key": "ASG-12", "status": "not_started", "dueDate": "2026-11-27" }',
      },
      { kind: "note", text: "✓ In Algorithmen angelegt, fällig Freitag" },
    ],
  },
  devices: { server: "sync.nookly.work" },
};

export type Samples = typeof en;

export function samples(locale: Locale): Samples {
  return locale === "de" ? de : en;
}
