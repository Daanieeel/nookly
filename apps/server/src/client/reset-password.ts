/// The reset password page's one script, bundled and served by `pages.ts`. It only adds to
/// the form: the page works without it, and the server checks everything again.
import { passwordStrength } from "@nookly/shared/password-strength";

const form = document.querySelector<HTMLFormElement>("form");
const password = document.querySelector<HTMLInputElement>("#password");
const repeat = document.querySelector<HTMLInputElement>("#repeat");
const meter = document.querySelector<HTMLElement>("#meter");
const word = document.querySelector<HTMLElement>("#meter-word");
const problem = document.querySelector<HTMLElement>("#problem");
const hint = document.querySelector<HTMLElement>("#hint");

function showStrength() {
  if (!password || !meter || !word) return;
  const strength = passwordStrength(password.value);
  meter.hidden = !strength;
  if (!strength) return;
  // The same four bars as the app: one filled at the weakest.
  const filled = Math.max(1, strength.score);
  meter.dataset.score = String(strength.score);
  meter.setAttribute("aria-valuenow", String(strength.score));
  meter.setAttribute("aria-valuetext", strength.label);
  meter.querySelectorAll(".bar").forEach((bar, index) => {
    bar.classList.toggle("on", index < filled);
  });
  word.textContent = strength.label;
}

function showProblem(message: string) {
  const text = problem?.querySelector("span");
  if (!problem || !text) return;
  text.textContent = message;
  problem.hidden = false;
  if (hint) hint.hidden = true;
}

password?.addEventListener("input", showStrength);
form?.addEventListener("submit", (event) => {
  if (password && repeat && password.value !== repeat.value) {
    event.preventDefault();
    showProblem("The passwords don't match.");
    repeat.focus();
  }
});
