use crate::db::entities::Entity;
use crate::db::page_json::BlockJson;
use crate::db::relationships::{Cardinality, MovesWith, RelationshipTypeDef};
use crate::db::schema::{
    ChildActionDef, ChildCollectionDef, ComputedFieldDef, CreateInput, EntitySchemaDef, FieldDef,
    FieldKind, JsonMap,
};
use crate::error::{AppError, AppResult};
use chrono::{DateTime, Duration, Utc};
use rs_fsrs::{Rating, State, FSRS};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

inventory::submit! {
    RelationshipTypeDef { name: "deck-exam", label: "Deck for exam", description: "Ties a flashcard deck to the exam it prepares for.", from_type: Some("index_card_deck"), to_type: Some("exam"), inverse_label: "has deck", cardinality: Cardinality::OneToPerFrom, moves_with: MovesWith::FromFollowsTo }
}

/// Learning cards due this soon still show when nothing else is due, so a
/// session doesn't stall on a card that comes back in a few minutes (Anki's
/// learn ahead limit).
const LEARN_AHEAD_MINUTES: i64 = 20;

/// A deck stands on its own; `exam_id` files it under the Exam it prepares for.
pub fn create_deck(
    conn: &Connection,
    space_id: String,
    title: String,
    exam_id: Option<String>,
) -> AppResult<Entity> {
    crate::db::atomically(conn, || {
        let entity = crate::db::entities::create_entity(
            conn,
            space_id,
            "index_card_deck".into(),
            title,
            None,
        )?;
        conn.execute(
            "INSERT INTO index_card_decks (entity_id) VALUES (?1)",
            params![entity.id],
        )?;
        if let Some(exam_id) = exam_id {
            set_deck_exam(conn, &entity.id, Some(exam_id))?;
        }
        Ok(entity)
    })
}

/// The Exam a deck belongs to, if any.
pub fn deck_exam_id(conn: &Connection, deck_id: &str) -> AppResult<Option<String>> {
    Ok(conn
        .query_row(
            "SELECT to_entity_id FROM relationships WHERE from_entity_id = ?1 AND relationship_type = 'deck-exam'",
            params![deck_id],
            |row| row.get(0),
        )
        .optional()?)
}

/// Files the deck under `exam_id`, or under no Exam with `None`.
pub fn set_deck_exam(conn: &Connection, deck_id: &str, exam_id: Option<String>) -> AppResult<()> {
    if let Some(exam_id) = &exam_id {
        let exam = crate::db::entities::get_entity(conn, exam_id)?;
        if exam.entity_type != "exam" {
            return Err(AppError::InvalidInput(format!(
                "{exam_id} is a '{}', not an exam",
                exam.entity_type
            )));
        }
    }
    conn.execute(
        "DELETE FROM relationships WHERE from_entity_id = ?1 AND relationship_type = 'deck-exam'",
        params![deck_id],
    )?;
    if let Some(exam_id) = exam_id {
        crate::db::relationships::create_relationship(
            conn,
            deck_id.to_string(),
            exam_id,
            "deck-exam".into(),
            None,
            None,
        )?;
    }
    Ok(())
}

/// One row of the Decks page: the deck, its Exam and its card counts.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeckSummary {
    pub entity: Entity,
    pub exam_id: Option<String>,
    pub stats: DeckStats,
}

pub fn list_deck_summaries(conn: &Connection, space_id: &str) -> AppResult<Vec<DeckSummary>> {
    list_decks(conn, space_id)?
        .into_iter()
        .map(|entity| {
            Ok(DeckSummary {
                exam_id: deck_exam_id(conn, &entity.id)?,
                stats: deck_stats(conn, &entity.id)?,
                entity,
            })
        })
        .collect()
}

/// Every Space's decks, oldest first, for the Dashboard's study cards.
pub fn list_deck_summaries_all_spaces(conn: &Connection) -> AppResult<Vec<DeckSummary>> {
    let mut stmt = conn.prepare(
        "SELECT e.* FROM entities e JOIN index_card_decks d ON d.entity_id = e.id
         WHERE e.deleted_at IS NULL ORDER BY e.created_at ASC",
    )?;
    let decks = stmt
        .query_map([], crate::db::entities::row_to_entity)?
        .collect::<Result<Vec<_>, _>>()?;
    decks
        .into_iter()
        .map(|entity| {
            Ok(DeckSummary {
                exam_id: deck_exam_id(conn, &entity.id)?,
                stats: deck_stats(conn, &entity.id)?,
                entity,
            })
        })
        .collect()
}

