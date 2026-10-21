import { useCourses, useExams } from "../data/queries.ts";
import { ChoiceProperty } from "../ui/property-rows.tsx";
import { SelectField } from "../ui/SelectField.tsx";

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
  return (
    <SelectField
      label="Course"
      value={value}
      onChange={onChange}
      disabled={readOnly}
      empty="Make a Course first, under Courses."
      options={courses.map((c) => ({ id: c.entity.id, label: c.entity.title || "Untitled" }))}
    />
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
    <SelectField
      label="Exam"
      value={value ?? "none"}
      onChange={(id) => onChange(id === "none" ? null : id)}
      disabled={readOnly}
      options={[
        { id: "none", label: "No exam" },
        ...exams.map((e) => ({ id: e.entity.id, label: e.entity.title || "Untitled" })),
      ]}
    />
  );
}

/// The Course of an Exam or an Assignment as a row of its card: the Course's name, and the
/// Space's Courses to change it to.
export function CourseProperty({
  spaceId,
  value,
  onChange,
  readOnly = false,
  icon,
}: {
  spaceId: string;
  value: string | null;
  onChange: (courseId: string) => void;
  readOnly?: boolean;
  icon?: React.ReactNode;
}) {
  const { data: courses = [] } = useCourses(spaceId);
  return (
    <ChoiceProperty
      icon={icon}
      label="Course"
      value={value ?? ""}
      readOnly={readOnly}
      options={courses.map((c) => ({ id: c.entity.id, label: c.entity.title || "Untitled" }))}
      onChange={onChange}
    />
  );
}

/// The Exam a deck prepares for, or none, as a row.
export function ExamProperty({
  spaceId,
  value,
  onChange,
  readOnly = false,
  icon,
}: {
  spaceId: string;
  value: string | null;
  onChange: (examId: string | null) => void;
  readOnly?: boolean;
  icon?: React.ReactNode;
}) {
  const { data: exams = [] } = useExams({ spaceId });
  return (
    <ChoiceProperty
      icon={icon}
      label="Exam"
      value={value ?? "none"}
      readOnly={readOnly}
      options={[
        { id: "none", label: "No exam" },
        ...exams.map((e) => ({ id: e.entity.id, label: e.entity.title || "Untitled" })),
      ]}
      onChange={(id) => onChange(id === "none" ? null : id)}
    />
  );
}
