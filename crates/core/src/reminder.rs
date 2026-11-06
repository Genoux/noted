//! "Remind me …" lines: parsing, and a book that fixes each reminder's time
//! when first seen so relative times ("in 10 minutes") don't drift.

use std::fs;
use std::io;
use std::path::PathBuf;

use chrono::{Datelike, Duration, NaiveDate, NaiveDateTime, NaiveTime, Timelike, Weekday};
use serde::{Deserialize, Serialize};

use crate::store::write_atomic;

/// A parsed reminder: when to fire and what to say.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Reminder {
    pub at: NaiveDateTime,
    pub message: String,
}

/// The current local time, as reminders are written in wall-clock terms.
#[must_use]
pub fn local_now() -> NaiveDateTime {
    chrono::Local::now().naive_local()
}

/// True if the line starts like a reminder, whether or not it has a time yet.
#[must_use]
pub fn is_reminder_line(line: &str) -> bool {
    strip_trigger(line).is_some()
}

/// Parses a reminder line relative to `now` (local time).
#[must_use]
pub fn parse(line: &str, now: NaiveDateTime) -> Option<Reminder> {
    let rest = strip_trigger(line)?;
    let words: Vec<&str> = rest.split_whitespace().collect();
    let mut used = vec![false; words.len()];
    let lower: Vec<String> = words
        .iter()
        .map(|w| {
            w.trim_matches(|c: char| matches!(c, ',' | '.' | '!' | ':' | ';'))
                .to_lowercase()
        })
        .collect();

    let mut relative: Option<Duration> = None;
    let mut day: Option<Day> = None;
    let mut clock: Option<NaiveTime> = None;

    let mut i = 0;
    while i < words.len() {
        let w = lower[i].as_str();
        let next = lower.get(i + 1).map(String::as_str);
        if w == "in"
            && let Some((dur, n)) = parse_duration(&lower[i + 1..])
        {
            relative = Some(dur);
            used[i..=i + n].fill(true);
            i += n + 1;
            continue;
        }
        if let Some(d) = parse_day(w) {
            day = Some(d);
            used[i] = true;
            if i > 0 && matches!(lower[i - 1].as_str(), "on" | "next" | "this") {
                used[i - 1] = true;
            }
        } else if w == "at" {
            if let Some(t) = next.and_then(parse_clock) {
                clock = Some(t);
                used[i] = true;
                used[i + 1] = true;
                i += 2;
                continue;
            }
        } else if let Some(t) = parse_clock_strict(w) {
            clock = Some(t);
            used[i] = true;
        }
        i += 1;
    }

    let at = if let Some(dur) = relative {
        now + dur
    } else if day.is_some() || clock.is_some() {
        resolve(now, day, clock)
    } else {
        return None;
    };

    let message = words
        .iter()
        .zip(&used)
        .filter(|(_, u)| !**u)
        .map(|(w, _)| *w)
        .collect::<Vec<_>>()
        .join(" ");
    let message = strip_lead_words(&message);
    let message = if message.is_empty() {
        "Reminder".to_owned()
    } else {
        message
    };

    Some(Reminder {
        at: at.with_nanosecond(0).unwrap_or(at),
        message,
    })
}

/// Strips list markers and the "remind me" / "reminder" trigger.
fn strip_trigger(line: &str) -> Option<&str> {
    let mut s = line.trim_start();
    for marker in ["- [ ] ", "- [x] ", "- [X] ", "- ", "* ", "+ "] {
        if let Some(rest) = s.strip_prefix(marker) {
            s = rest.trim_start();
            break;
        }
    }
    for trigger in ["remind me", "reminder"] {
        if s.len() >= trigger.len() && s[..trigger.len()].eq_ignore_ascii_case(trigger) {
            let rest = &s[trigger.len()..];
            if rest.is_empty() || rest.starts_with([' ', ':', ',']) {
                return Some(rest.trim_start_matches([':', ',']).trim());
            }
        }
    }
    None
}