pub fn list_decks(conn: &Connection, space_id: &str) -> AppResult<Vec<Entity>> {
    let mut stmt = conn.prepare(
        "SELECT e.* FROM entities e JOIN index_card_decks d ON d.entity_id = e.id
         WHERE e.space_id = ?1 AND e.deleted_at IS NULL ORDER BY e.created_at ASC",
    )?;
    let rows = stmt.query_map(params![space_id], crate::db::entities::row_to_entity)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

// --- cards -----------------------------------------------------------------

/// When the card comes back for each rating, worked out by FSRS at read time.
#[derive(Debug, Clone, Serialize)]
pub struct NextDue {
    pub again: String,
    pub hard: String,
    pub good: String,
    pub easy: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexCard {
    pub id: String,
    pub deck_entity_id: String,
    /// The front as markdown text. A card written with blocks keeps the markdown of its blocks
    /// here too, so anything that only reads text still gets the card.
    pub front: String,
    pub back: String,
    /// The front as blocks, the way the card editor writes it. `None` on a card that has not
    /// been edited since faces became blocks: it shows `front` until then.
    pub front_blocks: Option<Vec<BlockJson>>,
    pub back_blocks: Option<Vec<BlockJson>>,
    /// `new`, `learning`, `review` or `relearning`.
    pub state: String,
    pub due_at: String,
    pub stability: f64,
    pub difficulty: f64,
    pub elapsed_days: i64,
    pub scheduled_days: i64,
    pub reps: i64,
    pub lapses: i64,
    pub last_review_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub deleted_at: Option<String>,
    pub next: NextDue,
}

/// The scheduling columns of a card, stored with each review so it can be undone.
#[derive(Debug, Clone, Serialize, Deserialize)]
struct Schedule {
    state: String,
    due_at: String,
    stability: f64,
    difficulty: f64,
    elapsed_days: i64,
    scheduled_days: i64,
    reps: i64,
    lapses: i64,
    last_review_at: Option<String>,
}

fn state_name(state: State) -> &'static str {
    match state {
        State::New => "new",
        State::Learning => "learning",
        State::Review => "review",
        State::Relearning => "relearning",
    }
}

fn parse_state(name: &str) -> State {
    match name {
        "learning" => State::Learning,
        "review" => State::Review,
        "relearning" => State::Relearning,
        _ => State::New,
    }
}

fn rating_name(rating: Rating) -> &'static str {
    match rating {
        Rating::Again => "again",
        Rating::Hard => "hard",
        Rating::Good => "good",
        Rating::Easy => "easy",
    }
}

pub fn parse_rating(name: &str) -> AppResult<Rating> {
    match name {
        "again" | "1" => Ok(Rating::Again),
        "hard" | "2" => Ok(Rating::Hard),
        "good" | "3" => Ok(Rating::Good),
        "easy" | "4" => Ok(Rating::Easy),
        other => Err(AppError::InvalidInput(format!(
            "rating must be again, hard, good or easy (or 1 to 4), got '{other}'"
        ))),
    }
}

fn parse_time(raw: &str) -> DateTime<Utc> {
    DateTime::parse_from_rfc3339(raw)
        .map(|t| t.with_timezone(&Utc))
        .unwrap_or_else(|_| Utc::now())
}

impl Schedule {
    fn to_fsrs(&self) -> rs_fsrs::Card {
        rs_fsrs::Card {
            due: parse_time(&self.due_at),
            stability: self.stability,
            difficulty: self.difficulty,
            elapsed_days: self.elapsed_days,
            scheduled_days: self.scheduled_days,
            reps: self.reps as i32,
            lapses: self.lapses as i32,
            state: parse_state(&self.state),
            last_review: self
                .last_review_at
                .as_deref()
                .map(parse_time)
                .unwrap_or_else(Utc::now),
        }
    }

    fn from_fsrs(card: &rs_fsrs::Card) -> Self {
        Self {
            state: state_name(card.state).into(),
            due_at: card.due.to_rfc3339(),
            stability: card.stability,
            difficulty: card.difficulty,
            elapsed_days: card.elapsed_days,
            scheduled_days: card.scheduled_days,
            reps: card.reps.into(),
            lapses: card.lapses.into(),
            last_review_at: Some(card.last_review.to_rfc3339()),
        }
    }
}

