import type { DB } from "@/lib/db/client";
import type { CustomerSignal } from "@/lib/tools/exa-search";

export type CustomerSeed = {
  id: string;
  name: string;
  domain: string;
  segment: "enterprise" | "mid_market" | "plg_self_serve";
  employee_count: number;
  industry: string;
  hq_country: string;
  funding_stage: string | null;
  arr_estimate: number | null;
  health_score: number | null;
  is_real: 0 | 1;
  // Hand-authored signals served instead of Exa for fictional customers.
  // Real customers leave this undefined and always hit Exa live.
  // Per the simulated-signals design: url is set to "" so the UI never
  // accidentally links out to a fabricated source — rows render non-clickable
  // and the panel header carries an explicit "Simulated · Demo data" badge.
  simulated_signals?: CustomerSignal[];
};

// ---------------------------------------------------------------------------
// Hand-authored simulated signals for fictional hero customers. Served by
// fetchCustomerSignals() instead of Exa when customer.is_real === 0.
//
// Why: Exa returns real public results for our invented company names —
// "Tessera" hits Tessera Therapeutics (biotech), "Northbeam" hits a
// completely unrelated marketing-attribution startup, "Reverberate" hits
// fitness-class brands. Those are misleading in a deal-desk demo. We replace
// them with plausible-but-explicitly-labeled signals matched to the deal
// narrative for each scenario.
//
// Honesty: every signal renders behind a "Simulated · Demo data" badge in
// the UI; rows are non-clickable; URLs are deliberately blank so nothing
// links out to a fabricated source.
//
// Today is 2026-05-05; published_date stays inside the rolling 6-month
// window so the recency filter behaves identically to live Exa results.
// ---------------------------------------------------------------------------

const tesseraHealthSignals: CustomerSignal[] = [
  {
    kind: "leadership",
    headline: "Tessera Health names new Chief Revenue Officer to lead consolidation push",
    source_domain: "healthtechnews.com",
    url: "",
    published_date: "2026-03-12T14:00:00.000Z",
    summary:
      "Tessera Health announced the appointment of a new CRO (formerly VP Sales at a rival healthtech provider), tasked with consolidating sales tooling and accelerating mid-market enterprise expansion through 2026.",
    score: 78,
  },
  {
    kind: "product",
    headline: "Tessera Health expands HIPAA-attested integration suite for hospital networks",
    source_domain: "healthtechnews.com",
    url: "",
    published_date: "2026-04-02T09:30:00.000Z",
    summary:
      "Tessera released expanded HIPAA-attested integrations targeting Epic, Cerner, and Meditech-shaped buyers. The release is positioned as evidence of compliance maturity ahead of Tessera's enterprise upmarket push.",
    score: 72,
  },
  {
    kind: "other",
    headline: "Healthtech RevOps leaders cite stack consolidation as #1 2026 priority — survey",
    source_domain: "modernhealthtech.co",
    url: "",
    published_date: "2026-02-18T11:00:00.000Z",
    summary:
      "Industry survey finds 64% of mid-market healthtech RevOps leaders plan to consolidate three or more sales-engagement tools in 2026, citing renewal pressure and security-review fatigue.",
    score: 66,
  },
  {
    kind: "other",
    headline: "Tessera Health crosses 1,200 employees, posts second consecutive profitable quarter",
    source_domain: "healthtechnews.com",
    url: "",
    published_date: "2026-01-23T16:45:00.000Z",
    summary:
      "Q4 2025 earnings update notes a 1,200-person headcount and a second straight profitable quarter, alongside a stated 2026 priority of vendor consolidation across go-to-market infrastructure.",
    score: 70,
  },
  {
    kind: "leadership",
    headline: "Tessera Health adds VP RevOps from data-platform vendor",
    source_domain: "modernhealthtech.co",
    url: "",
    published_date: "2025-12-09T13:15:00.000Z",
    summary:
      "Tessera hired a VP RevOps from a data-platform vendor; her stated 90-day plan reportedly includes a sales-tooling RFP focused on prospecting, enrichment, and outbound orchestration.",
    score: 68,
  },
  {
    kind: "funding",
    headline: "Healthtech mid-market vendors face tighter Series D bar amid 2026 capital reset",
    source_domain: "modernhealthtech.co",
    url: "",
    published_date: "2026-02-05T10:00:00.000Z",
    summary:
      "Investor commentary suggests Series C healthtech operators (incl. Tessera-shaped 1,000-1,500 person mid-market players) face stricter capital efficiency expectations heading into late-2026 Series D rounds.",
    score: 60,
  },
];

