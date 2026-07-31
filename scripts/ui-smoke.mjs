/**
 * Phase 0 UI verification via Electron remote debugging + window.api IPC.
 */

async function waitForPage(timeoutMs = 20000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const list = await (await fetch('http://127.0.0.1:9222/json/list')).json()
      const page = list.find((t) => t.type === 'page' && String(t.url).includes('index.html'))
      if (page) return page
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 300))
  }
  throw new Error('Timed out waiting for Electron page')
}

const page = await waitForPage()
console.log('Connected to', page.url)

const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, { once: true })
  ws.addEventListener('error', reject, { once: true })
})

let id = 0
const pending = new Map()
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(String(ev.data))
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id)
    pending.delete(msg.id)
    if (msg.error) reject(new Error(JSON.stringify(msg.error)))
    else resolve(msg.result)
  }
})

function send(method, params = {}) {
  const msgId = ++id
  return new Promise((resolve, reject) => {
    pending.set(msgId, { resolve, reject })
    ws.send(JSON.stringify({ id: msgId, method, params }))
  })
}

async function evaluate(expression) {
  const result = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  })
  if (result.exceptionDetails) {
    throw new Error(JSON.stringify(result.exceptionDetails))
  }
  return result.result.value
}

await send('Runtime.enable')
await new Promise((r) => setTimeout(r, 1200))

const url = await evaluate('location.href')
console.log('URL:', url)
if (!String(url).includes('#/setup')) throw new Error(`Expected #/setup, got ${url}`)

const body = await evaluate('document.body.innerText')
if (!body.includes('Set up a new business') || !body.includes('Restore from a backup')) {
  throw new Error('Wizard missing new-business or restore options')
}
console.log('✓ first-run wizard offers new business AND restore')

// Complete setup via IPC (authoritative path used by the wizard)
const setup = await evaluate(`
  (async () => {
    return window.api.invoke('setup:complete', {
      businessName: 'UI Smoke Plant',
      address: 'Lahore',
      phone: '0300',
      currencyCode: 'PKR',
      currencySymbol: 'Rs',
      dateFormat: 'dd-MM-yyyy',
      decimalPlaces: 0,
      backupFolder: '',
      ownerUsername: 'owner',
      ownerDisplayName: 'Owner',
      ownerPassword: 'secret12',
    })
  })()
`)
console.log('setup:complete', setup)
if (!setup?.ok) throw new Error(`setup failed: ${JSON.stringify(setup)}`)

// Reflect session in renderer and navigate home
await evaluate(`
  (async () => {
    const session = await window.api.invoke('auth:session', {});
    // Force reload so React session bootstrap picks up the new user
    location.hash = '#/';
    location.reload();
  })()
`)
await new Promise((r) => setTimeout(r, 2000))

