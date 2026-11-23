// Turns a spell's Description_lang into the text the game shows, for the "Use:" line of crafted items.
// Pure: the tables come in through `spells`, so it can be tested without the client data.

// Food and drink auras (84 heal, 85 mana) have no tick period in the data and tick every 5 sec in the game:
// Charred Wolf Meat's 17 per tick over 18 sec is the 61 health the game shows.
const DEFAULT_PERIOD = 5000;
const MAX_DEPTH = 4;

const HOUR = 3600000;
const MINUTE = 60000;
const SECOND = 1000;

const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;

// Milliseconds as the game writes a duration: "2 hours", "30 min", "1 min 30 sec", "15 sec". Null for none.
export const formatDuration = (ms) => {
  if (!(ms > 0)) {
    return null;
  }
  if (ms % HOUR === 0) {
    return plural(ms / HOUR, "hour");
  }
  if (ms >= HOUR) {
    return `${plural(Math.floor(ms / HOUR), "hour")} ${Math.round((ms % HOUR) / MINUTE)} min`;
  }
  if (ms % MINUTE === 0) {
    return `${ms / MINUTE} min`;
  }
  if (ms > MINUTE) {
    return `${Math.floor(ms / MINUTE)} min ${Math.round((ms % MINUTE) / SECOND)} sec`;
  }
  return `${Math.round((ms / SECOND) * 10) / 10} sec`;
};

const formatNumber = (value) => String(Math.round(Math.abs(value) * 10) / 10);

// Evaluates + - * / and parentheses over numbers. Anything else throws.
export const evaluate = (text) => {
  let pos = 0;
  const skip = () => {
    while (text[pos] === " ") {
      pos += 1;
    }
  };
  const primary = () => {
    skip();
    if (text[pos] === "(") {
      pos += 1;
      const value = sum();
      skip();
      if (text[pos] !== ")") {
        throw new Error(`expected ) in ${text}`);
      }
      pos += 1;
      return value;
    }
    if (text[pos] === "-") {
      pos += 1;
      return -primary();
    }
    const match = /^\d+(\.\d+)?/.exec(text.slice(pos));
    if (!match) {
      throw new Error(`expected a number in ${text}`);
    }
    pos += match[0].length;
    return Number(match[0]);
  };
  const product = () => {
    let value = primary();
    for (skip(); text[pos] === "*" || text[pos] === "/"; skip()) {
      const op = text[pos];
      pos += 1;
      const right = primary();
      value = op === "*" ? value * right : value / right;
    }
    return value;
  };
  const sum = () => {
    let value = product();
    for (skip(); text[pos] === "+" || text[pos] === "-"; skip()) {
      const op = text[pos];
      pos += 1;
      const right = product();
      value = op === "+" ? value + right : value - right;
    }
    return value;
  };
  const value = sum();
  skip();
  if (pos < text.length) {
    throw new Error(`unexpected ${JSON.stringify(text.slice(pos))} in ${text}`);
  }
  return value;
};

// Returns the index just after the `]` that closes the `[` at `open`, counting nested brackets.
const closeBracket = (text, open) => {
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === "[") {
      depth += 1;
    } else if (text[i] === "]") {
      depth -= 1;
      if (depth === 0) {
        return i + 1;
      }
    }
  }
  throw new Error(`unclosed [ in ${text}`);
};

/**
 * Resolves the `$` tokens of a spell description. `spells` gives, by spell id:
 * - description(id): Description_lang or undefined
 * - effect(id, index): { base, variance, period, radius } for effect index (0-based), or undefined
 * - duration(id): ms, or undefined
 * - stacks(id): max stack count, or undefined
 * Supported: $s1/$m1 (value, a range when it varies), $o1 (total over the duration), $t1 (tick seconds),
 * $d/$d1 (duration), $a1 (radius), $u/$U (stacks), all optionally with a spell id ($12345s1), $/10; and $*10;
 * scaling, ${ arithmetic }, $@spelldesc12345 (another spell's description), and $?cond[a]?cond[b][else]
 * conditionals, which take the last branch: the text for a max-level character with no special buffs.
 * Returns { text, unresolved }: tokens it couldn't resolve are left as written and listed.
 */
