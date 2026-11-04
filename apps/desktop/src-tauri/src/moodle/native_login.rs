//! Signing in to Moodle with the system's own sign in sheet (macOS).
//!
//! A web view of our own cannot offer the passwords saved in Apple Passwords: macOS only
//! fills them into pages of sites that the app is associated with. The system sheet
//! (`ASWebAuthenticationSession`) is made for exactly this: it offers the saved passwords and
//! passkeys, shares the sign in with Safari, and hands back the redirect to our own scheme
//! without any browser involved.

use block2::RcBlock;
use objc2::rc::Retained;
use objc2::runtime::ProtocolObject;
use objc2::{
    define_class, msg_send, AllocAnyThread, DefinedClass, MainThreadMarker, MainThreadOnly,
};
use objc2_app_kit::NSWindow;
use objc2_authentication_services::{
    ASWebAuthenticationPresentationContextProviding, ASWebAuthenticationSession,
    ASWebAuthenticationSessionErrorCode,
};
use objc2_foundation::{NSError, NSObject, NSObjectProtocol, NSString, NSURL};
use std::cell::{Cell, RefCell};

/// How the sheet ended.
pub enum Outcome {
    /// The `nookly://token=...` link Moodle redirected to.
    Link(String),
    /// The person closed the sheet.
    Cancelled,
    Failed(String),
}

struct AnchorIvars {
    window: Retained<NSWindow>,
}

define_class!(
    /// Tells the system which window the sheet slides out of.
    #[unsafe(super(NSObject))]
    #[thread_kind = MainThreadOnly]
    #[name = "NooklySignInAnchor"]
    #[ivars = AnchorIvars]
    struct Anchor;

    unsafe impl NSObjectProtocol for Anchor {}

    unsafe impl ASWebAuthenticationPresentationContextProviding for Anchor {
        #[unsafe(method_id(presentationAnchorForWebAuthenticationSession:))]
        fn anchor(&self, _session: &ASWebAuthenticationSession) -> Retained<NSWindow> {
            self.ivars().window.clone()
        }
    }
);

impl Anchor {
    fn new(mtm: MainThreadMarker, window: Retained<NSWindow>) -> Retained<Self> {
        let this = Self::alloc(mtm).set_ivars(AnchorIvars { window });
        // SAFETY: `NSObject`'s plain `init`.
        unsafe { msg_send![super(this), init] }
    }
}

type Live = (Retained<ASWebAuthenticationSession>, Retained<Anchor>);

thread_local! {
    /// The sheet that is open. The session only keeps its anchor weakly, and ends when released.
    static LIVE: RefCell<Option<Live>> = const { RefCell::new(None) };
    /// Tells a sheet that was replaced apart from the current one.
    static GENERATION: Cell<u64> = const { Cell::new(0) };
}

/// Opens the sheet on `address` over `window`. `done` runs once, on the main thread, when it
/// ends. Only a redirect to `scheme` counts as a result.
///
/// # Safety
/// `window` must point to a live `NSWindow`.
pub unsafe fn start(
    mtm: MainThreadMarker,
    window: *mut std::ffi::c_void,
    address: &str,
    scheme: &str,
    done: impl Fn(Outcome) + 'static,
) -> Result<(), String> {
    // SAFETY: the caller guarantees `window` is a live window.
    let window = unsafe { Retained::retain(window.cast::<NSWindow>()) }
        .ok_or("Couldn't find the window to sign in from.")?;
    let url = NSURL::URLWithString(&NSString::from_str(address))
        .ok_or("That is not a Moodle address.")?;

    // A sheet from an earlier try is closed first. Its handler runs with `Cancelled`.
    if let Some((old, _)) = LIVE.with(|live| live.borrow_mut().take()) {
        // SAFETY: a session we started.
        unsafe { old.cancel() };
    }
    let generation = GENERATION.with(|g| {
        g.set(g.get() + 1);
        g.get()
    });

    let handler = RcBlock::new(move |url: *mut NSURL, error: *mut NSError| {
        // SAFETY: the system hands over a valid object or null.
        let outcome = match unsafe { url.as_ref() }.and_then(|url| url.absoluteString()) {
            Some(link) => Outcome::Link(link.to_string()),
            None => match unsafe { error.as_ref() } {
                Some(error)
                    if error.code() == ASWebAuthenticationSessionErrorCode::CanceledLogin.0 =>
                {
                    Outcome::Cancelled
                }
                Some(error) => Outcome::Failed(error.localizedDescription().to_string()),
                None => Outcome::Failed("The sign in ended without a result.".into()),
            },
        };
        if GENERATION.with(Cell::get) == generation {
            LIVE.with(|live| live.borrow_mut().take());
        }
        done(outcome);
    });

    // SAFETY: `url` and the block are valid; the session retains the block.
    #[allow(deprecated)]
    let session = unsafe {
        ASWebAuthenticationSession::initWithURL_callbackURLScheme_completionHandler(
            ASWebAuthenticationSession::alloc(),
            &url,
            Some(&NSString::from_str(scheme)),
            &*handler as *const _ as *mut _,
        )
    };
    let anchor = Anchor::new(mtm, window);
    // SAFETY: the anchor is main thread only and we are on the main thread. Not ephemeral,
    // so the saved passwords and the sign in shared with Safari are used.
    unsafe {
        session.setPresentationContextProvider(Some(ProtocolObject::from_ref(&*anchor)));
        session.setPrefersEphemeralWebBrowserSession(false);
        if !session.start() {
            return Err("Couldn't open the sign in.".into());
        }
    }
    LIVE.with(|live| *live.borrow_mut() = Some((session, anchor)));
    Ok(())
}
