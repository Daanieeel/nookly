//! Moodle as the CLI sees it: remote types.
//!
//! Moodle has no entities, so it is not in `db::schema`. This registry is its
//! counterpart: every Moodle record the app shows is declared once here (name, fields,
//! the parent it is read under) and the CLI's generic `list`, `get`, `describe` and
//! `schema` read it. A new Moodle page means one more entry, never a hand written
//! command. Every read goes through `MoodleState`, the same service the app uses, so
//! sign in state, the offline cache and error handling stay in one place.

use super::model::*;
use super::service::{Fetched, MoodleState};
use crate::error::{to_json, AppError, AppResult};
use serde::Serialize;
use serde_json::{json, Value};

pub struct RemoteField {
    pub name: &'static str,
    pub kind: &'static str,
    pub description: &'static str,
}

/// The record a type is read under, passed as `--<flag> <id>`.
pub struct RemoteParent {
    pub flag: &'static str,
    pub description: &'static str,
}

/// Which service call fills a type.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Source {
    Courses,
    Sections,
    Assignments,
    Grades,
    Forums,
    Discussions,
    Posts,
    Files,
}

pub struct RemoteTypeDef {
    pub entity_type: &'static str,
    pub description: &'static str,
    pub parent: Option<RemoteParent>,
    /// The field `get <id>` matches.
    pub id_field: &'static str,
    pub fields: &'static [RemoteField],
    pub source: Source,
    /// What `get` adds to the row.
    pub get_adds: Option<&'static str>,
    /// Whether the type has files that `download` can save.
    pub downloads: bool,
}

const fn field(name: &'static str, kind: &'static str, description: &'static str) -> RemoteField {
    RemoteField {
        name,
        kind,
        description,
    }
}

const FILE_FIELDS_NOTE: &str = "A file is `fileUrl` plus `fileName`; save one with `nookly cli moodle_file download --url <fileUrl> --out <path>`.";

const ATTACHMENTS: RemoteField = field(
    "attachments",
    "list<file>",
    "Files attached, each with fileName, fileSize, fileUrl, mimeType and timeModified.",
);

