//! What Nookly reads from Moodle. Each type reads Moodle's lower case names
//! (`fileurl`) and writes camelCase, which is also how the cache stores it.
//! Everything is optional or defaulted: sites differ in version and plugins.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct SiteInfo {
    #[serde(alias = "sitename")]
    pub site_name: String,
    #[serde(alias = "fullname")]
    pub full_name: String,
    #[serde(alias = "userid")]
    pub user_id: i64,
    #[serde(alias = "siteurl")]
    pub site_url: String,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Course {
    pub id: i64,
    #[serde(alias = "shortname")]
    pub short_name: String,
    #[serde(alias = "fullname")]
    pub full_name: String,
    pub summary: String,
    #[serde(alias = "startdate")]
    pub start_date: i64,
    #[serde(alias = "enddate")]
    pub end_date: i64,
    pub progress: Option<f64>,
    pub hidden: bool,
}

/// A file Moodle holds: in a course, an assignment, a forum post.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct RemoteFile {
    /// `file`, `url` (a link, `file_url` is where it goes) or `content`.
    #[serde(alias = "type")]
    pub kind: String,
    #[serde(alias = "filename")]
    pub file_name: String,
    #[serde(alias = "filepath")]
    pub file_path: String,
    #[serde(alias = "filesize")]
    pub file_size: i64,
    #[serde(alias = "fileurl")]
    pub file_url: String,
    #[serde(alias = "timemodified")]
    pub time_modified: i64,
    #[serde(alias = "mimetype")]
    pub mime_type: String,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct CourseModule {
    /// The course module id, which is the `id` in Moodle's page addresses.
    pub id: i64,
    pub name: String,
    #[serde(alias = "modname")]
    pub mod_name: String,
    pub url: String,
    pub description: String,
    #[serde(alias = "uservisible")]
    pub user_visible: Option<bool>,
    pub contents: Vec<RemoteFile>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Section {
    pub id: i64,
    pub name: String,
    pub summary: String,
    #[serde(alias = "uservisible")]
    pub user_visible: Option<bool>,
    pub modules: Vec<CourseModule>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Assignment {
    pub id: i64,
    pub cmid: i64,
    pub name: String,
    #[serde(alias = "duedate")]
    pub due_date: i64,
    #[serde(alias = "allowsubmissionsfromdate")]
    pub open_date: i64,
    #[serde(alias = "cutoffdate")]
    pub cut_off_date: i64,
    pub intro: String,
    #[serde(alias = "introattachments")]
    pub attachments: Vec<RemoteFile>,
}

/// Where the user stands on one assignment.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AssignmentStatus {
    /// `new`, `draft`, `submitted` or `reopened`.
    pub submission_status: Option<String>,
    /// `graded`, `notgraded`, `released` and so on.
    pub grading_status: Option<String>,
    pub grade: Option<String>,
    /// The teacher's feedback comments, as HTML.
    pub feedback: Vec<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct GradeItem {
    pub id: i64,
    #[serde(alias = "itemname")]
    pub name: Option<String>,
    /// `course` for the total, `category`, `mod` for graded activities.
    #[serde(alias = "itemtype")]
    pub item_type: String,
    #[serde(alias = "itemmodule")]
    pub item_module: Option<String>,
    pub cmid: Option<i64>,
    #[serde(alias = "gradeformatted")]
    pub grade: Option<String>,
    #[serde(alias = "rangeformatted")]
    pub range: Option<String>,
    #[serde(alias = "percentageformatted")]
    pub percentage: Option<String>,
    #[serde(alias = "weightformatted")]
    pub weight: Option<String>,
    pub feedback: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Forum {
    pub id: i64,
    pub cmid: i64,
    pub name: String,
    /// `news` is the course's announcements.
    #[serde(alias = "type")]
    pub kind: String,
    pub intro: String,
    #[serde(alias = "numdiscussions")]
    pub num_discussions: i64,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Discussion {
    #[serde(alias = "discussion")]
    pub discussion_id: i64,
    pub name: String,
    pub subject: String,
    pub message: String,
    #[serde(alias = "userfullname")]
    pub author: String,
    #[serde(alias = "timemodified")]
    pub time_modified: i64,
    #[serde(alias = "numreplies")]
    pub num_replies: i64,
    pub pinned: bool,
    pub attachments: Vec<RemoteFile>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Author {
    #[serde(alias = "fullname")]
    pub full_name: String,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Post {
    pub id: i64,
    #[serde(alias = "parentid")]
    pub parent_id: i64,
    pub subject: String,
    pub message: String,
    pub author: Author,
    #[serde(alias = "timecreated")]
    pub time_created: i64,
    pub attachments: Vec<RemoteFile>,
}
