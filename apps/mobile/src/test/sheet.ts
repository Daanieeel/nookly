import { fireEvent } from "expo-router/testing-library";
import type { renderScreens } from "./render.tsx";

type Screen = Awaited<ReturnType<typeof renderScreens>>;

/// The words a day button of the sheet's calendar is read out with.
function dayName(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/// Opens the field or property row named `label` (its button reads "label, value").
export async function openRow(screen: Screen, label: string) {
  const name = new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}, `);
  await fireEvent.press(await screen.findByRole("button", { name }));
}

/// Picks a day (`YYYY-MM-DD`) in the calendar sheet that is open, paging the months to it.
export async function pickDayInSheet(screen: Screen, day: string) {
  const name = dayName(day);
  const later = day > new Date().toISOString().slice(0, 10);
  for (let i = 0; i < 60 && !screen.queryByRole("button", { name }); i++) {
    await fireEvent.press(
      screen.getByRole("button", { name: later ? "Next Month" : "Previous Month" }),
    );
  }
  await fireEvent.press(screen.getByRole("button", { name }));
}

/// Opens the field or row named `label` and picks a day in its calendar.
export async function pickDay(screen: Screen, label: string, day: string) {
  await openRow(screen, label);
  await pickDayInSheet(screen, day);
}

/// Opens the row named `label` and types a time (`HH:MM`) into its time field.
export async function pickTime(screen: Screen, label: string, time: string) {
  await openRow(screen, label);
  await typeTime(screen, label, time);
  await fireEvent.press(screen.getByRole("button", { name: "Done" }));
}

/// Types a time (`HH:MM`, on a 24 hour clock) into the time field named `label`.
async function typeTime(screen: Screen, label: string, time: string) {
  const [h, m] = time.split(":");
  await fireEvent.changeText(await screen.findByLabelText(`${label}, hour`), h);
  await fireEvent.changeText(screen.getByLabelText(`${label}, minute`), m);
}

/// Opens the field or row named `label` and picks `option` among its choices.
export async function choose(screen: Screen, label: string, option: string) {
  await openRow(screen, label);
  await fireEvent.press(await screen.findByRole("radio", { name: option }));
}