const northbeamMortgageSignals: CustomerSignal[] = [
  {
    kind: "other",
    headline: "Mortgage origination volume falls for third straight quarter as rates hold high",
    source_domain: "fintechfutures.com",
    url: "",
    published_date: "2026-04-18T08:30:00.000Z",
    summary:
      "Industry data shows mortgage origination volume down 14% YoY in Q1 2026 as the Fed holds rates above 5%. Mid-market lenders cite a third straight quarter of demand softness.",
    score: 74,
  },
  {
    kind: "leadership",
    headline: "Northbeam Mortgage trims 8% of staff in operations and loan-officer roles",
    source_domain: "fintechfutures.com",
    url: "",
    published_date: "2026-03-04T12:00:00.000Z",
    summary:
      "Northbeam Mortgage confirmed an 8% workforce reduction primarily affecting back-office operations and loan-officer roles, citing the prolonged rate environment and a need to extend runway through 2027.",
    score: 82,
  },
  {
    kind: "product",
    headline: "YC-backed mortgage-origination startup launches at 60% below incumbents",
    source_domain: "techcrunch.com",
    url: "",
    published_date: "2026-02-22T15:30:00.000Z",
    summary:
      "A Y Combinator W26 fintech launched a mortgage-origination platform priced at roughly 60% below incumbents like Northbeam and Better, targeting mid-market regional lenders with an AI-first underwriting workflow.",
    score: 79,
  },
  {
    kind: "leadership",
    headline: "Northbeam Mortgage CRO emphasizes 'cost discipline' on Q4 investor call",
    source_domain: "fintechfutures.com",
    url: "",
    published_date: "2026-01-30T17:00:00.000Z",
    summary:
      "On the Q4 2025 investor call, Northbeam's CRO highlighted 'unit economics' and 'cost discipline' eight times, signaling tighter scrutiny on every renewal and procurement contract through fiscal 2026.",
    score: 71,
  },
  {
    kind: "other",
    headline: "Regional banks cut software spend 12% YoY, vendor consolidation accelerates",
    source_domain: "fintechfutures.com",
    url: "",
    published_date: "2025-12-15T09:45:00.000Z",
    summary:
      "Regional bank and non-bank lender SaaS spend fell 12% YoY through late 2025, with vendor consolidation accelerating across data, marketing, and origination tooling — Northbeam-class lenders are central to the trend.",
    score: 64,
  },
  {
    kind: "funding",
    headline: "Northbeam Mortgage extends Series C runway with $40M secondary",
    source_domain: "fintechfutures.com",
    url: "",
    published_date: "2025-11-19T11:30:00.000Z",
    summary:
      "Northbeam closed a $40M structured secondary led by an existing investor, framed as runway extension rather than a primary raise. The transaction valued the company below its 2023 Series C mark.",
    score: 67,
  },
];

