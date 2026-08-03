// Multinationals read straight from their own careers systems, through the generic
// platform adapters in src/sources/platforms.js. Every entry here was verified live
// against the employer's real endpoint before being added.
//
// To add a company, find which system its careers site runs on and add one line.
// Workday sites look like {tenant}.wd{N}.myworkdayjobs.com/{site}; the Ireland
// country facet is discovered automatically, so a tenant with no Irish vacancies
// today simply returns nothing rather than breaking the run.

export const MNC_EMPLOYERS = [
  // --- Consulting and professional services ---
  { platform: 'workday', name: 'Accenture', host: 'accenture.wd103.myworkdayjobs.com', site: 'AccentureCareers' },

  // --- Enterprise software and tech ---
  { platform: 'workday', name: 'Salesforce', host: 'salesforce.wd12.myworkdayjobs.com', site: 'External_Career_Site' },
  { platform: 'workday', name: 'Workday', host: 'workday.wd5.myworkdayjobs.com', site: 'Workday' },
  { platform: 'workday', name: 'NVIDIA', host: 'nvidia.wd5.myworkdayjobs.com', site: 'NVIDIAExternalCareerSite' },
  { platform: 'workday', name: 'Adobe', host: 'adobe.wd5.myworkdayjobs.com', site: 'external_experienced' },
  { platform: 'workday', name: 'Analog Devices', host: 'analogdevices.wd1.myworkdayjobs.com', site: 'External' },
  { platform: 'successfactors', name: 'SAP', searchUrl: 'https://jobs.sap.com/search/?q=&locationsearch=Ireland' },

  // --- Pharma and medtech ---
  { platform: 'workday', name: 'Medtronic', host: 'medtronic.wd1.myworkdayjobs.com', site: 'MedtronicCareers' },
  { platform: 'workday', name: 'Stryker', host: 'stryker.wd1.myworkdayjobs.com', site: 'StrykerCareers' },
  { platform: 'workday', name: 'Pfizer', host: 'pfizer.wd1.myworkdayjobs.com', site: 'PfizerCareers' },
  { platform: 'workday', name: 'AstraZeneca', host: 'astrazeneca.wd3.myworkdayjobs.com', site: 'Careers' },
  { platform: 'workday', name: 'GSK', host: 'gsk.wd5.myworkdayjobs.com', site: 'GSKCareers' },
  { platform: 'workday', name: 'Bristol Myers Squibb', host: 'bristolmyerssquibb.wd5.myworkdayjobs.com', site: 'BMS' },

  // --- Banking, funds and insurance ---
  { platform: 'workday', name: 'State Street', host: 'statestreet.wd1.myworkdayjobs.com', site: 'Global' },
  { platform: 'workday', name: 'Marsh McLennan', host: 'mmc.wd1.myworkdayjobs.com', site: 'MMC' },

  // --- Industrial and consumer ---
  { platform: 'workday', name: 'Johnson Controls', host: 'jci.wd5.myworkdayjobs.com', site: 'JCI' },
  { platform: 'workday', name: 'Diageo', host: 'diageo.wd3.myworkdayjobs.com', site: 'Diageo_Careers' },
]