fn strip_lead_words(message: &str) -> String {
    let mut m = message.trim();
    loop {
        let lower = m.to_lowercase();
        let Some(next) = ["to ", "that ", "about "]
            .iter()
            .find(|p| lower.starts_with(*p))
            .map(|p| m[p.len()..].trim_start())
        else {
            break;
        };
        m = next;
    }
    m.trim_end_matches([' ', ',', '.']).to_owned()
}

#[derive(Debug, Clone, Copy)]
enum Day {
    Today,
    Tonight,
    Tomorrow,
    Weekday(Weekday),
}

fn parse_day(w: &str) -> Option<Day> {
    Some(match w {
        "today" => Day::Today,
        "tonight" => Day::Tonight,
        "tomorrow" | "tmr" => Day::Tomorrow,
        "monday" | "mon" => Day::Weekday(Weekday::Mon),
        "tuesday" | "tue" | "tues" => Day::Weekday(Weekday::Tue),
        "wednesday" | "wed" => Day::Weekday(Weekday::Wed),
        "thursday" | "thu" | "thurs" => Day::Weekday(Weekday::Thu),
        "friday" | "fri" => Day::Weekday(Weekday::Fri),
        "saturday" | "sat" => Day::Weekday(Weekday::Sat),
        "sunday" | "sun" => Day::Weekday(Weekday::Sun),
        _ => return None,
    })
}

/// "10 minutes", "an hour", "10min", "2h". Returns the duration and words used.
fn parse_duration(words: &[String]) -> Option<(Duration, usize)> {
    let first = words.first()?;
    let (amount, unit, used) = match first.as_str() {
        "a" | "an" => (1, words.get(1)?.as_str(), 2),
        w => {
            let digits = w.chars().take_while(char::is_ascii_digit).count();
            if digits == 0 {
                return None;
            }
            let amount: i64 = w[..digits].parse().ok()?;
            if digits == w.len() {
                (amount, words.get(1)?.as_str(), 2)
            } else {
                (amount, &w[digits..], 1)
            }
        }
    };
    let dur = match unit {
        "s" | "sec" | "secs" | "second" | "seconds" => Duration::seconds(amount),
        "m" | "min" | "mins" | "minute" | "minutes" => Duration::minutes(amount),
        "h" | "hr" | "hrs" | "hour" | "hours" => Duration::hours(amount),
        "d" | "day" | "days" => Duration::days(amount),
        "w" | "week" | "weeks" => Duration::weeks(amount),
        _ => return None,
    };
    Some((dur, used))
}

/// "3pm", "3:30pm", "15:30", "9" (after "at").
fn parse_clock(w: &str) -> Option<NaiveTime> {
    parse_clock_strict(w).or_else(|| {
        let h: u32 = w.parse().ok()?;
        NaiveTime::from_hms_opt(h, 0, 0)
    })
}

/// Only unambiguous clock times: "3pm", "3:30pm", "15:30". Not bare numbers.
fn parse_clock_strict(w: &str) -> Option<NaiveTime> {
    let (body, meridiem) = if let Some(b) = w.strip_suffix("am") {
        (b, Some(false))
    } else if let Some(b) = w.strip_suffix("pm") {
        (b, Some(true))
    } else {
        (w, None)
    };
    let (h, m) = match body.split_once(':') {
        Some((h, m)) => (h.parse::<u32>().ok()?, m.parse::<u32>().ok()?),
        None if meridiem.is_some() => (body.parse::<u32>().ok()?, 0),
        None => return None,
    };
    let h = match meridiem {
        Some(pm) if (1..=12).contains(&h) => (h % 12) + if pm { 12 } else { 0 },
        Some(_) => return None,
        None => h,
    };
    NaiveTime::from_hms_opt(h, m, 0)
}

