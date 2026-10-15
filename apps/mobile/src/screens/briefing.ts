/// The sentence at the top of the Dashboard: what the day holds, said plainly.

export interface BriefingInputs {
  name: string;
  now?: Date;
  sessionsToday: number;
  entriesToday: number;
  tasksDue: number;
  tasksOverdue: number;
  deadlines: number;
  cardsDue: number;
  jotsToRefine: number;
}

export function greetingFor(now: Date, name: string): string {
  const hour = now.getHours();
  const part =
    hour < 5
      ? "Still up"
      : hour < 12
        ? "Good morning"
        : hour < 18
          ? "Good afternoon"
          : "Good evening";
  return name.trim() ? `${part}, ${name.trim()}` : part;
}

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function join(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/// "Good morning, Ada. Today you have 2 sessions and 3 tasks due, 1 overdue, and 12 cards to study."
export interface Briefing {
  greeting: string;
  text: string;
}

export function briefing(input: BriefingInputs): Briefing {
  const greeting = greetingFor(input.now ?? new Date(), input.name);
  const today: string[] = [];
  if (input.sessionsToday > 0) today.push(count(input.sessionsToday, "session"));
  if (input.entriesToday > 0) today.push(count(input.entriesToday, "event"));
  if (input.tasksDue > 0) today.push(`${count(input.tasksDue, "task")} due`);
  const also: string[] = [];
  if (input.tasksOverdue > 0) also.push(`${input.tasksOverdue} overdue`);
  if (input.deadlines > 0)
    also.push(count(input.deadlines, "exam or assignment", "exams and assignments") + " coming up");
  if (input.cardsDue > 0) also.push(`${count(input.cardsDue, "card")} to study`);
  if (input.jotsToRefine > 0) also.push(`${count(input.jotsToRefine, "jot")} to refine`);
  if (today.length === 0 && also.length === 0) {
    return { greeting, text: "Nothing is on your plate today." };
  }
  const sentences: string[] = [];
  if (today.length > 0) sentences.push(`Today you have ${join(today)}.`);
  if (also.length > 0) sentences.push(`${today.length > 0 ? "Also" : "There are"} ${join(also)}.`);
  return { greeting, text: sentences.join(" ") };
}
