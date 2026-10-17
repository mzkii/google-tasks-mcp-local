// CLI メッセージの日英切り替え。ロケールが ja で始まれば日本語、それ以外は英語
function isJapanese(): boolean {
  const env = process.env.LC_ALL || process.env.LC_MESSAGES || process.env.LANG;
  if (env) return env.toLowerCase().startsWith("ja");
  return Intl.DateTimeFormat().resolvedOptions().locale.toLowerCase().startsWith("ja");
}

const ja = isJapanese();

export function t(japanese: string, english: string): string {
  return ja ? japanese : english;
}
