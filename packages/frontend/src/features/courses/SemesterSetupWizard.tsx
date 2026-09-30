import { IconCheck } from "@tabler/icons-react";
import { useForm, useStore } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { z } from "zod";
import {
  StatusButtonContent,
  statusOf,
  useCloseAfterSuccess,
} from "#/components/action-feedback.tsx";
import { Button } from "@nookly/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@nookly/ui/components/dialog";
import { NumberInput } from "@nookly/ui/components/number-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@nookly/ui/components/select";
import {
  ACADEMIC_SYSTEMS,
  type AcademicSystemKey,
  type TermTypeDef,
  guessCurrentTerm,
} from "./academic-terms";
import { createSemester, setCurrentSemester } from "#/lib/api/courses.ts";
import { REGION_TERM_DATES, resolveTermDates } from "./region-term-dates";
import { cn } from "@nookly/ui/lib/utils";
import { qk } from "#/lib/query-keys.ts";

const DEFAULT_SEMESTER_COUNT = 4;

type Step = "system" | "region" | "current" | "count" | "review";

const wizardSchema = z.object({
  system: z.custom<AcademicSystemKey>((v) => Object.hasOwn(ACADEMIC_SYSTEMS, String(v))),
  regionKey: z.string().nullable(),
  currentTermKey: z.string().min(1),
  currentYear: z.number().int().min(2000).max(2100),
  semesterCount: z.number().int().min(1).max(16),
});

type WizardValues = z.infer<typeof wizardSchema>;

/// The fields each step owns, so Next only waits on the step being shown.
const STEP_FIELDS = {
  system: ["system"],
  region: ["regionKey"],
  current: ["currentTermKey", "currentYear"],
  count: ["semesterCount"],
  review: [],
} satisfies Record<Step, string[]>;

function stepIsValid(step: Step, values: WizardValues): boolean {
  const issues = wizardSchema.safeParse(values).error?.issues ?? [];
  const owned: readonly string[] = STEP_FIELDS[step];
  return issues.every((i) => !owned.includes(String(i.path[0])));
}

function initialValues(): WizardValues {
  const guess = guessCurrentTerm("winter_summer");
  return {
    system: "winter_summer",
    regionKey: null,
    currentTermKey: guess.term.key,
    currentYear: guess.year,
    semesterCount: DEFAULT_SEMESTER_COUNT,
  };
}