fn resolve(now: NaiveDateTime, day: Option<Day>, clock: Option<NaiveTime>) -> NaiveDateTime {
    let today = now.date();
    let default_time = |d: Day| match d {
        Day::Tonight => NaiveTime::from_hms_opt(20, 0, 0),
        _ => NaiveTime::from_hms_opt(9, 0, 0),
    };
    let date: NaiveDate = match day {
        None | Some(Day::Today | Day::Tonight) => today,
        Some(Day::Tomorrow) => today + Duration::days(1),
        Some(Day::Weekday(wd)) => {
            let ahead = (i64::from(wd.num_days_from_monday())
                - i64::from(today.weekday().num_days_from_monday()))
            .rem_euclid(7);
            today + Duration::days(ahead)
        }
    };
    let time = clock
        .or_else(|| day.and_then(default_time))
        .unwrap_or(now.time());
    let mut at = date.and_time(time);
    if at <= now {
        // A time that already passed means the next one.
        at += match day {
            Some(Day::Weekday(_)) => Duration::weeks(1),
            _ => Duration::days(1),
        };
    }
    at
}

/// One scheduled reminder, as stored and as shown to the UI.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Entry {
    pub tab: String,
    /// The reminder line's text; identifies the reminder within its tab.
    pub line: String,
    pub at: NaiveDateTime,
    pub message: String,
    pub sent: bool,
}

/// All reminders, persisted so times stay fixed and nothing fires twice.
#[derive(Debug, Default)]
pub struct ReminderBook {
    path: Option<PathBuf>,
    entries: Vec<Entry>,
}

impl ReminderBook {
    /// Loads the book from `path`; a missing or corrupt file starts empty.
    #[must_use]
    pub fn load(path: impl Into<PathBuf>) -> Self {
        let path = path.into();
        let entries = fs::read(&path)
            .ok()
            .and_then(|b| serde_json::from_slice(&b).ok())
            .unwrap_or_default();
        Self {
            path: Some(path),
            entries,
        }
    }

    fn persist(&self) -> io::Result<()> {
        let Some(path) = &self.path else {
            return Ok(());
        };
        let json = serde_json::to_vec_pretty(&self.entries).map_err(io::Error::from)?;
        write_atomic(path, &json)
    }

    /// Re-reads a tab's text: schedules new reminder lines, drops removed ones.
    pub fn sync(&mut self, tab: &str, text: &str, now: NaiveDateTime) -> io::Result<()> {
        let lines: Vec<&str> = text
            .lines()
            .map(str::trim)
            .filter(|l| is_reminder_line(l))
            .collect();
        let before = self.entries.len();
        self.entries
            .retain(|e| e.tab != tab || lines.contains(&e.line.as_str()));
        let mut changed = before != self.entries.len();
        for line in lines {
            let known = self.entries.iter().any(|e| e.tab == tab && e.line == line);
            if known {
                continue;
            }
            if let Some(r) = parse(line, now) {
                self.entries.push(Entry {
                    tab: tab.to_owned(),
                    line: line.to_owned(),
                    at: r.at,
                    message: r.message,
                    sent: false,
                });
                changed = true;
            }
        }
        if changed { self.persist() } else { Ok(()) }
    }

    /// Forgets every reminder in a closed tab.
    pub fn forget(&mut self, tab: &str) -> io::Result<()> {
        let before = self.entries.len();
        self.entries.retain(|e| e.tab != tab);
        if before == self.entries.len() {
            Ok(())
        } else {
            self.persist()
        }
    }

    /// Marks due reminders as sent and returns them, so each fires once.
    pub fn take_due(&mut self, now: NaiveDateTime) -> io::Result<Vec<Entry>> {
        let mut due = Vec::new();
        for e in &mut self.entries {
            if !e.sent && e.at <= now {
                e.sent = true;
                due.push(e.clone());
            }
        }
        if !due.is_empty() {
            self.persist()?;
        }
        Ok(due)
    }

