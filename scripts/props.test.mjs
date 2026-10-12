import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
import { pathToFileURL } from 'node:url'

import { CHROME, launch, open, waitFor } from './chrome.mjs'

const ROOT = resolve(import.meta.dirname, '..')

test('every interaction spot: props change only with a seated drawn figure, and leaving restores the empty frame', { skip: !existsSync(CHROME) && 'Chrome is not installed', timeout: 240_000 }, async () => {
  const { cdp, close } = await launch(1400, 900)
  try {
    await open(cdp, pathToFileURL(join(ROOT, 'web/check.html')).href, 1400, 900)
    const report = await waitFor(cdp, 'window.officeProps', 220_000)
    assert.equal(report.error, undefined)
    const failed = report.results.filter(one => !(one.seatedAt > 0 && one.outside === 0 && one.after === 0 && one.leaks === 0 && one.seated === one.wantsSeat && one.screen === one.wantsScreen))
    assert.deepEqual(failed, [])
    assert.ok(report.results.length >= 30)
    assert.equal(report.ok, true)
  } finally {
    await close()
  }
})