const reverberateGrowthSignals: CustomerSignal[] = [
  {
    kind: "product",
    headline: "Reverberate Growth crosses 50 active mid-market clients, formalizes 'Reverberate Engine' practice",
    source_domain: "modernsalesops.com",
    url: "",
    published_date: "2026-04-08T13:00:00.000Z",
    summary:
      "GTM agency Reverberate Growth announced its 50th active client and the formal launch of 'Reverberate Engine,' a productized service line that bundles outbound and enrichment workflows for mid-market RevOps teams.",
    score: 81,
  },
  {
    kind: "leadership",
    headline: "Reverberate founder publishes 2026 GTM Operator Playbook, 14k subscribers in two weeks",
    source_domain: "modernsalesops.com",
    url: "",
    published_date: "2026-03-19T10:30:00.000Z",
    summary:
      "Reverberate Growth's founder released the '2026 GTM Operator Playbook,' a long-form essay on agency-led RevOps that gained 14,000 subscribers in its first two weeks. The post argues for vendor-agnostic agency partnerships over single-vendor lock-in.",
    score: 76,
  },
  {
    kind: "product",
    headline: "GTM agencies announce vendor partnerships at 2026 RevOps Summit",
    source_domain: "modernsalesops.com",
    url: "",
    published_date: "2026-02-27T14:00:00.000Z",
    summary:
      "At the RevOps Summit, several top-50 GTM agencies — including Reverberate — were named in vendor co-launch sessions. Industry observers describe a shift toward agency-vendor revenue-share partnerships rather than referral fees.",
    score: 70,
  },
  {
    kind: "other",
    headline: "Reverberate Growth named #18 on annual 'Top 50 GTM Agencies' list",
    source_domain: "salesopstoday.com",
    url: "",
    published_date: "2026-01-14T11:00:00.000Z",
    summary:
      "Reverberate Growth ranked #18 on the annual 'Top 50 GTM Agencies' list (up from #34 the prior year), with judges citing strong client outcomes in enrichment-heavy outbound and waterfall enrichment design.",
    score: 73,
  },
  {
    kind: "leadership",
    headline: "Reverberate hires former PLG-vendor head of partnerships",
    source_domain: "salesopstoday.com",
    url: "",
    published_date: "2025-12-02T09:00:00.000Z",
    summary:
      "Reverberate Growth hired a former head of partnerships from a major PLG vendor to lead its new 'Strategic Vendor Partnerships' practice — explicitly framed as a path to revenue-share deals with infrastructure providers.",
    score: 69,
  },
];

// 6 real public companies that match Clay's ICP. These give the pipeline
// view immediate credibility — a deal-desk hire scanning the list should
// recognize the names.
const real: CustomerSeed[] = [
  {
    id: "cust_anthropic",
    name: "Anthropic",
    domain: "anthropic.com",
    segment: "enterprise",
    employee_count: 1500,
    industry: "AI/ML",
    hq_country: "US",
    funding_stage: "Late Stage Private",
    arr_estimate: 4_000_000_000,
    health_score: 88,
    is_real: 1,
  },
  {
    id: "cust_notion",
    name: "Notion",
    domain: "notion.so",
    segment: "mid_market",
    employee_count: 620,
    industry: "Productivity SaaS",
    hq_country: "US",
    funding_stage: "Series C",
    arr_estimate: 500_000_000,
    health_score: 79,
    is_real: 1,
  },
  {
    id: "cust_ramp",
    name: "Ramp",
    domain: "ramp.com",
    segment: "mid_market",
    employee_count: 950,
    industry: "Fintech",
    hq_country: "US",
    funding_stage: "Series E",
    arr_estimate: 700_000_000,
    health_score: 84,
    is_real: 1,
  },
  {
    id: "cust_verkada",
    name: "Verkada",
    domain: "verkada.com",
    segment: "mid_market",
    employee_count: 2200,
    industry: "Physical Security / IoT",
    hq_country: "US",
    funding_stage: "Series E",
    arr_estimate: 600_000_000,
    health_score: 71,
    is_real: 1,
  },
  {
    id: "cust_intercom",
    name: "Intercom",
    domain: "intercom.com",
    segment: "enterprise",
    employee_count: 900,
    industry: "Customer Messaging SaaS",
    hq_country: "US",
    funding_stage: "Late Stage Private",
    arr_estimate: 350_000_000,
    health_score: 66,
    is_real: 1,
  },
  {
    id: "cust_gong",
    name: "Gong",
    domain: "gong.io",
    segment: "enterprise",
    employee_count: 1300,
    industry: "Revenue Intelligence",
    hq_country: "US",
    funding_stage: "Series E",
    arr_estimate: 350_000_000,
    health_score: 81,
    is_real: 1,
  },
];