static TYPES: &[RemoteTypeDef] = &[
    RemoteTypeDef {
        entity_type: "moodle_course",
        description: "A course the user is enrolled in on their university's Moodle. Read only, fetched live.",
        parent: None,
        id_field: "id",
        source: Source::Courses,
        get_adds: None,
        downloads: false,
        fields: &[
            field("id", "integer", "Moodle's course id, the value for --course on the other moodle types."),
            field("shortName", "text", "Short name, like a course code."),
            field("fullName", "text", "Full course name."),
            field("summary", "html", "The course description, as HTML."),
            field("startDate", "unix_seconds", "When the course starts. 0 when not set."),
            field("endDate", "unix_seconds", "When the course ends. 0 when not set."),
            field("progress", "float", "Percent complete when the site tracks it, else null."),
            field("hidden", "boolean", "True when the user hid the course on Moodle."),
            field("overviewFiles", "list<file>", "The course banner, when its teachers set one."),
        ],
    },
    RemoteTypeDef {
        entity_type: "moodle_section",
        description: "A section of a course's content (a week or a topic) with its modules: pages, files, links, assignments and forums. Read only, fetched live. Files sit in each module's `contents`; `moodle_file list` flattens them.",
        parent: Some(RemoteParent {
            flag: "course",
            description: "A moodle_course id",
        }),
        id_field: "id",
        source: Source::Sections,
        get_adds: None,
        downloads: false,
        fields: &[
            field("id", "integer", "Moodle's section id."),
            field("name", "text", "Section title."),
            field("summary", "html", "Section description, as HTML."),
            field("userVisible", "boolean", "Whether the section is visible to the user, null when the site does not say."),
            field("modules", "list<module>", "The section's modules: id, name, modName (page, resource, assign, forum, url ...), url, description (HTML), userVisible and contents (files)."),
        ],
    },
    RemoteTypeDef {
        entity_type: "moodle_file",
        description: "A file or link in a course's modules, flattened with the section and module it sits in. Read only, fetched live. `download` saves one to a path.",
        parent: Some(RemoteParent {
            flag: "course",
            description: "A moodle_course id",
        }),
        id_field: "fileUrl",
        source: Source::Files,
        get_adds: None,
        downloads: true,
        fields: &[
            field("sectionId", "integer", "The section the file is in."),
            field("sectionName", "text", "That section's title."),
            field("moduleId", "integer", "The module the file is in."),
            field("moduleName", "text", "That module's title."),
            field("moduleType", "text", "What the module is: resource, folder, page, url ..."),
            field("kind", "text", "`file`, `url` (a link, `fileUrl` is where it goes) or `content`."),
            field("fileName", "text", "File name."),
            field("filePath", "text", "Folder path inside a Moodle folder module."),
            field("fileSize", "integer", "Size in bytes."),
            field("fileUrl", "text", "Where the file lives on Moodle. Pass it to `download --url`."),
            field("timeModified", "unix_seconds", "When the file last changed."),
            field("mimeType", "text", "Media type."),
        ],
    },
    RemoteTypeDef {
        entity_type: "moodle_assignment",
        description: "An assignment in a course, with its dates. `get` adds the user's own status. Read only, fetched live.",
        parent: Some(RemoteParent {
            flag: "course",
            description: "A moodle_course id",
        }),
        id_field: "id",
        source: Source::Assignments,
        get_adds: Some("status: { submissionStatus (new, draft, submitted, reopened), gradingStatus, grade, feedback (list of HTML comments) } for the user"),
        downloads: false,
        fields: &[
            field("id", "integer", "Moodle's assignment id."),
            field("cmid", "integer", "The assignment's module id."),
            field("name", "text", "Assignment title."),
            field("dueDate", "unix_seconds", "When it is due. 0 when there is no due date."),
            field("openDate", "unix_seconds", "When submissions open. 0 when not set."),
            field("cutOffDate", "unix_seconds", "When late submissions stop. 0 when not set."),
            field("intro", "html", "The assignment text, as HTML."),
            ATTACHMENTS,
        ],
    },
    RemoteTypeDef {
        entity_type: "moodle_grade",
        description: "One row of the user's grades in a course: graded activities, categories and the course total. Read only, fetched live.",
        parent: Some(RemoteParent {
            flag: "course",
            description: "A moodle_course id",
        }),
        id_field: "id",
        source: Source::Grades,
        get_adds: None,
        downloads: false,
        fields: &[
            field("id", "integer", "Moodle's grade item id."),
            field("name", "text", "Item name, null for the course total."),
            field("itemType", "text", "`course` for the total, `category`, `mod` for graded activities."),
            field("itemModule", "text", "The activity type for `mod` items, like assign or quiz."),
            field("cmid", "integer", "The activity's module id."),
            field("grade", "text", "The grade as Moodle shows it."),
            field("range", "text", "The possible range."),
            field("percentage", "text", "The grade as a percentage."),
            field("weight", "text", "How much the item counts."),
            field("feedback", "html", "The teacher's feedback."),
        ],
    },
    RemoteTypeDef {
        entity_type: "moodle_forum",
        description: "A forum in a course. The one with kind `news` is the course's announcements. Read only, fetched live.",
        parent: Some(RemoteParent {
            flag: "course",
            description: "A moodle_course id",
        }),
        id_field: "id",
        source: Source::Forums,
        get_adds: None,
        downloads: false,
        fields: &[
            field("id", "integer", "Moodle's forum id, the value for --forum on moodle_discussion."),
            field("cmid", "integer", "The forum's module id."),
            field("name", "text", "Forum title."),
            field("kind", "text", "`news` is the course's announcements."),
            field("intro", "html", "Forum description, as HTML."),
            field("numDiscussions", "integer", "How many discussions it has."),
        ],
    },
    RemoteTypeDef {
        entity_type: "moodle_discussion",
        description: "A discussion in a forum, newest activity first as Moodle orders it, with its first message. For an announcement this is the announcement. Read only, fetched live.",
        parent: Some(RemoteParent {
            flag: "forum",
            description: "A moodle_forum id",
        }),
        id_field: "discussionId",
        source: Source::Discussions,
        get_adds: None,
        downloads: false,
        fields: &[
            field("discussionId", "integer", "Moodle's discussion id, the value for --discussion on moodle_post."),
            field("name", "text", "Discussion title."),
            field("subject", "text", "Subject of the first message."),
            field("message", "html", "The first message, as HTML."),
            field("author", "text", "Who started it."),
            field("timeModified", "unix_seconds", "When it last changed."),
            field("numReplies", "integer", "How many replies it has."),
            field("pinned", "boolean", "Whether it is pinned to the top."),
            ATTACHMENTS,
        ],
    },
    RemoteTypeDef {
        entity_type: "moodle_post",
        description: "A post in a forum discussion, oldest first, replies pointing at their parent. Read only, fetched live.",
        parent: Some(RemoteParent {
            flag: "discussion",
            description: "A moodle_discussion discussionId",
        }),
        id_field: "id",
        source: Source::Posts,
        get_adds: None,
        downloads: false,
        fields: &[
            field("id", "integer", "Moodle's post id."),
            field("parentId", "integer", "The post this replies to, 0 for the first post."),
            field("subject", "text", "Post subject."),
            field("message", "html", "The post, as HTML."),
            field("author", "object", "{ fullName } of the author."),
            field("timeCreated", "unix_seconds", "When it was posted."),
            ATTACHMENTS,
        ],
    },
];

