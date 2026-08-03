import { detectEmploymentType } from './employment.js'

// The searches the radar actually runs, grouped the way you'd think about them.
// `queries` are sent to the job boards. `titleTerms` are used afterwards to score
// how relevant a result really is, because the boards match loosely (a search for
// "finance" in Kerry will happily return "Director of Nursing").

export const GROUPS = [
  { key: 'practice', name: 'Accountancy and practice' },
  { key: 'tax', name: 'Tax' },
  { key: 'audit', name: 'Audit' },
  { key: 'financeops', name: 'Finance operations' },
  { key: 'it', name: 'IT and software' },
  { key: 'ai', name: 'AI and data' },
  { key: 'student', name: 'Student part-time jobs' },
]

export const PROFILES = [
  {
    id: 'acca',
    group: 'practice',
    name: 'ACCA / qualified accountant',
    queries: ['ACCA', 'qualified accountant', 'newly qualified accountant', 'part qualified accountant', 'ACA', 'CIMA', 'chartered accountant'],
    titleTerms: ['acca', 'aca', 'cima', 'cpa', 'accountant', 'accountancy', 'qualified accountant', 'chartered accountant'],
  },
  {
    id: 'accountant',
    group: 'practice',
    name: 'Management / financial accountant',
    queries: ['management accountant', 'financial accountant', 'group accountant', 'project accountant', 'senior accountant', 'staff accountant', 'fund accountant', 'corporate accountant'],
    titleTerms: ['management accountant', 'financial accountant', 'group accountant', 'cost accountant', 'project accountant', 'fund accountant', 'corporate accountant', 'staff accountant', 'accountant'],
  },
  {
    id: 'controller',
    group: 'practice',
    name: 'Financial controller / finance manager',
    queries: ['financial controller', 'finance manager', 'head of finance', 'finance business partner', 'chief financial officer', 'CFO', 'head of accounting', 'financial reporting manager', 'group finance'],
    titleTerms: ['financial controller', 'finance controller', 'group controller', 'controller', 'finance manager', 'accounting manager', 'head of finance', 'head of accounting', 'head of accounts', 'finance director', 'financial director', 'chief financial officer', 'cfo', 'finance lead', 'business partner'],
  },
  {
    id: 'practicegen',
    group: 'practice',
    name: 'Accountancy practice',
    queries: ['accountancy practice', 'accounts senior', 'client manager accountancy', 'bookkeeper', 'accounts assistant', 'accounting supervisor', 'corporate services'],
    titleTerms: ['practice', 'accounts senior', 'client manager', 'accounts assistant', 'accounts administrator', 'accounting administrator', 'accounting supervisor', 'accounting officer', 'accounting associate', 'accounting', 'bookkeeper', 'bookkeeping', 'semi senior', 'corporate services'],
  },

  {
    id: 'tax',
    group: 'tax',
    name: 'Tax',
    queries: ['tax', 'tax consultant', 'corporate tax', 'tax manager', 'tax senior', 'transfer pricing', 'VAT', 'indirect tax', 'international tax', 'tax compliance'],
    titleTerms: ['tax', 'vat', 'taxation', 'transfer pricing', 'tax compliance', 'indirect tax'],
  },

  {
    id: 'audit',
    group: 'audit',
    name: 'Audit',
    queries: ['audit', 'auditor', 'audit senior', 'internal audit', 'external audit', 'audit manager', 'statutory audit', 'assurance', 'risk and compliance'],
    titleTerms: ['audit', 'auditor', 'auditing', 'assurance', 'compliance officer', 'internal control'],
  },

  {
    id: 'payroll',
    group: 'financeops',
    name: 'Payroll',
    queries: ['payroll', 'payroll manager', 'payroll specialist', 'payroll administrator'],
    titleTerms: ['payroll'],
  },
  {
    id: 'analyst',
    group: 'financeops',
    name: 'Financial analyst / FP&A',
    queries: ['financial analyst', 'FP&A', 'commercial analyst', 'finance analyst', 'financial planning and analysis', 'business controller', 'financial reporting'],
    titleTerms: ['financial analyst', 'fp&a', 'commercial analyst', 'finance analyst', 'financial planning', 'financial reporting', 'reporting analyst', 'business controller'],
  },
  {
    id: 'ledger',
    group: 'financeops',
    name: 'Accounts payable / receivable / credit',
    queries: ['accounts payable', 'accounts receivable', 'credit control', 'billing specialist', 'reconciliations', 'treasury'],
    titleTerms: ['accounts payable', 'accounts receivable', 'credit control', 'purchase ledger', 'sales ledger', 'billing', 'reconciliation', 'treasury', 'accounts clerk', 'finance officer', 'finance administrator', 'finance assistant'],
  },

  {
    id: 'software',
    group: 'it',
    name: 'Software engineering',
    queries: ['software engineer', 'software developer', 'full stack developer', 'backend developer'],
    titleTerms: ['software engineer', 'developer', 'engineer', 'full stack', 'backend', 'frontend', 'programmer'],
  },
  {
    id: 'itops',
    group: 'it',
    name: 'IT support and systems',
    queries: ['IT support', 'systems administrator', 'IT manager', 'service desk'],
    titleTerms: ['it support', 'systems administrator', 'sysadmin', 'it manager', 'service desk', 'helpdesk', 'infrastructure'],
  },
  {
    id: 'bizanalyst',
    group: 'it',
    name: 'Business / systems analyst',
    queries: ['business analyst', 'systems analyst', 'ERP consultant', 'finance systems'],
    titleTerms: ['business analyst', 'systems analyst', 'erp', 'implementation', 'finance systems', 'netsuite', 'sap', 'dynamics'],
  },

  {
    id: 'aiml',
    group: 'ai',
    name: 'AI / machine learning',
    queries: ['machine learning', 'artificial intelligence', 'AI engineer', 'LLM'],
    titleTerms: ['machine learning', 'artificial intelligence', 'ai', 'ai engineer', 'llm', 'nlp', 'mlops', 'deep learning'],
  },
  {
    id: 'data',
    group: 'ai',
    name: 'Data science and analytics',
    queries: ['data scientist', 'data analyst', 'data engineer', 'analytics engineer'],
    titleTerms: ['data scientist', 'data analyst', 'data engineer', 'analytics', 'bi developer', 'power bi'],
  },

  // These searches cover the jobs students commonly combine with study. The
  // partTimeOnly guard prevents a generic "retail assistant" result from being
  // shown unless the advert also says it is part-time, casual or weekend work.
  {
    id: 'studentgeneral',
    group: 'student',
    name: 'Flexible, event and campus work',
    queries: ['part time', 'student part time', 'weekend jobs', 'evening jobs'],
    titleTerms: ['student ambassador', 'student assistant', 'campus assistant', 'event staff', 'brand ambassador', 'cinema staff', 'leisure attendant'],
    partTimeOnly: true,
  },
  {
    id: 'studentretail',
    group: 'student',
    name: 'Retail and shop work',
    queries: ['part time retail assistant', 'part time sales assistant', 'part time shop assistant', 'part time store assistant'],
    titleTerms: ['retail assistant', 'sales assistant', 'shop assistant', 'store assistant', 'checkout operator', 'deli assistant', 'store team member'],
    partTimeOnly: true,
  },
  {
    id: 'studenthospitality',
    group: 'student',
    name: 'Hospitality and food service',
    queries: ['part time barista', 'part time waiter', 'part time kitchen porter', 'part time catering assistant', 'part time hotel receptionist'],
    titleTerms: ['barista', 'waiter', 'waitress', 'server', 'kitchen porter', 'catering assistant', 'food and beverage assistant', 'hotel receptionist', 'front of house', 'concierge', 'crew member'],
    partTimeOnly: true,
  },
  {
    id: 'studentsupport',
    group: 'student',
    name: 'Customer service, admin and tutoring',
    queries: ['part time customer service', 'part time receptionist', 'part time admin assistant', 'part time tutor'],
    titleTerms: ['customer service advisor', 'customer service assistant', 'customer assistant', 'call centre agent', 'receptionist', 'admin assistant', 'administrative assistant', 'library assistant', 'tutor'],
    partTimeOnly: true,
  },
  {
    id: 'studentoperations',
    group: 'student',
    name: 'Warehouse, cleaning and general work',
    queries: ['part time warehouse operative', 'part time cleaner', 'part time general operative', 'part time delivery driver'],
    titleTerms: ['warehouse operative', 'warehouse assistant', 'parcel sorter', 'packer', 'cleaner', 'cleaning operative', 'general operative', 'delivery driver', 'stock assistant'],
    partTimeOnly: true,
  },
]

