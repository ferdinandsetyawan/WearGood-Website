const fs = require('fs');

const BASE_URL = 'https://wear-good-website.vercel.app';

async function runAudit() {
  console.log(`Starting corrected live API audit against: ${BASE_URL}\n`);
  const results = [];

  async function testEndpoint(name, url, options = {}) {
    const t0 = Date.now();
    try {
      const res = await fetch(`${BASE_URL}${url}`, options);
      const elapsed = Date.now() - t0;
      let data = null;
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        data = await res.json();
      } else {
        data = await res.text();
      }
      return { name, status: res.status, ok: res.ok, elapsed, data, headers: Object.fromEntries(res.headers.entries()) };
    } catch (err) {
      return { name, status: 0, ok: false, elapsed: Date.now() - t0, error: err.message };
    }
  }

  // 1. Health
  const health = await testEndpoint('1. GET /api/v1/health', '/api/v1/health');
  results.push(health);
  console.log(`[Health] Status: ${health.status} (${health.elapsed}ms) - Mode: ${health.data?.ai?.mode}`);

  // 2. Meta Occasions & Styles
  const occ = await testEndpoint('2a. GET /api/v1/meta/occasions', '/api/v1/meta/occasions');
  const sty = await testEndpoint('2b. GET /api/v1/meta/styles', '/api/v1/meta/styles');
  console.log(`[Occasions] Status: ${occ.status} - Count: ${occ.data?.occasions?.length}`);
  console.log(`[Styles] Status: ${sty.status} - Count: ${sty.data?.styles?.length}`);

  // 3. Login
  const login = await testEndpoint('3. POST /api/v1/auth/login', '/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'nadia.putri@email.com', password: 'Password123' })
  });
  const token = login.data?.access_token;
  console.log(`[Login] Status: ${login.status} (${login.elapsed}ms) - User: ${login.data?.user?.full_name} - Has Token: ${Boolean(token)}`);

  if (!token) return;
  const authHeader = { 'Authorization': `Bearer ${token}` };

  // 4. Wardrobe Items
  const wardrobe = await testEndpoint('4. GET /api/v1/wardrobe/items', '/api/v1/wardrobe/items', { headers: authHeader });
  console.log(`[Wardrobe] Status: ${wardrobe.status} (${wardrobe.elapsed}ms) - Items: ${wardrobe.data?.items?.length}`);

  if (wardrobe.data?.items?.length) {
    const firstItem = wardrobe.data.items[0];
    const imgUrl = firstItem.original_image_url;
    console.log(`  First item image URL: ${imgUrl}`);
    const imgTest = await testEndpoint('4b. GET item image', imgUrl);
    console.log(`  Image fetch status: ${imgTest.status} (${imgTest.elapsed}ms) Content-Type: ${imgTest.headers?.['content-type']}`);
  }

  // 5. Outfit Generation with Gemini AI
  console.log('\nTesting AI Outfit Generation (Gemini 3.5 Flash Lite)...');
  const genOutfit = await testEndpoint('5. POST /api/v1/outfits/generate', '/api/v1/outfits/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader },
    body: JSON.stringify({
      occasion_code: 'kerja_kantor',
      style_code: 'smart_casual',
      weather_context: 'Ber-AC',
      location_context: 'Kantor',
      user_prompt: 'tampilan formal monokrom rapi dan nyaman'
    })
  });
  console.log(`[Outfit Gen] Status: ${genOutfit.status} (${genOutfit.elapsed}ms) - Outfits returned: ${genOutfit.data?.outfits?.length}`);
  if (genOutfit.data?.outfits?.[0]) {
    const o = genOutfit.data.outfits[0];
    console.log(`  Outfit 1 Title: "${o.title}"`);
    console.log(`  Reasoning: "${o.reasoning?.slice(0, 100)}..."`);
    console.log(`  Styling Note: "${o.styling_note?.slice(0, 100)}..."`);
    console.log(`  Items in outfit: ${o.items?.map(i => i.name).join(', ')}`);
  }

  // 6. Saved Outfits
  const saved = await testEndpoint('6. GET /api/v1/outfits', '/api/v1/outfits', { headers: authHeader });
  console.log(`\n[Saved Outfits] Status: ${saved.status} (${saved.elapsed}ms) - Saved count: ${saved.data?.outfits?.length}`);

  // 7. Gap Analysis & Mockup Recommendation
  console.log('\nTesting AI Gap Analysis & Mockup (Gemini)...');
  const mockup = await testEndpoint('7. POST /api/v1/mockups', '/api/v1/mockups', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader },
    body: JSON.stringify({
      missing_category: 'outerwear',
      prompt: 'Blazer linen warna navy relaxed fit untuk kantor'
    })
  });
  console.log(`[Mockup] Status: ${mockup.status} (${mockup.elapsed}ms)`);
  if (mockup.data) {
    console.log(`  Analysis: ${mockup.data.gap_analysis?.slice(0, 100)}...`);
    console.log(`  Mockup Image: ${mockup.data.mockup_image_url}`);
    console.log(`  Keywords (ID): ${JSON.stringify(mockup.data.search_keywords?.id)}`);
  }

  // 8. User Quota Usage
  const usage = await testEndpoint('8. GET /api/v1/users/me/usage', '/api/v1/users/me/usage', { headers: authHeader });
  console.log(`\n[Quota Usage] Status: ${usage.status} (${usage.elapsed}ms)`);
  console.log(`  Quota remaining: Outfit: ${usage.data?.usage?.outfit?.remaining}/${usage.data?.usage?.outfit?.limit}, Recognize: ${usage.data?.usage?.recognize?.remaining}/${usage.data?.usage?.recognize?.limit}`);

  console.log('\n--- LIVE AUDIT COMPLETE ---');
}

runAudit().catch(console.error);
