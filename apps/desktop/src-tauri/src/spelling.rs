//! The spell checker. Hunspell dictionaries (`dictionaries/`) are read by the `spellbook`
//! crate, which knows compound words, so German "Straßenbahn" and "Prüfungsvorbereitung" are
//! right. A word is right when it is right in any language that is switched on, which lets a
//! page mix languages without anything being switched by hand. Nothing is checked until the
//! user turns the spell checker on, and a dictionary is read only when its language is.

use spellbook::Dictionary;
use std::collections::{HashMap, HashSet};
use std::sync::Mutex;

/// At most this many suggestions come back for a word.
const MAX_SUGGESTIONS: usize = 6;

/// Every language there is a dictionary for: its code, and the files compiled into the app.
const LANGUAGES: &[(&str, &str, &str)] = &[
    (
        "en",
        include_str!("../dictionaries/en.aff"),
        include_str!("../dictionaries/en.dic"),
    ),
    (
        "en-gb",
        include_str!("../dictionaries/en-gb.aff"),
        include_str!("../dictionaries/en-gb.dic"),
    ),
    (
        "de",
        include_str!("../dictionaries/de.aff"),
        include_str!("../dictionaries/de.dic"),
    ),
    (
        "fr",
        include_str!("../dictionaries/fr.aff"),
        include_str!("../dictionaries/fr.dic"),
    ),
    (
        "es",
        include_str!("../dictionaries/es.aff"),
        include_str!("../dictionaries/es.dic"),
    ),
    (
        "it",
        include_str!("../dictionaries/it.aff"),
        include_str!("../dictionaries/it.dic"),
    ),
];

#[derive(Default)]
pub struct Speller {
    dictionaries: HashMap<&'static str, Dictionary>,
    active: Vec<&'static str>,
    personal: HashSet<String>,
    ignored: HashSet<String>,
}

impl Speller {
    /// Switches on exactly these languages, reading the dictionaries that are not read yet, and
    /// sets the user's own words. Returns the languages that are on: a code with no dictionary
    /// is left out, and so is one whose dictionary cannot be read.
    pub fn configure(&mut self, languages: &[String], personal: &[String]) -> Vec<String> {
        self.active.clear();
        for code in languages {
            let Some((name, aff, dic)) = LANGUAGES.iter().find(|(known, _, _)| known == code)
            else {
                continue;
            };
            if !self.dictionaries.contains_key(name) {
                match Dictionary::new(aff, dic) {
                    Ok(dictionary) => {
                        self.dictionaries.insert(name, dictionary);
                    }
                    Err(_) => continue,
                }
            }
            if !self.active.contains(name) {
                self.active.push(name);
            }
        }
        self.set_personal(personal);
        self.active.iter().map(|code| (*code).to_string()).collect()
    }

    /// Sets the user's own words. Returns whether they are not the ones it had.
    pub fn set_personal(&mut self, personal: &[String]) -> bool {
        let next: HashSet<String> = personal.iter().map(|word| word.to_lowercase()).collect();
        let changed = next != self.personal;
        self.personal = next;
        changed
    }

    /// Accepts a word until the app is closed, without saving it anywhere.
    pub fn ignore(&mut self, word: &str) {
        self.ignored.insert(word.to_lowercase());
    }

    pub fn is_correct(&self, word: &str) -> bool {
        let lower = word.to_lowercase();
        if self.personal.contains(&lower) || self.ignored.contains(&lower) {
            return true;
        }
        // With no language on, nothing is wrong.
        if self.active.is_empty() {
            return true;
        }
        self.active
            .iter()
            .any(|code| self.dictionaries.get(code).is_some_and(|d| d.check(word)))
    }

    /// Suggestions from every language that is on, the first of each before the second of any.
    pub fn suggest(&self, word: &str) -> Vec<String> {
        let lists: Vec<Vec<String>> = self
            .active
            .iter()
            .filter_map(|code| self.dictionaries.get(code))
            .map(|dictionary| {
                let mut found = Vec::new();
                dictionary.suggest(word, &mut found);
                found
            })
            .collect();
        let mut merged: Vec<String> = Vec::new();
        for round in 0..MAX_SUGGESTIONS {
            for list in &lists {
                if let Some(suggestion) = list.get(round) {
                    if !merged.contains(suggestion) && merged.len() < MAX_SUGGESTIONS {
                        merged.push(suggestion.clone());
                    }
                }
            }
        }
        merged
    }
}

