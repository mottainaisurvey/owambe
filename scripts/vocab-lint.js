#!/usr/bin/env node
/**
 * ─── Owambe Vocabulary Linter ──────────────────────────────────────────────
 *
 * Enforces the Owambe product vocabulary by scanning source files for
 * forbidden terms and suggesting the correct alternatives.
 *
 * Runs in ADVISORY mode by default (exit 0 even on violations).
 * Set VOCAB_LINT_STRICT=true to make violations fail the build (exit 1).
 *
 * Usage:
 *   node scripts/vocab-lint.js [--strict] [files...]
 *   node scripts/vocab-lint.js apps/api/src/routes/channel.ts
 *
 * Integrated into:
 *   - Pre-commit hook: .husky/pre-commit
 *   - CI/CD pipeline: .github/workflows/ci-cd.yml (vocab-lint step)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ─── Vocabulary Rules ──────────────────────────────────────────────────────
//
// Format: { forbidden: RegExp, preferred: string, context: string }
//
// Rules are intentionally scoped to avoid false positives in:
//   - Comments that explicitly discuss terminology
//   - Third-party API field names (e.g., Paystack, Coastal Corridor)
//   - Test fixtures and seed data

const VOCAB_RULES = [
  // ── Mode terminology ──────────────────────────────────────────────────
  {
    forbidden: /\bhotel\b(?!\s*\.ng|\s*booking)/gi,
    preferred: 'property (for STAYS mode) or stay',
    context: 'Mode vocabulary: Owambe uses "property" not "hotel" for accommodation listings',
    excludePatterns: [/hotels\.ng/i, /hotel_id/i, /HotelsNg/i],
  },
  {
    forbidden: /\bAirbnb-style\b/gi,
    preferred: 'STAYS mode or short-let property',
    context: 'Mode vocabulary: Do not reference competitor brand names in product copy',
    excludePatterns: [],
  },
  {
    forbidden: /\bactivity\b/gi,
    preferred: 'experience (for EXPERIENCES mode)',
    context: 'Mode vocabulary: Owambe uses "experience" not "activity"',
    excludePatterns: [
      /activity_log/i,
      /activityId/i,
      /recentActivity/i,
      /userActivity/i,
      /\.activity\b/i,
      // Lucide React icon imports — "Activity" is a UI icon, not product copy
      /from ['"]lucide-react['"].*Activity/i,
      /Activity.*from ['"]lucide-react['"]/i,
      /import.*Activity.*lucide/i,
      /<Activity\s/i,
      /Activity size=/i,
    ],
  },
  {
    forbidden: /\btour operator\b/gi,
    preferred: 'operator (for EXPERIENCES mode)',
    context: 'Mode vocabulary: Use "operator" not "tour operator"',
    excludePatterns: [],
  },

  // ── User role terminology ─────────────────────────────────────────────
  {
    forbidden: /\bcustomer\b/gi,
    preferred: 'guest (for STAYS/EXPERIENCES) or attendee (for EVENTS)',
    context: 'User role vocabulary: Owambe uses "guest" or "attendee", not "customer"',
    excludePatterns: [/customer_id/i, /customerId/i, /createOrFetchCustomer/i, /paystackCustomer/i, /customer_code/i],
  },
  {
    forbidden: /\blandlord\b/gi,
    preferred: 'host (for STAYS mode)',
    context: 'User role vocabulary: Use "host" not "landlord"',
    excludePatterns: [],
  },
  {
    forbidden: /\bproperty owner\b/gi,
    preferred: 'host (for STAYS mode)',
    context: 'User role vocabulary: Use "host" not "property owner"',
    excludePatterns: [],
  },

  // ── Payment terminology ───────────────────────────────────────────────
  {
    forbidden: /\bfee\b/gi,
    preferred: 'commission (for platform charges) or rate/price (for vendor pricing)',
    context: 'Payment vocabulary: Use "commission" for platform charges, not "fee"',
    excludePatterns: [/service_fee/i, /serviceFee/i, /booking_fee/i, /bookingFee/i, /\.fee\b/i, /feeAmount/i],
  },
  {
    forbidden: /\bpayment gateway\b/gi,
    preferred: 'Paystack (the specific provider)',
    context: 'Payment vocabulary: Name the provider explicitly',
    excludePatterns: [],
  },

  // ── Booking terminology ───────────────────────────────────────────────
  {
    forbidden: /\breservation\b/gi,
    preferred: 'booking (Owambe internal term) — use "reservation" only in Coastal Corridor API context',
    context: 'Booking vocabulary: Owambe uses "booking" internally; "reservation" is only for Coastal Corridor API fields',
    excludePatterns: [
      /coastalCorridorReservationId/i,
      /createReservation/i,
      /ReservationCreation/i,
      /ReservationResponse/i,
      /ReservationStatusUpdate/i,
      /reservation\.cancelled/i,
      /reservation\.no_show/i,
      /reservation\.guest_checked/i,
      /reservation\.refunded/i,
      /\/stays\/reservations/i,
      /owambeReservationId/i,
      /conflictingReservationId/i,
      /RESERVATION_NOT_FOUND/i,
    ],
  },

  // ── Platform terminology ──────────────────────────────────────────────
  {
    forbidden: /\bmarketplace\b/gi,
    preferred: 'platform',
    context: 'Platform vocabulary: Owambe is a "platform" not a "marketplace"',
    excludePatterns: [],
  },
  {
    forbidden: /\bapp store\b/gi,
    preferred: 'platform or Owambe',
    context: 'Platform vocabulary: Do not use "app store" to describe Owambe',
    excludePatterns: [],
  },

  // ── Cohort terminology ────────────────────────────────────────────────
  {
    forbidden: /\bpartner\b(?!\s+API|\s+key|\s+program)/gi,
    preferred: 'cohort member (for Coastal Corridor participants)',
    context: 'Cohort vocabulary: Use "cohort member" not "partner" for Coastal Corridor participants',
    excludePatterns: [/partner_id/i, /partnerId/i, /partnerKey/i, /partnerAPI/i],
  },
];

// ─── File Scanning ─────────────────────────────────────────────────────────

const SCAN_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.md'];
const EXCLUDE_DIRS = ['node_modules', '.git', 'dist', 'build', '.next', 'coverage', 'prisma/migrations'];
const EXCLUDE_FILES = ['vocab-lint.js', 'vocab-lint.test.ts', 'PHASE_A_CLARIFICATION_RESPONSE.md'];

function shouldScanFile(filePath) {
  const ext = path.extname(filePath);
  if (!SCAN_EXTENSIONS.includes(ext)) return false;

  const normalised = filePath.replace(/\\/g, '/');
  if (EXCLUDE_DIRS.some(dir => normalised.includes(`/${dir}/`) || normalised.includes(`/${dir}`))) return false;
  if (EXCLUDE_FILES.some(f => normalised.endsWith(f))) return false;

  return true;
}

function getFilesToScan(targets) {
  if (targets.length > 0) {
    return targets.filter(shouldScanFile);
  }

  // Default: scan the entire repo
  const result = [];
  function walk(dir) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (!EXCLUDE_DIRS.includes(entry.name)) walk(fullPath);
        } else if (entry.isFile() && shouldScanFile(fullPath)) {
          result.push(fullPath);
        }
      }
    } catch {
      // Skip unreadable directories
    }
  }
  walk(process.cwd());
  return result;
}

function scanFile(filePath, rules) {
  const violations = [];
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch {
    return violations;
  }

  const lines = content.split('\n');

  for (const rule of rules) {
    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const line = lines[lineIdx];

      // Skip comment lines that explicitly discuss terminology
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
        if (trimmed.includes('vocabulary') || trimmed.includes('Owambe uses') || trimmed.includes('not "')) continue;
      }

      // Skip lines that match any exclude pattern
      if (rule.excludePatterns.some(p => p.test(line))) continue;

      // Reset regex lastIndex for global regexes
      rule.forbidden.lastIndex = 0;

      let match;
      while ((match = rule.forbidden.exec(line)) !== null) {
        // Double-check exclude patterns on the match itself
        if (rule.excludePatterns.some(p => p.test(match[0]))) continue;

        violations.push({
          file: filePath,
          line: lineIdx + 1,
          column: match.index + 1,
          found: match[0],
          preferred: rule.preferred,
          context: rule.context,
          lineContent: line.trimEnd(),
        });
      }
    }
  }

  return violations;
}

// ─── Main ──────────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const strict = args.includes('--strict') || process.env.VOCAB_LINT_STRICT === 'true';
  const targets = args.filter(a => !a.startsWith('--'));

  const files = getFilesToScan(targets);
  const allViolations = [];

  for (const file of files) {
    const violations = scanFile(file, VOCAB_RULES);
    allViolations.push(...violations);
  }

  const scannedCount = files.length;
  const violationCount = allViolations.length;

  if (violationCount === 0) {
    console.log(`✅ Vocabulary lint passed — ${scannedCount} file(s) scanned, 0 violations`);
    process.exit(0);
  }

  // Group violations by file for readable output
  const byFile = {};
  for (const v of allViolations) {
    if (!byFile[v.file]) byFile[v.file] = [];
    byFile[v.file].push(v);
  }

  console.log(`\n⚠️  Owambe Vocabulary Lint — ${violationCount} violation(s) in ${Object.keys(byFile).length} file(s)\n`);

  for (const [file, violations] of Object.entries(byFile)) {
    const relPath = path.relative(process.cwd(), file);
    console.log(`  📄 ${relPath}`);
    for (const v of violations) {
      console.log(`     Line ${v.line}:${v.column} — found "${v.found}"`);
      console.log(`     Preferred: ${v.preferred}`);
      console.log(`     Context:   ${v.context}`);
      console.log(`     > ${v.lineContent}`);
      console.log();
    }
  }

  if (strict) {
    console.log(`❌ Vocabulary lint FAILED (strict mode) — ${violationCount} violation(s) must be resolved`);
    process.exit(1);
  } else {
    console.log(`ℹ️  Vocabulary lint running in ADVISORY mode — violations logged but build not blocked`);
    console.log(`   Set VOCAB_LINT_STRICT=true or pass --strict to fail the build on violations`);
    process.exit(0);
  }
}

main();