pub fn all() -> &'static [RemoteTypeDef] {
    TYPES
}

pub fn lookup(entity_type: &str) -> Option<&'static RemoteTypeDef> {
    TYPES.iter().find(|d| d.entity_type == entity_type)
}

pub fn describe_json(def: &RemoteTypeDef) -> Value {
    let fields: Vec<Value> = def
        .fields
        .iter()
        .map(|f| json!({ "name": f.name, "kind": f.kind, "description": f.description }))
        .collect();
    let mut commands = serde_json::Map::new();
    let parent_flag = def
        .parent
        .as_ref()
        .map(|p| format!(" --{} <id>", p.flag))
        .unwrap_or_default();
    let name = def.entity_type;
    commands.insert(
        "list".into(),
        json!(format!(
            "nookly cli {name} list{parent_flag} [--fields a,b,...] [--limit <n>]"
        )),
    );
    commands.insert(
        "get".into(),
        json!(format!(
            "nookly cli {name} get <{}>{parent_flag}",
            def.id_field
        )),
    );
    if def.downloads {
        commands.insert(
            "download".into(),
            json!(format!(
                "nookly cli {name} download --url <fileUrl> --out <path> [--file-name <name>]  \
                 ({FILE_FIELDS_NOTE} Any `fileUrl` works, also those in attachments of other moodle types. \
                 --out is a new file, or an existing folder together with --file-name. Never overwrites.)"
            )),
        );
    }
    json!({
        "entityType": name,
        "remote": true,
        "readOnly": true,
        "module": "moodle",
        "description": def.description,
        "parent": def.parent.as_ref().map(|p| json!({
            "flag": p.flag,
            "description": p.description,
            "required": true,
        })),
        "idField": def.id_field,
        "fields": fields,
        "getAdds": def.get_adds,
        "commands": commands,
        "note": "Not an entity: no key, Space, labels or relationships, and it cannot be created, \
                 updated or deleted. Fetched live from the user's university with the Moodle sign in \
                 saved in the system keychain; if Moodle cannot be reached the last answer is returned \
                 with `offline: true`. Needs the user to be signed in to Moodle in the Nookly app.",
    })
}

/// A file or link of a module, with where it sits.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CourseFile {
    section_id: i64,
    section_name: String,
    module_id: i64,
    module_name: String,
    module_type: String,
    #[serde(flatten)]
    file: RemoteFile,
}

fn erase<T: Serialize>(fetched: Fetched<T>) -> AppResult<Fetched<Vec<Value>>> {
    let Value::Array(items) = to_json(fetched.data)? else {
        return Err(AppError::InvalidInput(
            "Moodle answered in a way Nookly can't read.".into(),
        ));
    };
    Ok(Fetched {
        data: items,
        fetched_at: fetched.fetched_at,
        offline: fetched.offline,
    })
}

fn course_files(sections: Vec<Section>) -> Vec<CourseFile> {
    sections
        .into_iter()
        .flat_map(|section| {
            let (section_id, section_name) = (section.id, section.name);
            section.modules.into_iter().flat_map(move |module| {
                let (module_id, module_name, module_type) =
                    (module.id, module.name, module.mod_name);
                let section_name = section_name.clone();
                module.contents.into_iter().map(move |file| CourseFile {
                    section_id,
                    section_name: section_name.clone(),
                    module_id,
                    module_name: module_name.clone(),
                    module_type: module_type.clone(),
                    file,
                })
            })
        })
        .collect()
}