// 34 fictional customers split: 8 enterprise + 12 mid-market + 14 plg.
// Names chosen to sound plausible and avoid wordplay.
const fictionalEnterprise: CustomerSeed[] = [
  {
    id: "cust_tideline_logistics",
    name: "Tideline Logistics",
    domain: "tidelinelogistics.com",
    segment: "enterprise",
    employee_count: 12_400,
    industry: "Logistics",
    hq_country: "US",
    funding_stage: "Public",
    arr_estimate: 2_100_000_000,
    health_score: 73,
    is_real: 0,
  },
  {
    id: "cust_helix_diagnostics",
    name: "Helix Diagnostics",
    domain: "helixdx.com",
    segment: "enterprise",
    employee_count: 6500,
    industry: "Healthtech",
    hq_country: "US",
    funding_stage: "Public",
    arr_estimate: 1_400_000_000,
    health_score: 68,
    is_real: 0,
  },
  {
    id: "cust_voltspring",
    name: "Voltspring Energy",
    domain: "voltspring.com",
    segment: "enterprise",
    employee_count: 8200,
    industry: "Climate / Energy",
    hq_country: "US",
    funding_stage: "Public",
    arr_estimate: 3_800_000_000,
    health_score: 74,
    is_real: 0,
  },
  {
    id: "cust_meridian_insure",
    name: "Meridian Insurance Group",
    domain: "meridianinsure.com",
    segment: "enterprise",
    employee_count: 7200,
    industry: "Insurtech",
    hq_country: "US",
    funding_stage: "Public",
    arr_estimate: 2_600_000_000,
    health_score: 62,
    is_real: 0,
  },
  {
    id: "cust_cantilever_capital",
    name: "Cantilever Capital",
    domain: "cantilever.capital",
    segment: "enterprise",
    employee_count: 5500,
    industry: "Fintech / Asset Management",
    hq_country: "US",
    funding_stage: "Public",
    arr_estimate: 4_900_000_000,
    health_score: 77,
    is_real: 0,
  },
  {
    id: "cust_polymath_robotics",
    name: "Polymath Robotics",
    domain: "polymathrobotics.com",
    segment: "enterprise",
    employee_count: 9100,
    industry: "Manufacturing / Robotics",
    hq_country: "US",
    funding_stage: "Late Stage Private",
    arr_estimate: 1_800_000_000,
    health_score: 80,
    is_real: 0,
  },
  {
    id: "cust_cipher_co",
    name: "Cipher & Co.",
    domain: "cipherco.com",
    segment: "enterprise",
    employee_count: 5800,
    industry: "Cybersecurity",
    hq_country: "US",
    funding_stage: "Public",
    arr_estimate: 1_300_000_000,
    health_score: 70,
    is_real: 0,
  },
  {
    id: "cust_northstar_defense",
    name: "Northstar Defense Systems",
    domain: "northstar-defense.com",
    segment: "enterprise",
    employee_count: 6300,
    industry: "Defense / Cybersecurity",
    hq_country: "US",
    funding_stage: "Public",
    arr_estimate: 2_200_000_000,
    health_score: 65,
    is_real: 0,
  },
];

