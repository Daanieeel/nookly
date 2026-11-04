use super::nth_slot;
use chrono::{Datelike, Months, NaiveDate};
use proptest::prelude::*;

fn anchor() -> impl Strategy<Value = NaiveDate> {
    // 2000-01-01 through 2100-12-31.
    (0i32..36_500).prop_map(|d| {
        NaiveDate::from_ymd_opt(2000, 1, 1)
            .unwrap()
            .checked_add_days(chrono::Days::new(d as u64))
            .unwrap()
    })
}

fn last_day_of_month(date: NaiveDate) -> u32 {
    let first = date.with_day(1).unwrap();
    let next = first.checked_add_months(Months::new(1)).unwrap();
    next.pred_opt().unwrap().day()
}

proptest! {
    /// A monthly series lands on the anchor's day of the month in every month,
    /// or on the month's last day when the month is shorter: it never drifts.
    #[test]
    fn monthly_slots_keep_the_anchor_day(anchor in anchor(), n in 0u32..600) {
        let slot = nth_slot(anchor, n, "monthly").unwrap();
        prop_assert_eq!(slot.day(), anchor.day().min(last_day_of_month(slot)));
    }

    /// Slots never go backwards, whatever the cadence.
    #[test]
    fn slots_move_forward(anchor in anchor(), n in 0u32..600, cadence in 0usize..3) {
        let cadence = ["daily", "weekly", "monthly"][cadence];
        let this = nth_slot(anchor, n, cadence).unwrap();
        let next = nth_slot(anchor, n + 1, cadence).unwrap();
        prop_assert!(next > this);
    }

    /// The first slot is the anchor itself.
    #[test]
    fn the_first_slot_is_the_anchor(anchor in anchor(), cadence in 0usize..3) {
        let cadence = ["daily", "weekly", "monthly"][cadence];
        prop_assert_eq!(nth_slot(anchor, 0, cadence), Some(anchor));
    }

    /// A day and a week step are exactly 1 and 7 days apart.
    #[test]
    fn daily_and_weekly_steps_are_exact(anchor in anchor(), n in 0u32..600) {
        let days = |c| nth_slot(anchor, n, c).unwrap().signed_duration_since(anchor).num_days();
        prop_assert_eq!(days("daily"), i64::from(n));
        prop_assert_eq!(days("weekly"), 7 * i64::from(n));
    }
}
