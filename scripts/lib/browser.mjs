/**
 * A real browser, driven from Node, with no dependencies.
 *
 * ## Why this exists
 *
 * Everything in this app that can be checked as a number already is —
 * `verify-orbits`, `verify-bodies`, `verify-spacecraft` and the rest run the
 * pure modules headlessly and assert against JPL. What none of them can reach is
 * the half of the app that only exists once a frame has been drawn: anything
 * written from `useFrame`, every shader uniform, the position registry, the
 * camera's actual arrival, and whether a trail is on screen at all.
 *
 * The in-app preview pane cannot reach it either, and the reason is worth
 * stating exactly, because it looks like a bug in the app and is not. A hidden
 * or backgrounded tab has `requestAnimationFrame` throttled to zero by the
 * browser. React renders, the DOM updates, screenshots come back — and the
 * render loop never runs, so the canvas stays at whatever it last drew, which
 * on a cold load is black. Probing `__solar.fleet()` there reports three craft
 * shown and none positioned: React mounted them, `useFrame` never fired.
 *
 * So the fix is not to work around the pane, it is to use a browser whose
 * frames actually run. Headless Chrome does run rAF — its compositor drives
 * BeginFrame the same way a visible window does — and it is already installed.
 *
 * ## Why not Playwright
 *
 * It would be nicer to write against, and it is one `npm i` away. But this app
 * has no test dependencies at all — the entire `devDependencies` list is Vite
 * and its React plugin — and the whole verification suite is plain Node scripts
 * against the real modules. A 150 MB browser download to press buttons on a
 * browser that is already on the machine is a poor trade for that. CDP over the
 * WebSocket that Node 22+ ships natively is about a hundred lines, and those
 * hundred lines are the ones below.
 */

import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

/**
 * Chrome's flags, and the two that matter.
 *
 * `--headless=new` is the modern headless mode rather than the old one: the old
 * mode was a separate, cut-down browser with no GPU path at all, and WebGL under
 * it either failed outright or fell back to a software rasteriser that renders
 * nothing this app draws. The new mode is the same browser without a window.
 *
 * `--use-angle=metal` because macOS is the platform this runs on, and the
 * SwiftShader fallback is both slow enough to matter at 60 fps and different
 * enough from a real GPU that a shader bug could pass here and fail on screen.
 * `--enable-unsafe-swiftshader` stays as the last resort so a machine without a
 * usable GPU still gets *a* picture rather than a hard failure; the "unsafe" is
 * about running untrusted content, which this is not.
 */
const FLAGS = [
  '--headless=new',
  '--use-angle=metal',
  '--enable-unsafe-swiftshader',
  '--hide-scrollbars',
  '--mute-audio',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-extensions',
  '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows',
]

/** Minimal CDP client: send a method, await its result, dispatch events. */
class Connection {
  constructor(socket) {
    this.socket = socket
    this.nextId = 1
    this.pending = new Map()
    this.listeners = new Map()

    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data)

      if (message.id !== undefined) {
        const waiter = this.pending.get(message.id)
        if (!waiter) return
        this.pending.delete(message.id)
        if (message.error) waiter.reject(new Error(message.error.message))
        else waiter.resolve(message.result)
        return
      }

      for (const fn of this.listeners.get(message.method) ?? []) fn(message.params)
    })
  }

  send(method, params = {}, sessionId) {
    const id = this.nextId++
    const payload = { id, method, params }
    if (sessionId) payload.sessionId = sessionId
    this.socket.send(JSON.stringify(payload))
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }))
  }

  on(method, fn) {
    const list = this.listeners.get(method) ?? []
    list.push(fn)
    this.listeners.set(method, list)
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * The port Chrome actually chose, read from its profile.
 *
 * `--remote-debugging-port=0` asks the OS for a free port and Chrome writes the
 * result to `DevToolsActivePort` in the user-data-dir. A fixed port is the
 * obvious alternative and it is a trap: kill a run mid-flight — a test timeout,
 * a Ctrl-C — and `close()` never executes, so that Chrome keeps running and
 * keeps the port. The next run then cannot bind it, silently attaches to the
 * *old* browser instead, and hangs on a page that is not the one it just asked
 * for. Ephemeral ports and a fresh profile per run make that impossible rather
 * than merely unlikely.
 */
async function devToolsUrl(profile) {
  const path = join(profile, 'DevToolsActivePort')
  for (let i = 0; i < 200; i++) {
    try {
      const [port, route] = (await readFile(path, 'utf8')).split('\n')
      if (port && route) return `ws://127.0.0.1:${port.trim()}${route.trim()}`
    } catch {
      // Not written yet.
    }
    await sleep(100)
  }
  throw new Error('Chrome never opened its DevTools port')
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url)
    socket.addEventListener('open', () => resolve(new Connection(socket)))
    socket.addEventListener('error', () => reject(new Error(`could not connect to ${url}`)))
  })
}

/**
 * Opens a page and returns a handle to drive it.
 *
 * `width`/`height` set the real window size rather than an emulated viewport:
 * this app reads `useThree().size` for its trail shader's viewport uniform and
 * its label projection, and an emulation override and the actual drawing buffer
 * are two different numbers that are easy to get out of step.
 */
