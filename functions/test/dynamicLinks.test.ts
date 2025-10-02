import * as request from 'supertest';

const HOST_BASE_URL = process.env.TRACEBACK_API_URL ?? 'http://127.0.0.1:5002';

describe('Dynamic Link Redirect', () => {
  test('should redirect when followLink is present', async () => {
    const testFollowLink =
      'https://familymealplanner.inqbarna.com/test/deep/link';

    // 1. Create a test dynamic link via doctor endpoint
    const doctorResponse = await request(HOST_BASE_URL)
      .get('/v1_doctor')
      .query({ testFollowLink });

    expect(doctorResponse.statusCode).toBe(200);
    expect(doctorResponse.body.extensionInitialization).toBeDefined();

    // Small delay to ensure Firestore write completes
    await new Promise((resolve) => setTimeout(resolve, 500));

    // 2. Request the /example path (which should have the test link)
    const linkResponse = await request(HOST_BASE_URL)
      .get('/example')
      .redirects(0); // Don't follow redirects automatically

    // 3. Verify redirect response
    expect(linkResponse.statusCode).toBe(302);
    expect(linkResponse.headers.location).toBeDefined();

    // 4. Verify the redirect URL contains the link parameter and uses correct host
    const redirectUrl = new URL(linkResponse.headers.location, HOST_BASE_URL);
    expect(redirectUrl.searchParams.get('link')).toBe(testFollowLink);
    expect(redirectUrl.pathname).toBe('/example');

    // 5. Verify redirect stays on hosting domain (not internal Cloud Functions domain)
    expect(redirectUrl.hostname).toBe('127.0.0.1');
    expect(redirectUrl.protocol).toBe('http:');
    expect(redirectUrl.href).not.toContain('cloudfunctions.net');
  });

  test('should return HTML preview when link parameter already exists', async () => {
    const testFollowLink =
      'https://familymealplanner.inqbarna.com/test/deep/link';

    // 1. Create a test dynamic link via doctor endpoint
    await request(HOST_BASE_URL).get('/v1_doctor').query({ testFollowLink });

    await new Promise((resolve) => setTimeout(resolve, 100));

    // 2. Request with link parameter already in URL - should not redirect again
    const linkResponse = await request(HOST_BASE_URL)
      .get('/example?link=https://alreadyhere.com')
      .redirects(0);

    // 3. Should return 200 with HTML content (not redirect)
    expect(linkResponse.statusCode).toBe(200);
    expect(linkResponse.headers['content-type']).toMatch(/html/);
  });

  test('should return 200 for unknown path', async () => {
    // Request a path that doesn't exist in dynamic links
    const linkResponse = await request(HOST_BASE_URL)
      .get('/nonexistent-path-12345')
      .redirects(0);

    // Should return 200 with default HTML (not 404)
    expect(linkResponse.statusCode).toBe(200);
    expect(linkResponse.headers['content-type']).toMatch(/html/);
  });
});
