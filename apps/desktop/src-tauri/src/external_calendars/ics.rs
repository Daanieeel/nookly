//! Turns iCalendar resources fetched over CalDAV into concrete occurrences
//! within the sync window, expanding recurrence and applying per occurrence
//! overrides (`RECURRENCE-ID`) and exclusions (`EXDATE`).

use chrono::{DateTime, Duration, NaiveDate, NaiveDateTime, TimeZone, Utc};
use icalendar::{
    CalendarDateTime, Component, DatePerhapsTime, Event, EventLike, EventStatus, RRuleSet,
};
use std::collections::HashSet;

/// How many occurrences one recurring event may produce in the window.
const MAX_OCCURRENCES: u16 = 1000;

#[derive(Debug, PartialEq)]
pub struct Occurrence {
    /// Stable per occurrence: the event's UID plus its start.
    pub key: String,
    pub title: String,
    pub location: Option<String>,
    pub all_day: bool,
    /// UTC RFC 3339 for timed occurrences, `YYYY-MM-DD` for all day ones.
    pub start: String,
    /// Exclusive, in the same form as `start`.
    pub end: String,
}

/// A moment an occurrence starts at, comparable between a recurring event's
/// expansion and an override's `RECURRENCE-ID`.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
enum Start {
    Date(NaiveDate),
    Instant(DateTime<Utc>),
}

impl Start {
    fn of(value: &DatePerhapsTime) -> Option<Start> {
        match value {
            DatePerhapsTime::Date(date) => Some(Start::Date(*date)),
            DatePerhapsTime::DateTime(dt) => to_utc(dt).map(Start::Instant),
        }
    }

    fn format(&self) -> String {
        match self {
            Start::Date(date) => date.format("%Y-%m-%d").to_string(),
            Start::Instant(dt) => dt.to_rfc3339_opts(chrono::SecondsFormat::Secs, true),
        }
    }

    fn plus(&self, length: Length) -> String {
        match (self, length) {
            (Start::Date(date), Length::Days(days)) => (*date + Duration::days(days))
                .format("%Y-%m-%d")
                .to_string(),
            (Start::Instant(dt), Length::Exact(d)) => {
                (*dt + d).to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
            }
            // Mixed DATE / DATE-TIME events are malformed; keep them zero length.
            _ => self.format(),
        }
    }

    /// Whether the occurrence overlaps `from..to`.
    fn overlaps(&self, length: Length, from: DateTime<Utc>, to: DateTime<Utc>) -> bool {
        let (start, end) = match (self, length) {
            (Start::Date(date), Length::Days(days)) => (
                utc_midnight(*date),
                utc_midnight(*date + Duration::days(days)),
            ),
            (Start::Instant(dt), Length::Exact(d)) => (*dt, *dt + d),
            (Start::Date(date), _) => (utc_midnight(*date), utc_midnight(*date)),
            (Start::Instant(dt), _) => (*dt, *dt),
        };
        start < to && end >= from
    }
}

#[derive(Debug, Clone, Copy)]
enum Length {
    Days(i64),
    Exact(Duration),
}

pub fn expand(ics: &str, from: DateTime<Utc>, to: DateTime<Utc>) -> Vec<Occurrence> {
    let Ok(calendar) = ics.parse::<icalendar::Calendar>() else {
        return Vec::new();
    };
    let events: Vec<&Event> = calendar
        .events()
        .filter(|e| e.get_status() != Some(EventStatus::Cancelled))
        .collect();

    // Occurrences replaced by an override of their own, keyed by UID and start.
    let overridden: HashSet<(String, Start)> = calendar
        .events()
        .filter_map(|e| {
            let uid = e.get_uid()?.to_string();
            Some((uid, Start::of(&e.get_recurrence_id()?)?))
        })
        .collect();

    let mut occurrences = Vec::new();
    for event in events {
        let Some(start_value) = event.get_start() else {
            continue;
        };
        let Some(start) = Start::of(&start_value) else {
            continue;
        };
        let length = length_of(event, &start_value);
        let uid = event.get_uid().unwrap_or_default().to_string();
        let recurring = event.get_recurrence_id().is_none()
            && (event.property_value("RRULE").is_some() || event.property_value("RDATE").is_some());

        let starts = if recurring {
            expand_starts(event, &start, length, from, to).unwrap_or_else(|| vec![start])
        } else {
            vec![start]
        };
        for start in starts {
            if recurring && overridden.contains(&(uid.clone(), start.clone())) {
                continue;
            }
            if !start.overlaps(length, from, to) {
                continue;
            }
            occurrences.push(Occurrence {
                key: format!("{uid}:{}", start.format()),
                title: event.get_summary().unwrap_or_default().to_string(),
                location: event
                    .get_location()
                    .map(str::to_string)
                    .filter(|l| !l.is_empty()),
                all_day: matches!(start, Start::Date(_)),
                end: start.plus(length),
                start: start.format(),
            });
        }
    }
    occurrences
}