const fictionalMidMarket: CustomerSeed[] = [
  {
    id: "cust_tessera_health",
    name: "Tessera Health",
    domain: "tesserahealth.com",
    segment: "mid_market",
    employee_count: 1200,
    industry: "Healthtech",
    hq_country: "US",
    funding_stage: "Series C",
    arr_estimate: 95_000_000,
    health_score: 58,
    is_real: 0,
    simulated_signals: tesseraHealthSignals,
  },
  {
    id: "cust_northbeam_mortgage",
    name: "Northbeam Mortgage",
    domain: "northbeammortgage.com",
    segment: "mid_market",
    employee_count: 850,
    industry: "Fintech / Mortgage",
    hq_country: "US",
    funding_stage: "Series C",
    arr_estimate: 70_000_000,
    health_score: 42,
    is_real: 0,
    simulated_signals: northbeamMortgageSignals,
  },
  {
    id: "cust_pebblebrook_logistics",
    name: "Pebblebrook Logistics",
    domain: "pebblebrook.io",
    segment: "mid_market",
    employee_count: 1100,
    industry: "Logistics",
    hq_country: "US",
    funding_stage: "Series B",
    arr_estimate: 60_000_000,
    health_score: 72,
    is_real: 0,
  },
  {
    id: "cust_lattice_networks",
    name: "Lattice Networks",
    domain: "latticenet.io",
    segment: "mid_market",
    employee_count: 720,
    industry: "Cybersecurity",
    hq_country: "US",
    funding_stage: "Series C",
    arr_estimate: 80_000_000,
    health_score: 76,
    is_real: 0,
  },
  {
    id: "cust_glacial_insure",
    name: "Glacial Insurance",
    domain: "glacialinsure.com",
    segment: "mid_market",
    employee_count: 950,
    industry: "Insurtech",
    hq_country: "US",
    funding_stage: "Series B",
    arr_estimate: 55_000_000,
    health_score: 64,
    is_real: 0,
  },
  {
    id: "cust_saffron_ventures",
    name: "Saffron Ventures",
    domain: "saffron.vc",
    segment: "mid_market",
    employee_count: 340,
    industry: "Fintech / VC Ops",
    hq_country: "US",
    funding_stage: "Series B",
    arr_estimate: 40_000_000,
    health_score: 81,
    is_real: 0,
  },
  {
    id: "cust_ironhold",
    name: "Ironhold Industries",
    domain: "ironhold.com",
    segment: "mid_market",
    employee_count: 1800,
    industry: "Manufacturing",
    hq_country: "US",
    funding_stage: "Series D",
    arr_estimate: 110_000_000,
    health_score: 69,
    is_real: 0,
  },
  {
    id: "cust_quill_education",
    name: "Quill Education",
    domain: "quill.edu",
    segment: "mid_market",
    employee_count: 540,
    industry: "Edtech",
    hq_country: "US",
    funding_stage: "Series B",
    arr_estimate: 45_000_000,
    health_score: 60,
    is_real: 0,
  },
  {
    id: "cust_kindred_therapy",
    name: "Kindred Therapy",
    domain: "kindredtherapy.com",
    segment: "mid_market",
    employee_count: 460,
    industry: "Telehealth",
    hq_country: "US",
    funding_stage: "Series B",
    arr_estimate: 38_000_000,
    health_score: 75,
    is_real: 0,
  },
  {
    id: "cust_maquette_studios",
    name: "Maquette Studios",
    domain: "maquette.studio",
    segment: "mid_market",
    employee_count: 380,
    industry: "Adtech",
    hq_country: "US",
    funding_stage: "Series B",
    arr_estimate: 32_000_000,
    health_score: 51,
    is_real: 0,
  },
  {
    id: "cust_olmstead_realty",
    name: "Olmstead Realty",
    domain: "olmsteadrealty.com",
    segment: "mid_market",
    employee_count: 880,
    industry: "Proptech",
    hq_country: "US",
    funding_stage: "Series C",
    arr_estimate: 65_000_000,
    health_score: 67,
    is_real: 0,
  },
  {
    id: "cust_coastline_bank",
    name: "Coastline Community Bank",
    domain: "coastlinebank.com",
    segment: "mid_market",
    employee_count: 2200,
    industry: "Fintech / Regional Bank",
    hq_country: "US",
    funding_stage: "Public",
    arr_estimate: 240_000_000,
    health_score: 74,
    is_real: 0,
  },
];

