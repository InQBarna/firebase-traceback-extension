import * as admin from 'firebase-admin';

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

interface DummyLink {
  longLink: string;
  shortLink: string;
  name: string;
  description?: string;
}

const dummyLinks: DummyLink[] = [
  {
    longLink: 'https://example.com/products/summer-sale',
    shortLink: 'https://short.link/summer',
    name: 'Summer Sale Campaign',
    description: 'Promotional link for summer sale',
  },
  {
    longLink: 'https://example.com/blog/new-features',
    shortLink: 'https://short.link/features',
    name: 'New Features Announcement',
    description: 'Blog post about latest features',
  },
  {
    longLink: 'https://example.com/app/onboarding',
    shortLink: 'https://short.link/onboard',
    name: 'User Onboarding Flow',
    description: 'Deep link for new user onboarding',
  },
  {
    longLink: 'https://example.com/products/item/12345',
    shortLink: 'https://short.link/prod12345',
    name: 'Product #12345',
    description: 'Direct link to product page',
  },
  {
    longLink: 'https://example.com/referral?code=ABC123',
    shortLink: 'https://short.link/ref-abc',
    name: 'Referral Code ABC123',
    description: 'Referral link for user acquisition',
  },
];

function generateAnalyticsData(): {
  opens: number;
  clicks: number;
  installs: number;
  reopens: number;
} {
  // Generate semi-realistic data with some variation
  const baseOpens = Math.floor(Math.random() * 100) + 50;
  const clicks = Math.floor(baseOpens * (0.3 + Math.random() * 0.3)); // 30-60% click rate
  const installs = Math.floor(clicks * (0.1 + Math.random() * 0.2)); // 10-30% install rate
  const reopens = Math.floor(installs * (0.2 + Math.random() * 0.4)); // 20-60% reopen rate

  return { opens: baseOpens, clicks, installs, reopens };
}

async function createAnalyticsForLink(linkId: string, linkName: string) {
  console.log(`  Creating analytics for: ${linkName}`);

  const analyticsCollection = db
    .collection('_traceback_')
    .doc('dynamiclinks')
    .collection('records')
    .doc(linkId)
    .collection('analytics');

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
    .collection('_traceback_')
    .doc('dynamiclinks')
    .collection('records');

  for (const link of dummyLinks) {
    const linkData = {
      ...link,
      createdAt: admin.firestore.Timestamp.now(),
      updatedAt: admin.firestore.Timestamp.now(),
    };

    const docRef = await linksCollection.add(linkData);
    console.log(`Created link: ${link.name} (ID: ${docRef.id})`);

    // Create analytics for this link
    await createAnalyticsForLink(docRef.id, link.name);
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
