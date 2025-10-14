import * as admin from 'firebase-admin';
import DynamicLink from '../src/types';
import {
  TRACEBACK_COLLECTION,
  DYNAMICLINKS_DOC,
  RECORDS_COLLECTION,
  ANALYTICS_COLLECTION,
} from '../src/common/constants';
import { additionalSampleLinks } from '../src/common/sample-links';

// Check if running in production mode
const isProduction = process.argv.includes('--prod');

if (isProduction) {
  console.log('🔧 Using Production Firebase\n');

  // Check for credentials
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.error(
      '❌ Error: GOOGLE_APPLICATION_CREDENTIALS environment variable is not set.',
    );
    console.error(
      'Please set it to the path of your service account key JSON file.',
    );
    process.exit(1);
  }

  // Initialize with service account credentials
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
} else {
  console.log('🔧 Using Firebase Emulators\n');

  // Set emulator environment variables
  process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';

  // Initialize for emulator
  admin.initializeApp({
    projectId: 'iqbdemocms',
  });
}

const db = admin.firestore();

// Use shared sample links and add images and optional expiry
const dummyLinks: DynamicLink[] = [
  {
    ...additionalSampleLinks[0], // summer
    image:
      'https://via.placeholder.com/1200x630/ff6b6b/ffffff?text=Summer+Sale',
  },
  {
    ...additionalSampleLinks[1], // features
    image:
      'https://via.placeholder.com/1200x630/4ecdc4/ffffff?text=New+Features',
  },
  {
    ...additionalSampleLinks[2], // onboard
    image: 'https://via.placeholder.com/1200x630/95e1d3/ffffff?text=Onboarding',
  },
  {
    ...additionalSampleLinks[3], // prod12345
    image: 'https://via.placeholder.com/1200x630/f38181/ffffff?text=Product',
  },
  {
    ...additionalSampleLinks[4], // ref-abc
    image: 'https://via.placeholder.com/1200x630/aa96da/ffffff?text=Referral',
    expires: admin.firestore.Timestamp.fromMillis(
      Date.now() + 30 * 24 * 60 * 60 * 1000,
    ), // 30 days from now
  },
];

function generateAnalyticsData(): {
  clicks: number;
  redirects: number;
  first_opens_intent: number;
  first_opens_install: number;
  reopens: number;
} {
  // Generate semi-realistic data following the installation funnel: clicks -> redirects -> first_opens_install
  const clicks = Math.floor(Math.random() * 100) + 50;
  const redirects = Math.floor(clicks * (0.4 + Math.random() * 0.3)); // 40-70% redirect rate
  const first_opens_install = Math.floor(
    redirects * (0.1 + Math.random() * 0.2),
  ); // 10-30% install rate
  const first_opens_intent = Math.floor(
    redirects * (0.05 + Math.random() * 0.1),
  ); // 5-15% intent opens
  const reopens = Math.floor(first_opens_install * (0.2 + Math.random() * 0.4)); // 20-60% reopen rate

  return {
    clicks,
    redirects,
    first_opens_intent,
    first_opens_install,
    reopens,
  };
}

async function createAnalyticsForLink(linkId: string, linkName: string) {
  console.log(`  Creating analytics for: ${linkName}`);

  const analyticsCollection = db
    .collection(TRACEBACK_COLLECTION)
    .doc(DYNAMICLINKS_DOC)
    .collection(RECORDS_COLLECTION)
    .doc(linkId)
    .collection(ANALYTICS_COLLECTION);

  // Create analytics for last 60 days with some gaps
  const today = new Date();
  const analyticsPromises = [];
  let createdCount = 0;

  for (let i = 0; i < 60; i++) {
    // Skip some days randomly to create gaps (30% chance to skip)
    if (Math.random() < 0.3) {
      continue;
    }

    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD format

    const analyticsData = generateAnalyticsData();

    analyticsPromises.push(analyticsCollection.doc(dateStr).set(analyticsData));
    createdCount++;
  }

  await Promise.all(analyticsPromises);
  console.log(`    ✓ Created ${createdCount} days of analytics (with gaps)`);
}

async function createDummyLinks() {
  const environment = isProduction ? 'production' : 'local emulator';
  console.log(`Creating dummy links and analytics in ${environment}...\n`);

  const linksCollection = db
    .collection(TRACEBACK_COLLECTION)
    .doc(DYNAMICLINKS_DOC)
    .collection(RECORDS_COLLECTION);

  for (const link of dummyLinks) {
    const linkData = {
      ...link,
      createdAt: admin.firestore.Timestamp.now(),
      updatedAt: admin.firestore.Timestamp.now(),
    };

    const docRef = await linksCollection.add(linkData);
    console.log(`Created link: ${link.title} (ID: ${docRef.id})`);

    // Create analytics for this link
    await createAnalyticsForLink(docRef.id, link.title || 'Untitled');
  }

  console.log(
    `\n✓ Successfully created ${dummyLinks.length} dummy links with analytics in ${environment}!`,
  );
  process.exit(0);
}

createDummyLinks().catch((error) => {
  console.error('Error creating dummy links:', error);
  process.exit(1);
});
