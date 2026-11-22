import { type OptionsType, ZxcvbnFactory } from "@zxcvbn-ts/core";
import * as zxcvbnCommonPackage from "@zxcvbn-ts/language-common";
import * as zxcvbnEnPackage from "@zxcvbn-ts/language-en";

/// How strong a password is, by zxcvbn's score (the standard way to guess it, from Dropbox):
/// the guesses a cracker would need, counting common words, names, keyboard patterns, dates
/// and l33t spellings, not "has a capital letter". It only advises: no password is refused for
/// its score.
export interface PasswordStrength {
  /// 0 (guessed at once) to 4 (very unlikely to be guessed).
  score: 0 | 1 | 2 | 3 | 4;
  label: "Very weak" | "Weak" | "Fair" | "Good" | "Strong";
}

const LABELS = ["Very weak", "Weak", "Fair", "Good", "Strong"] as const;

/// zxcvbn gets slow on very long input, and a password past this length is strong anyway.
const MAX_LENGTH = 72;

const options: OptionsType = {
  translations: zxcvbnEnPackage.translations,
  graphs: zxcvbnCommonPackage.adjacencyGraphs,
  dictionary: { ...zxcvbnCommonPackage.dictionary, ...zxcvbnEnPackage.dictionary },
};

let zxcvbn: ZxcvbnFactory | null = null;

/// The strength of `password`, or null while there is none to rate. `userInputs` are words
/// that make it easier to guess for whoever knows the person (their name, their email).
export function passwordStrength(
  password: string,
  userInputs: readonly string[] = [],
): PasswordStrength | null {
  if (password === "") return null;
  zxcvbn ??= new ZxcvbnFactory(options);
  const { score } = zxcvbn.check(password.slice(0, MAX_LENGTH), [...userInputs]);
  return { score, label: LABELS[score] };
}