/// Setup wizard (PLAN §3) — bootstraps a run of Semester entities starting at
/// a confirmed "current" one, with rough auto-suggested dates. Only ever
/// generates the current semester and the ones after it — never backfills
/// past terms, since those aren't what the user is asking to plan for.
/// Triggered on first Semester creation or via an explicit "Set up
/// semesters" action; re-triggerable, never runs silently on its own.
export function SemesterSetupWizard({
  open,
  onOpenChange,
  spaceId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spaceId: string;
}) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>("system");
  const form = useForm({
    defaultValues: initialValues(),
    validators: { onChange: wizardSchema },
    onSubmit: () => {
      if (!locked) finish.mutate();
    },
  });
  const { system, regionKey, currentTermKey, currentYear, semesterCount } = useStore(
    form.store,
    (state) => state.values,
  );

  useEffect(() => {
    if (!open) return;
    setStep("system");
    form.reset(initialValues());
  }, [open, form]);

  const terms = ACADEMIC_SYSTEMS[system].terms;
  const currentTerm = terms.find((t) => t.key === currentTermKey) ?? terms[0];
  const region = REGION_TERM_DATES.find((r) => r.key === regionKey && r.system === system) ?? null;

  const plan = buildSemesterPlan(system, currentTerm, currentYear, semesterCount);
  // SAFETY: ACADEMIC_SYSTEMS is defined as Record<AcademicSystemKey, ...>, so its own keys are exactly that union.
  const systemKeys = Object.keys(ACADEMIC_SYSTEMS) as AcademicSystemKey[];

  const finish = useMutation({
    mutationFn: async () => {
      let currentEntityId: string | null = null;
      for (const item of plan) {
        const window = region?.windows[item.term.key];
        const dates = window ? resolveTermDates(window, item.year) : null;
        const created = await createSemester(
          spaceId,
          ACADEMIC_SYSTEMS[system].formatTitle(item.term, item.year),
          {
            termType: item.term.key,
            year: item.year,
            startDate: dates?.startDate,
            endDate: dates?.endDate,
          },
        );
        if (item.isCurrent) currentEntityId = created.entity.id;
      }
      if (currentEntityId) await setCurrentSemester(spaceId, currentEntityId);
    },
    // Also on error: semesters created before the failure should show up in the list.
    onSettled: () => queryClient.invalidateQueries({ queryKey: qk.semesters.bySpace(spaceId) }),
  });
  useCloseAfterSuccess(finish, () => onOpenChange(false));
  const resetFinish = finish.reset;
  useEffect(() => {
    if (open) resetFinish();
  }, [open, resetFinish]);
  const finishStatus = statusOf(finish);
  const locked = finishStatus === "pending" || finishStatus === "success";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Set up semesters</DialogTitle>
          <DialogDescription>
            {step === "system" && "Which term system do you use?"}
            {step === "region" && "Where's your institution? Used only to suggest rough dates."}
            {step === "current" && "Which semester are you in right now?"}
            {step === "count" && "How many semesters will you study, starting from this one?"}
            {step === "review" && "This will create the following semesters."}
          </DialogDescription>
        </DialogHeader>

        <StepDots step={step} />

        {step === "system" && (
          <div className="flex flex-col gap-2">
            {systemKeys.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => form.setFieldValue("system", key)}
                className={cn(
                  "flex items-center justify-between rounded-md border border-input bg-accent px-3 py-2 text-left text-sm hover:bg-accent/80",
                  system === key && "border-primary",
                )}
              >
                {ACADEMIC_SYSTEMS[key].label}
                {system === key && <IconCheck size={14} className="text-primary" />}
              </button>
            ))}
          </div>
        )}

        {step === "region" && (
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => form.setFieldValue("regionKey", null)}
              className={cn(
                "flex items-center justify-between rounded-md border border-input bg-accent px-3 py-2 text-left text-sm hover:bg-accent/80",
                regionKey === null && "border-primary",
              )}
            >
              Skip — leave dates blank
              {regionKey === null && <IconCheck size={14} className="text-primary" />}
            </button>
            {REGION_TERM_DATES.filter((r) => r.system === system).map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={() => form.setFieldValue("regionKey", r.key)}
                className={cn(
                  "flex items-center justify-between rounded-md border border-input bg-accent px-3 py-2 text-left text-sm hover:bg-accent/80",
                  regionKey === r.key && "border-primary",
                )}
              >
                {r.label}
                {regionKey === r.key && <IconCheck size={14} className="text-primary" />}
              </button>
            ))}
            <p className="text-xs text-muted-foreground">
              Rough defaults only — commonly off by 1–3 weeks from your institution's real dates.
              Always editable afterward, never re-synced automatically.
            </p>
          </div>
        )}

        {step === "current" && (
          <div className="flex items-center gap-2">
            <Select
              value={currentTermKey}
              onValueChange={(v) => form.setFieldValue("currentTermKey", v)}
            >
              <SelectTrigger className="flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {terms.map((t) => (
                  <SelectItem key={t.key} value={t.key}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <NumberInput
              value={currentYear}
              onChange={(v) => form.setFieldValue("currentYear", v)}
              min={2000}
              max={2100}
            />
          </div>
        )}

        {step === "count" && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <NumberInput
                value={semesterCount}
                onChange={(v) => form.setFieldValue("semesterCount", v)}
                min={1}
                max={16}
              />
              <span className="text-sm text-muted-foreground">
                semester{semesterCount === 1 ? "" : "s"}, starting at{" "}
                {ACADEMIC_SYSTEMS[system].formatTitle(currentTerm, currentYear)}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Only this semester and the ones after it are created — nothing before.
            </p>
          </div>
        )}

        {step === "review" && (
          <div className="flex flex-col gap-1">
            {plan.map((item) => (
              <div
                key={`${item.term.key}-${item.year}`}
                className={cn(
                  "flex items-center justify-between rounded-md border border-border px-3 py-1.5 text-sm",
                  item.isCurrent && "border-primary bg-primary/5",
                )}
              >
                {ACADEMIC_SYSTEMS[system].formatTitle(item.term, item.year)}
                {item.isCurrent && (
                  <span className="text-xs font-medium text-primary">Current</span>
                )}
              </div>
            ))}
            <p className="mt-1 text-xs text-muted-foreground">
              You can rename, add, delete, reorder, or edit dates for any of these afterward.
            </p>
          </div>
        )}

        <DialogFooter>
          {step !== "system" && (
            <Button variant="outline" onClick={() => setStep(PREV_STEP[step])} disabled={locked}>
              Back
            </Button>
          )}
          {step !== "review" ? (
            <Button
              disabled={
                !stepIsValid(step, {
                  system,
                  regionKey,
                  currentTermKey,
                  currentYear,
                  semesterCount,
                })
              }
              onClick={() => setStep(NEXT_STEP[step])}
            >
              Next
            </Button>
          ) : (
            <Button onClick={() => void form.handleSubmit()}>
              <StatusButtonContent
                status={finishStatus}
                label="Create semesters"
                successLabel="Semesters created"
                errorLabel="Couldn't create all semesters, try again"
              />
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const NEXT_STEP = {
  system: "region",
  region: "current",
  current: "count",
  count: "review",
} satisfies Record<Exclude<Step, "review">, Step>;
const PREV_STEP = {
  region: "system",
  current: "region",
  count: "current",
  review: "count",
} satisfies Record<Exclude<Step, "system">, Step>;
const STEPS: Step[] = ["system", "region", "current", "count", "review"];

function StepDots({ step }: { step: Step }) {
  const index = STEPS.indexOf(step);
  return (
    <div className="flex items-center gap-1.5">
      {STEPS.map((s, i) => (
        <span
          key={s}
          className={cn(
            "h-1.5 flex-1 rounded-full",
            i <= index ? "bg-primary" : "bg-muted-foreground/20",
          )}
        />
      ))}
    </div>
  );
}

/// Walks the system's terms chronologically forward from the confirmed
/// current one, `semesterCount` terms total (PLAN §3 step 4/5 — user-chosen
/// count). Never generates anything before the current semester.
function buildSemesterPlan(
  system: AcademicSystemKey,
  currentTerm: TermTypeDef,
  currentYear: number,
  semesterCount: number,
): { term: TermTypeDef; year: number; isCurrent: boolean }[] {
  const terms = [...ACADEMIC_SYSTEMS[system].terms].sort((a, b) => a.sortMonth - b.sortMonth);
  const currentIndex = terms.findIndex((t) => t.key === currentTerm.key);
  // Flattened absolute index into an infinite (year, term) sequence, so
  // stepping forward across a year boundary is just +1.
  const currentAbs = currentYear * terms.length + currentIndex;

  const plan: { term: TermTypeDef; year: number; isCurrent: boolean }[] = [];
  for (let offset = 0; offset < Math.max(1, semesterCount); offset++) {
    const abs = currentAbs + offset;
    const year = Math.floor(abs / terms.length);
    const term = terms[((abs % terms.length) + terms.length) % terms.length];
    plan.push({ term, year, isCurrent: offset === 0 });
  }
  return plan;
}