/// Every start of a recurring event that could overlap the window. `None` when
/// the rule can't be evaluated, so the caller falls back to the first one.
fn expand_starts(
    event: &Event,
    start: &Start,
    length: Length,
    from: DateTime<Utc>,
    to: DateTime<Utc>,
) -> Option<Vec<Start>> {
    let set = match start {
        // All day rules are expanded on UTC midnights, so each occurrence maps
        // straight back to its calendar date.
        Start::Date(date) => all_day_rule_set(event, *date)?,
        Start::Instant(_) => event.get_recurrence().ok()?,
    };
    let lead = match length {
        Length::Days(days) => Duration::days(days),
        Length::Exact(d) => d,
    };
    let after = (from - lead - Duration::days(1)).with_timezone(&icalendar::Tz::UTC);
    let before = to.with_timezone(&icalendar::Tz::UTC);
    let dates = set.after(after).before(before).all(MAX_OCCURRENCES).dates;
    Some(
        dates
            .into_iter()
            .map(|dt| match start {
                Start::Date(_) => Start::Date(dt.with_timezone(&Utc).date_naive()),
                Start::Instant(_) => Start::Instant(dt.with_timezone(&Utc)),
            })
            .collect(),
    )
}

fn all_day_rule_set(event: &Event, date: NaiveDate) -> Option<RRuleSet> {
    let as_utc_midnights = |value: &str| {
        value
            .split(',')
            .map(|v| {
                let v = v.trim();
                if v.len() == 8 {
                    format!("{v}T000000Z")
                } else {
                    v.to_string()
                }
            })
            .collect::<Vec<_>>()
            .join(",")
    };
    let mut rule = format!("DTSTART:{}T000000Z\n", date.format("%Y%m%d"));
    if let Some(rrule) = event.property_value("RRULE") {
        rule.push_str(&format!("RRULE:{rrule}\n"));
    } else {
        rule.push_str(&format!("RDATE:{}T000000Z\n", date.format("%Y%m%d")));
    }
    for (key, props) in event.multi_properties() {
        if key == "EXDATE" || key == "RDATE" {
            for prop in props {
                rule.push_str(&format!("{key}:{}\n", as_utc_midnights(prop.value())));
            }
        }
    }
    for key in ["EXDATE", "RDATE"] {
        if let Some(value) = event.property_value(key) {
            rule.push_str(&format!("{key}:{}\n", as_utc_midnights(value)));
        }
    }
    rule.trim_end().parse().ok()
}

fn length_of(event: &Event, start: &DatePerhapsTime) -> Length {
    let end = event.get_end();
    match start {
        DatePerhapsTime::Date(start_date) => {
            let days = match end {
                Some(end) => (end.date_naive() - *start_date).num_days(),
                None => event
                    .property_value("DURATION")
                    .and_then(parse_duration)
                    .map_or(1, |d| d.num_days()),
            };
            Length::Days(days.max(1))
        }
        DatePerhapsTime::DateTime(start_dt) => {
            let from_end = end
                .as_ref()
                .and_then(|end| match end {
                    DatePerhapsTime::DateTime(dt) => to_utc(dt),
                    DatePerhapsTime::Date(date) => Some(utc_midnight(*date)),
                })
                .zip(to_utc(start_dt))
                .map(|(end, start)| end - start);
            let length = from_end
                .or_else(|| event.property_value("DURATION").and_then(parse_duration))
                .unwrap_or_else(Duration::zero);
            Length::Exact(length.max(Duration::zero()))
        }
    }
}

fn utc_midnight(date: NaiveDate) -> DateTime<Utc> {
    Utc.from_utc_datetime(&date.and_hms_opt(0, 0, 0).unwrap_or_default())
}

/// Unknown zones and floating times are read in the machine's own zone.
fn to_utc(value: &CalendarDateTime) -> Option<DateTime<Utc>> {
    let local = |naive: &NaiveDateTime| {
        chrono::Local
            .from_local_datetime(naive)
            .earliest()
            .map(|dt| dt.with_timezone(&Utc))
    };
    match value {
        CalendarDateTime::Utc(dt) => Some(*dt),
        CalendarDateTime::WithTimezone { date_time, tzid } => match tzid.parse::<chrono_tz::Tz>() {
            Ok(tz) => tz
                .from_local_datetime(date_time)
                .earliest()
                .map(|dt| dt.with_timezone(&Utc)),
            Err(_) => local(date_time),
        },
        CalendarDateTime::Floating(naive) => local(naive),
    }
}

