// Deterministic brand-name → env-var-suffix converter.
//
// Rules:
//   1. Trim, then collapse non-alphanumeric runs into spaces.
//   2. Split on whitespace.
//   3. Single word → uppercase the entire word.
//      Multiple words → take the first character of each, uppercased.
//   4. Strip anything that isn't [A-Z0-9] (defensive).
//   5. Truncate to 10 characters.
//
// Examples (from spec):
//   'The Wedding Minimalist'     → 'TWM'
//   'Rahul Saharan Photography'  → 'RSP'
//   'Auramist'                   → 'AURAMIST'
//   'Revaah Decor'               → 'RD'
//   'The Bride Side'             → 'TBS'
//
// Edge cases:
//   ''                           → ''
//   'Brand-Name'                 → 'BN'   (hyphen → space → 2 words)
//   'Brand 2.0'                  → 'B20'  (numeric word kept; dot stripped)
//   'A B C D E F G H I J K'      → 'ABCDEFGHIJ' (truncated at 10)
//
// Pure / isomorphic — safe to import on the server and the client.
export function brandToEnvKey(name: string): string {
  if (!name) return '';
  const stripped = name.replace(/[^A-Za-z0-9\s]+/g, ' ').trim();
  if (!stripped) return '';
  const words = stripped.split(/\s+/);
  const raw = words.length === 1
    ? words[0].toUpperCase()
    : words.map((w) => w[0]).join('').toUpperCase();
  return raw.replace(/[^A-Z0-9]/g, '').slice(0, 10);
}
