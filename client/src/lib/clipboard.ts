export function copyText(text: string, onDone: () => void): void {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(onDone).catch(() => copyFallback(text, onDone));
  } else {
    copyFallback(text, onDone);
  }
}

function copyFallback(text: string, onDone: () => void): void {
  const ta = document.createElement("textarea");
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand("copy");
  } catch {
    // ignore
  }
  document.body.removeChild(ta);
  onDone();
}
