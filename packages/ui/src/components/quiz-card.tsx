import { Button } from "@nookly/ui/components/button";
import { Card, CardContent, CardHeader } from "@nookly/ui/components/card";

/// One question of a quiz (chat visual design §8.5): a dedicated card, not
/// chat text — question, a reveal step, then a self-graded right/wrong.
function QuizCard({
  index,
  total,
  question,
  answer,
  revealed,
  onReveal,
  onGrade,
}: {
  index: number;
  total: number;
  question: string;
  answer: string;
  revealed: boolean;
  onReveal: () => void;
  onGrade: (correct: boolean) => void;
}) {
  return (
    <Card className="gap-0 py-0">
      <CardHeader className="gap-2 border-b border-input px-4 py-3">
        <span className="text-xs font-medium text-muted-foreground">
          Question {index + 1} of {total}
        </span>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 py-4">
        <p className="text-base font-medium text-foreground">{question}</p>
        {revealed ? (
          <>
            <p className="rounded-md bg-background/60 p-3 text-sm text-muted-foreground">{answer}</p>
            <div className="flex justify-end gap-2">
              <Button variant="destructive" size="sm" onClick={() => onGrade(false)}>
                Missed it
              </Button>
              <Button variant="positive" size="sm" onClick={() => onGrade(true)}>
                Got it
              </Button>
            </div>
          </>
        ) : (
          <Button variant="secondary" size="sm" className="self-start" onClick={onReveal}>
            Reveal answer
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

/// End-of-quiz score card.
function QuizSummaryCard({ right, total }: { right: number; total: number }) {
  return (
    <Card className="gap-0 py-0">
      <CardContent className="flex flex-col items-center gap-1 py-6 text-center">
        <p className="text-lg font-semibold text-foreground">
          {right} / {total}
        </p>
        <p className="text-sm text-muted-foreground">questions you got right</p>
      </CardContent>
    </Card>
  );
}

export { QuizCard, QuizSummaryCard };
