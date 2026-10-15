import { useCourses, useExams } from "../data/queries.ts";
import { Chip, ChipGroup } from "../ui/Chips.tsx";
import { Text } from "../ui/Text.tsx";

/// The Course an exam or assignment belongs to: exactly one, of its Space.
export function CoursePicker({
  spaceId,
  value,
  onChange,
  readOnly = false,
}: {
  spaceId: string;
  value: string | null;
  onChange: (courseId: string) => void;
  readOnly?: boolean;
}) {
  const { data: courses = [] } = useCourses(spaceId);
  if (courses.length === 0) return <Text tone="muted">Make a Course first, under Courses.</Text>;
  return (
    <ChipGroup label="Course" scroll>
      {courses.map((c) => (
        <Chip
          key={c.entity.id}
          label={c.entity.title || "Untitled"}
          selected={c.entity.id === value}
          disabled={readOnly}
          onPress={() => c.entity.id !== value && onChange(c.entity.id)}
        />
      ))}
    </ChipGroup>
  );
}

/// The Exam a deck prepares for, or none.
export function ExamPicker({
  spaceId,
  value,
  onChange,
  readOnly = false,
}: {
  spaceId: string;
  value: string | null;
  onChange: (examId: string | null) => void;
  readOnly?: boolean;
}) {
  const { data: exams = [] } = useExams({ spaceId });
  return (
    <ChipGroup label="Exam" scroll>
      <Chip
        label="No exam"
        selected={value === null}
        disabled={readOnly}
        onPress={() => value !== null && onChange(null)}
      />
      {exams.map((e) => (
        <Chip
          key={e.entity.id}
          label={e.entity.title || "Untitled"}
          selected={e.entity.id === value}
          disabled={readOnly}
          onPress={() => e.entity.id !== value && onChange(e.entity.id)}
        />
      ))}
    </ChipGroup>
  );
}
