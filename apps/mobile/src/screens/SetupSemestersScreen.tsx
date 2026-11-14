import {
  ACADEMIC_SYSTEMS,
  ACADEMIC_SYSTEM_KEYS,
  type AcademicSystemKey,
  REGION_TERM_DATES,
  guessCurrentTerm,
  resolveTermDates,
} from "@nookly/shared/academic";
import { createSemester, listSemesters, setCurrentSemester } from "@nookly/shared/data";
import { IconChevronLeft, IconX } from "@tabler/icons-react-native";
import { useState } from "react";
import { View } from "react-native";
import { useLocalWrite } from "../data/context.tsx";
import { useSpaces } from "../data/queries.ts";
import { Button, statusOf } from "../ui/Button.tsx";
import { useSemantic } from "../ui/kit/scheme.ts";
import { Segmented } from "../ui/Segmented.tsx";
import { PillSelect } from "../ui/sheet/Compose.tsx";
import { DisplayGroup } from "../ui/sheet/DisplayParts.tsx";
import { OptionList } from "../ui/sheet/OptionList.tsx";
import { useCloseSheet } from "../ui/sheet/route.tsx";
import { RoundButton, SheetFooter, SheetHeader } from "../ui/sheet/Sheet.tsx";
import { Text } from "../ui/Text.tsx";
import { useTheme } from "../ui/theme.ts";
import { FACE, SPACE, TYPE } from "../ui/tokens.ts";
import { dayLabel } from "./dates.ts";
import { spaceOption } from "./option-badges.tsx";
import { termsUpTo } from "./semester-setup.ts";

/// Each step asks one question, as Linear's onboarding does.
const STEPS = [
  { title: "Which term system does your school use?", hint: "It names your semesters." },
  { title: "Where do you study?", hint: "Your region's typical dates fill in each term." },
  { title: "Which term is it now?", hint: "This one becomes the current semester." },
  { title: "How many semesters?", hint: "Counting back from the current one." },
  { title: "Ready to set up", hint: "A term the Space already has is left as it is." },
] as const;

const COUNTS = ["1", "2", "3", "4", "6", "8"] as const;

/// How far along: one bar a step, filled up to this one.
function Progress({ step }: { step: number }) {
  const theme = useTheme();
  const track = useSemantic("fill");
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`Step ${step + 1} of ${STEPS.length}`}
      className="flex-row gap-1.5"
      style={{ width: 120 }}
    >
      {STEPS.map((s, i) => (
        <View
          key={s.title}
          style={{
            flex: 1,
            height: 4,
            borderRadius: 2,
            backgroundColor: i <= step ? theme.colors.primary : track,
          }}
        />
      ))}
    </View>
  );
}

/// The five step setup for semesters, as the desktop's wizard in Linear's style (D65): the
/// term system, the region whose typical dates seed them, the current term, how many to make
/// counting back from it, and a review. A term the Space already has is left as it is.
export function SetupSemestersScreen({ spaceId }: { spaceId?: string }) {
  const close = useCloseSheet();
  const theme = useTheme();
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
    if (!space) throw new Error("Make a Space first.");
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
  const last = step === STEPS.length - 1;
  // The choices are lists on the page itself, so a pick stays on it.
  const stay = () => undefined;
  return (
    <View style={{ gap: SPACE.xl }}>
      <SheetHeader>
        <View className="flex-row items-center gap-2 px-4 pb-1 pt-2">
          {step === 0 ? (
            <RoundButton label="Close" onPress={() => close()}>
              <IconX size={22} color={theme.colors.foreground} />
            </RoundButton>
          ) : (
            <RoundButton label="Back" onPress={() => setStep(step - 1)}>
              <IconChevronLeft size={22} color={theme.colors.foreground} />
            </RoundButton>
          )}
          <View className="flex-1 items-center">
            <Progress step={step} />
          </View>
          <View style={{ width: 44 }} />
        </View>
      </SheetHeader>
      <View style={{ gap: SPACE.xs }}>
        <Text
          accessibilityRole="header"
          style={{
            fontFamily: FACE["700"],
            fontSize: TYPE.title2.fontSize,
            lineHeight: TYPE.title2.lineHeight,
          }}
        >
          {STEPS[step].title}
        </Text>
        <Text tone="muted">{STEPS[step].hint}</Text>
      </View>
      {step === 0 ? (
        <View style={{ gap: SPACE.lg }}>
          {spaceId ? null : (
            <View className="flex-row">
              <PillSelect
                label="Space"
                value={space}
                options={spaces.map(spaceOption)}
                onChange={setPicked}
              />
            </View>
          )}
          <OptionList
            label="Term system"
            value={system}
            options={ACADEMIC_SYSTEM_KEYS.map((key) => ({
              id: key,
              label: ACADEMIC_SYSTEMS[key].label,
            }))}
            afterPick={stay}
            onChange={(key) => {
              setSystem(key);
              setTermKey(null);
              setRegion(null);
            }}
          />
        </View>
      ) : null}
      {step === 1 ? (
        <OptionList
          label="Region"
          value={region ?? "none"}
          options={[
            { id: "none", label: "No dates", subtitle: "Set them later" },
            ...regions.map((r) => ({ id: r.key, label: r.label })),
          ]}
          afterPick={stay}
          onChange={(key) => setRegion(key === "none" ? null : key)}
        />
      ) : null}
      {step === 2 ? (
        <View style={{ gap: SPACE.lg }}>
          <OptionList
            label="Current term"
            value={term.key}
            options={def.terms.map((t) => ({ id: t.key, label: t.label }))}
            afterPick={stay}
            onChange={setTermKey}
          />
          <Segmented
            label="Year"
            value={String(theYear)}
            options={[guess.year - 1, guess.year, guess.year + 1].map((y) => ({
              value: String(y),
              label: String(y),
            }))}
            onChange={(y) => setYear(Number(y))}
          />
        </View>
      ) : null}
      {step === 3 ? (
        <Segmented
          label="How many semesters"
          value={String(count)}
          options={COUNTS.map((n) => ({ value: n, label: n }))}
          onChange={(n) => setCount(Number(n))}
        />
      ) : null}
      {last ? (
        <DisplayGroup>
          {planned.map((p) => {
            const dates = datesFor(p.termType, p.year);
            const current = p.termType === term.key && p.year === theYear;
            return (
              <View
                key={`${p.termType}-${p.year}`}
                className="flex-row items-center gap-3 px-4"
                style={{ minHeight: 52 }}
              >
                <View className="flex-1">
                  <Text>{p.title}</Text>
                  {dates ? (
                    <Text variant="small" tone="muted">
                      {`${dayLabel(dates.startDate)} to ${dayLabel(dates.endDate)}`}
                    </Text>
                  ) : null}
                </View>
                {current ? <Text tone="primary">Current</Text> : null}
              </View>
            );
          })}
        </DisplayGroup>
      ) : null}
      {create.error ? <Text tone="destructive">{create.error.message}</Text> : null}
      <SheetFooter>
        <View style={{ paddingHorizontal: SPACE.lg, paddingBottom: SPACE.sm }}>
          {last ? (
            <Button
              size="lg"
              label="Create Semesters"
              status={statusOf(create)}
              errorLabel="Couldn't create"
              onPress={() => create.mutate(undefined, { onSuccess: () => close() })}
            />
          ) : (
            <Button size="lg" label="Continue" onPress={() => setStep(step + 1)} />
          )}
        </View>
      </SheetFooter>
    </View>
  );
}
