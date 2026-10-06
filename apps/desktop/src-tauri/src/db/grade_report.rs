//! The Grade Report: every course's grade and the work behind it, grouped by semester,
//! with a grade point average per semester and across all of them. Computed from Exams
//! and Assignments, never stored. Course grades roll up as in `courses::roll_up_grades`.

use crate::db::courses::{item_weights, roll_up_grades, CourseGrades, Semester};
use crate::db::entities::Entity;
use crate::error::AppResult;
use rusqlite::{params, Connection};
use serde::Serialize;
use std::collections::HashMap;

/// One Exam or Assignment counting towards a course's grade.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GradeItem {
    pub entity: Entity,
    /// `exam` or `assignment`.
    pub kind: String,
    /// The weight as stored.
    pub weight: Option<f64>,
    /// What share of the course's grade it counts for, 0 to 1.
    pub share: f64,
    pub grade: Option<f64>,
    /// The exam's or the assignment's own status, as stored.
    pub status: String,
    /// The exam date, or the day the assignment is due.
    pub date: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CourseReport {
    pub course: Entity,
    pub grades: CourseGrades,
    /// By date, undated last.
    pub items: Vec<GradeItem>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SemesterReport {
    /// `None` for the courses that are in no semester.
    pub semester: Option<Semester>,
    /// Mean of the grades of its courses that have one.
    pub gpa: Option<f64>,
    pub graded_course_count: usize,
    pub courses: Vec<CourseReport>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GradeReport {
    /// Semesters in the order they were created, the courses in none last. Semesters
    /// without a course are left out.
    pub semesters: Vec<SemesterReport>,
    /// Mean of every graded course's grade, across all semesters.
    pub gpa: Option<f64>,
}

fn mean(grades: impl Iterator<Item = f64>) -> Option<f64> {
    let (sum, count) = grades.fold((0.0, 0usize), |(sum, count), g| (sum + g, count + 1));
    (count > 0).then(|| sum / count as f64)
}

/// `from -> course` for one relationship type, among live courses only.
fn course_links(conn: &Connection, relationship_type: &str) -> AppResult<HashMap<String, String>> {
    let mut stmt = conn.prepare(
        "SELECT r.from_entity_id, r.to_entity_id FROM relationships r
         WHERE r.relationship_type = ?1",
    )?;
    let rows = stmt.query_map(params![relationship_type], |row| {
        Ok((row.get(0)?, row.get(1)?))
    })?;
    Ok(rows.collect::<Result<_, _>>()?)
}

pub fn get_grade_report(conn: &Connection, space_id: &str) -> AppResult<GradeReport> {
    let courses = crate::db::courses::list_courses(conn, space_id)?;
    let semesters = crate::db::courses::list_semesters(conn, space_id)?;
    let semester_of = course_links(conn, "course-semester")?;
    let exam_course = course_links(conn, "exam-course")?;
    let assignment_course = course_links(conn, "assignment-course")?;

    let mut items_of: HashMap<String, Vec<GradeItem>> = HashMap::new();
    for exam in crate::db::exams::list_exams(conn, space_id)? {
        let Some(course_id) = exam_course.get(&exam.entity.id) else {
            continue;
        };
        items_of
            .entry(course_id.clone())
            .or_default()
            .push(GradeItem {
                entity: exam.entity,
                kind: "exam".into(),
                weight: exam.weight,
                share: 0.0,
                grade: exam.grade,
                status: exam.status,
                date: exam.exam_date,
            });
    }
    for assignment in crate::db::assignments::list_assignments(conn, space_id)? {
        let Some(course_id) = assignment_course.get(&assignment.entity.id) else {
            continue;
        };
        items_of
            .entry(course_id.clone())
            .or_default()
            .push(GradeItem {
                entity: assignment.entity,
                kind: "assignment".into(),
                weight: assignment.weight,
                share: 0.0,
                grade: assignment.grade,
                status: assignment.status,
                date: assignment.due_date,
            });
    }

    let mut reports: HashMap<String, CourseReport> = HashMap::new();
    for course in courses {
        let mut items = items_of.remove(&course.id).unwrap_or_default();
        let pairs: Vec<_> = items.iter().map(|i| (i.weight, i.grade)).collect();
        let grades = roll_up_grades(&pairs);
        let weights = item_weights(&pairs);
        let total: f64 = weights.iter().sum();
        for (item, weight) in items.iter_mut().zip(weights) {
            item.share = if total > 0.0 { weight / total } else { 0.0 };
        }
        // Dated items first, by date; the sort is stable, so equal dates keep their order.
        items.sort_by(|a, b| match (&a.date, &b.date) {
            (Some(a), Some(b)) => a.cmp(b),
            (Some(_), None) => std::cmp::Ordering::Less,
            (None, Some(_)) => std::cmp::Ordering::Greater,
            (None, None) => std::cmp::Ordering::Equal,
        });
        reports.insert(
            course.id.clone(),
            CourseReport {
                course,
                grades,
                items,
            },
        );
    }

    let mut groups: Vec<(Option<Semester>, Vec<CourseReport>)> = semesters
        .into_iter()
        .map(|s| (Some(s), Vec::new()))
        .collect();
    groups.push((None, Vec::new()));
    let mut ordered: Vec<CourseReport> = reports.into_values().collect();
    ordered.sort_by(|a, b| a.course.created_at.cmp(&b.course.created_at));
    for report in ordered {
        let semester_id = semester_of.get(&report.course.id);
        let slot = groups
            .iter_mut()
            .find(|(semester, _)| match (semester, semester_id) {
                (Some(semester), Some(id)) => &semester.entity.id == id,
                _ => false,
            });
        match slot {
            Some((_, courses)) => courses.push(report),
            // In no semester, or in one that is trashed.
            None => groups
                .last_mut()
                .expect("the loose group is always there")
                .1
                .push(report),
        }
    }

    let semesters: Vec<SemesterReport> = groups
        .into_iter()
        .filter(|(_, courses)| !courses.is_empty())
        .map(|(semester, courses)| {
            let graded: Vec<f64> = courses.iter().filter_map(|c| c.grades.grade).collect();
            SemesterReport {
                semester,
                gpa: mean(graded.iter().copied()),
                graded_course_count: graded.len(),
                courses,
            }
        })
        .collect();
    let gpa = mean(
        semesters
            .iter()
            .flat_map(|s| s.courses.iter())
            .filter_map(|c| c.grades.grade),
    );
    Ok(GradeReport { semesters, gpa })
}

/// A semester's grade point average, as the CLI reports it.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SemesterGrades {
    pub gpa: Option<f64>,
    pub graded_course_count: usize,
    pub course_count: usize,
}

/// `report`'s numbers for one semester; zeros and no average when it has no courses.
pub fn semester_summary(report: &GradeReport, semester_id: &str) -> SemesterGrades {
    report
        .semesters
        .iter()
        .find(|s| {
            s.semester
                .as_ref()
                .is_some_and(|s| s.entity.id == semester_id)
        })
        .map_or(
            SemesterGrades {
                gpa: None,
                graded_course_count: 0,
                course_count: 0,
            },
            |s| SemesterGrades {
                gpa: s.gpa,
                graded_course_count: s.graded_course_count,
                course_count: s.courses.len(),
            },
        )
}
