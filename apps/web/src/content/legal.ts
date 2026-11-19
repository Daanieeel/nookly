import type { Locale } from "@/lib/i18n";

/// The legal pages. Placeholders until a lawyer has looked at them: the Impressum holds
/// sample values, and every page says so at the top. Replace the text here, not in the
/// page components.

type LegalSection = { heading: string; body: string[] };
export type LegalDoc = { title: string; updated: string; sections: LegalSection[] };
export type LegalPage = "imprint" | "privacy" | "terms";

const UPDATED = "2026-11-19";

/// Sample values, the same on every page that names them.
const SAMPLE = {
  name: "Max Mustermann",
  street: "Musterstraße 1",
  city: "12345 Musterstadt",
  country: "Deutschland",
  countryEn: "Germany",
  email: "kontakt@beispiel.de",
  phone: "+49 123 456789",
};

const de = {
  imprint: {
    title: "Impressum",
    updated: UPDATED,
    sections: [
      {
        heading: "Angaben gemäß § 5 DDG",
        body: [SAMPLE.name, SAMPLE.street, SAMPLE.city, SAMPLE.country],
      },
      {
        heading: "Kontakt",
        body: [`Telefon: ${SAMPLE.phone}`, `E-Mail: ${SAMPLE.email}`],
      },
      {
        heading: "Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV",
        body: [`${SAMPLE.name}, ${SAMPLE.street}, ${SAMPLE.city}`],
      },
      {
        heading: "Verbraucherstreitbeilegung",
        body: [
          "Wir sind nicht bereit oder verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.",
        ],
      },
      {
        heading: "Haftung für Inhalte und Links",
        body: [
          "Wir erstellen die Inhalte dieser Seiten mit Sorgfalt, übernehmen für ihre Richtigkeit, Vollständigkeit und Aktualität aber keine Gewähr. Für Inhalte verlinkter Seiten sind allein deren Betreiber verantwortlich. Werden uns Rechtsverletzungen bekannt, entfernen wir die betroffenen Inhalte oder Links umgehend.",
        ],
      },
    ],
  },
  privacy: {
    title: "Datenschutzerklärung",
    updated: UPDATED,
    sections: [
      {
        heading: "Verantwortlicher",
        body: [
          `${SAMPLE.name}, ${SAMPLE.street}, ${SAMPLE.city}, ${SAMPLE.country}. E-Mail: ${SAMPLE.email}`,
        ],
      },
      {
        heading: "Kurz gesagt",
        body: [
          "Nookly speichert deine Daten auf deinem eigenen Gerät. Die App funktioniert ohne Konto, ohne Internet und ohne Tracking. Diese Website setzt keine Cookies und nutzt keine Analysewerkzeuge.",
        ],
      },
      {
        heading: "Diese Website",
        body: [
          "Die Website wird von Cloudflare, Inc. ausgeliefert (Cloudflare Pages). Beim Aufruf verarbeitet Cloudflare technisch notwendige Daten wie deine IP Adresse, Datum und Uhrzeit sowie die aufgerufene Seite, um die Seite auszuliefern und vor Angriffen zu schützen. Rechtsgrundlage ist unser berechtigtes Interesse an einem sicheren Betrieb (Art. 6 Abs. 1 lit. f DSGVO). Cloudflare ist unter dem EU US Data Privacy Framework zertifiziert.",
          "Deine Wahl von Sprache und Darstellung (hell, dunkel) speichern wir nur in deinem Browser (Local Storage). Sie verlässt dein Gerät nicht.",
          "Die Anzahl der GitHub Sterne, die Downloads und der Verlauf der Statusseite werden direkt von GitHub, Inc. geladen. Dabei erfährt GitHub deine IP Adresse. Die Statusseite fragt außerdem unseren Sync Server (sync.nookly.work) ab, ob er erreichbar ist; dabei wird nichts gespeichert, das dich erkennbar macht.",
        ],
      },
      {
        heading: "Die App",
        body: [
          "Alles, was du in Nookly anlegst, bleibt auf deinem Gerät. Wir erhalten davon nichts. Die App fragt bei GitHub nach Updates; dabei erfährt GitHub deine IP Adresse.",
          "Verbindest du die App mit Moodle oder anderen Diensten, spricht die App direkt mit diesen Diensten. Deine Zugangsdaten bleiben auf deinem Gerät.",
        ],
      },
      {
        heading: "Sync und Konto (freiwillig)",
        body: [
          "Wenn du Sync nutzt, legst du ein Konto mit Name, E-Mail Adresse und Passwort an. Deine synchronisierten Inhalte, Geräte und Spaces speichern wir, um sie zwischen deinen Geräten abzugleichen (Art. 6 Abs. 1 lit. b DSGVO). Dafür nutzen wir Heroku (Salesforce, Inc.) in der EU für Server und Datenbank, Scaleway SAS in Paris für Dateien und Resend, Inc. für E-Mails wie die Bestätigung deiner Adresse. Mit allen bestehen Verträge zur Auftragsverarbeitung.",
          "Löschst du dein Konto, löschen wir die zugehörigen Daten. Sicherungen bewahren wir nur für begrenzte Zeit auf, danach werden sie überschrieben.",
          "Du kannst stattdessen auch deinen eigenen Sync Server betreiben. Dann erhalten wir keine dieser Daten.",
        ],
      },
      {
        heading: "Deine Rechte",
        body: [
          "Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit und Widerspruch (Art. 15 bis 21 DSGVO). Schreib uns dafür eine E-Mail. Außerdem kannst du dich bei einer Datenschutzaufsichtsbehörde beschweren.",
        ],
      },
    ],
  },
  terms: {
    title: "Allgemeine Geschäftsbedingungen",
    updated: UPDATED,
    sections: [
      {
        heading: "Geltung",
        body: [
          `Diese Bedingungen gelten für die Nutzung der App Nookly und des Sync Dienstes unter sync.nookly.work, angeboten von ${SAMPLE.name}, ${SAMPLE.street}, ${SAMPLE.city}.`,
        ],
      },
      {
        heading: "Die App",
        body: [
          "Nookly ist kostenlos und quelloffen. Für den Quellcode gilt die GNU Affero General Public License, Version 3. Sie regelt, wie du die Software nutzen, ändern und weitergeben darfst.",
        ],
      },
      {
        heading: "Der Sync Dienst",
        body: [
          "Der Sync Dienst ist freiwillig und derzeit kostenlos. Wir bemühen uns um einen zuverlässigen Betrieb, können aber keine ständige Verfügbarkeit zusagen. Wir können den Dienst ändern oder einstellen und kündigen das mit angemessener Frist vorher an, damit du deine Daten mitnehmen kannst. Deine Daten liegen ohnehin auch auf deinen Geräten.",
          "Halte dein Passwort geheim. Nutze den Dienst nicht für rechtswidrige Inhalte und nicht so, dass er für andere beeinträchtigt wird. Bei Verstößen können wir dein Konto sperren.",
        ],
      },
      {
        heading: "Haftung",
        body: [
          "Wir haften unbeschränkt bei Vorsatz und grober Fahrlässigkeit sowie bei Verletzung von Leben, Körper oder Gesundheit. Bei leichter Fahrlässigkeit haften wir nur für die Verletzung wesentlicher Pflichten und begrenzt auf den typischerweise vorhersehbaren Schaden. Für einen kostenlosen Dienst gilt außerdem die Haftungsbeschränkung des Schenkungsrechts (§ 521 BGB).",
        ],
      },
      {
        heading: "Kündigung",
        body: [
          "Du kannst dein Konto jederzeit in der App löschen. Wir können den Vertrag mit einer Frist von 30 Tagen kündigen, aus wichtigem Grund auch sofort.",
        ],
      },
      {
        heading: "Schluss",
        body: [
          "Es gilt deutsches Recht. Ändern wir diese Bedingungen, informieren wir dich vorher; widersprichst du nicht, gelten sie als angenommen. Ist eine Bestimmung unwirksam, bleibt der Rest gültig.",
        ],
      },
    ],
  },
} satisfies Record<LegalPage, LegalDoc>;