fn next_due(schedule: &Schedule, now: DateTime<Utc>) -> NextDue {
    let preview = FSRS::default().repeat(schedule.to_fsrs(), now);
    let due = |rating| preview[&rating].card.due.to_rfc3339();
    NextDue {
        again: due(Rating::Again),
        hard: due(Rating::Hard),
        good: due(Rating::Good),
        easy: due(Rating::Easy),
    }
}

fn row_to_schedule(row: &rusqlite::Row) -> rusqlite::Result<Schedule> {
    Ok(Schedule {
        state: row.get("state")?,
        due_at: row.get("due_at")?,
        stability: row.get("stability")?,
        difficulty: row.get("difficulty")?,
        elapsed_days: row.get("elapsed_days")?,
        scheduled_days: row.get("scheduled_days")?,
        reps: row.get("reps")?,
        lapses: row.get("lapses")?,
        last_review_at: row.get("last_review_at")?,
    })
}

fn row_to_card(row: &rusqlite::Row) -> rusqlite::Result<IndexCard> {
    let schedule = row_to_schedule(row)?;
    Ok(IndexCard {
        id: row.get("id")?,
        deck_entity_id: row.get("deck_entity_id")?,
        front: row.get("front")?,
        back: row.get("back")?,
        front_blocks: blocks_of(row.get("front_blocks")?),
        back_blocks: blocks_of(row.get("back_blocks")?),
        next: next_due(&schedule, Utc::now()),
        state: schedule.state,
        due_at: schedule.due_at,
        stability: schedule.stability,
        difficulty: schedule.difficulty,
        elapsed_days: schedule.elapsed_days,
        scheduled_days: schedule.scheduled_days,
        reps: schedule.reps,
        lapses: schedule.lapses,
        last_review_at: schedule.last_review_at,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
        deleted_at: row.get("deleted_at")?,
    })
}

pub fn get_card(conn: &Connection, card_id: &str) -> AppResult<IndexCard> {
    conn.query_row(
        "SELECT * FROM index_cards WHERE id = ?1",
        params![card_id],
        row_to_card,
    )
    .optional()?
    .ok_or_else(|| AppError::NotFound(format!("index card {card_id}")))
}

/// One side of a card, as written: text with inline markdown, or blocks.
#[derive(Debug, Clone, PartialEq)]
pub enum Face {
    Text(String),
    Blocks(Vec<BlockJson>),
}

impl From<String> for Face {
    fn from(text: String) -> Self {
        Face::Text(text)
    }
}

impl From<&str> for Face {
    fn from(text: &str) -> Self {
        Face::Text(text.into())
    }
}

impl From<Vec<BlockJson>> for Face {
    fn from(blocks: Vec<BlockJson>) -> Self {
        Face::Blocks(blocks)
    }
}

impl Face {
    /// What a command that takes both forms was given; blocks win over text.
    pub fn given(text: Option<String>, blocks: Option<Vec<BlockJson>>) -> Option<Face> {
        blocks.map(Face::Blocks).or(text.map(Face::Text))
    }
}

/// Stored blocks back to a list. A column that does not parse is treated as no blocks, so
/// the card still shows its text.
fn blocks_of(raw: Option<String>) -> Option<Vec<BlockJson>> {
    serde_json::from_str(&raw?).ok()
}

/// `(text, blocks column)` of a face as it is stored. Blocks are checked like the blocks of
/// a page, and their markdown goes in the text column.
fn stored_face(conn: &Connection, face: Face) -> AppResult<(String, Option<String>)> {
    let blocks = match face {
        Face::Text(text) => return Ok((text, None)),
        Face::Blocks(blocks) => blocks,
    };
    let mut prepared = Vec::with_capacity(blocks.len());
    for (index, block) in blocks.into_iter().enumerate() {
        if !crate::db::page_json::is_known_type(&block.block_type) {
            return Err(AppError::InvalidInput(format!(
                "block {}: '{}' is not a block type",
                index + 1,
                block.block_type
            )));
        }
        let (content, attrs) =
            crate::db::notes::prepare_block(conn, &block.block_type, block.content, block.attrs)
                .map_err(|e| match e {
                    AppError::InvalidInput(reason) => {
                        AppError::InvalidInput(format!("block {}: {reason}", index + 1))
                    }
                    other => other,
                })?;
        prepared.push(BlockJson {
            block_type: block.block_type,
            content,
            language: block.language,
            filename: block.filename,
            attrs,
        });
    }
    let markdown = prepared
        .iter()
        .map(|b| crate::db::notes::block_to_markdown(&crate::db::page_json::block_from_json(b)))
        .collect::<Vec<_>>()
        .join("\n\n");
    let text = crate::db::mention_keys::ids_to_keys(conn, &markdown)?;
    Ok((text, Some(crate::error::to_json_string(&prepared)?)))
}

