//! Signing in through the browser, the way the Moodle mobile app does, so
//! single sign on and two step login work. Nookly opens
//! `admin/tool/mobile/launch.php`; after the person signs in, Moodle redirects
//! to `nookly://token=<base64>` carrying `<signature>:::<token>`.
//!
//! Any web page can open a `nookly://` link, so a token is only accepted with
//! the signature of a login Nookly started itself: `md5(site address + passport)`
//! with a passport that was never sent anywhere but to that site.

use super::site::Site;
use base64::engine::general_purpose::STANDARD_NO_PAD;
use base64::Engine;
use url::Url;

pub const DEFAULT_SCHEME: &str = "nookly";

/// The scheme this build is registered for. A build installed next to the real
/// app (a different bundle identifier) gives itself another one, so Moodle's
/// redirect reaches the right app.
pub fn configured_scheme(plugins: &std::collections::HashMap<String, serde_json::Value>) -> String {
    plugins
        .get("deep-link")
        .and_then(|config| config["desktop"]["schemes"][0].as_str())
        .filter(|scheme| {
            !scheme.is_empty()
                && scheme
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || matches!(c, '+' | '-' | '.'))
        })
        .unwrap_or(DEFAULT_SCHEME)
        .to_string()
}

pub fn launch_url(site: &Site, passport: &str, scheme: &str) -> Url {
    let mut url = site.page("admin/tool/mobile/launch.php");
    url.query_pairs_mut()
        .append_pair("service", "moodle_mobile_app")
        .append_pair("passport", passport)
        .append_pair("urlscheme", scheme);
    url
}

#[derive(Debug, PartialEq, Eq)]
pub struct Callback {
    pub signature: String,
    pub token: String,
}

/// Reads what Moodle sent back: the whole `nookly://token=...` link, or just
/// the part after `token=`, which is what a person pastes when the link could
/// not open Nookly by itself.
pub fn parse_callback(input: &str) -> Result<Callback, String> {
    const BAD: &str = "That is not a Moodle sign in link. Start the sign in again.";
    let trimmed = input.trim();
    let encoded = trimmed
        .split_once("token=")
        .map_or(trimmed, |(_, rest)| rest)
        .trim()
        .replace("%3D", "=")
        .replace("%2F", "/")
        .replace("%2B", "+");
    let decoded = STANDARD_NO_PAD
        .decode(encoded.trim_end_matches('='))
        .ok()
        .and_then(|bytes| String::from_utf8(bytes).ok())
        .ok_or(BAD)?;
    let mut parts = decoded.split(":::");
    let (Some(signature), Some(token)) = (parts.next(), parts.next()) else {
        return Err(BAD.into());
    };
    let plausible =
        |t: &str| !t.is_empty() && t.len() <= 256 && t.chars().all(|c| c.is_ascii_alphanumeric());
    if !plausible(signature) || !plausible(token) {
        return Err(BAD.into());
    }
    Ok(Callback {
        signature: signature.to_string(),
        token: token.to_string(),
    })
}

fn md5_hex(text: &str) -> String {
    format!("{:x}", md5::compute(text.as_bytes()))
}

/// Whether `signature` proves the login started here. The site may call
/// itself something else than what was typed (`www.`), so every address
/// that is known for it is tried.
pub fn signature_matches(signature: &str, addresses: &[&str], passport: &str) -> bool {
    addresses.iter().any(|address| {
        let address = address.trim_end_matches('/');
        md5_hex(&format!("{address}{passport}")).eq_ignore_ascii_case(signature)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn link(payload: &str) -> String {
        format!(
            "nookly://token={}",
            base64::engine::general_purpose::STANDARD.encode(payload)
        )
    }

    #[test]
    fn launch_url_asks_for_the_mobile_service_and_our_scheme() {
        let site = Site::parse("https://uni.edu/moodle").unwrap();
        let url = launch_url(&site, "pp1", "nookly");
        assert_eq!(url.path(), "/moodle/admin/tool/mobile/launch.php");
        let query: Vec<_> = url.query_pairs().into_owned().collect();
        assert!(query.contains(&("service".into(), "moodle_mobile_app".into())));
        assert!(query.contains(&("passport".into(), "pp1".into())));
        assert!(query.contains(&("urlscheme".into(), "nookly".into())));
    }

    #[test]
    fn a_build_with_its_own_scheme_asks_moodle_to_come_back_to_it() {
        let site = Site::parse("https://uni.edu").unwrap();
        let url = launch_url(&site, "pp1", "nookly-dev");
        assert!(url
            .query_pairs()
            .any(|(k, v)| k == "urlscheme" && v == "nookly-dev"));
    }

    #[test]
    fn the_scheme_comes_from_the_deep_link_setting() {
        let plugins = |value: serde_json::Value| {
            std::collections::HashMap::from([("deep-link".to_string(), value)])
        };
        let set = plugins(serde_json::json!({ "desktop": { "schemes": ["nookly-dev", "other"] } }));
        assert_eq!(configured_scheme(&set), "nookly-dev");
        for unset in [
            std::collections::HashMap::new(),
            plugins(serde_json::json!({})),
            plugins(serde_json::json!({ "desktop": { "schemes": [] } })),
            // Not a scheme: never sent to Moodle.
            plugins(serde_json::json!({ "desktop": { "schemes": ["a b://"] } })),
        ] {
            assert_eq!(configured_scheme(&unset), "nookly");
        }
    }

    #[test]
    fn reads_the_signature_and_token_from_the_link() {
        let got = parse_callback(&link("abc123:::tok456")).unwrap();
        assert_eq!(
            got,
            Callback {
                signature: "abc123".into(),
                token: "tok456".into()
            }
        );
    }

    #[test]
    fn ignores_the_private_token() {
        let got = parse_callback(&link("sig:::tok:::private")).unwrap();
        assert_eq!(got.token, "tok");
    }

    #[test]
    fn reads_a_pasted_token_with_or_without_the_link_and_padding() {
        let b64 = base64::engine::general_purpose::STANDARD.encode("sig9:::tok9");
        for input in [
            b64.clone(),
            format!("token={b64}"),
            format!("  {}  ", link("sig9:::tok9")),
            b64.trim_end_matches('=').to_string(),
            b64.replace('=', "%3D"),
        ] {
            assert_eq!(parse_callback(&input).unwrap().token, "tok9", "{input}");
        }
    }

    #[test]
    fn refuses_anything_else() {
        for bad in [
            "",
            "nookly://token=",
            "nookly://open/abc",
            "nookly://token=%%%",
            &link("onlyonepart"),
            &link(":::tok"),
            &link("sig:::"),
            &link("sig:::to k"),
        ] {
            assert!(parse_callback(bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn the_signature_is_md5_of_site_and_passport() {
        // md5("https://uni.eduPASS") computed independently.
        let expected = md5_hex("https://uni.eduPASS");
        assert!(signature_matches(&expected, &["https://uni.edu"], "PASS"));
        assert!(signature_matches(
            &expected.to_uppercase(),
            &["https://uni.edu/"],
            "PASS"
        ));
        assert!(signature_matches(
            &expected,
            &["https://www.uni.edu", "https://uni.edu"],
            "PASS"
        ));
        assert!(!signature_matches(&expected, &["https://uni.edu"], "OTHER"));
        assert!(!signature_matches(
            &expected,
            &["https://evil.example"],
            "PASS"
        ));
        assert!(!signature_matches("", &["https://uni.edu"], "PASS"));
    }
}