const en = {
  imprint: {
    title: "Imprint",
    updated: UPDATED,
    sections: [
      {
        heading: "Information under § 5 DDG",
        body: [SAMPLE.name, SAMPLE.street, SAMPLE.city, SAMPLE.countryEn],
      },
      {
        heading: "Contact",
        body: [`Phone: ${SAMPLE.phone}`, `Email: ${SAMPLE.email}`],
      },
      {
        heading: "Responsible for the content under § 18 (2) MStV",
        body: [`${SAMPLE.name}, ${SAMPLE.street}, ${SAMPLE.city}`],
      },
      {
        heading: "Consumer dispute resolution",
        body: [
          "We are neither willing nor obliged to take part in dispute resolution proceedings before a consumer arbitration board.",
        ],
      },
      {
        heading: "Liability for content and links",
        body: [
          "We write these pages with care but cannot guarantee that they are correct, complete and up to date. Linked pages are the responsibility of the people who run them. If we learn of anything unlawful, we remove it right away.",
        ],
      },
    ],
  },
  privacy: {
    title: "Privacy policy",
    updated: UPDATED,
    sections: [
      {
        heading: "Who is responsible",
        body: [
          `${SAMPLE.name}, ${SAMPLE.street}, ${SAMPLE.city}, ${SAMPLE.countryEn}. Email: ${SAMPLE.email}`,
        ],
      },
      {
        heading: "In short",
        body: [
          "Nookly keeps your data on your own device. The app works without an account, without the internet and without tracking. This website sets no cookies and uses no analytics.",
        ],
      },
      {
        heading: "This website",
        body: [
          "The website is served by Cloudflare, Inc. (Cloudflare Pages). When you open it, Cloudflare processes what it needs to deliver the page and protect it from attacks, such as your IP address, the date and time and the page you asked for. The legal basis is our legitimate interest in running the site safely (Art. 6 (1) (f) GDPR). Cloudflare is certified under the EU US Data Privacy Framework.",
          "Your choice of language and appearance (light, dark) is stored only in your browser (local storage). It never leaves your device.",
          "The GitHub star count, the downloads and the status page history load straight from GitHub, Inc., which sees your IP address. The status page also asks our sync server (sync.nookly.work) whether it is up; nothing that identifies you is stored.",
        ],
      },
      {
        heading: "The app",
        body: [
          "Everything you put into Nookly stays on your device. We receive none of it. The app asks GitHub for updates, which lets GitHub see your IP address.",
          "When you connect the app to Moodle or other services, the app talks to those services directly. Your sign in details stay on your device.",
        ],
      },
      {
        heading: "Sync and accounts (optional)",
        body: [
          "If you use sync, you create an account with a name, an email address and a password. We store what you sync, your devices and your Spaces to keep your devices in step (Art. 6 (1) (b) GDPR). For this we use Heroku (Salesforce, Inc.) in the EU for the server and database, Scaleway SAS in Paris for files, and Resend, Inc. for emails such as confirming your address. All of them process data on our behalf under a data processing agreement.",
          "When you delete your account, we delete its data. Backups are kept for a limited time and then overwritten.",
          "You can also run your own sync server instead. Then none of this reaches us.",
        ],
      },
      {
        heading: "Your rights",
        body: [
          "You have the right to access, correct and delete your data, to restrict or object to its processing and to take it with you (Art. 15 to 21 GDPR). Just send us an email. You can also complain to a data protection authority.",
        ],
      },
    ],
  },
  terms: {
    title: "Terms of service",
    updated: UPDATED,
    sections: [
      {
        heading: "Scope",
        body: [
          `These terms cover the Nookly app and the sync service at sync.nookly.work, offered by ${SAMPLE.name}, ${SAMPLE.street}, ${SAMPLE.city}.`,
        ],
      },
      {
        heading: "The app",
        body: [
          "Nookly is free and open source. Its code is licensed under the GNU Affero General Public License, version 3, which says how you may use, change and share it.",
        ],
      },
      {
        heading: "The sync service",
        body: [
          "Sync is optional and free for now. We work to keep it running reliably but cannot promise it is always available. We may change or end the service and will tell you well ahead of time so you can take your data with you. Your data stays on your devices either way.",
          "Keep your password to yourself. Do not use the service for anything unlawful or in a way that harms it for others. If you do, we may suspend your account.",
        ],
      },
      {
        heading: "Liability",
        body: [
          "We are fully liable for intent and gross negligence and for harm to life, body or health. For slight negligence we are only liable for breaching essential duties, and only up to the damage that is typical and foreseeable. As the service is free, the limits for gifts under German law (§ 521 BGB) also apply.",
        ],
      },
      {
        heading: "Ending",
        body: [
          "You can delete your account in the app at any time. We can end the agreement with 30 days' notice, or right away for good cause.",
        ],
      },
      {
        heading: "Final terms",
        body: [
          "German law applies. If we change these terms, we tell you first; if you do not object, the new terms apply. If one clause is invalid, the rest still holds.",
        ],
      },
    ],
  },
} satisfies Record<LegalPage, LegalDoc>;

export function legal(locale: Locale, page: LegalPage): LegalDoc {
  return (locale === "de" ? de : en)[page];
}