export const PROFILE_BY_ID = Object.fromEntries(PROFILES.map((p) => [p.id, p]))
export const GROUP_BY_KEY = Object.fromEntries(GROUPS.map((g) => [g.key, g]))

// Terms have to match whole words. Without this, "erp" matches "Enterprise" and
// "vat" matches "innovators", which quietly fills the list with sales roles.
// A trailing plural is allowed, so "Reconciliations Officer" still counts as a
// reconciliation role and "Accounts Payable Specialists" still counts as one.
const boundary = (term) =>
  new RegExp(`(^|[^a-z0-9])${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:s|es)?([^a-z0-9]|$)`, 'i')

const COMPILED = PROFILES.map((p) => ({
  id: p.id,
  group: p.group,
  terms: p.titleTerms.map(boundary),
  partTimeOnly: Boolean(p.partTimeOnly),
}))

// Scores a listing against every profile. Title hits are worth far more than
// description hits, which is what separates a real match from a board's loose guess.
export function classify(title, description) {
  const t = String(title || '')
  const d = String(description || '')
  const matched = []
  let best = 0

  for (const p of COMPILED) {
    if (p.partTimeOnly && detectEmploymentType(t, d) !== 'part_time') continue
    let score = 0
    for (const re of p.terms) {
      if (re.test(t)) score += 10
      else if (re.test(d)) score += 2
    }
    if (score > 0) {
      matched.push({ id: p.id, group: p.group, score })
      if (score > best) best = score
    }
  }

  matched.sort((a, b) => b.score - a.score)
  return {
    profiles: matched.map((m) => m.id),
    groups: [...new Set(matched.map((m) => m.group))],
    score: best,
  }
}
