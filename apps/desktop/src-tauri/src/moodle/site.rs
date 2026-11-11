//! The address of a Moodle site and the pages on it.

use url::Url;

/// A Moodle site root, always `https` and ending in `/`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Site(Url);

/// Path segments after which the rest of a pasted address is Moodle's own
/// page, not part of where the site is installed (`/moodle/course/view.php`).
const PAGES: [&str; 12] = [
    "login",
    "my",
    "course",
    "mod",
    "calendar",
    "user",
    "admin",
    "grade",
    "message",
    "lib",
    "webservice",
    "enrol",
];

impl Site {
    /// Reads what a person types or pastes: `moodle.uni.edu`, or any page on
    /// the site. A site that is not `https` is refused, because the login
    /// token would travel in the clear.
    pub fn parse(input: &str) -> Result<Site, String> {
        let trimmed = input.trim();
        if trimmed.is_empty() {
            return Err("Enter the address of your Moodle site.".into());
        }
        let with_scheme = if trimmed.contains("://") {
            trimmed.to_string()
        } else {
            format!("https://{trimmed}")
        };
        let mut url = Url::parse(&with_scheme)
            .map_err(|_| "That doesn't look like a web address.".to_string())?;
        if url.scheme() != "https" || url.host_str().is_none() {
            return Err("Moodle sites must use https.".into());
        }
        let kept: Vec<String> = url
            .path_segments()
            .map(|segments| {
                segments
                    .take_while(|s| !s.is_empty() && !s.contains(".php") && !PAGES.contains(s))
                    .map(str::to_string)
                    .collect()
            })
            .unwrap_or_default();
        url.set_path(&format!("/{}", kept.join("/")));
        url.set_query(None);
        url.set_fragment(None);
        let _ = url.set_username("");
        let _ = url.set_password(None);
        if !url.path().ends_with('/') {
            url.set_path(&format!("{}/", url.path()));
        }
        Ok(Site(url))
    }

    /// For tests that talk to a local server over plain `http`.
    #[cfg(test)]
    pub fn unchecked(url: Url) -> Site {
        Site(url)
    }

    pub fn host(&self) -> &str {
        self.0.host_str().unwrap_or_default()
    }

    /// The address without a trailing slash, as Moodle writes `wwwroot`.
    pub fn root(&self) -> String {
        self.0.as_str().trim_end_matches('/').to_string()
    }

    /// A page on the site, `relative` to its root.
    pub fn page(&self, relative: &str) -> Url {
        self.0
            .join(relative.trim_start_matches('/'))
            .unwrap_or_else(|_| self.0.clone())
    }

    /// Whether `url` is on this very site. Files are only ever fetched with the
    /// token from here, so it can't leak to another host.
    pub fn owns(&self, url: &Url) -> bool {
        url.scheme() == self.0.scheme()
            && url.host_str() == self.0.host_str()
            && url.port_or_known_default() == self.0.port_or_known_default()
            && url.path().starts_with(self.0.path())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn root(input: &str) -> String {
        Site::parse(input).unwrap().root()
    }

    #[test]
    fn bare_host_gets_https() {
        assert_eq!(root("moodle.uni.edu"), "https://moodle.uni.edu");
        assert_eq!(root("  moodle.uni.edu/  "), "https://moodle.uni.edu");
    }

    #[test]
    fn any_page_on_the_site_gives_its_root() {
        assert_eq!(
            root("https://moodle.uni.edu/course/view.php?id=4"),
            "https://moodle.uni.edu"
        );
        assert_eq!(
            root("https://moodle.uni.edu/my/courses.php"),
            "https://moodle.uni.edu"
        );
        assert_eq!(
            root("https://moodle.uni.edu/login/index.php"),
            "https://moodle.uni.edu"
        );
    }

    #[test]
    fn keeps_the_folder_moodle_is_installed_in() {
        assert_eq!(
            root("https://uni.edu/moodle/course/view.php?id=4"),
            "https://uni.edu/moodle"
        );
        assert_eq!(root("uni.edu/lms"), "https://uni.edu/lms");
    }

    #[test]
    fn drops_credentials_query_and_fragment() {
        assert_eq!(
            root("https://me:secret@moodle.uni.edu/?lang=de#top"),
            "https://moodle.uni.edu"
        );
    }

    #[test]
    fn keeps_a_port() {
        assert_eq!(
            root("https://moodle.uni.edu:8443/"),
            "https://moodle.uni.edu:8443"
        );
    }

    #[test]
    fn refuses_plain_http_and_nonsense() {
        assert!(Site::parse("http://moodle.uni.edu").is_err());
        assert!(Site::parse("ftp://moodle.uni.edu").is_err());
        assert!(Site::parse("").is_err());
        assert!(Site::parse("   ").is_err());
    }

    #[test]
    fn builds_pages_under_the_root() {
        let site = Site::parse("https://uni.edu/moodle").unwrap();
        assert_eq!(
            site.page("/course/view.php?id=4").as_str(),
            "https://uni.edu/moodle/course/view.php?id=4"
        );
    }

    #[test]
    fn owns_only_its_own_urls() {
        let site = Site::parse("https://uni.edu/moodle").unwrap();
        let own = Url::parse("https://uni.edu/moodle/webservice/pluginfile.php/1/a.pdf").unwrap();
        assert!(site.owns(&own));
        for other in [
            "https://evil.example/moodle/webservice/pluginfile.php/1/a.pdf",
            "http://uni.edu/moodle/webservice/pluginfile.php/1/a.pdf",
            "https://uni.edu.evil.example/moodle/x",
            "https://uni.edu/other/x",
            "https://uni.edu:444/moodle/x",
        ] {
            assert!(!site.owns(&Url::parse(other).unwrap()), "{other}");
        }
    }
}