pub fn create_card(
    conn: &Connection,
    deck_entity_id: String,
    front: Face,
    back: Face,
) -> AppResult<IndexCard> {
    let deck = crate::db::entities::get_entity(conn, &deck_entity_id)?;
    if deck.entity_type != "index_card_deck" {
        return Err(AppError::InvalidInput(format!(
            "{deck_entity_id} is a '{}', not a deck",
            deck.entity_type
        )));
    }
    let (front, front_blocks) = stored_face(conn, front)?;
    let (back, back_blocks) = stored_face(conn, back)?;
    let id = super::new_id();
    let now = super::now();
    conn.execute(
        "INSERT INTO index_cards (id, deck_entity_id, front, back, front_blocks, back_blocks, due_at, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7, ?7)",
        params![id, deck_entity_id, front, back, front_blocks, back_blocks, now],
    )?;
    get_card(conn, &id)
}

/// Rewrites the given sides; a side left out stays as it is. Writing a side as text drops
/// its blocks, writing it as blocks replaces its text.
pub fn update_card(
    conn: &Connection,
    card_id: &str,
    front: Option<Face>,
    back: Option<Face>,
) -> AppResult<IndexCard> {
    get_card(conn, card_id)?;
    for (column, face) in [("front", front), ("back", back)] {
        let Some(face) = face else { continue };
        let (text, blocks) = stored_face(conn, face)?;
        conn.execute(
            &format!("UPDATE index_cards SET {column} = ?1, {column}_blocks = ?2, updated_at = ?3 WHERE id = ?4"),
            params![text, blocks, super::now(), card_id],
        )?;
    }
    get_card(conn, card_id)
}

pub fn delete_card(conn: &Connection, card_id: &str) -> AppResult<()> {
    get_card(conn, card_id)?;
    conn.execute(
        "UPDATE index_cards SET deleted_at = ?1 WHERE id = ?2",
        params![super::now(), card_id],
    )?;
    Ok(())
}

pub fn restore_card(conn: &Connection, card_id: &str) -> AppResult<()> {
    get_card(conn, card_id)?;
    conn.execute(
        "UPDATE index_cards SET deleted_at = NULL WHERE id = ?1",
        params![card_id],
    )?;
    Ok(())
}