/// The checker the app shares, behind a lock: a check is quick, and reading a dictionary
/// happens once per language.
#[derive(Default)]
pub struct SpellState(pub Mutex<Speller>);

#[cfg(test)]
mod tests {
    use super::*;

    fn speller(languages: &[&str]) -> Speller {
        let mut speller = Speller::default();
        let codes: Vec<String> = languages.iter().map(|c| (*c).to_string()).collect();
        speller.configure(&codes, &[]);
        speller
    }

    #[test]
    fn a_word_is_checked_against_the_language_that_is_on() {
        let english = speller(&["en"]);
        assert!(english.is_correct("house"));
        assert!(!english.is_correct("hause"));
        let german = speller(&["de"]);
        assert!(german.is_correct("Haus"));
        assert!(!german.is_correct("Hauss"));
        assert!(!german.is_correct("haus"));
    }

    #[test]
    fn a_word_is_right_when_any_language_that_is_on_has_it() {
        let both = speller(&["en", "de"]);
        assert!(both.is_correct("house"));
        assert!(both.is_correct("Haus"));
        assert!(!both.is_correct("Hauss"));
    }

    #[test]
    fn a_word_of_a_language_that_is_off_is_wrong() {
        let english = speller(&["en"]);
        assert!(!english.is_correct("Haus"));
        assert!(!english.is_correct("Straßenbahn"));
    }

    #[test]
    fn a_page_that_mixes_languages_is_checked_without_switching_anything() {
        let both = speller(&["en", "de"]);
        let page = "This is a house and das ist ein Haus mit einem Garten und Prüfungsvorbereitung";
        let wrong: Vec<&str> = page.split(' ').filter(|w| !both.is_correct(w)).collect();
        assert!(wrong.is_empty(), "{wrong:?}");
    }

    #[test]
    fn german_compounds_umlauts_and_capitals_are_right() {
        let german = speller(&["de"]);
        for word in [
            "Hausaufgabe",
            "Straßenbahn",
            "Rechtschreibprüfung",
            "Informatikvorlesung",
            "Lerngruppe",
            "Wahrscheinlichkeitsrechnung",
            "Übung",
            "schön",
        ] {
            assert!(german.is_correct(word), "{word}");
        }
    }

    #[test]
    fn every_language_has_a_dictionary_that_reads() {
        for (code, _, _) in LANGUAGES {
            let mut speller = Speller::default();
            let on = speller.configure(&[(*code).to_string()], &[]);
            assert_eq!(on, vec![(*code).to_string()], "{code}");
        }
    }

    #[test]
    fn the_users_own_words_and_ignored_words_are_accepted_in_any_case() {
        let mut english = speller(&["en"]);
        assert!(!english.is_correct("Nookly"));
        english.configure(&["en".to_string()], &["nookly".to_string()]);
        assert!(english.is_correct("Nookly"));
        assert!(english.is_correct("NOOKLY"));
        english.configure(&["en".to_string()], &[]);
        assert!(!english.is_correct("Nookly"));
        english.ignore("Nookly");
        assert!(english.is_correct("nookly"));
    }

    #[test]
    fn setting_the_words_says_whether_they_changed() {
        let mut english = speller(&["en"]);
        assert!(english.set_personal(&["Nookly".to_string()]));
        assert!(!english.set_personal(&["nookly".to_string()]));
        assert!(english.set_personal(&[]));
    }

    #[test]
    fn suggestions_come_from_every_language_that_is_on() {
        let both = speller(&["en", "de"]);
        let suggestions = both.suggest("Hauss");
        assert!(suggestions.contains(&"Haus".to_string()), "{suggestions:?}");
        assert!(both.suggest("hause").contains(&"house".to_string()));
        assert!(both.suggest("hause").len() <= MAX_SUGGESTIONS);
        // No repeats.
        let mut unique = suggestions.clone();
        unique.dedup();
        assert_eq!(unique, suggestions);
    }

    #[test]
    fn with_no_language_on_nothing_is_wrong_and_nothing_is_suggested() {
        let off = speller(&[]);
        assert!(off.is_correct("asdfgh"));
        assert!(off.suggest("asdfgh").is_empty());
    }

    #[test]
    fn a_language_without_a_dictionary_is_left_out() {
        let mut speller = Speller::default();
        let on = speller.configure(
            &["tlh".to_string(), "en".to_string(), "en".to_string()],
            &[],
        );
        assert_eq!(on, vec!["en".to_string()]);
    }
}
