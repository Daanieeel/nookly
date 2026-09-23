import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { FieldError, StatusButtonContent, useActionStatus } from "@/components/action-feedback";
import { EntityDetailLayout } from "@/components/entity-detail-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createDeck } from "@/lib/api/decks";
import { listExams, updateExam } from "@/lib/api/exams";
import { createStudyBlock } from "@/lib/api/studyBlocks";
import type { Entity } from "@/lib/api/types";

const STATUSES = ["upcoming", "studying", "done"];

export function ExamDetailView({ entity }: { entity: Entity }) {
  const queryClient = useQueryClient();
  const [deckTitle, setDeckTitle] = useState("");
  const [blockDate, setBlockDate] = useState("");

  const { data: exams = [] } = useQuery({
    queryKey: ["exams", entity.spaceId],
    queryFn: () => listExams(entity.spaceId),
  });
  const exam = exams.find((e) => e.entity.id === entity.id);

  const invalidateRelated = () => {
    queryClient.invalidateQueries({ queryKey: ["exams", entity.spaceId] });
    queryClient.invalidateQueries({ queryKey: ["relationships", entity.id] });
  };

  const setStatus = useMutation({
    mutationFn: (status: string) => updateExam(entity.id, null, status),
    onSuccess: invalidateRelated,
  });
  const setGrade = useMutation({
    mutationFn: (grade: number) => updateExam(entity.id, grade, null),
    onSuccess: invalidateRelated,
  });
  const addDeck = useMutation({
    mutationFn: (title: string) => createDeck(entity.spaceId, title, entity.id),
    onSuccess: () => {
      invalidateRelated();
      setDeckTitle("");
    },
  });
  const addStudyBlock = useMutation({
    mutationFn: (date: string) =>
      createStudyBlock(entity.spaceId, `Study: ${entity.title}`, entity.id, date, "18:00", "20:00"),
    onSuccess: () => {
      invalidateRelated();
      setBlockDate("");
    },
  });

  const deckStatus = useActionStatus(addDeck);
  const studyBlockStatus = useActionStatus(addStudyBlock);
  const fieldError = setStatus.isError
    ? `Couldn't change status: ${setStatus.error.message}`
    : setGrade.isError
      ? `Couldn't save grade: ${setGrade.error.message}`
      : null;

  return (
    <EntityDetailLayout entity={entity}>
      <div className="flex max-w-xl flex-col gap-4">
        <div className="flex items-center gap-3">
          <Select value={exam?.status} onValueChange={(v) => setStatus.mutate(v)}>
            <SelectTrigger size="sm" className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="number"
            placeholder="Grade"
            defaultValue={exam?.grade ?? ""}
            onBlur={(e) => e.target.value && setGrade.mutate(Number(e.target.value))}
            className="w-24"
          />
        </div>
        <FieldError message={fieldError} />

        <div className="flex flex-col gap-2 border-t border-border pt-4">
          <h3 className="text-sm font-medium">Index card decks</h3>
          <div className="flex gap-2">
            <Input
              placeholder="New deck name…"
              value={deckTitle}
              onChange={(e) => setDeckTitle(e.target.value)}
            />
            <Button
              size="sm"
              disabled={!deckTitle.trim()}
              onClick={() => !addDeck.isPending && addDeck.mutate(deckTitle.trim())}
            >
              <StatusButtonContent
                status={deckStatus}
                label="Add"
                successLabel="Deck added"
                errorLabel="Couldn't add, try again"
              />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Decks appear in the Relationships panel →</p>
        </div>

        <div className="flex flex-col gap-2 border-t border-border pt-4">
          <h3 className="text-sm font-medium">Study blocks</h3>
          <div className="flex gap-2">
            <Input type="date" value={blockDate} onChange={(e) => setBlockDate(e.target.value)} />
            <Button
              size="sm"
              disabled={!blockDate && studyBlockStatus !== "success"}
              onClick={() =>
                blockDate && !addStudyBlock.isPending && addStudyBlock.mutate(blockDate)
              }
            >
              <StatusButtonContent
                status={studyBlockStatus}
                label="Schedule 18:00 to 20:00"
                successLabel="Study block scheduled"
                errorLabel="Couldn't schedule, try again"
              />
            </Button>
          </div>
        </div>
      </div>
    </EntityDetailLayout>
  );
}