pub fn list_cards(
    conn: &Connection,
    deck_entity_id: &str,
    include_deleted: bool,
) -> AppResult<Vec<IndexCard>> {
    let mut stmt = conn.prepare(
        "SELECT * FROM index_cards WHERE deck_entity_id = ?1 AND (?2 OR deleted_at IS NULL)
         ORDER BY created_at ASC",
    )?;
    let rows = stmt.query_map(params![deck_entity_id, include_deleted], row_to_card)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

/// What to study now, in order: cards in (re)learning, reviews, then new cards,
/// each by due date. With nothing due, learning cards coming back within
/// `LEARN_AHEAD_MINUTES` fill in.
pub fn study_queue(conn: &Connection, deck_entity_id: &str) -> AppResult<Vec<IndexCard>> {
    let now = Utc::now();
    let rank = |c: &IndexCard| match c.state.as_str() {
        "learning" | "relearning" => 0,
        "review" => 1,
        _ => 2,
    };
    let mut cards = list_cards(conn, deck_entity_id, false)?;
    cards.sort_by(|a, b| rank(a).cmp(&rank(b)).then(a.due_at.cmp(&b.due_at)));
    let due: Vec<IndexCard> = cards
        .iter()
        .filter(|c| parse_time(&c.due_at) <= now)
        .cloned()
        .collect();
    if !due.is_empty() {
        return Ok(due);
    }
    let ahead = now + Duration::minutes(LEARN_AHEAD_MINUTES);
    Ok(cards
        .into_iter()
        .filter(|c| rank(c) == 0 && parse_time(&c.due_at) <= ahead)
        .collect())
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeckStats {
    pub total: i64,
    pub new: i64,
    pub learning: i64,
    /// Review cards due now.
    pub due: i64,
    /// The soonest a card that isn't due yet comes back, for "next card in 3h".
    pub next_due_at: Option<String>,
    pub reviewed_today: i64,
}

pub fn deck_stats(conn: &Connection, deck_entity_id: &str) -> AppResult<DeckStats> {
    let now = Utc::now();
    let cards = list_cards(conn, deck_entity_id, false)?;
    let is_due = |c: &IndexCard| parse_time(&c.due_at) <= now;
    let count = |f: &dyn Fn(&IndexCard) -> bool| cards.iter().filter(|c| f(c)).count() as i64;
    let start_of_day = chrono::Local::now()
        .date_naive()
        .and_hms_opt(0, 0, 0)
        .and_then(|t| t.and_local_timezone(chrono::Local).single())
        .map(|t| t.with_timezone(&Utc).to_rfc3339())
        .unwrap_or_else(|| now.to_rfc3339());
    let reviewed_today: i64 = conn.query_row(
        "SELECT COUNT(*) FROM index_card_reviews r JOIN index_cards c ON c.id = r.card_id
         WHERE c.deck_entity_id = ?1 AND r.reviewed_at >= ?2",
        params![deck_entity_id, start_of_day],
        |row| row.get(0),
    )?;
    Ok(DeckStats {
        total: cards.len() as i64,
        new: count(&|c| c.state == "new"),
        learning: count(&|c| matches!(c.state.as_str(), "learning" | "relearning") && is_due(c)),
        due: count(&|c| c.state == "review" && is_due(c)),
        next_due_at: cards
            .iter()
            .filter(|c| c.state != "new" && !is_due(c))
            .map(|c| c.due_at.clone())
            .min(),
        reviewed_today,
    })
}

fn write_schedule(conn: &Connection, card_id: &str, s: &Schedule) -> AppResult<()> {
    conn.execute(
        "UPDATE index_cards SET state = ?1, due_at = ?2, stability = ?3, difficulty = ?4,
         elapsed_days = ?5, scheduled_days = ?6, reps = ?7, lapses = ?8, last_review_at = ?9,
         updated_at = ?10 WHERE id = ?11",
        params![
            s.state,
            s.due_at,
            s.stability,
            s.difficulty,
            s.elapsed_days,
            s.scheduled_days,
            s.reps,
            s.lapses,
            s.last_review_at,
            super::now(),
            card_id
        ],
    )?;
    Ok(())
}

/// Schedules the card with FSRS for `rating` and logs the review.
pub fn review_card(conn: &Connection, card_id: &str, rating: Rating) -> AppResult<IndexCard> {
    let previous = conn
        .query_row(
            "SELECT * FROM index_cards WHERE id = ?1",
            params![card_id],
            row_to_schedule,
        )
        .optional()?
        .ok_or_else(|| AppError::NotFound(format!("index card {card_id}")))?;
    let now = Utc::now();
    let info = FSRS::default().next(previous.to_fsrs(), now, rating);
    let next = Schedule::from_fsrs(&info.card);
    write_schedule(conn, card_id, &next)?;
    conn.execute(
        "INSERT INTO index_card_reviews
         (id, card_id, rating, state, elapsed_days, scheduled_days, previous, reviewed_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            super::new_id(),
            card_id,
            rating_name(rating),
            state_name(info.review_log.state),
            info.review_log.elapsed_days,
            info.review_log.scheduled_days,
            crate::error::to_json_string(&previous)?,
            now.to_rfc3339()
        ],
    )?;
    get_card(conn, card_id)
}

/// Puts the card back the way it was before its latest review and drops that review.
pub fn undo_review(conn: &Connection, card_id: &str) -> AppResult<IndexCard> {
    let (review_id, previous): (String, String) = conn
        .query_row(
            "SELECT id, previous FROM index_card_reviews WHERE card_id = ?1
             ORDER BY reviewed_at DESC LIMIT 1",
            params![card_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()?
        .ok_or_else(|| {
            AppError::InvalidInput(format!("index card {card_id} has no review to undo"))
        })?;
    let previous: Schedule = serde_json::from_str(&previous)
        .map_err(|e| AppError::Db(format!("unreadable review snapshot: {e}")))?;
    write_schedule(conn, card_id, &previous)?;
    conn.execute(
        "DELETE FROM index_card_reviews WHERE id = ?1",
        params![review_id],
    )?;
    get_card(conn, card_id)
}

// --- CLI schema registration (PLAN.md §1/§3) -------------------------------
//
// Index Cards aren't entities: they have no base entity fields (no title, no
// space_id) per `02-entity-model.md` §2.1, the same way Note blocks are page
// owned records. They reach the CLI as the deck's `cards` child collection.

const DECK_FIELDS: &[FieldDef] = &[FieldDef {
    name: "examId",
    kind: FieldKind::EntityRef("exam"),
    required_on_create: false,
    writable_on_update: true,
    description: "The Exam this deck prepares for, at most one. Optional; pass an empty value on update to unfile it.",
}];

fn cli_create_deck(conn: &Connection, input: CreateInput) -> AppResult<serde_json::Value> {
    let exam_id = crate::db::schema::field_str(&input.fields, "examId").filter(|id| !id.is_empty());
    let entity = create_deck(conn, input.space_id, input.title, exam_id)?;
    deck_payload(conn, entity)
}

fn cli_update_deck(conn: &Connection, id: &str, fields: &JsonMap) -> AppResult<serde_json::Value> {
    if fields.contains_key("examId") {
        let exam_id = crate::db::schema::field_str(fields, "examId").filter(|id| !id.is_empty());
        set_deck_exam(conn, id, exam_id)?;
    }
    cli_get_deck(conn, id)
}

fn cli_get_deck(conn: &Connection, id: &str) -> AppResult<serde_json::Value> {
    deck_payload(
        conn,
        crate::db::entities::get_entity_of_type(conn, id, "index_card_deck")?,
    )
}

/// The Deck entity plus its `examId` and `stats` computed field.
fn deck_payload(conn: &Connection, entity: Entity) -> AppResult<serde_json::Value> {
    let stats = deck_stats(conn, &entity.id)?;
    let exam_id = deck_exam_id(conn, &entity.id)?;
    let mut value = crate::error::to_json(entity)?;
    value["examId"] = serde_json::json!(exam_id);
    value["stats"] = crate::error::to_json(stats)?;
    Ok(value)
}

fn cli_list_decks(
    conn: &Connection,
    space_id: Option<&str>,
    _include_deleted: bool,
) -> AppResult<Vec<serde_json::Value>> {
    let space_id = space_id.ok_or_else(|| {
        AppError::InvalidInput("index_card_deck list requires --space <space-id>".into())
    })?;
    list_decks(conn, space_id)?
        .into_iter()
        .map(|e| deck_payload(conn, e))
        .collect()
}

inventory::submit! {
    EntitySchemaDef {
        entity_type: "index_card_deck",
        supports_blocks: false,
        description: "A deck of index cards studied with FSRS spaced repetition, optionally filed under one Exam. \
                      Its cards are the `cards` child collection.",
        fields: DECK_FIELDS,
        relationship_types: &["deck-exam"],
        create: cli_create_deck,
        update: cli_update_deck,
        get: cli_get_deck,
        list: cli_list_decks,
    }
}

inventory::submit! {
    ComputedFieldDef {
        entity_type: "index_card_deck",
        name: "stats",
        kind: FieldKind::Object,
        description: "Read only card counts: { total, new, learning, due, nextDueAt, reviewedToday }. `learning` \
                      and `due` count cards due now; `nextDueAt` is when the next not yet due card comes back.",
    }
}

const CARD_FIELDS: &[FieldDef] = &[
    FieldDef {
        name: "front",
        kind: FieldKind::LongText,
        required_on_create: false,
        writable_on_update: true,
        description: "The prompt side as inline markdown: **bold**, *italic*, `code`, $math$. Required to create unless \
                      frontBlocks is given. For a card written with blocks it reads as their markdown. Setting it \
                      replaces the front's blocks with this text.",
    },
    FieldDef {
        name: "back",
        kind: FieldKind::LongText,
        required_on_create: false,
        writable_on_update: true,
        description: "The answer side, same as front. Required to create unless backBlocks is given.",
    },
    FieldDef {
        name: "frontBlocks",
        kind: FieldKind::Object,
        required_on_create: false,
        writable_on_update: true,
        description: "The prompt side as blocks, a JSON array of { type, content, language?, filename?, attrs? } \
                      like the blocks of a note (`describe` lists the block types and their content formats). \
                      An `image` block mentions a File, [photo.png](mention:<file-id>). Wins over front. Read \
                      back as null on a card that has only text.",
    },
    FieldDef {
        name: "backBlocks",
        kind: FieldKind::Object,
        required_on_create: false,
        writable_on_update: true,
        description: "The answer side as blocks, same as frontBlocks. Wins over back.",
    },
];

const CARD_COMPUTED: &[FieldDef] = &[
    FieldDef {
        name: "state",
        kind: FieldKind::Enum(&["new", "learning", "review", "relearning"]),
        required_on_create: false,
        writable_on_update: false,
        description: "FSRS learning state.",
    },
    FieldDef {
        name: "dueAt",
        kind: FieldKind::DateTime,
        required_on_create: false,
        writable_on_update: false,
        description: "When the card is next due. New cards are due from creation.",
    },
    FieldDef {
        name: "stability",
        kind: FieldKind::Float,
        required_on_create: false,
        writable_on_update: false,
        description: "FSRS memory stability in days.",
    },
    FieldDef {
        name: "difficulty",
        kind: FieldKind::Float,
        required_on_create: false,
        writable_on_update: false,
        description: "FSRS difficulty, 1 to 10.",
    },
    FieldDef {
        name: "reps",
        kind: FieldKind::Integer,
        required_on_create: false,
        writable_on_update: false,
        description: "Times reviewed.",
    },
    FieldDef {
        name: "lapses",
        kind: FieldKind::Integer,
        required_on_create: false,
        writable_on_update: false,
        description: "Times forgotten after being learned.",
    },
    FieldDef {
        name: "next",
        kind: FieldKind::Object,
        required_on_create: false,
        writable_on_update: false,
        description: "{ again, hard, good, easy }: when the card would be due after each rating, as timestamps.",
    },
];

const REVIEW_FIELDS: &[FieldDef] = &[FieldDef {
    name: "rating",
    kind: FieldKind::Enum(&["again", "hard", "good", "easy"]),
    required_on_create: true,
    writable_on_update: false,
    description: "How well the answer was recalled. 1 to 4 work too.",
}];

fn card_json(card: IndexCard) -> AppResult<serde_json::Value> {
    crate::error::to_json(card)
}

fn cli_list_cards(
    conn: &Connection,
    deck_id: &str,
    include_deleted: bool,
) -> AppResult<Vec<serde_json::Value>> {
    list_cards(conn, deck_id, include_deleted)?
        .into_iter()
        .map(card_json)
        .collect::<AppResult<Vec<_>>>()
}

fn cli_get_card(conn: &Connection, id: &str) -> AppResult<serde_json::Value> {
    get_card(conn, id).and_then(card_json)
}

/// The side a command gives as text or as blocks (blocks win), or a clear error when the
/// blocks are not a list of blocks.
fn cli_face(fields: &JsonMap, text: &str, blocks: &str) -> AppResult<Option<Face>> {
    let parsed = match fields.get(blocks) {
        None | Some(serde_json::Value::Null) => None,
        Some(value) => Some(
            serde_json::from_value::<Vec<BlockJson>>(value.clone()).map_err(|e| {
                AppError::InvalidInput(format!(
                    "{blocks} must be a JSON array of blocks ({{ \"type\", \"content\" }}): {e}"
                ))
            })?,
        ),
    };
    Ok(Face::given(
        crate::db::schema::field_str(fields, text),
        parsed,
    ))
}

fn cli_create_card(
    conn: &Connection,
    deck_id: &str,
    fields: &JsonMap,
) -> AppResult<serde_json::Value> {
    let front = cli_face(fields, "front", "frontBlocks")?.ok_or_else(|| {
        AppError::InvalidInput("--field front=<text> or frontBlocks=<blocks> is required".into())
    })?;
    let back = cli_face(fields, "back", "backBlocks")?.ok_or_else(|| {
        AppError::InvalidInput("--field back=<text> or backBlocks=<blocks> is required".into())
    })?;
    create_card(conn, deck_id.into(), front, back).and_then(card_json)
}

fn cli_update_card(conn: &Connection, id: &str, fields: &JsonMap) -> AppResult<serde_json::Value> {
    let front = cli_face(fields, "front", "frontBlocks")?;
    let back = cli_face(fields, "back", "backBlocks")?;
    update_card(conn, id, front, back).and_then(card_json)
}

fn cli_review_card(conn: &Connection, id: &str, fields: &JsonMap) -> AppResult<serde_json::Value> {
    let raw = fields
        .get("rating")
        .map(|v| {
            v.as_str()
                .map(str::to_string)
                .unwrap_or_else(|| v.to_string())
        })
        .ok_or_else(|| {
            AppError::InvalidInput("--field rating=<again|hard|good|easy> is required".into())
        })?;
    review_card(conn, id, parse_rating(&raw)?).and_then(card_json)
}

fn cli_undo_review(conn: &Connection, id: &str, _fields: &JsonMap) -> AppResult<serde_json::Value> {
    undo_review(conn, id).and_then(card_json)
}

inventory::submit! {
    ChildCollectionDef {
        parent_type: "index_card_deck",
        singular: "card",
        plural: "cards",
        description: "The deck's index cards, each a front and a back scheduled with FSRS.",
        fields: CARD_FIELDS,
        computed: CARD_COMPUTED,
        list: cli_list_cards,
        get: cli_get_card,
        create: cli_create_card,
        update: cli_update_card,
        delete: delete_card,
        restore: restore_card,
        actions: &[
            ChildActionDef {
                name: "review",
                description: "Records one review and reschedules the card with FSRS.",
                fields: REVIEW_FIELDS,
                run: cli_review_card,
            },
            ChildActionDef {
                name: "undo-review",
                description: "Reverts the card's latest review.",
                fields: &[],
                run: cli_undo_review,
            },
        ],
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::exams::create_exam;
    use crate::db::spaces::create_space;

    fn deck(conn: &mut Connection) -> Entity {
        crate::db::migrations::MIGRATIONS.to_latest(conn).unwrap();
        let space = create_space(conn, "Study".into(), None, "#000".into()).unwrap();
        let course =
            crate::db::courses::create_course(conn, space.id.clone(), "Algorithms".into()).unwrap();
        let exam = create_exam(
            conn,
            space.id.clone(),
            "Midterm".into(),
            course.id,
            None,
            None,
        )
        .unwrap();
        create_deck(conn, space.id, "Midterm Deck".into(), Some(exam.entity.id)).unwrap()
    }

    #[test]
    fn review_reschedules_and_undo_restores() {
        let mut conn = Connection::open_in_memory().unwrap();
        let deck = deck(&mut conn);
        let card = create_card(&conn, deck.id.clone(), "Q".into(), "A".into()).unwrap();
        assert_eq!(card.state, "new");
        assert_eq!(study_queue(&conn, &deck.id).unwrap().len(), 1);

        let easy = review_card(&conn, &card.id, Rating::Easy).unwrap();
        assert_eq!(easy.state, "review");
        assert!(parse_time(&easy.due_at) > Utc::now() + Duration::days(1));
        assert!(study_queue(&conn, &deck.id).unwrap().is_empty());

        let undone = undo_review(&conn, &card.id).unwrap();
        assert_eq!(undone.state, "new");
        assert_eq!(undone.reps, 0);
        assert!(undo_review(&conn, &card.id).is_err());
    }

    #[test]
    fn again_keeps_card_in_learning_queue() {
        let mut conn = Connection::open_in_memory().unwrap();
        let deck = deck(&mut conn);
        let card = create_card(&conn, deck.id.clone(), "Q".into(), "A".into()).unwrap();
        let again = review_card(&conn, &card.id, Rating::Again).unwrap();
        assert_eq!(again.state, "learning");
        assert_eq!(study_queue(&conn, &deck.id).unwrap()[0].id, card.id);
    }

    #[test]
    fn deleted_cards_leave_the_deck_until_restored() {
        let mut conn = Connection::open_in_memory().unwrap();
        let deck = deck(&mut conn);
        let card = create_card(&conn, deck.id.clone(), "Q".into(), "A".into()).unwrap();
        delete_card(&conn, &card.id).unwrap();
        assert!(list_cards(&conn, &deck.id, false).unwrap().is_empty());
        assert_eq!(list_cards(&conn, &deck.id, true).unwrap().len(), 1);
        restore_card(&conn, &card.id).unwrap();
        assert_eq!(deck_stats(&conn, &deck.id).unwrap().new, 1);
    }
}