    /// Reminders in one tab, for the inline status.
    #[must_use]
    pub fn for_tab(&self, tab: &str) -> Vec<Entry> {
        self.entries
            .iter()
            .filter(|e| e.tab == tab)
            .cloned()
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Friday 2026-11-06 13:00:00.
    fn now() -> NaiveDateTime {
        NaiveDate::from_ymd_opt(2026, 11, 6)
            .unwrap()
            .and_hms_opt(13, 0, 0)
            .unwrap()
    }

    fn at(d: u32, h: u32, m: u32, s: u32) -> NaiveDateTime {
        NaiveDate::from_ymd_opt(2026, 11, d)
            .unwrap()
            .and_hms_opt(h, m, s)
            .unwrap()
    }

    fn check(line: &str, when: NaiveDateTime, message: &str) {
        let r = parse(line, now()).unwrap_or_else(|| panic!("no reminder in {line:?}"));
        assert_eq!((r.at, r.message.as_str()), (when, message), "{line}");
    }

    #[test]
    fn relative_times() {
        check(
            "Remind me in 10 minutes to check this",
            at(6, 13, 10, 0),
            "check this",
        );
        check(
            "remind me to write Y in 10 sec",
            at(6, 13, 0, 10),
            "write Y",
        );
        check("remind me in an hour: stretch", at(6, 14, 0, 0), "stretch");
        check("- [ ] remind me in 2h to ship", at(6, 15, 0, 0), "ship");
    }

    #[test]
    fn clock_times() {
        check("reminder 10pm to call Lena", at(6, 22, 0, 0), "call Lena");
        check(
            "Remind me at 3:30pm to stand up",
            at(6, 15, 30, 0),
            "stand up",
        );
        check("remind me at 9 to email", at(7, 9, 0, 0), "email");
        check("remind me at 15:00 about rent", at(6, 15, 0, 0), "rent");
        check(
            "remind me at 9am to water plants",
            at(7, 9, 0, 0),
            "water plants",
        );
    }

    #[test]
    fn day_words() {
        check(
            "Remind me Friday at 3pm to send invoice",
            at(6, 15, 0, 0),
            "send invoice",
        );
        check("remind me tomorrow to buy milk", at(7, 9, 0, 0), "buy milk");
        check("remind me tonight to call mom", at(6, 20, 0, 0), "call mom");
        check(
            "remind me on monday at 10am to plan",
            at(9, 10, 0, 0),
            "plan",
        );
        check(
            "remind me friday at 9am to review",
            at(13, 9, 0, 0),
            "review",
        );
    }

    #[test]
    fn not_reminders() {
        assert!(parse("remind me to do it", now()).is_none(), "no time yet");
        assert!(
            parse("please remind me in 5 min", now()).is_none(),
            "must start the line"
        );
        assert!(parse("reminders are great at 3pm", now()).is_none());
        assert!(is_reminder_line("Remind me to do it"));
        assert!(!is_reminder_line("reminders list"));
    }

    #[test]
    fn book_fixes_times_and_fires_once() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("reminders.json");
        let mut book = ReminderBook::load(&path);
        let text = "notes\nremind me in 10 min to stretch\n";

        book.sync("tab", text, now()).unwrap();
        // Re-reading later must not move the time.
        book.sync("tab", text, now() + Duration::minutes(5))
            .unwrap();
        assert_eq!(book.for_tab("tab")[0].at, at(6, 13, 10, 0));

        assert!(book.take_due(at(6, 13, 9, 0)).unwrap().is_empty());
        let due = book.take_due(at(6, 13, 10, 0)).unwrap();
        assert_eq!(due.len(), 1);
        assert_eq!(due[0].message, "stretch");
        assert!(
            book.take_due(at(6, 14, 0, 0)).unwrap().is_empty(),
            "fires once"
        );

        // Survives a restart.
        let reloaded = ReminderBook::load(&path);
        assert!(reloaded.for_tab("tab")[0].sent);
    }

    #[test]
    fn book_drops_deleted_lines_and_closed_tabs() {
        let mut book = ReminderBook::default();
        book.sync("a", "remind me in 1 min to x", now()).unwrap();
        book.sync("b", "remind me in 1 min to y", now()).unwrap();
        book.sync("a", "line removed", now()).unwrap();
        assert!(book.for_tab("a").is_empty());
        book.forget("b").unwrap();
        assert!(book.for_tab("b").is_empty());
    }
}
