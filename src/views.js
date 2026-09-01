// Saved views. A view is a tab that is not a country: a fixed slice of the data
// that answers one question, so you do not have to set the same five filters every
// time you open the page.

export const VIEWS = [
  {
    key: 'limerick-pt',
    name: 'Limerick part time',
    country: 'ie',
    // Work you could actually get to, plus work with no address at all.
    regionKeys: ['limerick'],
    includeRemote: true,
    // A student visa rules out a full-time contract, so those are left out.
    excludeEmploymentTypes: ['full_time', 'contract'],
    // Excluding full-time is not enough on its own: most adverts never state their
    // hours at all, so "not full-time" quietly lets every senior role through. A
    // listing also has to say part-time or seasonal, or be one of the kinds of work
    // students actually do.
    requireAny: {
      employmentTypes: ['part_time', 'temporary'],
      groups: ['student'],
    },
    // A "Head of EMEA Fund Accounting" whose advert merely mentions part-time hours
    // somewhere is still a career post. But when an advert states plainly that the
    // role is part-time, believe it over any reading of the job title: a part-time
    // retail consultant, or a part-time accounts role, is exactly the point.
    excludeCareerRoles: true,
    note: 'Limerick and commutable towns, plus work-from-home roles. '
      + 'On a Stamp 2 student permission you may work 20 hours a week during term and '
      + '40 hours a week in the holiday periods. Full-time contracts are filtered out. '
      + 'Check the current conditions on your own permission before you apply.',
    noteLink: {
      href: 'https://www.irishimmigration.ie/coming-to-study-in-ireland/what-are-my-options-for-studying-in-ireland/',
      text: 'Irish immigration guidance',
    },
  },
]

export const VIEW_BY_KEY = Object.fromEntries(VIEWS.map((v) => [v.key, v]))

// Turns a view into a WHERE fragment. Kept here rather than in db.js so that
// adding a view is a single edit in a single file.
export function viewClause(key) {
  const v = VIEW_BY_KEY[key]
  if (!v) return null

  const where = []
  const params = []

  const location = []
  if (v.regionKeys?.length) {
    location.push(`j.region_key IN (${v.regionKeys.map(() => '?').join(',')})`)
    params.push(...v.regionKeys)
  }
  if (v.includeRemote) location.push(`(j.work_mode = 'remote' OR j.region_key = 'remote')`)
  if (location.length) where.push(`(${location.join(' OR ')})`)

  if (v.excludeEmploymentTypes?.length) {
    where.push(`COALESCE(j.employment_type, 'unspecified') NOT IN (${v.excludeEmploymentTypes.map(() => '?').join(',')})`)
    params.push(...v.excludeEmploymentTypes)
  }

  if (v.excludeCareerRoles) {
    const stated = v.requireAny?.employmentTypes || []
    where.push(stated.length
      ? `(COALESCE(j.career_role, 0) = 0 OR j.employment_type IN (${stated.map(() => '?').join(',')}))`
      : 'COALESCE(j.career_role, 0) = 0')
    params.push(...stated)
  }

  if (v.requireAny) {
    const any = []
    if (v.requireAny.employmentTypes?.length) {
      any.push(`j.employment_type IN (${v.requireAny.employmentTypes.map(() => '?').join(',')})`)
      params.push(...v.requireAny.employmentTypes)
    }
    for (const g of v.requireAny.groups || []) {
      any.push(`(',' || j.groups || ',') LIKE ?`)
      params.push(`%,${g},%`)
    }
    if (any.length) where.push(`(${any.join(' OR ')})`)
  }

  return where.length ? { sql: where.join(' AND '), params } : null
}
