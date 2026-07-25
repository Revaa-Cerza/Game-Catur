/**
 * pgn.js — PGN export and import.
 *
 * Export writes the Seven Tag Roster plus movetext wrapped at 80 columns.
 * Import is tolerant: it strips comments ({...} and ;...), nested variations,
 * NAGs ($n), move numbers and result tokens, then returns SAN tokens for the
 * game controller to replay (which validates every move).
 */

/**
 * @param {object} args
 * @param {Record<string,string>} args.headers — extra/overriding PGN tags.
 * @param {string[]} args.sans — SAN moves in order.
 * @param {string} args.result — "1-0", "0-1", "1/2-1/2" or "*".
 */
export function exportPgn({ headers = {}, sans, result = "*" }) {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const tags = {
    Event: "Casual game",
    Site: "ChessMaster (offline)",
    Date: `${now.getFullYear()}.${pad(now.getMonth() + 1)}.${pad(now.getDate())}`,
    Round: "1",
    White: "White",
    Black: "Black",
    Result: result,
    ...headers,
  };

  let out = "";
  for (const [key, value] of Object.entries(tags)) {
    out += `[${key} "${String(value).replace(/["\\]/g, "\\$&")}"]\n`;
  }
  out += "\n";

  const tokens = [];
  sans.forEach((san, i) => {
    if (i % 2 === 0) tokens.push(`${i / 2 + 1}.`);
    tokens.push(san);
  });
  tokens.push(result);

  let line = "";
  for (const token of tokens) {
    if (line && line.length + token.length + 1 > 80) {
      out += line + "\n";
      line = token;
    } else {
      line = line ? line + " " + token : token;
    }
  }
  if (line) out += line + "\n";
  return out;
}

/** Remove (possibly nested) parenthesised variations. */
function stripVariations(text) {
  let out = "";
  let depth = 0;
  for (const ch of text) {
    if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    else if (depth === 0) out += ch;
  }
  return out;
}

const RESULT_TOKENS = new Set(["1-0", "0-1", "1/2-1/2", "*"]);

/**
 * Parse PGN text (a single game).
 * @returns {{ headers: Record<string,string>, sans: string[], result: string }}
 */
export function importPgn(text) {
  const headers = {};
  const headerRe = /\[\s*(\w+)\s+"((?:[^"\\]|\\.)*)"\s*\]/g;
  let match;
  while ((match = headerRe.exec(text)) !== null) {
    headers[match[1]] = match[2].replace(/\\(["\\])/g, "$1");
  }

  let movetext = text
    .replace(headerRe, " ")
    .replace(/\{[^}]*\}/g, " ") // block comments
    .replace(/;[^\n]*/g, " "); // line comments
  movetext = stripVariations(movetext)
    .replace(/\$\d+/g, " ") // NAGs
    .replace(/\d+\.(\.\.)?/g, " ") // move numbers ("12." / "12...")
    .replace(/\.\.\./g, " ");

  const sans = [];
  let result = headers.Result && RESULT_TOKENS.has(headers.Result) ? headers.Result : "*";
  for (const token of movetext.split(/\s+/)) {
    if (!token) continue;
    if (RESULT_TOKENS.has(token)) {
      result = token;
      continue;
    }
    sans.push(token);
  }
  if (sans.length === 0) throw new Error("No moves found in PGN");
  return { headers, sans, result };
}
