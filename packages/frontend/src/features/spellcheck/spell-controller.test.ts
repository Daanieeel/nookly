import { beforeEach, describe, expect, it, vi } from "vitest";
import { settings } from "#/lib/settings/settings.ts";
import { type SpellApi, createSpellController } from "./spell-controller";

function api(over: Partial<SpellApi> = {}): SpellApi & { configured: string[][]; added: string[] } {
  const configured: string[][] = [];
  const added: string[] = [];
  return {
    configured,
    added,
    configure: async (languages) => {
      configured.push(languages);
      return languages;
    },
    check: async (words) => words.map((w) => w !== "wrong"),
    suggest: async () => ["right"],
    ignore: async () => {},
    addWord: async (word) => {
      added.push(word);
    },
    reloadWords: async () => false,
    ...over,
  };
}

beforeEach(() => {
  settings.reset("notes.spellcheck");
  settings.reset("notes.spellcheckLanguages");
});

describe("the spell checker is off until it is turned on", () => {
  it("does nothing while the setting is off", async () => {
    const backend = api();
    const controller = createSpellController(backend);
    expect(controller.enabled()).toBe(false);
    expect(await controller.check(["wrong"])).toEqual([true]);
    expect(backend.configured).toEqual([]);
    controller.dispose();
  });

  it("starts checking when it is turned on, with the languages chosen", async () => {
    const backend = api();
    const controller = createSpellController(backend);
    const changed = vi.fn();
    controller.subscribe(changed);
    settings.set("notes.spellcheckLanguages", ["en", "de"]);
    settings.set("notes.spellcheck", true);
    await vi.waitFor(() => expect(changed).toHaveBeenCalled());
    expect(controller.enabled()).toBe(true);
    expect(backend.configured.at(-1)).toEqual(["en", "de"]);
    expect(await controller.check(["wrong", "fine"])).toEqual([false, true]);
    controller.dispose();
  });

  it("is on from the start when it was left on", async () => {
    settings.set("notes.spellcheck", true);
    const backend = api();
    const controller = createSpellController(backend);
    expect(controller.enabled()).toBe(true);
    expect(await controller.check(["wrong"])).toEqual([false]);
    expect(backend.configured).toHaveLength(1);
    controller.dispose();
  });
});

describe("a change of settings", () => {
  it("is passed on to the backend and to whoever is listening", async () => {
    settings.set("notes.spellcheck", true);
    const backend = api();
    const controller = createSpellController(backend);
    await controller.check([]);
    const changed = vi.fn();
    controller.subscribe(changed);
    settings.set("notes.spellcheckLanguages", ["de"]);
    await vi.waitFor(() => expect(changed).toHaveBeenCalledTimes(1));
    expect(backend.configured.at(-1)).toEqual(["de"]);
    controller.dispose();
  });

  it("is told to a listener that unsubscribed no more", async () => {
    settings.set("notes.spellcheck", true);
    const controller = createSpellController(api());
    const changed = vi.fn();
    const stop = controller.subscribe(changed);
    stop();
    settings.set("notes.spellcheckLanguages", ["de"]);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(changed).not.toHaveBeenCalled();
    controller.dispose();
  });
});

describe("words", () => {
  it("adds a word to the dictionary file through the backend, and tells the listeners", async () => {
    settings.set("notes.spellcheck", true);
    const backend = api();
    const controller = createSpellController(backend);
    await controller.check([]);
    const changed = vi.fn();
    controller.subscribe(changed);
    await controller.addWord("Nookly");
    await controller.addWord("   ");
    expect(backend.added).toEqual(["Nookly"]);
    expect(changed).toHaveBeenCalledTimes(1);
    controller.dispose();
  });

  it("does not tell the listeners when the word could not be saved", async () => {
    settings.set("notes.spellcheck", true);
    const controller = createSpellController(
      api({
        addWord: async () => {
          throw new Error("dictionary.json can't be read");
        },
      }),
    );
    await controller.check([]);
    const changed = vi.fn();
    controller.subscribe(changed);
    await expect(controller.addWord("Nookly")).rejects.toThrow("can't be read");
    expect(changed).not.toHaveBeenCalled();
    controller.dispose();
  });

  it("reads the dictionary file again when the window comes back, and says when it changed", async () => {
    settings.set("notes.spellcheck", true);
    let changedOnDisk = false;
    const backend = api({ reloadWords: async () => changedOnDisk });
    const controller = createSpellController(backend);
    await controller.check([]);
    const changed = vi.fn();
    controller.subscribe(changed);
    window.dispatchEvent(new Event("focus"));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(changed).not.toHaveBeenCalled();
    changedOnDisk = true;
    window.dispatchEvent(new Event("focus"));
    await vi.waitFor(() => expect(changed).toHaveBeenCalledTimes(1));
    controller.dispose();
    window.dispatchEvent(new Event("focus"));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it("does not look at the dictionary file while it is off", async () => {
    const reloadWords = vi.fn(async () => true);
    const controller = createSpellController(api({ reloadWords }));
    window.dispatchEvent(new Event("focus"));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(reloadWords).not.toHaveBeenCalled();
    controller.dispose();
  });

  it("ignores a word for now and tells the listeners", async () => {
    settings.set("notes.spellcheck", true);
    const ignore = vi.fn(async () => {});
    const controller = createSpellController(api({ ignore }));
    const changed = vi.fn();
    controller.subscribe(changed);
    await controller.ignore("Nookly");
    expect(ignore).toHaveBeenCalledWith("Nookly");
    expect(changed).toHaveBeenCalled();
    controller.dispose();
  });

  it("suggests", async () => {
    settings.set("notes.spellcheck", true);
    const controller = createSpellController(api());
    expect(await controller.suggest("wrng")).toEqual(["right"]);
    controller.dispose();
  });

  it("finds nothing wrong when the backend cannot answer", async () => {
    settings.set("notes.spellcheck", true);
    const controller = createSpellController(
      api({
        check: async () => {
          throw new Error("no backend");
        },
      }),
    );
    expect(await controller.check(["wrong"])).toEqual([true]);
    controller.dispose();
  });
});

describe("the settings that go with the spell checker", () => {
  it("fall back to safe values for what is stored wrong", () => {
    // SAFETY: wrong values on purpose, as a hand edited settings file can hold them.
    settings.set("notes.spellcheckLanguages", ["de", "tlh", "de"] as never);
    expect(settings.get("notes.spellcheckLanguages")).toEqual(["en"]);
    // SAFETY: wrong value on purpose.
    settings.set("notes.spellcheck", "yes" as never);
    expect(settings.get("notes.spellcheck")).toBe(false);
  });
});
