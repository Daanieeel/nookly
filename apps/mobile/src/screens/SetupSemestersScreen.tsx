import {
  ACADEMIC_SYSTEMS,
  ACADEMIC_SYSTEM_KEYS,
  type AcademicSystemKey,
  REGION_TERM_DATES,
  guessCurrentTerm,
  resolveTermDates,
} from "@nookly/shared/academic";
import { createSemester, listSemesters, setCurrentSemester } from "@nookly/shared/data";
import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { useLocalWrite } from "../data/context.tsx";
import { useSpaces } from "../data/queries.ts";
import { Button, statusOf } from "../ui/Button.tsx";
import { Chip, ChipGroup } from "../ui/Chips.tsx";
import { Screen } from "../ui/Screen.tsx";
import { Text } from "../ui/Text.tsx";
import { dayLabel } from "./dates.ts";
import { termsUpTo } from "./semester-setup.ts";
import { SpacePicker } from "./SpacePicker.tsx";

const STEPS = ["Grading system", "Region", "Current term", "How many", "Review"] as const;

/// The five step setup for semesters, as the desktop's wizard: the term system, the region
/// whose typical dates seed them, the current term, how many semesters to make counting back
/// from it, and a review. A term the Space already has is left as it is.
export function SetupSemestersScreen({ spaceId }: { spaceId?: string }) {
  const router = useRouter();
  const { data: spaces = [] } = useSpaces();
  const [picked, setPicked] = useState<string | null>(spaceId ?? null);
  const space = picked ?? spaces[0]?.id ?? null;
  const [step, setStep] = useState(0);
  const [system, setSystem] = useState<AcademicSystemKey>("winter_summer");
  const [region, setRegion] = useState<string | null>(null);
  const guess = guessCurrentTerm(system);
  const [termKey, setTermKey] = useState<string | null>(null);
  const [year, setYear] = useState<number | null>(null);
  const [count, setCount] = useState(2);
  const def = ACADEMIC_SYSTEMS[system];
  const term = def.terms.find((t) => t.key === (termKey ?? guess.term.key)) ?? guess.term;
  const theYear = year ?? guess.year;
  const regions = REGION_TERM_DATES.filter((r) => r.system === system);
  const windows = regions.find((r) => r.key === region)?.windows;
  const planned = termsUpTo(system, { termType: term.key, year: theYear }, count);
  const datesFor = (termType: string, y: number) => {
    const window = windows ? Object.entries(windows).find(([k]) => k === termType)?.[1] : undefined;
    return window ? resolveTermDates(window, y) : null;
  };
  const create = useLocalWrite(async (db, _: undefined) => {
    if (!space) throw new Error("Pick a Space");
    const have = await listSemesters(db, space);
    let current: string | null = null;
    for (const p of planned) {
      const existing = have.find((s) => s.termType === p.termType && s.year === p.year);
      const id =
        existing?.entity.id ??
        (await createSemester(db, space, {
          title: p.title,
          termType: p.termType,
          year: p.year,
          startDate: datesFor(p.termType, p.year)?.startDate ?? null,
          endDate: datesFor(p.termType, p.year)?.endDate ?? null,
        }));
      if (p.termType === term.key && p.year === theYear) current = id;
    }
    if (current) await setCurrentSemester(db, space, current);
  });
  return (
    <Screen>
      <Text variant="small" tone="muted" accessibilityLiveRegion="polite">
        {`Step ${step + 1} of ${STEPS.length}: ${STEPS[step]}`}
      </Text>
      {step === 0 ? (
        <View className="gap-3">
          <SpacePicker value={space} onChange={setPicked} />
          <ChipGroup label="Grading system">
            {ACADEMIC_SYSTEM_KEYS.map((key) => (
              <Chip
                key={key}
                label={ACADEMIC_SYSTEMS[key].label}
                selected={system === key}
                onPress={() => {
                  setSystem(key);
                  setTermKey(null);
                  setRegion(null);
                }}
              />
            ))}
          </ChipGroup>
        </View>
      ) : null}
      {step === 1 ? (
        <ChipGroup label="Region">
          <Chip label="No dates" selected={region === null} onPress={() => setRegion(null)} />
          {regions.map((r) => (
            <Chip
              key={r.key}
              label={r.label}
              selected={r.key === region}
              onPress={() => setRegion(r.key)}
            />
          ))}
        </ChipGroup>
      ) : null}
      {step === 2 ? (
        <View className="gap-3">
          <ChipGroup label="Current term">
            {def.terms.map((t) => (
              <Chip
                key={t.key}
                label={t.label}
                selected={t.key === term.key}
                onPress={() => setTermKey(t.key)}
              />
            ))}
          </ChipGroup>
          <ChipGroup label="Year">
            {[theYear - 1, theYear, theYear + 1].map((y) => (
              <Chip key={y} label={String(y)} selected={y === theYear} onPress={() => setYear(y)} />
            ))}
          </ChipGroup>
        </View>
      ) : null}
      {step === 3 ? (
        <ChipGroup label="How many semesters">
          {[1, 2, 3, 4, 6, 8].map((n) => (
            <Chip key={n} label={String(n)} selected={n === count} onPress={() => setCount(n)} />
          ))}
        </ChipGroup>
      ) : null}
      {step === 4 ? (
        <View className="gap-2">
          {planned.map((p) => {
            const dates = datesFor(p.termType, p.year);
            const last = p.termType === term.key && p.year === theYear;
            return (
              <Text key={`${p.termType}-${p.year}`}>
                {p.title}
                {last ? " (current)" : ""}
                {dates ? `, ${dayLabel(dates.startDate)} to ${dayLabel(dates.endDate)}` : ""}
              </Text>
            );
          })}
          {create.error ? <Text tone="destructive">{create.error.message}</Text> : null}
        </View>
      ) : null}
      <View className="flex-row gap-2">
        {step > 0 ? (
          <Button label="Back" variant="ghost" onPress={() => setStep(step - 1)} />
        ) : null}
        {step < STEPS.length - 1 ? (
          <Button label="Next" onPress={() => setStep(step + 1)} />
        ) : (
          <Button
            label="Create Semesters"
            status={statusOf(create)}
            errorLabel="Couldn't create"
            onPress={() =>
              create.mutate(undefined, {
                onSuccess: () => (router.canGoBack() ? router.back() : router.replace("/")),
              })
            }
          />
        )}
      </View>
    </Screen>
  );
}
