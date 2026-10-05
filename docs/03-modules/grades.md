# Module: Grades

A report, not a place to create things. It has no entities of its own: it reads the grades and weights on Exams and Assignments and groups them by course and semester.

The module is added to a Space together with Exams or Assignments, and removed on its own. Removing it hides it; nothing is lost. Spaces that already used either module got it when it was introduced.

## Report

Per Space. Courses are grouped by Semester in the Semesters page's order, with courses in no semester last. A course shows its grade (see [Course Grade](courses-semesters.md#course-grade)) and the Exams and Assignments behind it, each with its share of the course.

- **Semester average:** the mean of its courses' grades. A course without a grade is left out.
- **Cumulative average:** the mean of every graded course across all semesters, not of the semester averages.
- **Current semester:** the one the Semesters page treats as current.

Grades are on whatever scale the user enters. Weights and grades of both Exams and Assignments are edited in the rows; work without a weight splits what the weighted work leaves evenly.

`semester` has a read only `grades` field in the CLI: `{ gpa, gradedCourseCount, courseCount }`.

## Layout Direction

A transcript. The cumulative and current averages on top, with a line of the semester averages over time. Below, one fold per semester in a single column: the current one open, the others showing only their average until opened, remembered per device. Each course shows its grade and a bar of its work, each segment as wide as its share and filled once graded. Work is listed by date; its grade and weight read as plain numbers and are edited in place.