const fictionalPlg: CustomerSeed[] = [
  {
    id: "cust_reverberate_growth",
    name: "Reverberate Growth",
    domain: "reverberategrowth.com",
    segment: "plg_self_serve",
    employee_count: 80,
    industry: "GTM Agency",
    hq_country: "US",
    funding_stage: "Bootstrapped",
    arr_estimate: 12_000_000,
    health_score: 88,
    is_real: 0,
    simulated_signals: reverberateGrowthSignals,
  },
  {
    id: "cust_hightide_devtools",
    name: "Hightide Devtools",
    domain: "hightide.dev",
    segment: "plg_self_serve",
    employee_count: 45,
    industry: "Developer Tools",
    hq_country: "US",
    funding_stage: "Series A",
    arr_estimate: 8_000_000,
    health_score: 82,
    is_real: 0,
  },
  {
    id: "cust_slate_analytics",
    name: "Slate Analytics",
    domain: "slateanalytics.io",
    segment: "plg_self_serve",
    employee_count: 65,
    industry: "Analytics SaaS",
    hq_country: "US",
    funding_stage: "Series A",
    arr_estimate: 6_500_000,
    health_score: 70,
    is_real: 0,
  },
  {
    id: "cust_beanstalk_ai",
    name: "Beanstalk AI",
    domain: "beanstalk.ai",
    segment: "plg_self_serve",
    employee_count: 25,
    industry: "AI/ML",
    hq_country: "US",
    funding_stage: "Seed",
    arr_estimate: 2_500_000,
    health_score: 78,
    is_real: 0,
  },
  {
    id: "cust_makers_loom",
    name: "Maker's Loom",
    domain: "makersloom.com",
    segment: "plg_self_serve",
    employee_count: 110,
    industry: "Ecommerce SaaS",
    hq_country: "US",
    funding_stage: "Series A",
    arr_estimate: 14_000_000,
    health_score: 65,
    is_real: 0,
  },
  {
    id: "cust_sparrow_labs",
    name: "Sparrow Labs",
    domain: "sparrowlabs.io",
    segment: "plg_self_serve",
    employee_count: 32,
    industry: "Developer Tools",
    hq_country: "US",
    funding_stage: "Seed",
    arr_estimate: 3_200_000,
    health_score: 73,
    is_real: 0,
  },
  {
    id: "cust_filament_studios",
    name: "Filament Studios",
    domain: "filament.studio",
    segment: "plg_self_serve",
    employee_count: 55,
    industry: "Design Tooling",
    hq_country: "US",
    funding_stage: "Series A",
    arr_estimate: 5_400_000,
    health_score: 79,
    is_real: 0,
  },
  {
    id: "cust_underwood_legal",
    name: "Underwood Legal",
    domain: "underwoodlegal.com",
    segment: "plg_self_serve",
    employee_count: 90,
    industry: "Legaltech",
    hq_country: "US",
    funding_stage: "Series A",
    arr_estimate: 9_500_000,
    health_score: 71,
    is_real: 0,
  },
  {
    id: "cust_rookery_hr",
    name: "Rookery HR",
    domain: "rookeryhr.com",
    segment: "plg_self_serve",
    employee_count: 70,
    industry: "HR Tech",
    hq_country: "US",
    funding_stage: "Series A",
    arr_estimate: 7_200_000,
    health_score: 56,
    is_real: 0,
  },
  {
    id: "cust_sunfish_media",
    name: "Sunfish Media",
    domain: "sunfishmedia.com",
    segment: "plg_self_serve",
    employee_count: 140,
    industry: "Media Analytics",
    hq_country: "US",
    funding_stage: "Series B",
    arr_estimate: 18_000_000,
    health_score: 63,
    is_real: 0,
  },
  {
    id: "cust_bristlecone_climate",
    name: "Bristlecone Climate",
    domain: "bristleconeclimate.com",
    segment: "plg_self_serve",
    employee_count: 28,
    industry: "Climate SaaS",
    hq_country: "US",
    funding_stage: "Seed",
    arr_estimate: 1_800_000,
    health_score: 84,
    is_real: 0,
  },
  {
    id: "cust_stillwater_insure",
    name: "Stillwater Insurance",
    domain: "stillwaterinsure.com",
    segment: "plg_self_serve",
    employee_count: 175,
    industry: "Insurtech",
    hq_country: "US",
    funding_stage: "Series B",
    arr_estimate: 22_000_000,
    health_score: 59,
    is_real: 0,
  },
  {
    id: "cust_quokka_travel",
    name: "Quokka Travel",
    domain: "quokkatravel.com",
    segment: "plg_self_serve",
    employee_count: 60,
    industry: "Travel Tech",
    hq_country: "US",
    funding_stage: "Series A",
    arr_estimate: 6_000_000,
    health_score: 47,
    is_real: 0,
  },
  {
    id: "cust_halibut_marketplaces",
    name: "Halibut Marketplaces",
    domain: "halibut.market",
    segment: "plg_self_serve",
    employee_count: 38,
    industry: "Marketplace Ops",
    hq_country: "US",
    funding_stage: "Seed",
    arr_estimate: 3_400_000,
    health_score: 72,
    is_real: 0,
  },
];

export const customers: CustomerSeed[] = [
  ...real,
  ...fictionalEnterprise,
  ...fictionalMidMarket,
  ...fictionalPlg,
];

export function seedCustomers(db: DB): number {
  const insert = db.prepare(`
    INSERT OR REPLACE INTO customers (
      id, name, domain, segment, employee_count, industry, hq_country,
      funding_stage, arr_estimate, health_score, is_real, simulated_signals
    ) VALUES (
      @id, @name, @domain, @segment, @employee_count, @industry, @hq_country,
      @funding_stage, @arr_estimate, @health_score, @is_real, @simulated_signals
    )
  `);

  const insertAll = db.transaction((rows: CustomerSeed[]) => {
    for (const row of rows) {
      insert.run({
        ...row,
        simulated_signals: row.simulated_signals
          ? JSON.stringify(row.simulated_signals)
          : null,
      });
    }
  });

  insertAll(customers);
  return customers.length;
}
