// Main-process memory only: renderer reloads and window recreation retain the visit.
// A new application process starts a fresh session.
let entered = false

export function claimCdStartupEntry(): { firstEntry: boolean } {
  const firstEntry = !entered
  entered = true
  return { firstEntry }
}