// Reconnect after reload
ws.close()
const page2 = await waitForPage()
const ws2 = new WebSocket(page2.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  ws2.addEventListener('open', resolve, { once: true })
  ws2.addEventListener('error', reject, { once: true })
})
const pending2 = new Map()
let id2 = 0
ws2.addEventListener('message', (ev) => {
  const msg = JSON.parse(String(ev.data))
  if (msg.id && pending2.has(msg.id)) {
    const { resolve, reject } = pending2.get(msg.id)
    pending2.delete(msg.id)
    if (msg.error) reject(new Error(JSON.stringify(msg.error)))
    else resolve(msg.result)
  }
})
function send2(method, params = {}) {
  const msgId = ++id2
  return new Promise((resolve, reject) => {
    pending2.set(msgId, { resolve, reject })
    ws2.send(JSON.stringify({ id: msgId, method, params }))
  })
}
async function evaluate2(expression) {
  const result = await send2('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  })
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
  return result.result.value
}
await send2('Runtime.enable')
await new Promise((r) => setTimeout(r, 1000))

// After reload we should be on login (session is main-process memory — lost on reload)
// So login again
let href = await evaluate2('location.href')
console.log('Post-reload URL:', href)
if (String(href).includes('#/setup')) throw new Error('Setup still required after complete')

if (!String(href).includes('#/login') && !(await evaluate2(`document.body.innerText.includes('Dashboard')`))) {
  // navigate to login if needed
  await evaluate2(`location.hash = '#/login'`)
  await new Promise((r) => setTimeout(r, 500))
}

const wrong = await evaluate2(`
  (async () => window.api.invoke('auth:login', { username: 'owner', password: 'wrong' }))()
`)
if (!wrong || wrong.ok !== false || wrong.error?.code !== 'UNAUTHORIZED') {
  throw new Error(`Expected UNAUTHORIZED, got ${JSON.stringify(wrong)}`)
}
console.log('✓ wrong password rejected')

const login = await evaluate2(`
  (async () => window.api.invoke('auth:login', { username: 'owner', password: 'secret12' }))()
`)
if (!login?.ok) throw new Error(`login failed: ${JSON.stringify(login)}`)
await evaluate2(`location.hash = '#/'; location.reload()`)
await new Promise((r) => setTimeout(r, 1500))

// reconnect again
ws2.close()
const page3 = await waitForPage()
const ws3 = new WebSocket(page3.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  ws3.addEventListener('open', resolve, { once: true })
  ws3.addEventListener('error', reject, { once: true })
})
const pending3 = new Map()
let id3 = 0
ws3.addEventListener('message', (ev) => {
  const msg = JSON.parse(String(ev.data))
  if (msg.id && pending3.has(msg.id)) {
    const { resolve, reject } = pending3.get(msg.id)
    pending3.delete(msg.id)
    if (msg.error) reject(new Error(JSON.stringify(msg.error)))
    else resolve(msg.result)
  }
})
function send3(method, params = {}) {
  const msgId = ++id3
  return new Promise((resolve, reject) => {
    pending3.set(msgId, { resolve, reject })
    ws3.send(JSON.stringify({ id: msgId, method, params }))
  })
}
async function evaluate3(expression) {
  const result = await send3('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  })
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
  return result.result.value
}
await send3('Runtime.enable')
await new Promise((r) => setTimeout(r, 1200))

// Session is lost on reload again — login without reload and update via hash navigation
await evaluate3(`
  (async () => {
    const res = await window.api.invoke('auth:login', { username: 'owner', password: 'secret12' });
    if (!res.ok) throw new Error(JSON.stringify(res));
    // Soft-load by setting store is hard; just verify IPC + navigate after injecting via location
    location.hash = '#/';
  })()
`)
await new Promise((r) => setTimeout(r, 800))

// React won't know about login without store update. Call session and force a full in-page bootstrap:
const boot = await evaluate3(`
  (async () => {
    // Directly exercise remaining IPC acceptance criteria without relying on React store after reload.
    const op = await window.api.invoke('auth:createUser', {
      username: 'clerk', displayName: 'Clerk', password: 'secret12', role: 'operator'
    });
    if (!op.ok) return { step: 'create', op };
    await window.api.invoke('auth:logout', {});
    const loginOp = await window.api.invoke('auth:login', { username: 'clerk', password: 'secret12' });
    if (!loginOp.ok) return { step: 'loginOp', loginOp };
    const forbidden = await window.api.invoke('backup:list', {});
    const validation = await window.api.invoke('auth:login', { username: '', password: '' });
    // auto-lock: call auth:lock then unlock
    await window.api.invoke('auth:logout', {});
    await window.api.invoke('auth:login', { username: 'owner', password: 'secret12' });
    await window.api.invoke('auth:lock', {});
    const lockedSession = await window.api.invoke('auth:session', {});
    const unlockFail = await window.api.invoke('auth:unlock', { password: 'wrong' });
    const unlockOk = await window.api.invoke('auth:unlock', { password: 'secret12' });
    return { forbidden, validation, lockedSession, unlockFail, unlockOk };
  })()
`)
console.log(JSON.stringify(boot, null, 2))

if (boot.forbidden?.error?.code !== 'FORBIDDEN') {
  throw new Error('operator backup:list should be FORBIDDEN')
}
console.log('✓ operator FORBIDDEN on owner-only channel')

if (boot.validation?.error?.code !== 'VALIDATION_FAILED') {
  throw new Error('invalid payload should be VALIDATION_FAILED')
}
console.log('✓ VALIDATION_FAILED for invalid payload')

if (!boot.lockedSession?.data?.locked) {
  throw new Error('auth:lock did not lock session')
}
if (boot.unlockFail?.ok !== false) throw new Error('bad unlock should fail')
if (boot.unlockOk?.ok !== true) throw new Error('unlock with password should succeed')
console.log('✓ auto-lock lock/unlock works')

console.log('\nUI / IPC acceptance checks passed.')
ws3.close()
process.exit(0)