/// An RFC 5545 duration like `PT1H30M` or `P1D`.
fn parse_duration(value: &str) -> Option<Duration> {
    let (negative, rest) = match value.strip_prefix('-') {
        Some(rest) => (true, rest),
        None => (false, value.strip_prefix('+').unwrap_or(value)),
    };
    let rest = rest.strip_prefix('P')?;
    let mut total = Duration::zero();
    let mut number = String::new();
    let mut in_time = false;
    for c in rest.chars() {
        match c {
            'T' => in_time = true,
            '0'..='9' => number.push(c),
            unit => {
                let n: i64 = number.parse().ok()?;
                number.clear();
                total += match (unit, in_time) {
                    ('W', false) => Duration::weeks(n),
                    ('D', false) => Duration::days(n),
                    ('H', true) => Duration::hours(n),
                    ('M', true) => Duration::minutes(n),
                    ('S', true) => Duration::seconds(n),
                    _ => return None,
                };
            }
        }
    }
    Some(if negative { -total } else { total })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn window() -> (DateTime<Utc>, DateTime<Utc>) {
        (
            Utc.with_ymd_and_hms(2026, 9, 1, 0, 0, 0).unwrap(),
            Utc.with_ymd_and_hms(2026, 10, 1, 0, 0, 0).unwrap(),
        )
    }

    fn calendar(body: &str) -> String {
        format!("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:test\r\n{body}END:VCALENDAR\r\n")
    }

    #[test]
    fn single_timed_event_in_zone() {
        let ics = calendar(
            "BEGIN:VEVENT\r\nUID:a\r\nSUMMARY:Dentist\r\nLOCATION:Main St\r\n\
             DTSTART;TZID=Europe/Berlin:20260915T100000\r\n\
             DTEND;TZID=Europe/Berlin:20260915T110000\r\nEND:VEVENT\r\n",
        );
        let (from, to) = window();
        let occurrences = expand(&ics, from, to);
        assert_eq!(
            occurrences,
            vec![Occurrence {
                key: "a:2026-09-15T08:00:00Z".into(),
                title: "Dentist".into(),
                location: Some("Main St".into()),
                all_day: false,
                start: "2026-09-15T08:00:00Z".into(),
                end: "2026-09-15T09:00:00Z".into(),
            }]
        );
    }

    #[test]
    fn weekly_rule_with_exdate_and_override() {
        let ics = calendar(
            "BEGIN:VEVENT\r\nUID:w\r\nSUMMARY:Gym\r\n\
             DTSTART:20260901T170000Z\r\nDURATION:PT1H\r\n\
             RRULE:FREQ=WEEKLY;COUNT=4\r\nEXDATE:20260908T170000Z\r\nEND:VEVENT\r\n\
             BEGIN:VEVENT\r\nUID:w\r\nSUMMARY:Gym moved\r\n\
             RECURRENCE-ID:20260915T170000Z\r\n\
             DTSTART:20260915T190000Z\r\nDTEND:20260915T200000Z\r\nEND:VEVENT\r\n",
        );
        let (from, to) = window();
        let mut starts: Vec<(String, String)> = expand(&ics, from, to)
            .into_iter()
            .map(|o| (o.start, o.title))
            .collect();
        starts.sort();
        assert_eq!(
            starts,
            vec![
                ("2026-09-01T17:00:00Z".into(), "Gym".into()),
                ("2026-09-15T19:00:00Z".into(), "Gym moved".into()),
                ("2026-09-22T17:00:00Z".into(), "Gym".into()),
            ]
        );
    }

    #[test]
    fn yearly_all_day_event() {
        let ics = calendar(
            "BEGIN:VEVENT\r\nUID:b\r\nSUMMARY:Birthday\r\n\
             DTSTART;VALUE=DATE:20200910\r\nDTEND;VALUE=DATE:20200911\r\n\
             RRULE:FREQ=YEARLY\r\nEND:VEVENT\r\n",
        );
        let (from, to) = window();
        let occurrences = expand(&ics, from, to);
        assert_eq!(occurrences.len(), 1);
        assert!(occurrences[0].all_day);
        assert_eq!(occurrences[0].start, "2026-09-10");
        assert_eq!(occurrences[0].end, "2026-09-11");
    }

    #[test]
    fn durations() {
        assert_eq!(parse_duration("PT1H30M"), Some(Duration::minutes(90)));
        assert_eq!(parse_duration("P1W"), Some(Duration::weeks(1)));
        assert_eq!(parse_duration("P1DT2H"), Some(Duration::hours(26)));
        assert_eq!(parse_duration("nope"), None);
    }
}
