// Simple in-memory ring buffer for runtime logs (survives per instance).
const MAX = 500
const buf: string[] = []

const origLog = console.log.bind(console)
const origErr = console.error.bind(console)
const origWarn = console.warn.bind(console)

function push(line: string) {
  const ts = new Date().toISOString()
  buf.push(`${ts} ${line}`)
  if (buf.length > MAX) buf.shift()
}

console.log = (...args: any[]) => { push(args.map(String).join(' ')); origLog(...args) }
console.error = (...args: any[]) => { push('ERROR: ' + args.map(String).join(' ')); origErr(...args) }
console.warn = (...args: any[]) => { push('WARN: ' + args.map(String).join(' ')); origWarn(...args) }

export function logLine(line: string) { push(line) }
export function getLogs(): string[] { return [...buf] }