export const resolveDescription = (spellId, spells) => {
  const unresolved = [];

  // One value token at `pos` (just after `$`), in the context of `ownId`. Returns { value, number, end } or null.
  const readValue = (text, pos, ownId) => {
    let scale = 1;
    const scaled = /^([/*])(\d+(?:\.\d+)?);/.exec(text.slice(pos));
    if (scaled) {
      scale = scaled[1] === "*" ? Number(scaled[2]) : 1 / Number(scaled[2]);
      pos += scaled[0].length;
    }
    const match = /^(\d*)([smotdauU])(\d?)/.exec(text.slice(pos));
    if (!match) {
      return null;
    }
    const id = match[1] ? Number(match[1]) : ownId;
    const letter = match[2];
    const index = Math.max(0, Number(match[3] || 1) - 1);
    const end = pos + match[0].length;
    const effect = spells.effect(id, index);
    if (letter === "d") {
      const ms = spells.duration(id);
      const text = formatDuration(ms);
      return text === null ? null : { value: text, number: ms / SECOND, end };
    }
    if (letter === "u" || letter === "U") {
      const stacks = spells.stacks(id);
      return stacks > 0 ? { value: String(stacks), number: stacks, end } : null;
    }
    if (!effect) {
      return null;
    }
    if (letter === "s" || letter === "m") {
      const base = effect.base * scale;
      const spread = Math.abs(base) * (effect.variance || 0) / 2;
      const value = spread >= 0.5
        ? `${Math.round(Math.abs(base) - spread)} to ${Math.round(Math.abs(base) + spread)}` : formatNumber(base);
      return { value, number: Math.abs(base), end };
    }
    if (letter === "o") {
      const ms = spells.duration(id);
      if (!(ms > 0)) {
        return null;
      }
      const total = Math.abs(effect.base * scale) * (ms / (effect.period || DEFAULT_PERIOD));
      return { value: String(Math.floor(total)), number: total, end };
    }
    if (letter === "t") {
      const seconds = (effect.period || DEFAULT_PERIOD) / SECOND;
      return { value: formatNumber(seconds), number: seconds, end };
    }
    // "a": radius in yards.
    return effect.radius > 0 ? { value: formatNumber(effect.radius), number: effect.radius, end } : null;
  };

  const resolve = (text, ownId, depth) => {
    let out = "";
    let pos = 0;
    while (pos < text.length) {
      const next = text.indexOf("$", pos);
      if (next === -1) {
        out += text.slice(pos);
        break;
      }
      out += text.slice(pos, next);
      pos = next + 1;
      const rest = text.slice(pos);
      const embed = /^@spelldesc(\d+)/.exec(rest);
      if (embed) {
        const id = Number(embed[1]);
        const description = spells.description(id);
        if (description === undefined || depth >= MAX_DEPTH) {
          unresolved.push(`$${embed[0]}`);
          out += `$${embed[0]}`;
        } else {
          out += resolve(description, id, depth + 1);
        }
        pos += embed[0].length;
        continue;
      }
      if (rest.startsWith("?")) {
        // $?cond[a]?cond[b][else]: skip every condition and its branch, keep the last bracket (else) if any.
        let at = pos + 1;
        let chosen = "";
        for (;;) {
          const open = text.indexOf("[", at);
          if (open === -1) {
            throw new Error(`conditional without a branch in ${text}`);
          }
          const close = closeBracket(text, open);
          if (text[close] === "?") {
            at = close + 1;
          } else if (text[close] === "[") {
            const end = closeBracket(text, close);
            chosen = text.slice(close + 1, end - 1);
            pos = end;
            break;
          } else {
            pos = close;
            break;
          }
        }
        out += resolve(chosen, ownId, depth);
        continue;
      }
      if (rest.startsWith("{")) {
        const end = text.indexOf("}", pos);
        if (end === -1) {
          unresolved.push(text.slice(pos - 1));
          out += text.slice(pos - 1);
          break;
        }
        const expression = text.slice(pos + 1, end);
        let failed = false;
        const numeric = expression.replace(/\$/g, "\u0000").split("\u0000").map((part, i) => {
          if (i === 0) {
            return part;
          }
          const value = readValue(part, 0, ownId);
          if (!value) {
            failed = true;
            return part;
          }
          return `${value.number}${part.slice(value.end)}`;
        }).join("");
        if (failed) {
          unresolved.push(`\${${expression}}`);
          out += `\${${expression}}`;
        } else {
          out += String(Math.floor(evaluate(numeric)));
        }
        pos = end + 1;
        continue;
      }
      const value = readValue(text, pos, ownId);
      if (value) {
        out += value.value;
        pos = value.end;
      } else {
        const token = /^\S*/.exec(rest)[0] || "$";
        unresolved.push(`$${token}`);
        out += "$";
      }
    }
    return out;
  };

  const description = spells.description(spellId) ?? "";
  const text = resolve(description, spellId, 0)
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/ {2,}/g, " ")
    .trim();
  return { text, unresolved };
};
