import { type Locale, pathFor } from "@/lib/i18n";

/// The legal pages: Impressum, Datenschutzerklärung and terms of use. German is the
/// binding version, English a translation of it: keep both in step, section for section
/// (`legal.test.ts` checks it). Replace the text here, not in the page components.
///
/// Written by a developer, not a lawyer. Review the whole of it again whenever the
/// server, a provider or what Nookly stores about people changes, and move `UPDATED`.

type LegalSection = { heading: string; body: string[]; list?: string[] };
export type LegalDoc = { title: string; updated: string; sections: LegalSection[] };
export type LegalPage = "imprint" | "privacy" | "terms";

const UPDATED = "2026-11-22";

const OWNER = {
  name: "Daniel Dopatka",
  street: "Sally-Ehrlich-Straße 8",
  city: "96450 Coburg",
  region: "Bayern",
  country: "Deutschland",
  countryEn: "Germany",
  email: "contact@nookly.work",
};

const de = {
  imprint: {
    title: "Impressum",
    updated: UPDATED,
    sections: [
      {
        heading: "Angaben gemäß § 5 DDG",
        body: [OWNER.name, OWNER.street, `${OWNER.city}, ${OWNER.region}`, OWNER.country],
      },
      {
        heading: "Kontakt",
        body: [
          `E-Mail: ${OWNER.email}`,
          "Wir melden uns so schnell wie möglich, in der Regel innerhalb weniger Tage.",
        ],
      },
      {
        heading: "Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV",
        body: [`${OWNER.name}, ${OWNER.street}, ${OWNER.city}, ${OWNER.region}`],
      },
      {
        heading: "Open Source",
        body: [
          `Nookly ist quelloffen und steht unter der [GNU Affero General Public License, Version 3](${pathFor("de", "license")}). Den Quellcode findest du auf github.com/Daanieeel/nookly.`,
        ],
      },
      {
        heading: "Urheberrecht",
        body: [
          `Texte, Bilder und Gestaltung dieser Website sind urheberrechtlich geschützt. Der Quellcode von Nookly steht unter der [GNU Affero General Public License, Version 3](${pathFor("de", "license")}).`,
        ],
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
          "Wir erstellen die Inhalte dieser Seiten mit Sorgfalt, übernehmen für ihre Richtigkeit, Vollständigkeit und Aktualität aber keine Gewähr. Für Inhalte verlinkter Seiten sind allein deren Betreiber verantwortlich. Zum Zeitpunkt der Verlinkung waren uns keine Rechtsverstöße erkennbar. Werden uns Rechtsverletzungen bekannt, entfernen wir die betroffenen Inhalte oder Links umgehend.",
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
          `Verantwortlich im Sinne der Datenschutz-Grundverordnung (DSGVO) ist ${OWNER.name}, ${OWNER.street}, ${OWNER.city}, ${OWNER.region}, ${OWNER.country}. E-Mail: ${OWNER.email}`,
          "Einen Datenschutzbeauftragten haben wir nicht benannt, weil das Gesetz es für uns nicht verlangt. Alle Fragen zum Datenschutz erreichen uns unter der genannten E-Mail Adresse.",
        ],
      },
      {
        heading: "Kurz gesagt",
        body: [
          "Nookly speichert deine Inhalte zuerst auf deinem eigenen Gerät. Die App funktioniert ohne Konto, ohne Internet und ohne Tracking. Wir setzen keine Cookies, keine Werbung und keine Analysewerkzeuge ein und verkaufen keine Daten.",
          "Nur wenn du Sync nutzt, speichern wir ein Konto und deine synchronisierten Inhalte auf unserem Server. Diese Inhalte sind dort nicht Ende zu Ende verschlüsselt (mehr dazu unter Sicherheit und Einsicht).",
        ],
      },
      {
        heading: "Übersicht der Verarbeitungen",
        body: [
          "Das Wichtigste auf einen Blick. Die Einzelheiten stehen in den Abschnitten darunter.",
        ],
        list: [
          "Daten: Kontodaten, Geräte und Anmeldungen, synchronisierte Inhalte und Dateien, Freigaben, technische Protokolle und E-Mails, die du uns schreibst.",
          "Betroffene: Nutzer des Sync Dienstes, Besucher dieser Website und Menschen, die uns schreiben.",
          "Zwecke: Konto, Sync, Dateispeicher und Freigaben bereitstellen, Missbrauch abwehren, Fehler finden und Anfragen beantworten.",
          "Rechtsgrundlagen: Vertragserfüllung (Art. 6 Abs. 1 lit. b DSGVO) für Konto und Sync, berechtigtes Interesse (Art. 6 Abs. 1 lit. f DSGVO) für Website, Protokolle und Sicherheit. Eine Einwilligung holen wir nicht ein, weil wir nichts verarbeiten, wofür man sie bräuchte.",
        ],
      },
      {
        heading: "Diese Website",
        body: [
          "Die Website wird von Cloudflare, Inc. (101 Townsend Street, San Francisco, CA 94107, USA) ausgeliefert (Cloudflare Pages und DNS). Beim Aufruf verarbeitet Cloudflare technisch notwendige Daten: deine IP Adresse, Datum und Uhrzeit, die aufgerufene Seite oder Datei, die übertragene Datenmenge, den Statuscode, Browser und Betriebssystem sowie die Adresse der Seite, von der du kommst (Referrer). Das dient dazu, die Seite auszuliefern und vor Angriffen zu schützen. Cloudflare bewahrt diese Protokolle nach eigenen Fristen auf; bei uns werden sie nicht gespeichert. Rechtsgrundlage ist unser berechtigtes Interesse an einem sicheren und stabilen Betrieb (Art. 6 Abs. 1 lit. f DSGVO).",
          "Deine Wahl von Sprache und Darstellung (hell oder dunkel) speichern wir nur in deinem Browser (Local Storage). Sie wird nicht an uns übertragen und dient allein dazu, dir die Seite so zu zeigen, wie du sie eingestellt hast (§ 25 Abs. 2 Nr. 2 TDDDG). Wir setzen keine Cookies.",
          "Die Anzahl der GitHub Sterne und der Verlauf der Statusseite werden von GitHub, Inc. (88 Colin P. Kelly Jr. Street, San Francisco, CA 94107, USA) geladen. Dabei ruft dein Browser GitHub direkt auf, und GitHub erfährt deine IP Adresse. Die Statusseite fragt außerdem unseren Sync Server (sync.nookly.work) ab, ob er erreichbar ist; auch dabei sieht der Server deine IP Adresse, die nur im üblichen Server Protokoll steht (siehe Konto und Sync). Rechtsgrundlage ist jeweils unser berechtigtes Interesse, dir aktuelle Angaben zu zeigen (Art. 6 Abs. 1 lit. f DSGVO).",
        ],
      },
      {
        heading: "Die App ohne Konto",
        body: [
          "Alles, was du in Nookly anlegst, bleibt in einer Datenbank auf deinem Gerät. Wir erhalten davon nichts. Die App sendet keine Nutzungsdaten, Absturzberichte oder Gerätekennungen an uns.",
          "Die folgenden Verbindungen gehen von deinem Gerät aus, und nur dann, wenn du die jeweilige Funktion nutzt:",
        ],
        list: [
          "Updates: Die Desktop App fragt bei GitHub nach neuen Versionen. Dabei erfährt GitHub deine IP Adresse und die Version deiner App. Die iPhone und iPad App wird über Apple aktualisiert.",
          "Lesezeichen: Speicherst du einen Link, ruft die App die Adresse selbst ab, um Titel, Symbol und Vorschau zu holen. Die Betreiber dieser Seite sehen dabei deine IP Adresse.",
          "Moodle: Verbindest du die App mit der Moodle Seite deiner Hochschule, spricht die App direkt mit dieser Seite. Zugangsdaten und Kalenderlinks bleiben im Schlüsselbund deines Geräts. Was du aus Moodle in Nookly übernimmst, ist danach dein eigener Inhalt.",
          "Google Kalender und iCloud: Verbindest du einen Kalender, liest die App ihn direkt bei Google (Google LLC) oder Apple (Apple Inc.) aus, nur lesend. Die Zugangsdaten bleiben im Schlüsselbund deines Geräts, und nichts läuft über unseren Server. Es gelten die Datenschutzhinweise dieser Anbieter.",
          "Eingebettete Inhalte und Bilder von fremden Adressen werden direkt von dort geladen.",
          "Apple: Lädst du die App über den App Store oder TestFlight, verarbeitet Apple Daten in eigener Verantwortung. Wir erhalten daraus keine personenbezogenen Angaben.",
          "Speicher auf dem Gerät: Die App legt deine Daten in einer Datenbank auf dem Gerät ab und Zugangsdaten im Schlüsselbund. Beides ist für die Funktion technisch erforderlich (§ 25 Abs. 2 Nr. 2 TDDDG) und wird nicht an uns übertragen.",
          "Berechtigungen auf dem iPhone und iPad: Die Kamera nutzt die App nur, wenn du ein Dokument scannen willst. Fotos und Dateien wählst du selbst über die Auswahl des Systems. Alles bleibt auf dem Gerät, bis du Sync nutzt. Du kannst Berechtigungen jederzeit in den Einstellungen des Systems widerrufen.",
          "Absturzberichte: Schließt sich die Desktop App unerwartet, bleibt der Bericht auf deinem Computer. Du entscheidest, ob du ihn als Meldung bei GitHub abschickst; dann gilt dort die Datenschutzerklärung von GitHub.",
        ],
      },
      {
        heading: "Konto und Sync (freiwillig)",
        body: [
          "Sync ist freiwillig. Legst du ein Konto an, verarbeiten wir die folgenden Daten, um dir Anmeldung, Sync, Dateispeicher, Freigaben und die nötigen E-Mails bereitzustellen (Art. 6 Abs. 1 lit. b DSGVO):",
        ],
        list: [
          "Kontodaten: Benutzername oder Name, E-Mail Adresse (nötig zum Teilen und zum Zurücksetzen des Passworts), dein Passwort nur als sicherer Hashwert (argon2id) und der Zeitpunkt der Erstellung.",
          "Geräte und Anmeldungen: Name und Art jedes Geräts, der Zeitpunkt der letzten Nutzung sowie die IP Adresse und der User Agent der Anmeldung.",
          "Synchronisierte Inhalte: alles, was du synchronisierst, also zum Beispiel Spaces, Aufgaben, Seiten, Notizen, Kurse, Lesezeichen, Dateien und synchronisierte Einstellungen, samt dem Änderungsverlauf und den Konflikten, die für den Abgleich nötig sind.",
          "Freigaben: wen du eingeladen hast, mit welcher Rolle, und was du geteilt hast.",
          "Server Protokolle: IP Adresse, Zeitpunkt, aufgerufener Pfad und Statuscode jeder Anfrage, zur Abwehr von Missbrauch und zur Fehlersuche (Art. 6 Abs. 1 lit. f DSGVO). Sie enthalten keine Inhalte und keine Passwörter und werden nach höchstens einer Woche gelöscht.",
        ],
      },
      {
        heading: "Sicherheit und Einsicht",
        body: [
          "Die Verbindung zum Server ist per TLS verschlüsselt, Passwörter speichern wir nicht im Klartext. Deine synchronisierten Inhalte sind auf dem Server nicht Ende zu Ende verschlüsselt; das ist nötig, damit der Server Änderungen mehrerer Geräte abgleichen und Seiten gemeinsam bearbeitbar machen kann. Technisch könnte der Betreiber sie daher lesen.",
          "Wir tun das nicht, außer es ist nötig, um eine Störung zu beheben, einen Missbrauch aufzuklären oder eine gesetzliche Pflicht zu erfüllen. Wer Inhalte besonders schützen will, lässt sie außerhalb des Kontos, denn ohne Sync verlassen sie das Gerät nie.",
          "Diese Maßnahmen schützen deine Daten:",
        ],
        list: [
          "Verschlüsselte Übertragung (TLS) zwischen deinen Geräten und dem Server.",
          "Passwörter nur als Hashwert (argon2id), nie im Klartext.",
          "Eine eigene Sitzung für jedes Gerät, die du in der App beenden kannst.",
          "Begrenzte Versuche bei Anmeldung, Registrierung und E-Mail Versand gegen Missbrauch.",
          "Tägliche Sicherungen der Datenbank, die nach höchstens 30 Tagen überschrieben werden.",
        ],
      },
      {
        heading: "Sensible Inhalte",
        body: [
          "Was du in Nookly ablegst, bestimmst du. Wir prüfen und werten Inhalte nicht aus. Legst du Angaben ab, die besonders geschützt sind, etwa zur Gesundheit oder Religion, oder Angaben über andere Menschen, verarbeiten wir sie nur, um sie für dich zu speichern und abzugleichen. Überleg dir bei solchen Inhalten, ob sie in ein Konto sollen: Dort sind sie nicht Ende zu Ende verschlüsselt, ohne Sync bleiben sie auf deinem Gerät.",
        ],
      },
      {
        heading: "Teilen mit anderen",
        body: [
          "Teilst du eine Seite oder Aufgabe, sieht die eingeladene Person den geteilten Inhalt und deinen Benutzernamen oder deine E-Mail Adresse und kann ihn, den Inhalt, je nach Rolle bearbeiten. In deinem Auftrag senden wir der eingeladenen Adresse eine E-Mail mit der Einladung. Die Weitergabe geschieht auf deine Veranlassung und zur Erfüllung des Vertrags (Art. 6 Abs. 1 lit. b DSGVO). Teile nur mit Personen, bei denen du das darfst, und nur Inhalte, die du teilen darfst.",
        ],
      },
      {
        heading: "E-Mails",
        body: [
          "Wir senden dir nur E-Mails, die für dein Konto nötig sind: die Bestätigung deiner Adresse, das Zurücksetzen des Passworts und Einladungen, die du auslöst oder erhältst. Es gibt keine Werbung und keinen Newsletter. Der Versand läuft über Resend, Inc. (USA) mit Servern in der EU.",
        ],
      },
      {
        heading: "Kontakt mit uns",
        body: [
          "Schreibst du uns an contact@nookly.work, verarbeiten wir deine Adresse, den Inhalt und den Zeitpunkt deiner Nachricht, um sie zu beantworten (Art. 6 Abs. 1 lit. b oder f DSGVO). Wir löschen die Nachricht, wenn die Sache erledigt ist, außer eine gesetzliche Aufbewahrungspflicht verlangt etwas anderes.",
        ],
      },
      {
        heading: "Dienstleister",
        body: [
          "Mit den Anbietern, die in unserem Auftrag Daten verarbeiten, haben wir Verträge zur Auftragsverarbeitung (Art. 28 DSGVO). Darüber hinaus geben wir Daten nur weiter, wenn eine Behörde es rechtmäßig verlangt.",
        ],
        list: [
          "Heroku (Salesforce, Inc., USA): Server und Datenbank des Sync Dienstes, in der EU Region in Irland.",
          "Scaleway SAS (Paris, Frankreich): Speicher für deine Dateien, in Frankreich.",
          "Resend, Inc. (USA): Versand der E-Mails, über die EU Region in Irland.",
          "Cloudflare, Inc. (USA): Auslieferung der Website und DNS.",
          "GitHub, Inc. (USA): Quellcode, Downloads, Updates der Desktop App und Statusdaten.",
        ],
      },
      {
        heading: "Übermittlung in Drittländer",
        body: [
          "Heroku, Cloudflare, Resend und GitHub gehören zu Unternehmen in den USA. Wir nutzen ihre Dienste in EU Regionen, soweit der Anbieter das anbietet, ein Zugriff aus den USA, etwa zur Wartung, lässt sich aber nicht ausschließen. Die Übermittlung stützt sich auf den Angemessenheitsbeschluss der EU Kommission zum EU US Data Privacy Framework, soweit der Anbieter dort zertifiziert ist, und sonst auf EU Standardvertragsklauseln (Art. 45 und 46 DSGVO). Auf Anfrage nennen wir dir die Einzelheiten.",
          "Weil diese Anbieter zu US Unternehmen gehören, können US Behörden nach dem CLOUD Act (Clarifying Lawful Overseas Use of Data Act) von ihnen verlangen, Daten herauszugeben, auch wenn diese auf Servern in der EU liegen. Das betrifft vor allem deine synchronisierten Inhalte in der Datenbank bei Heroku, die nicht Ende zu Ende verschlüsselt sind. Ein solcher Zugriff lässt sich nicht ausschließen. Scaleway sitzt in Frankreich und unterliegt dem CLOUD Act nicht. Deshalb sind die Dokumente aus dem Files Modul, also die Inhalte deiner Dateien, nicht betroffen, denn sie liegen bei Scaleway. Angaben zu diesen Dateien wie Name und Labels gehören zu deinen synchronisierten Inhalten bei Heroku. Wer das nicht will, nutzt Nookly ohne Konto oder betreibt einen eigenen Sync Server.",
        ],
      },
      {
        heading: "Speicherdauer",
        body: ["Wir speichern Daten nur so lange, wie es der Zweck verlangt."],
        list: [
          "Konto und Inhalte: bis du dein Konto löschst, in der App unter Einstellungen, Konto. Dann löschen wir sofort alle Daten des Kontos auf dem Server, auch die Dateien samt ihrer früheren Fassungen. Deine Geräte behalten ihre eigenen Daten.",
          "Sicherungen: Die Datenbank wird täglich gesichert. Diese Sicherungen werden innerhalb von 30 Tagen überschrieben. Bis dahin können gelöschte Daten noch darin liegen. Wir spielen sie nur ein, um den Dienst nach einem Ausfall wiederherzustellen.",
          "Server Protokolle: höchstens eine Woche.",
          "E-Mails: Resend führt Versandprotokolle für kurze Zeit.",
        ],
      },
      {
        heading: "Deine Rechte",
        body: [
          "Du hast das Recht auf Auskunft (Art. 15 DSGVO), Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung der Verarbeitung (Art. 18), Datenübertragbarkeit (Art. 20) und Widerspruch (Art. 21). Wo wir Daten nur aufgrund unseres berechtigten Interesses verarbeiten, kannst du jederzeit aus Gründen, die sich aus deiner besonderen Situation ergeben, widersprechen.",
          "Vieles kannst du selbst tun: deine Inhalte exportieren, sie ändern und dein Konto in der App löschen. Für alles andere schreib uns eine E-Mail an contact@nookly.work. Wir antworten so schnell wie möglich.",
        ],
      },
      {
        heading: "Beschwerde bei einer Aufsichtsbehörde",
        body: [
          "Du kannst dich bei einer Datenschutzaufsichtsbehörde beschweren (Art. 77 DSGVO), zum Beispiel an deinem Wohnort. Für uns zuständig ist: Bayerisches Landesamt für Datenschutzaufsicht, Promenade 18, 91522 Ansbach, www.lda.bayern.de.",
        ],
      },
      {
        heading: "Pflicht zur Angabe, Alter und automatisierte Entscheidungen",
        body: [
          "Du musst keine Daten angeben, um Nookly ohne Konto zu nutzen. Für ein Konto brauchen wir einen Namen und ein Passwort, sonst können wir es nicht anlegen. Ein Konto ist ab 18 Jahren möglich. Automatisierte Entscheidungen einschließlich Profiling im Sinne von Art. 22 DSGVO gibt es nicht.",
        ],
      },
      {
        heading: "Änderungen",
        body: [
          "Wir passen diese Erklärung an, wenn sich der Dienst oder die Rechtslage ändert. Es gilt die Fassung mit dem oben genannten Datum. Bei wesentlichen Änderungen, die deine Rechte betreffen, informieren wir dich gesondert.",
        ],
      },
    ],
  },
  terms: {
    title: "Allgemeine Geschäftsbedingungen",
    updated: UPDATED,
    sections: [
      {
        heading: "Geltungsbereich und Anbieter",
        body: [
          `Diese Bedingungen gelten zwischen dir und ${OWNER.name}, ${OWNER.street}, ${OWNER.city}, ${OWNER.region}, ${OWNER.country} (wir) für den Sync Dienst von Nookly unter sync.nookly.work und das dazugehörige Konto.`,
          `Für die App als Software gilt die [GNU Affero General Public License, Version 3 (AGPL)](${pathFor("de", "license")}). Sie erlaubt dir, den Quellcode zu nutzen, zu ändern und weiterzugeben, und diese Bedingungen schränken das nicht ein. Betreibst du einen eigenen Sync Server, gelten diese Bedingungen dafür nicht.`,
        ],
      },
      {
        heading: "Der Dienst",
        body: [
          "Nookly funktioniert ohne Konto vollständig auf deinem Gerät. Mit einem Konto kannst du zusätzlich deine Geräte synchronisieren, Dateien speichern, Seiten gemeinsam bearbeiten und Inhalte mit anderen teilen.",
          "Der Sync Dienst ist derzeit kostenlos und befindet sich in einer geschlossenen Beta: Für die Registrierung brauchst du einen Beta Schlüssel. In der Beta kann es Fehler, Ausfälle und Änderungen geben.",
          "Der Sync Dienst ist für die private Nutzung gedacht. Eine gewerbliche oder berufliche Nutzung ist nur erlaubt, wenn wir ihr vorher ausdrücklich zugestimmt haben. Frag dafür vorher unter contact@nookly.work an. Das gilt nur für den Sync Dienst: Die App und ihren Quellcode darfst du nach der AGPL auch gewerblich nutzen.",
        ],
      },
      {
        heading: "Dein Konto",
        body: ["Mit der Registrierung versicherst du:"],
        list: [
          "Du bist mindestens 18 Jahre alt.",
          "Deine Angaben stimmen, und eine angegebene E-Mail Adresse gehört dir.",
          "Du hältst dein Passwort geheim, gibst es nicht weiter und meldest uns, wenn jemand anderes Zugriff hat. Wir fragen nie per E-Mail nach deinem Passwort.",
          "Du nutzt ein Konto für dich allein und gibst es nicht weiter.",
          "Du bist für alles verantwortlich, was unter deinem Konto geschieht, außer du hast einen Missbrauch nicht zu vertreten.",
        ],
      },
      {
        heading: "Deine Inhalte",
        body: [
          "Deine Inhalte gehören dir. Du räumst uns nur das einfache, nicht übertragbare Recht ein, sie zu speichern, zu übertragen, zu sichern und den Personen zu zeigen, die du eingeladen hast, soweit das für den Dienst nötig ist. Das Recht endet, wenn du die Inhalte oder dein Konto löschst, abgesehen von der Frist für Sicherungen.",
          "Du bist für deine Inhalte verantwortlich und versicherst, dass du sie speichern und teilen darfst. Wir prüfen sie nicht vorab.",
          "Teilst du etwas, kann die eingeladene Person es je nach Rolle sehen und ändern. Nimmst du die Freigabe zurück, endet ihr Zugriff, aber was sie schon gesehen oder kopiert hat, kann sie behalten.",
        ],
      },
      {
        heading: "Erlaubte Nutzung",
        body: ["Nutze den Dienst nicht dafür,"],
        list: [
          "rechtswidrige Inhalte zu speichern oder zu teilen, insbesondere Inhalte, die Rechte anderer verletzen, zu Gewalt aufrufen oder Kinder sexuell darstellen,",
          "andere zu belästigen oder ihnen unerwünschte Einladungen und Nachrichten zu schicken,",
          "den Dienst zu stören oder zu überlasten, Schutzmaßnahmen zu umgehen oder auf fremde Konten zuzugreifen,",
          "große Datenmengen abzulegen, die über die private Nutzung von Nookly hinausgehen.",
        ],
      },
      {
        heading: "Folgen eines Verstoßes",
        body: [
          "Verstößt du gegen die erlaubte Nutzung, können wir Inhalte entfernen, dein Konto sperren oder den Vertrag kündigen. Wir hören dich vorher an, außer wenn das wegen einer Gefahr für andere oder für den Dienst nicht möglich ist. Deine Daten auf deinen Geräten bleiben dir in jedem Fall.",
        ],
      },
      {
        heading: "Verfügbarkeit und Datensicherung",
        body: [
          "Wir bemühen uns um einen zuverlässigen Betrieb, können aber keine ständige Verfügbarkeit zusagen. Wartung und Störungen können den Dienst zeitweise unterbrechen. Die App arbeitet in dieser Zeit offline weiter und gleicht ihre Änderungen später ab.",
          "Deine Daten liegen auch auf deinen Geräten, doch der Sync Dienst ist keine Datensicherung. Lege deshalb regelmäßig Sicherungen an (Einstellungen, Backup) und exportiere wichtige Inhalte.",
        ],
      },
      {
        heading: "Änderungen und Einstellung des Dienstes",
        body: [
          "Wir dürfen den Dienst aus triftigem Grund ändern oder einstellen, zum Beispiel aus technischen, rechtlichen oder wirtschaftlichen Gründen. Wesentliche Änderungen und eine Einstellung kündigen wir mindestens 30 Tage vorher an, damit du deine Daten mitnehmen kannst. Neue Entgelte gelten nur, wenn du ihnen ausdrücklich zustimmst.",
        ],
      },
      {
        heading: "Haftung",
        body: [
          "Wir haften unbeschränkt bei Vorsatz und grober Fahrlässigkeit, bei Verletzung von Leben, Körper oder Gesundheit, bei arglistig verschwiegenen Mängeln, bei einer übernommenen Garantie und nach dem Produkthaftungsgesetz.",
          "Bei leichter Fahrlässigkeit haften wir nur für die Verletzung einer wesentlichen Vertragspflicht, also einer Pflicht, auf deren Erfüllung du vertrauen darfst und ohne die der Vertrag nicht sinnvoll durchführbar wäre, und begrenzt auf den vertragstypischen, vorhersehbaren Schaden. Für den Verlust von Daten haften wir dabei nur für den Aufwand, der auch bei regelmäßiger und der Gefahr angemessener Sicherung durch dich entstanden wäre.",
          "Die Haftung unserer Hilfspersonen ist im gleichen Umfang begrenzt. Deine gesetzlichen Rechte bei digitalen Produkten (§§ 327 ff. BGB) und Vorschriften, die zu deinen Gunsten gelten, weil der Dienst unentgeltlich ist, bleiben unberührt.",
        ],
      },
      {
        heading: "Laufzeit und Kündigung",
        body: [
          "Der Vertrag läuft auf unbestimmte Zeit. Du kannst ihn jederzeit beenden, indem du dein Konto in der App löschst oder uns schreibst.",
          "Wir können mit einer Frist von 30 Tagen kündigen. Das Recht beider Seiten, aus wichtigem Grund fristlos zu kündigen, bleibt unberührt, etwa bei schweren oder wiederholten Verstößen gegen die erlaubte Nutzung.",
          "Mit dem Ende des Vertrags löschen wir dein Konto und seine Daten, wie in der Datenschutzerklärung beschrieben. Kündigen wir, kannst du in der Frist deine Daten von deinen Geräten sichern. Die Geräte behalten ihre lokalen Daten.",
        ],
      },
      {
        heading: "Änderungen dieser Bedingungen",
        body: [
          "Wir können diese Bedingungen für die Zukunft ändern, wenn ein triftiger Grund besteht, etwa eine neue Funktion, eine Gesetzesänderung oder ein Urteil, und die Änderung dich nicht unangemessen benachteiligt. Wir teilen sie dir mindestens sechs Wochen vorher per E-Mail oder in der App mit. Du kannst bis dahin widersprechen oder kündigen. Widersprichst du nicht, gelten die neuen Bedingungen, worauf wir dich in der Mitteilung hinweisen.",
          "Änderungen, die das Verhältnis von Leistung und Gegenleistung verschieben, zum Beispiel ein Entgelt, brauchen deine ausdrückliche Zustimmung.",
        ],
      },
      {
        heading: "Name und Marke",
        body: [
          "Die AGPL gibt dir Rechte am Quellcode, aber nicht am Namen „Nookly“ und am Logo. Daran behalten wir uns alle Rechte vor. Du darfst sie nicht so verwenden, dass der Eindruck entsteht, ein Angebot stamme von uns oder werde von uns unterstützt.",
        ],
      },
      {
        heading: "Kommunikation und Support",
        body: [
          "Wir erreichen dich per E-Mail an die Adresse deines Kontos oder in der App. Hast du keine E-Mail hinterlegt, erfährst du Wichtiges in der App, sobald du sie öffnest. Du erreichst uns unter contact@nookly.work.",
        ],
      },
      {
        heading: "Meldung rechtswidriger Inhalte",
        body: [
          "Hältst du einen Inhalt im Dienst für rechtswidrig, schreib uns an contact@nookly.work. Nenne, wo wir ihn finden, warum er rechtswidrig ist, und deinen Namen und deine E-Mail Adresse. Wir prüfen die Meldung zeitnah und teilen dir und dem Betroffenen das Ergebnis mit.",
        ],
      },
      {
        heading: "Dienste Dritter",
        body: [
          "Verbindest du Nookly mit Diensten Dritter, zum Beispiel Moodle, Google Kalender oder iCloud, gelten deren Bedingungen. Wir sind für diese Dienste nicht verantwortlich. Nookly ist mit Moodle, Google und Apple nicht verbunden und wird von ihnen weder betrieben noch unterstützt. Nookly liest dort nur und ändert nichts. Apple ist nicht Vertragspartner dieser Bedingungen und nicht für die App oder ihren Support verantwortlich.",
        ],
      },
      {
        heading: "Schlussbestimmungen",
        body: [
          "Es gilt deutsches Recht unter Ausschluss des UN Kaufrechts. Zwingende Verbraucherschutzvorschriften des Staates, in dem du lebst, bleiben unberührt. Zur Streitbeilegung siehe das Impressum.",
          "Ist eine Bestimmung unwirksam, bleibt der Rest gültig, und es gilt die gesetzliche Regelung (§ 306 BGB). Maßgeblich ist die deutsche Fassung.",
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
        body: [OWNER.name, OWNER.street, `${OWNER.city}, ${OWNER.region}`, OWNER.countryEn],
      },
      {
        heading: "Contact",
        body: [`Email: ${OWNER.email}`, "We reply as soon as we can, usually within a few days."],
      },
      {
        heading: "Responsible for the content under § 18 (2) MStV",
        body: [`${OWNER.name}, ${OWNER.street}, ${OWNER.city}, ${OWNER.region}`],
      },
      {
        heading: "Open source",
        body: [
          `Nookly is open source under the [GNU Affero General Public License, version 3](${pathFor("en", "license")}). You can find the source code at github.com/Daanieeel/nookly.`,
        ],
      },
      {
        heading: "Copyright",
        body: [
          `The texts, images and design of this website are protected by copyright. The source code of Nookly is under the [GNU Affero General Public License, version 3](${pathFor("en", "license")}).`,
        ],
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
          "We write these pages with care but cannot guarantee that they are correct, complete and up to date. Linked pages are the responsibility of the people who run them. We saw nothing unlawful on them when we added the links. If we learn of anything unlawful, we remove it right away.",
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
          `The controller under the General Data Protection Regulation (GDPR) is ${OWNER.name}, ${OWNER.street}, ${OWNER.city}, ${OWNER.region}, ${OWNER.countryEn}. Email: ${OWNER.email}`,
          "We have not appointed a data protection officer because the law does not require one for us. Every question about privacy reaches us at the email address above.",
        ],
      },
      {
        heading: "In short",
        body: [
          "Nookly keeps your content on your own device first. The app works without an account, without the internet and without tracking. We use no cookies, no ads and no analytics, and we sell no data.",
          "Only if you use sync do we store an account and your synced content on our server. That content is not end to end encrypted there (more under Security and access).",
        ],
      },
      {
        heading: "Overview of processing",
        body: ["The most important points at a glance. The details are in the sections below."],
        list: [
          "Data: account data, devices and sign ins, synced content and files, shares, technical logs and emails you write to us.",
          "People: users of the sync service, visitors of this website and people who write to us.",
          "Purposes: providing the account, sync, file storage and sharing, fending off abuse, finding faults and answering requests.",
          "Legal bases: performance of the agreement (Art. 6 (1) (b) GDPR) for account and sync, legitimate interest (Art. 6 (1) (f) GDPR) for the website, logs and security. We do not ask for consent because we process nothing that would need it.",
        ],
      },
      {
        heading: "This website",
        body: [
          "The website is served by Cloudflare, Inc. (101 Townsend Street, San Francisco, CA 94107, USA), through Cloudflare Pages and DNS. When you open it, Cloudflare processes what it needs to deliver the page and protect it from attacks, namely your IP address, the date and time, the page or file you asked for, the amount of data sent, the status code, your browser and operating system and the address of the page you came from (referrer). The legal basis is our legitimate interest in running the site safely and reliably (Art. 6 (1) (f) GDPR). Cloudflare keeps these logs for its own periods; we do not store them.",
          "Your choice of language and appearance (light or dark) is stored only in your browser (local storage). It is not sent to us and only serves to show you the page the way you set it (§ 25 (2) no. 2 TDDDG). We set no cookies.",
          "The GitHub star count and the status page history are loaded from GitHub, Inc. (88 Colin P. Kelly Jr. Street, San Francisco, CA 94107, USA). Your browser calls GitHub directly, so GitHub sees your IP address. The status page also asks our sync server (sync.nookly.work) whether it is up; the server sees your IP address then too, which ends up only in its usual server log (see Account and sync). The legal basis in each case is our legitimate interest in showing you current information (Art. 6 (1) (f) GDPR).",
        ],
      },
      {
        heading: "The app without an account",
        body: [
          "Everything you put into Nookly stays in a database on your device. We receive none of it. The app sends us no usage data, crash reports or device identifiers.",
          "These connections start from your device, and only when you use the feature in question:",
        ],
        list: [
          "Updates: The desktop app asks GitHub for new versions. GitHub sees your IP address and your app version. The iPhone and iPad app is updated through Apple.",
          "Bookmarks: When you save a link, the app opens the address itself to fetch its title, icon and preview. The people who run that site see your IP address.",
          "Moodle: When you connect the app to your university's Moodle, the app talks to that site directly. Sign in details and calendar links stay in your device's keychain. What you bring from Moodle into Nookly is then your own content.",
          "Google Calendar and iCloud: When you connect a calendar, the app reads it straight from Google (Google LLC) or Apple (Apple Inc.), read only. Sign in details stay in your device's keychain, and nothing goes through our server. The privacy notices of those providers apply.",
          "Embedded content and images from other addresses are loaded directly from there.",
          "Apple: When you get the app from the App Store or TestFlight, Apple processes data under its own responsibility. We receive no personal data from it.",
          "Storage on the device: The app keeps your data in a database on the device and sign in details in the keychain. Both are technically necessary for the app to work (§ 25 (2) no. 2 TDDDG) and are not sent to us.",
          "Permissions on iPhone and iPad: The app uses the camera only when you want to scan a document. You pick photos and files yourself through the system's picker. Everything stays on the device until you use sync. You can withdraw permissions at any time in the system's settings.",
          "Crash reports: If the desktop app closes unexpectedly, the report stays on your computer. You decide whether to send it to GitHub as an issue; GitHub's privacy policy then applies there.",
        ],
      },
      {
        heading: "Account and sync (optional)",
        body: [
          "Sync is optional. If you create an account, we process the following data to give you sign in, sync, file storage, sharing and the emails they need (Art. 6 (1) (b) GDPR):",
        ],
        list: [
          "Account data: username or name, email address (needed for sharing and for resetting your password), your password only as a secure hash (argon2id) and the time the account was created.",
          "Devices and sign ins: the name and kind of each device, the time it was last used, and the IP address and user agent of the sign in.",
          "Synced content: everything you sync, such as Spaces, tasks, pages, notes, courses, bookmarks, files and synced settings, with the change history and conflicts needed to keep devices in step.",
          "Shares: whom you invited, with which role, and what you shared.",
          "Server logs: IP address, time, requested path and status code of each request, to fend off abuse and find faults (Art. 6 (1) (f) GDPR). They hold no content and no passwords and are deleted after a week at most.",
        ],
      },
      {
        heading: "Security and access",
        body: [
          "The connection to the server is encrypted with TLS, and we never store passwords in plain text. Your synced content is not end to end encrypted on the server; that is needed so the server can merge changes from several devices and let people edit pages together. Technically, the operator could therefore read it.",
          "We do not, unless it is needed to fix a fault, to look into abuse or to meet a legal duty. If you want something kept private from us, keep it out of the account: without sync it never leaves your device.",
          "These measures protect your data:",
        ],
        list: [
          "Encrypted transfer (TLS) between your devices and the server.",
          "Passwords only as a hash (argon2id), never in plain text.",
          "A session of its own for each device, which you can end in the app.",
          "Limited attempts at signing in, signing up and sending emails, against abuse.",
          "Daily backups of the database, overwritten after 30 days at most.",
        ],
      },
      {
        heading: "Sensitive content",
        body: [
          "What you put into Nookly is up to you. We do not check or analyze content. If you store details that are specially protected, such as about health or religion, or details about other people, we process them only to store and merge them for you. Think about whether such content belongs in an account: there it is not end to end encrypted, and without sync it stays on your device.",
        ],
      },
      {
        heading: "Sharing with others",
        body: [
          "When you share a page or task, the invited person sees the shared content and your username or email address and, depending on the role, can edit the content. On your behalf we send the invited address an email with the invitation. This happens at your request and to carry out the agreement (Art. 6 (1) (b) GDPR). Only share with people you may share with, and only what you may share.",
        ],
      },
      {
        heading: "Emails",
        body: [
          "We only send emails your account needs: confirming your address, resetting your password and invitations you send or receive. There are no ads and no newsletter. Emails are sent through Resend, Inc. (USA) with servers in the EU.",
        ],
      },
      {
        heading: "Contacting us",
        body: [
          "If you write to us at contact@nookly.work, we process your address, the content and the time of your message to answer it (Art. 6 (1) (b) or (f) GDPR). We delete the message when the matter is settled, unless a legal retention duty says otherwise.",
        ],
      },
      {
        heading: "Service providers",
        body: [
          "We have data processing agreements (Art. 28 GDPR) with the providers that process data on our behalf. Beyond that, we only pass data on when an authority lawfully requires it.",
        ],
        list: [
          "Heroku (Salesforce, Inc., USA): server and database of the sync service, in the EU region in Ireland.",
          "Scaleway SAS (Paris, France): storage for your files, in France.",
          "Resend, Inc. (USA): sending the emails, through the EU region in Ireland.",
          "Cloudflare, Inc. (USA): serving the website and DNS.",
          "GitHub, Inc. (USA): source code, downloads, desktop app updates and status data.",
        ],
      },
      {
        heading: "Transfers to other countries",
        body: [
          "Heroku, Cloudflare, Resend and GitHub belong to companies in the USA. We use their services in EU regions where the provider offers that, but access from the USA, for example for maintenance, cannot be ruled out. The transfer relies on the European Commission's adequacy decision for the EU US Data Privacy Framework where the provider is certified under it, and otherwise on EU standard contractual clauses (Art. 45 and 46 GDPR). We can give you the details on request.",
          "Because these providers belong to US companies, US authorities can demand data from them under the CLOUD Act (Clarifying Lawful Overseas Use of Data Act), even when the data sits on servers in the EU. This mainly concerns your synced content in the database at Heroku, which is not end to end encrypted. We cannot rule out such access. Scaleway is based in France and is not subject to the CLOUD Act. That is why the documents of the Files module, meaning the contents of your files, are not affected, as they are stored at Scaleway. Details about these files, such as their name and labels, are part of your synced content at Heroku. If you do not want that, use Nookly without an account or run your own sync server.",
        ],
      },
      {
        heading: "How long we keep data",
        body: ["We keep data only as long as its purpose requires."],
        list: [
          "Account and content: until you delete your account, in the app under Settings, Account. We then delete everything the account holds on the server right away, including files and their earlier versions. Your devices keep their own data.",
          "Backups: The database is backed up daily. Those backups are overwritten within 30 days. Until then, deleted data can still sit in them. We only restore from them to bring the service back after an outage.",
          "Server logs: a week at most.",
          "Emails: Resend keeps sending logs for a short time.",
        ],
      },
      {
        heading: "Your rights",
        body: [
          "You have the right to access (Art. 15 GDPR), correction (Art. 16), deletion (Art. 17), restriction of processing (Art. 18), data portability (Art. 20) and objection (Art. 21). Where we process data only on the basis of our legitimate interest, you can object at any time on grounds relating to your particular situation.",
          "You can do a lot yourself: export your content, change it and delete your account in the app. For anything else, email us at contact@nookly.work. We reply as soon as we can.",
        ],
      },
      {
        heading: "Complaints to a supervisory authority",
        body: [
          "You can complain to a data protection authority (Art. 77 GDPR), for example where you live. The one responsible for us is: Bayerisches Landesamt für Datenschutzaufsicht, Promenade 18, 91522 Ansbach, Germany, www.lda.bayern.de.",
        ],
      },
      {
        heading: "Required details, age and automated decisions",
        body: [
          "You do not have to give any data to use Nookly without an account. For an account we need a name and a password, or we cannot create it. An account is possible from the age of 18. There are no automated decisions, including profiling, under Art. 22 GDPR.",
        ],
      },
      {
        heading: "Changes",
        body: [
          "We update this policy when the service or the law changes. The version with the date above applies. For major changes that affect your rights, we tell you separately.",
        ],
      },
    ],
  },
  terms: {
    title: "Terms of service",
    updated: UPDATED,
    sections: [
      {
        heading: "Scope and provider",
        body: [
          `These terms apply between you and ${OWNER.name}, ${OWNER.street}, ${OWNER.city}, ${OWNER.region}, ${OWNER.countryEn} (we) for the Nookly sync service at sync.nookly.work and the account that comes with it.`,
          `The app as software is licensed under the [GNU Affero General Public License, version 3 (AGPL)](${pathFor("en", "license")}). It lets you use, change and share the source code, and these terms do not limit that. If you run your own sync server, these terms do not apply to it.`,
        ],
      },
      {
        heading: "The service",
        body: [
          "Nookly works fully on your device without an account. With an account you can also sync your devices, store files, edit pages together and share content with others.",
          "The sync service is free for now and in a closed beta: signing up needs a beta key. In the beta there can be errors, outages and changes.",
          "The sync service is meant for private use. Commercial or professional use is only allowed if we have expressly agreed to it beforehand. Ask us first at contact@nookly.work. This applies to the sync service only: you may also use the app and its source code commercially under the AGPL.",
        ],
      },
      {
        heading: "Your account",
        body: ["By signing up you confirm that:"],
        list: [
          "You are at least 18 years old.",
          "Your details are correct, and any email address you give is yours.",
          "You keep your password to yourself, do not pass it on and tell us if someone else has access. We never ask for your password by email.",
          "You use an account for yourself only and do not pass it on.",
          "You are responsible for everything that happens under your account, unless you are not to blame for the misuse.",
        ],
      },
      {
        heading: "Your content",
        body: [
          "Your content is yours. You give us only the simple, non transferable right to store, transmit and back it up and to show it to the people you invited, as far as the service needs that. The right ends when you delete the content or your account, apart from the backup period.",
          "You are responsible for your content and confirm that you may store and share it. We do not check it in advance.",
          "When you share something, the invited person can see and change it depending on the role. If you take the share back, their access ends, but they may keep what they already saw or copied.",
        ],
      },
      {
        heading: "Acceptable use",
        body: ["Do not use the service to"],
        list: [
          "store or share unlawful content, especially content that violates the rights of others, calls for violence or shows children in a sexual way,",
          "harass others or send them unwanted invitations and messages,",
          "disrupt or overload the service, get around protections or access other people's accounts,",
          "store large amounts of data that go beyond private use of Nookly.",
        ],
      },
      {
        heading: "What follows a violation",
        body: [
          "If you break the rules on acceptable use, we may remove content, suspend your account or end the agreement. We hear you out first, unless that is not possible because of a danger to others or to the service. Your data on your own devices stays yours in any case.",
        ],
      },
      {
        heading: "Availability and backups",
        body: [
          "We work to keep the service running reliably but cannot promise it is always available. Maintenance and faults can interrupt it for a while. The app keeps working offline meanwhile and syncs its changes later.",
          "Your data is also on your devices, but sync is not a backup. Make backups regularly (Settings, Backup) and export what matters.",
        ],
      },
      {
        heading: "Changing or ending the service",
        body: [
          "We may change or end the service for good reason, for example for technical, legal or business reasons. We announce major changes and an ending at least 30 days ahead so you can take your data with you. New fees apply only if you expressly agree to them.",
        ],
      },
      {
        heading: "Liability",
        body: [
          "We are fully liable for intent and gross negligence, for harm to life, body or health, for defects we fraudulently concealed, for a guarantee we gave and under the Product Liability Act.",
          "For slight negligence we are liable only for breaching an essential duty, meaning one you can rely on being met and without which the agreement could not sensibly be carried out, and only up to the damage that is typical for such an agreement and foreseeable. For lost data we are liable only for the effort that would have been needed even if you had made regular backups suited to the risk.",
          "The liability of our assistants is limited to the same extent. Your statutory rights for digital products (§§ 327 ff. BGB) and rules that protect you because the service is free of charge remain unaffected.",
        ],
      },
      {
        heading: "Term and ending",
        body: [
          "The agreement runs for an unlimited time. You can end it at any time by deleting your account in the app or by writing to us.",
          "We can end it with 30 days' notice. Either side's right to end it without notice for good cause stays unaffected, for example after serious or repeated violations of the rules on acceptable use.",
          "When the agreement ends, we delete your account and its data as the privacy policy describes. If we end it, you can back up your data from your devices during the notice period. The devices keep their local data.",
        ],
      },
      {
        heading: "Changes to these terms",
        body: [
          "We may change these terms for the future if there is good reason, such as a new feature, a change in the law or a court ruling, and the change does not put you at an unreasonable disadvantage. We tell you at least six weeks ahead by email or in the app. Until then you can object or end the agreement. If you do not object, the new terms apply, which we point out in the notice.",
          "Changes that shift the balance between what you get and what you give, such as a fee, need your express consent.",
        ],
      },
      {
        heading: "Name and trademark",
        body: [
          'The AGPL gives you rights in the source code, but not in the name "Nookly" and the logo. We keep all rights to them. You may not use them in a way that suggests an offer comes from us or is backed by us.',
        ],
      },
      {
        heading: "Communication and support",
        body: [
          "We reach you by email at your account's address or in the app. If you have not given an email address, you learn what matters in the app as soon as you open it. You can reach us at contact@nookly.work.",
        ],
      },
      {
        heading: "Reporting unlawful content",
        body: [
          "If you think something in the service is unlawful, write to contact@nookly.work. Tell us where to find it, why it is unlawful, and your name and email address. We look into the report promptly and tell you and the person concerned the result.",
        ],
      },
      {
        heading: "Third party services",
        body: [
          "If you connect Nookly to third party services, such as Moodle, Google Calendar or iCloud, their terms apply. We are not responsible for those services. Nookly is not affiliated with Moodle, Google or Apple and is neither run nor endorsed by them. Nookly only reads from them and changes nothing there. Apple is not a party to these terms and is not responsible for the app or its support.",
        ],
      },
      {
        heading: "Final terms",
        body: [
          "German law applies, excluding the UN Convention on Contracts for the International Sale of Goods. Mandatory consumer protection rules of the country where you live remain unaffected. For dispute resolution see the imprint.",
          "If one clause is invalid, the rest still holds and the statutory rule applies instead (§ 306 BGB). The German version is the binding one.",
        ],
      },
    ],
  },
} satisfies Record<LegalPage, LegalDoc>;

export function legal(locale: Locale, page: LegalPage): LegalDoc {
  return (locale === "de" ? de : en)[page];
}
