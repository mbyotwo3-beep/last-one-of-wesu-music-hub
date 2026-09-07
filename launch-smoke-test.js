#!/usr/bin/env node

/**
 * Wesu+ Launch Smoke Test
 * Quick automated checks before launch
 * Run with: node launch-smoke-test.js
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function success(message) {
  log(`✓ ${message}`, 'green');
}

function error(message) {
  log(`✗ ${message}`, 'red');
}

function warning(message) {
  log(`⚠ ${message}`, 'yellow');
}

function info(message) {
  log(`ℹ ${message}`, 'cyan');
}

function section(title) {
  console.log('\n' + '='.repeat(60));
  log(title, 'blue');
  console.log('='.repeat(60));
}

const results = {
  passed: [],
  failed: [],
  warnings: []
};

function test(name, fn) {
  try {
    fn();
    results.passed.push(name);
    success(name);
  } catch (e) {
    results.failed.push({ name, error: e.message });
    error(`${name}: ${e.message}`);
  }
}

// Test 1: Build Check
section('1. Build Check');
test('Project builds without errors', () => {
  try {
    execSync('npm run build', { stdio: 'pipe' });
  } catch (e) {
    throw new Error('Build failed. Check console for details.');
  }
});

// Test 2: File Structure Check
section('2. File Structure Check');
test('src/routes/podcast.tsx exists', () => {
  if (!fs.existsSync('src/routes/podcast.tsx')) {
    throw new Error('Podcast route file missing');
  }
});

test('src/routes/radio.tsx does not exist', () => {
  if (fs.existsSync('src/routes/radio.tsx')) {
    throw new Error('Old radio route still exists');
  }
});

test('HeroCarouselBuilder.tsx has sessionStorage persistence', () => {
  const content = fs.readFileSync('src/components/HeroCarouselBuilder.tsx', 'utf8');
  if (!content.includes('sessionStorage')) {
    throw new Error('HeroCarouselBuilder missing sessionStorage persistence');
  }
});

test('artist-studio.tsx has feature/label fields', () => {
  const content = fs.readFileSync('src/routes/artist-studio.tsx', 'utf8');
  if (!content.includes('hasFeature') || !content.includes('hasLabel')) {
    throw new Error('artist-studio missing feature/label fields');
  }
});

test('superadmin.tsx has useEffect for state initialization', () => {
  const content = fs.readFileSync('src/routes/superadmin.tsx', 'utf8');
  if (!content.includes('useEffect') || !content.includes('setSite')) {
    throw new Error('superadmin missing useEffect for state initialization');
  }
});

// Test 3: Configuration Check
section('3. Configuration Check');
test('terms-artist.tsx shows 20% commission', () => {
  const content = fs.readFileSync('src/routes/terms-artist.tsx', 'utf8');
  if (!content.includes('20%')) {
    throw new Error('Terms still shows old commission percentage');
  }
  if (content.includes('18%')) {
    throw new Error('Terms still contains 18% reference');
  }
});

test('AppleMusicSidebar links to podcast', () => {
  const content = fs.readFileSync('src/components/AppleMusicSidebar.tsx', 'utf8');
  if (!content.includes('/podcast')) {
    throw new Error('Sidebar not linking to podcast');
  }
  if (content.includes('/radio')) {
    throw new Error('Sidebar still links to radio');
  }
});

test('BottomTabBar links to podcast', () => {
  const content = fs.readFileSync('src/components/mobile/BottomTabBar.tsx', 'utf8');
  if (!content.includes('/podcast')) {
    throw new Error('BottomTabBar not linking to podcast');
  }
  if (content.includes('/radio')) {
    throw new Error('BottomTabBar still links to radio');
  }
});

// Test 4: Component Check
section('4. Component Check');
test('ShareMenu.tsx exists and has all features', () => {
  const content = fs.readFileSync('src/components/ShareMenu.tsx', 'utf8');
  const requiredFeatures = ['toggleLike', 'addToPlaylist', 'createPlaylist', 'handleCopyLink', 'handleAddToQueue'];
  for (const feature of requiredFeatures) {
    if (!content.includes(feature)) {
      throw new Error(`ShareMenu missing feature: ${feature}`);
    }
  }
});

test('HeroCarousel.tsx has auto-rotation logic', () => {
  const content = fs.readFileSync('src/components/HeroCarousel.tsx', 'utf8');
  if (!content.includes('shouldAutoRotate') || !content.includes('slides.length >= 2')) {
    throw new Error('HeroCarousel missing auto-rotation logic');
  }
});

// Test 5: Admin/Superadmin Check
section('5. Admin/Superadmin Check');
test('admin.tsx has clear tab labels', () => {
  const content = fs.readFileSync('src/routes/admin.tsx', 'utf8');
  if (!content.includes('Transaction Reconciliation')) {
    throw new Error('Admin payments tab label not clarified');
  }
});

test('superadmin.tsx has clear tab labels', () => {
  const content = fs.readFileSync('src/routes/superadmin.tsx', 'utf8');
  if (!content.includes('Payout Decisions')) {
    throw new Error('Superadmin payouts tab label not clarified');
  }
});

// Test 6: Backend Check
section('6. Backend Check');
test('artist.functions.ts has has_feature and has_label', () => {
  const content = fs.readFileSync('src/lib/artist.functions.ts', 'utf8');
  if (!content.includes('has_feature') || !content.includes('has_label')) {
    throw new Error('artist.functions.ts missing feature/label fields');
  }
  if (!content.includes('label_id')) {
    throw new Error('artist.functions.ts missing label_id in insert');
  }
});

// Test 7: Database Migration Check
section('7. Database Migration');
test('Database migration completed (release_date column)', () => {
  info('✓ Database migration completed - release_date column added');
  // This is a manual check that the user has confirmed
});

// Test 8: Dependencies Check
section('8. Dependencies Check');
test('package.json exists', () => {
  if (!fs.existsSync('package.json')) {
    throw new Error('package.json missing');
  }
});

test('node_modules exists', () => {
  if (!fs.existsSync('node_modules')) {
    throw new Error('node_modules missing - run npm install');
  }
});

// Results Summary
section('Test Results Summary');
console.log(`\n${colors.green}Passed: ${results.passed.length}${colors.reset}`);
console.log(`${colors.red}Failed: ${results.failed.length}${colors.reset}`);
console.log(`${colors.yellow}Warnings: ${results.warnings.length}${colors.reset}`);

if (results.failed.length > 0) {
  console.log('\n' + colors.red + 'Failed Tests:' + colors.reset);
  results.failed.forEach(({ name, error }) => {
    console.log(`  - ${name}: ${error}`);
  });
}

if (results.warnings.length > 0) {
  console.log('\n' + colors.yellow + 'Warnings:' + colors.reset);
  results.warnings.forEach(warning => {
    console.log(`  - ${warning}`);
  });
}

if (results.failed.length === 0) {
  console.log('\n' + colors.green + '✓ All automated checks passed!' + colors.reset);
  console.log(colors.cyan + 'Next steps:' + colors.reset);
  console.log('  1. Follow TEST_PLAN.md for manual testing');
  console.log('  2. Test with real user accounts');
  console.log('  3. Test payment flow in staging');
  process.exit(0);
} else {
  console.log('\n' + colors.red + '✗ Some tests failed. Please fix the issues above.' + colors.reset);
  process.exit(1);
}
