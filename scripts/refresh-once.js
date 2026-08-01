// Runs a single refresh and exits. Useful for a cron job or a quick manual top-up.
import { runRefresh } from '../src/refresh.js'

console.log('Refreshing Ireland Job Radar...\n')
runRefresh()
  .then((r) => {
    console.log(`\nScanned ${r.scanned}, added ${r.added}, still live ${r.refreshed}, off-profile ${r.dropped}, expired ${r.pruned}`)
    if (r.errors?.length) {
      console.log('\nIssues:')
      for (const e of r.errors) console.log(`  ${e}`)
    }
    process.exit(0)
  })
  .catch((err) => {
    console.error(`Refresh failed: ${err.message}`)
    process.exit(1)
  })