export async function openPage({ url, width = 1600, height = 1000 } = {}) {
  const profile = await mkdtemp(join(tmpdir(), 'solar-chrome-'))

  const chrome = spawn(
    CHROME,
    [...FLAGS, '--remote-debugging-port=0', `--user-data-dir=${profile}`,
     `--window-size=${width},${height}`, 'about:blank'],
    { stdio: 'ignore' },
  )

  /*
   * Kill Chrome even if this process does not exit cleanly.
   *
   * A headless browser leaves no window, so a leaked one is invisible until
   * something else notices — and what noticed here was the next run hanging.
   * `exit` covers a thrown error and a normal return; the signals cover Ctrl-C
   * and the timeout a test runner applies, neither of which fires `exit` on
   * their own.
   */
  const reap = () => {
    try {
      chrome.kill('SIGKILL')
    } catch {
      // Already gone.
    }
  }
  process.once('exit', reap)
  process.once('SIGINT', () => { reap(); process.exit(130) })
  process.once('SIGTERM', () => { reap(); process.exit(143) })

  const browser = await connect(await devToolsUrl(profile))
  const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true })

  /*
   * Console and page errors, collected from the start.
   *
   * A silent exception inside `useFrame` is this app's most likely failure and
   * its least visible one: React does not unmount, the canvas keeps its last
   * frame, and the only trace is a console line nobody is reading. Collecting
   * from before the first navigation is what makes the load-time ones catchable.
   */
  const errors = []
  browser.on('Runtime.exceptionThrown', (p) => {
    errors.push(p.exceptionDetails?.exception?.description ?? p.exceptionDetails?.text ?? 'error')
  })
  browser.on('Runtime.consoleAPICalled', (p) => {
    if (p.type !== 'error' && p.type !== 'warning') return
    errors.push(`${p.type}: ${p.args.map((a) => a.description ?? a.value).join(' ')}`)
  })

  await browser.send('Runtime.enable', {}, sessionId)
  await browser.send('Page.enable', {}, sessionId)

  const loaded = new Promise((resolve) => browser.on('Page.loadEventFired', resolve))
  await browser.send('Page.navigate', { url }, sessionId)
  await loaded

  /**
   * Evaluates an expression in the page and returns its value.
   *
   * `awaitPromise` so a probe can wait on something itself, and
   * `returnByValue` so what comes back is data rather than a remote handle —
   * every caller here wants the number, not a reference to it.
   */
  const evaluate = async (expression) => {
    const result = await browser.send(
      'Runtime.evaluate',
      { expression, awaitPromise: true, returnByValue: true },
      sessionId,
    )
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description ?? 'evaluate failed')
    }
    return result.result.value
  }

  /**
   * Waits until an expression is truthy, or gives up.
   *
   * Everything about this app's readiness is asynchronous and none of it is a
   * DOM event: textures load behind a progress bar, meshes arrive over fetch,
   * and the first frame is whenever rAF gets round to it. Polling a predicate
   * the page itself can answer is the only honest signal.
   */
  const waitFor = async (expression, { timeout = 20000, label = expression } = {}) => {
    const deadline = Date.now() + timeout
    while (Date.now() < deadline) {
      if (await evaluate(`!!(${expression})`)) return true
      await sleep(100)
    }
    throw new Error(`timed out waiting for ${label}`)
  }

  /** Lets the render loop run for a while — real frames, not a fixed sleep. */
  const frames = (count = 30) =>
    evaluate(`new Promise((done) => {
      let left = ${count}
      const tick = () => (--left > 0 ? requestAnimationFrame(tick) : done(true))
      requestAnimationFrame(tick)
    })`)

  /**
   * A real wheel, delivered by the browser rather than by `dispatchEvent`.
   *
   * The distinction is the whole reason this exists. A synthetic `WheelEvent`
   * runs every listener but performs **no default action** — untrusted events
   * never scroll anything. So it can prove a wheel does *not* reach the camera,
   * and cannot prove the thing under the pointer scrolled instead, which is the
   * half that matters when the complaint is "the list doesn't move".
   */
  const wheel = async (x, y, deltaY, deltaX = 0) => {
    await browser.send(
      'Input.dispatchMouseEvent',
      { type: 'mouseWheel', x, y, deltaX, deltaY, pointerType: 'mouse' },
      sessionId,
    )
  }

  /**
   * A real press, move and release, for the same reason `wheel` is real.
   *
   * OrbitControls listens on the canvas, so what actually decides whether a
   * drag turns the camera is *hit testing* — which element the browser decides
   * is under the pointer. A synthetic `pointerdown` aimed at the canvas skips
   * that decision entirely, and so cannot see a full-screen overlay sitting in
   * front of it. One did: `.feature-layer` lost a specificity tie to
   * `.ui-layer > *`, took `pointer-events: auto`, and swallowed every drag over
   * a planet close enough to have named features.
   */
  const drag = async (fromX, fromY, toX, toY, steps = 6) => {
    const send = (type, x, y) =>
      browser.send(
        'Input.dispatchMouseEvent',
        { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 },
        sessionId,
      )
    await send('mousePressed', fromX, fromY)
    for (let i = 1; i <= steps; i++) {
      const t = i / steps
      await send('mouseMoved', fromX + (toX - fromX) * t, fromY + (toY - fromY) * t)
    }
    await send('mouseReleased', toX, toY)
  }

  /**
   * Resize the viewport, so a check can ask what a laptop sees.
   *
   * More than cosmetic. Anything the app gates on a pixel count is really
   * gating on a fraction of *this* number, since every framing distance in the
   * camera is proportional to the viewport height — so a threshold that passes
   * at 1400 px can silently fail at 700 and nothing else in the suite would
   * notice. The landing-site marks did exactly that, and they are the way into
   * the surface view.
   */
  const resize = async (width, height) => {
    await browser.send(
      'Emulation.setDeviceMetricsOverride',
      { width, height, deviceScaleFactor: 1, mobile: false },
      sessionId,
    )
  }

  /**
   * The colours actually on screen, in a rectangle.
   *
   * Goes through a screenshot rather than `gl.readPixels`, which is the whole
   * reason this is fiddly enough to need a helper. The WebGL drawing buffer is
   * undefined once the frame has been composited — the renderer runs without
   * `preserveDrawingBuffer`, so reading it back from the page returns a
   * rectangle of zeros, and it does so *silently*: a check written that way
   * reports a black sky over a lit landscape and looks like a rendering bug.
   *
   * `Page.captureScreenshot` composites properly, so the picture it returns is
   * the picture. It comes back as a PNG, which Node cannot decode without a
   * dependency — so it is handed back to the page, drawn to a 2D canvas, and
   * read from there.
   *
   * Returns `{ mean, peak, peakLuminance, bright, pixels }`, all channels 0–255
   * in sRGB. `mean` is what a colour check wants (a sky is a broad wash), `peak`
   * is what a "is the Sun there" check wants, and `bright` — how many pixels
   * stand clearly above the local mean — is what a "how many stars" check
   * wants. The last one exists because the brightest pixel in a patch of
   * daytime sky is a planet, and planets are *supposed* to be visible by day;
   * only a count can tell a sky with two planets in it from a sky with two
   * planets and four hundred stars.
   */
  const pixels = async (x, y, width, height) => {
    const { data } = await browser.send(
      'Page.captureScreenshot',
      { format: 'png', clip: { x, y, width, height, scale: 1 }, captureBeyondViewport: false },
      sessionId,
    )
    return evaluate(`(async () => {
      const image = new Image()
      image.src = 'data:image/png;base64,${data}'
      await image.decode()
      const canvas = document.createElement('canvas')
      canvas.width = image.width
      canvas.height = image.height
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      ctx.drawImage(image, 0, 0)
      const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data
      let r = 0, g = 0, b = 0, n = 0
      let peak = [0, 0, 0], best = -1
      const lum = new Float32Array(d.length / 4)
      for (let i = 0; i < d.length; i += 4) {
        r += d[i]; g += d[i + 1]; b += d[i + 2]
        const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]
        lum[n++] = l
        if (l > best) { best = l; peak = [d[i], d[i + 1], d[i + 2]] }
      }
      const meanLum = lum.reduce((a, v) => a + v, 0) / n
      let bright = 0
      for (let i = 0; i < n; i++) if (lum[i] > meanLum + 24) bright++
      return {
        mean: [r / n, g / n, b / n].map((v) => Math.round(v)),
        peak,
        peakLuminance: Math.round(best),
        bright,
        pixels: n,
      }
    })()`)
  }

  const screenshot = async (path) => {
    const { data } = await browser.send(
      'Page.captureScreenshot',
      { format: 'png', captureBeyondViewport: false },
      sessionId,
    )
    const { writeFile } = await import('node:fs/promises')
    await writeFile(path, Buffer.from(data, 'base64'))
    return path
  }

  const close = async () => {
    try {
      browser.socket.close()
    } catch {
      // Already gone.
    }
    reap()
    process.off('exit', reap)
    await rm(profile, { recursive: true, force: true }).catch(() => {})
  }

  return { evaluate, waitFor, frames, wheel, drag, resize, pixels, screenshot, errors, close }
}

/**
 * Opens the app and waits until it is actually running.
 *
 * "Running" is deliberately `positioned`, not `loaded`: the store's `loaded`
 * flag means the assets arrived, which is true in a throttled tab where no
 * frame will ever be drawn. A body with a world position is proof that
 * `useFrame` has fired at least once, which is the thing that was missing.
 */
export async function openApp(options = {}) {
  const page = await openPage({ url: 'http://localhost:5173', ...options })
  await page.waitFor('window.__solar', { label: 'the app to boot' })
  await page.waitFor('window.__solar.state().loaded', { timeout: 60000, label: 'assets to load' })
  await page.waitFor('window.__solar.positions.size > 0', { label: 'the first frame' })
  return page
}
