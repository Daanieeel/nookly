import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { aiGenerateQuiz } from "#/lib/api/assistant.ts";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@nookly/ui/components/dialog";
import { QuizCard, QuizSummaryCard } from "@nookly/ui/components/quiz-card";
import { Skeleton } from "@nookly/ui/components/skeleton";

/// "Quiz me" (PLAN §7.1/§8.5), opened from a Note or Jot's context menu.
/// Questions are generated once per open from that page's own content; the
/// quiz itself never writes anything.
export function QuizDialog({
  entityId,
  onOpenChange,
}: {
  entityId: string;
  onOpenChange: (open: boolean) => void;
}) {
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [right, setRight] = useState(0);
  const [graded, setGraded] = useState(0);

  const { data: questions, error } = useQuery({
    queryKey: ["ai-quiz", entityId],
    queryFn: () => aiGenerateQuiz(entityId, 8),
  });

  const current = questions?.[index];
  const finished = questions !== undefined && graded >= questions.length;

  function grade(correct: boolean) {
    if (correct) setRight((r) => r + 1);
    setGraded((g) => g + 1);
    setRevealed(false);
    setIndex((i) => i + 1);
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Quiz me</DialogTitle>
          <DialogDescription>Questions generated from this page's own content.</DialogDescription>
        </DialogHeader>
        {error && (
          <p className="text-sm text-destructive">
            {error instanceof Error ? error.message : "Couldn't generate a quiz."}
          </p>
        )}
        {!error && !questions && <Skeleton className="h-40 w-full" />}
        {!error && questions && questions.length === 0 && (
          <p className="text-sm text-muted-foreground">This page has no content to quiz on yet.</p>
        )}
        {!error && questions && questions.length > 0 && !finished && current && (
          <QuizCard
            index={index}
            total={questions.length}
            question={current.question}
            answer={current.answer}
            revealed={revealed}
            onReveal={() => setRevealed(true)}
            onGrade={grade}
          />
        )}
        {!error && questions && finished && <QuizSummaryCard right={right} total={questions.length} />}
      </DialogContent>
    </Dialog>
  );
}