/// Every row of a type, read live through the app's own service. `parent` is the
/// `--course`, `--forum` or `--discussion` id the type is read under.
pub async fn list(
    state: &MoodleState,
    def: &RemoteTypeDef,
    parent: Option<i64>,
) -> AppResult<Fetched<Vec<Value>>> {
    let parent_id = || {
        parent.ok_or_else(|| {
            let flag = def.parent.as_ref().map_or("id", |p| p.flag);
            AppError::InvalidInput(format!("missing required flag: --{flag}"))
        })
    };
    match def.source {
        Source::Courses => erase(state.courses().await?),
        Source::Sections => erase(state.contents(parent_id()?).await?),
        Source::Files => {
            let sections = state.contents(parent_id()?).await?;
            erase(Fetched {
                data: course_files(sections.data),
                fetched_at: sections.fetched_at,
                offline: sections.offline,
            })
        }
        Source::Assignments => erase(state.assignments(parent_id()?).await?),
        Source::Grades => erase(state.grades(parent_id()?).await?),
        Source::Forums => erase(state.forums(parent_id()?).await?),
        Source::Discussions => erase(state.discussions(parent_id()?).await?),
        Source::Posts => erase(state.posts(parent_id()?).await?),
    }
}

/// The user's own status on one assignment, for `get`.
pub async fn assignment_status(state: &MoodleState, assignment_id: i64) -> AppResult<Value> {
    let fetched = state.assignment_status(assignment_id).await?;
    to_json(fetched.data)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeSet;

    fn keys(value: Value) -> BTreeSet<String> {
        value.as_object().unwrap().keys().cloned().collect()
    }

    fn declared(def: &RemoteTypeDef) -> BTreeSet<String> {
        def.fields.iter().map(|f| f.name.to_string()).collect()
    }

    /// The registry cannot drift from what the service returns: its fields are the keys
    /// of the model each type serializes.
    #[test]
    fn declared_fields_are_the_model_fields() {
        let model = |source: Source| -> BTreeSet<String> {
            match source {
                Source::Courses => keys(to_json(Course::default()).unwrap()),
                Source::Sections => keys(to_json(Section::default()).unwrap()),
                Source::Assignments => keys(to_json(Assignment::default()).unwrap()),
                Source::Grades => keys(to_json(GradeItem::default()).unwrap()),
                Source::Forums => keys(to_json(Forum::default()).unwrap()),
                Source::Discussions => keys(to_json(Discussion::default()).unwrap()),
                Source::Posts => keys(to_json(Post::default()).unwrap()),
                Source::Files => keys(
                    to_json(CourseFile {
                        section_id: 0,
                        section_name: String::new(),
                        module_id: 0,
                        module_name: String::new(),
                        module_type: String::new(),
                        file: RemoteFile::default(),
                    })
                    .unwrap(),
                ),
            }
        };
        for def in all() {
            assert_eq!(declared(def), model(def.source), "{}", def.entity_type);
        }
    }

    #[test]
    fn every_type_has_its_id_field_and_a_unique_moodle_name() {
        let mut seen = BTreeSet::new();
        for def in all() {
            assert!(
                def.entity_type.starts_with("moodle_"),
                "{}",
                def.entity_type
            );
            assert!(seen.insert(def.entity_type), "{} twice", def.entity_type);
            assert!(declared(def).contains(def.id_field), "{}", def.entity_type);
            assert_eq!(
                def.parent.is_some(),
                def.source != Source::Courses,
                "{}",
                def.entity_type
            );
        }
    }

    #[test]
    fn moodle_types_never_clash_with_entity_types() {
        for def in all() {
            assert!(
                crate::db::schema::lookup(def.entity_type).is_none(),
                "{}",
                def.entity_type
            );
        }
    }

    #[test]
    fn describe_marks_a_type_remote_and_read_only() {
        let described = describe_json(lookup("moodle_assignment").unwrap());
        assert_eq!(described["remote"], true);
        assert_eq!(described["readOnly"], true);
        assert_eq!(described["parent"]["flag"], "course");
        assert!(described["commands"]["list"]
            .as_str()
            .unwrap()
            .contains("--course <id>"));
        assert!(described["commands"].get("download").is_none());
        let files = describe_json(lookup("moodle_file").unwrap());
        assert!(files["commands"].get("download").is_some());
    }

    #[test]
    fn files_are_flattened_with_where_they_sit() {
        let sections = vec![Section {
            id: 1,
            name: "Week 1".into(),
            modules: vec![CourseModule {
                id: 5,
                name: "Slides".into(),
                mod_name: "resource".into(),
                contents: vec![RemoteFile {
                    file_name: "a.pdf".into(),
                    ..Default::default()
                }],
                ..Default::default()
            }],
            ..Default::default()
        }];
        let files = course_files(sections);
        assert_eq!(files.len(), 1);
        let row = to_json(&files[0]).unwrap();
        assert_eq!(row["sectionName"], "Week 1");
        assert_eq!(row["moduleName"], "Slides");
        assert_eq!(row["fileName"], "a.pdf");
    }
}
