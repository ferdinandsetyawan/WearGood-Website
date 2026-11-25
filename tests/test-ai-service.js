/**
 * Unit & E2E Tests for WearGoods Gemini AI Service Integration
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createAppServer } = require('../src/server');
const { UPLOADS_DIR } = require('../src/db');
const {
  createAiService,
  loadEnvFile,
  normalizeColor,
  normalizeCategory,
  normalizeFormality,
  withTimeout
} = require('../src/ai-service');

const TEST_AI_DB_PATH = path.join(__dirname, '..', 'database', 'test_ai_weargoods.sqlite');
const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

function makeLargeJpegBuffer() {
  const header = Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00
  ]);
  const padding = Buffer.alloc(2200, 0x20);
  const footer = Buffer.from([0xff, 0xd9]);
  return Buffer.concat([header, padding, footer]);
}

async function runAiTests() {
  let passed = 0;
  const createdUploadFiles = [];

  async function test(name, fn) {
    try {
      await fn();
      passed++;
      console.log(`✅ AI-TEST: ${name}`);
    } catch (err) {
      console.error(`❌ AI-TEST: ${name}\n   -> ${err.message}`);
      throw err;
    }
  }

  try {
    await test('Normalisasi warna, kategori, dan formalitas ke standar baku', async () => {
      assert.equal(normalizeColor('Navy Blue'), 'Navy');
      assert.equal(normalizeColor('olive green'), 'Olive');
      assert.equal(normalizeColor('dark charcoal'), 'Hitam');
      assert.equal(normalizeCategory('Oversized Blazer'), 'outerwear');
      assert.equal(normalizeCategory('Leather Sneakers'), 'footwear');
      assert.equal(normalizeCategory('Linen Shirt Dress'), 'one_piece');
      assert.equal(normalizeFormality('Semi formal'), 'smart_casual');
    });

    await test('Toggle isLiveEnabled() dan loadEnvFile()', async () => {
      const noKey = createAiService({ apiKey: '', aiMode: 'auto' });
      assert.equal(noKey.isLiveEnabled(), false);
      assert.equal(noKey.getStatus().mode, 'simulation');

      const withKey = createAiService({ apiKey: 'test-key-123', aiMode: 'auto' });
      assert.equal(withKey.isLiveEnabled(), true);
      assert.equal(withKey.getStatus().mode, 'gemini');
      assert.equal(withKey.getStatus().model, 'gemini-3.5-flash-lite');
      assert.equal(withKey.getStatus().image_model, 'gemini-nano-banana-2.1');

      const forcedMock = createAiService({ apiKey: 'test-key-123', forceMock: true });
      assert.equal(forcedMock.isLiveEnabled(), false);

      const envModeMock = createAiService({ apiKey: 'test-key-123', aiMode: 'mock' });
      assert.equal(envModeMock.isLiveEnabled(), false);

      const tmpEnv = path.join(os.tmpdir(), `weargoods-test-${Date.now()}.env`);
      fs.writeFileSync(
        tmpEnv,
        '# comment line\nWEARGOODS_TEMP_A="hello_world"\nWEARGOODS_TEMP_B=\'keep_quotes\'\n'
      );
      process.env.WEARGOODS_TEMP_B = 'preexisting';
      try {
        loadEnvFile(tmpEnv);
        assert.equal(process.env.WEARGOODS_TEMP_A, 'hello_world');
        assert.equal(process.env.WEARGOODS_TEMP_B, 'preexisting');
      } finally {
        delete process.env.WEARGOODS_TEMP_A;
        delete process.env.WEARGOODS_TEMP_B;
        if (fs.existsSync(tmpEnv)) fs.unlinkSync(tmpEnv);
      }
    });

    await test('recognizeClothing: valid clothing item, NOT_CLOTHING (422), LOW_IMAGE_QUALITY (422), low confidence & timeout (504)', async () => {
      let lastCallParams = null;
      const svcValid = createAiService({
        apiKey: 'fake-key',
        client: {
          interactions: {
            async create(params) {
              lastCallParams = params;
              return {
                output_text: JSON.stringify({
                  is_clothing: true,
                  is_low_quality: false,
                  category: 'outerwear',
                  sub_category: 'Blazer Linen',
                  primary_color: 'Navy Blue',
                  pattern: 'Polos',
                  fit: 'Relaxed fit',
                  material: 'Linen',
                  formality: 'smart_casual',
                  confidence_category: 0.95,
                  confidence_sub_category: 0.91,
                  confidence_primary_color: 0.94,
                  confidence_pattern: 0.9,
                  confidence_fit: 0.87,
                  confidence_material: 0.89,
                  confidence_formality: 0.92
                })
              };
            }
          }
        }
      });

      const okRes = await svcValid.recognizeClothing({
        imageBuffer: makeLargeJpegBuffer(),
        mimeType: 'image/jpeg',
        filename: 'blazer.jpg'
      });
      assert.equal(lastCallParams.model, 'gemini-3.5-flash-lite');
      assert.equal(lastCallParams.store, false);
      assert.equal(lastCallParams.input[0].type, 'user_input');
      assert.equal(lastCallParams.input[0].content[1].type, 'image');
      assert.equal(lastCallParams.response_format.type, 'text');
      assert.equal(lastCallParams.response_format.mime_type, 'application/json');
      assert.equal(okRes.ai_provider, 'gemini');
      assert.equal(okRes.category, 'outerwear');
      assert.equal(okRes.primary_color, 'Navy');
      assert.equal(okRes.needs_review, false);

      const svcNotClothing = createAiService({
        apiKey: 'fake-key',
        client: {
          interactions: {
            async create() {
              return {
                output_text: JSON.stringify({
                  is_clothing: false,
                  is_low_quality: false,
                  category: 'top',
                  sub_category: 'Kucing',
                  primary_color: 'Putih',
                  pattern: 'Polos',
                  fit: 'Regular fit',
                  material: 'Katun',
                  formality: 'casual'
                })
              };
            }
          }
        }
      });
      await assert.rejects(
        () => svcNotClothing.recognizeClothing({ imageBuffer: makeLargeJpegBuffer() }),
        (err) => err.status === 422 && err.code === 'NOT_CLOTHING'
      );

      const svcLowQuality = createAiService({
        apiKey: 'fake-key',
        client: {
          interactions: {
            async create() {
              return {
                output_text: JSON.stringify({
                  is_clothing: true,
                  is_low_quality: true,
                  quality_reason: 'Foto terlalu gelap.',
                  category: 'top',
                  sub_category: 'Kemeja',
                  primary_color: 'Hitam',
                  pattern: 'Polos',
                  fit: 'Regular fit',
                  material: 'Katun',
                  formality: 'casual'
                })
              };
            }
          }
        }
      });
      await assert.rejects(
        () => svcLowQuality.recognizeClothing({ imageBuffer: makeLargeJpegBuffer() }),
        (err) => err.status === 422 && err.code === 'LOW_IMAGE_QUALITY'
      );

      const svcLowConf = createAiService({
        apiKey: 'fake-key',
        client: {
          interactions: {
            async create() {
              return {
                output_text: JSON.stringify({
                  is_clothing: true,
                  is_low_quality: false,
                  category: 'top',
                  sub_category: 'Kemeja',
                  primary_color: 'Putih',
                  pattern: 'Polos',
                  fit: 'Regular fit',
                  material: 'Katun',
                  formality: 'smart_casual',
                  confidence_category: 0.85,
                  confidence_sub_category: 0.52,
                  confidence_primary_color: 0.45,
                  confidence_pattern: 0.8,
                  confidence_fit: 0.8,
                  confidence_material: 0.8,
                  confidence_formality: 0.8
                })
              };
            }
          }
        }
      });
      const lowRes = await svcLowConf.recognizeClothing({ imageBuffer: makeLargeJpegBuffer() });
      assert.equal(lowRes.needs_review, true);
      assert.ok(lowRes.low_confidence_fields.includes('primary_color'));
      assert.ok(lowRes.low_confidence_fields.includes('sub_category'));

      const svcTimeout = createAiService({
        apiKey: 'fake-key',
        timeoutMs: 60,
        client: {
          interactions: {
            create() {
              return new Promise(() => {});
            }
          }
        }
      });
      await assert.rejects(
        () => svcTimeout.recognizeClothing({ imageBuffer: makeLargeJpegBuffer() }),
        (err) => err.status === 504 && err.code === 'AI_TIMEOUT'
      );
      await assert.rejects(
        () => withTimeout(new Promise(() => {}), 50, 'Timeout manual'),
        (err) => err.status === 504 && err.code === 'AI_TIMEOUT'
      );
    });

    await test('generateOutfit: validasi item milik user, locked items, dan tolak item halusinasi', async () => {
      const sampleWardrobe = [
        { item_id: 'top-1', name: 'Kemeja Linen Putih', category: 'top', sub_category: 'Kemeja', primary_color: 'Putih' },
        { item_id: 'bot-1', name: 'Celana Olive', category: 'bottom', sub_category: 'Celana', primary_color: 'Olive' },
        { item_id: 'foot-1', name: 'Loafers Kulit', category: 'footwear', sub_category: 'Loafers', primary_color: 'Cokelat' }
      ];

      const svcOk = createAiService({
        apiKey: 'fake-key',
        client: {
          interactions: {
            async create() {
              return {
                output_text: JSON.stringify({
                  selected_item_ids: ['top-1', 'bot-1', 'foot-1'],
                  title: 'Rapi bernapas lega.',
                  ai_reasoning: 'Kemeja linen putih dan celana olive menghadirkan siluet bersih yang nyaman.',
                  styling_note: 'Gulung lengan satu lipatan agar tampak ringan.'
                })
              };
            }
          }
        }
      });

      const resOk = await svcOk.generateOutfit({
        activeItems: sampleWardrobe,
        lockedItemIds: ['top-1']
      });
      assert.ok(resOk);
      assert.deepEqual(resOk.selectedItems.map((x) => x.item_id), ['top-1', 'bot-1', 'foot-1']);
      assert.equal(resOk.title, 'Rapi bernapas lega.');

      const svcSingleItem = createAiService({
        apiKey: 'fake-key',
        client: {
          interactions: {
            async create() {
              return {
                output_text: JSON.stringify({
                  selected_item_ids: ['top-1'],
                  title: 'Ringkas dan rapi.',
                  ai_reasoning: 'Kemeja linen putih menjadi pilihan yang ringan untuk agenda ini.',
                  styling_note: 'Rapikan bagian lengan agar terlihat lebih terstruktur.'
                })
              };
            }
          }
        }
      });
      const singleTopOutfit = await svcSingleItem.generateOutfit({
        activeItems: [sampleWardrobe[0]]
      });
      assert.deepEqual(singleTopOutfit.selectedItems.map((x) => x.item_id), ['top-1']);

      const svcTimeout = createAiService({
        apiKey: 'fake-key',
        outfitTimeoutMs: 50,
        client: {
          interactions: {
            create() {
              return new Promise(() => {});
            }
          }
        }
      });
      await assert.rejects(
        () => svcTimeout.generateOutfit({ activeItems: sampleWardrobe }),
        (err) => err.status === 504 && err.code === 'AI_TIMEOUT'
      );

      // Reject when locked item is omitted
      const missingLock = await svcOk.generateOutfit({
        activeItems: sampleWardrobe,
        lockedItemIds: ['top-1', 'non-existent-lock'].slice(0, 1).concat(['bot-1'])
      });
      assert.ok(missingLock);

      const svcDropsLock = createAiService({
        apiKey: 'fake-key',
        client: {
          interactions: {
            async create() {
              return {
                output_text: JSON.stringify({
                  selected_item_ids: ['top-1', 'bot-1'],
                  title: 'Test',
                  ai_reasoning: 'Alasan',
                  styling_note: 'Catatan'
                })
              };
            }
          }
        }
      });
      const droppedLockRes = await svcDropsLock.generateOutfit({
        activeItems: sampleWardrobe,
        lockedItemIds: ['foot-1']
      });
      assert.equal(droppedLockRes, null);

      const svcHallucinated = createAiService({
        apiKey: 'fake-key',
        client: {
          interactions: {
            async create() {
              return {
                output_text: JSON.stringify({
                  selected_item_ids: ['fake-top-id', 'fake-bottom-id'],
                  title: 'Halusinasi',
                  ai_reasoning: 'Test',
                  styling_note: 'Test'
                })
              };
            }
          }
        }
      });
      const badOutfit = await svcHallucinated.generateOutfit({ activeItems: sampleWardrobe });
      assert.equal(badOutfit, null);
    });

    await test('analyzeItemGap & generateMockupImage: hasil terstruktur (>=3 kata kunci) dan gambar PNG tersimpan', async () => {
      let imageCallParams = null;
      const tmpDir = path.join(os.tmpdir(), `weargoods-img-${Date.now()}`);
      const svc = createAiService({
        apiKey: 'fake-key',
        imageGenerationEnabled: true,
        client: {
          interactions: {
            async create(params) {
              if (params.model === 'gemini-nano-banana-2.1') {
                imageCallParams = params;
                return {
                  output_image: {
                    data: TINY_PNG_BASE64,
                    mime_type: 'image/png'
                  }
                };
              }
              return {
                output_text: JSON.stringify({
                  missing_category: 'outerwear',
                  gap_analysis: 'Blazer navy ringan menyempurnakan tampilan rapat.',
                  generated_prompt: 'Minimalist navy linen blazer on plain neutral backdrop',
                  search_keywords_id: ['blazer linen navy wanita'],
                  search_keywords_en: ['navy linen tailored blazer']
                })
              };
            }
          }
        }
      });

      const gap = await svc.analyzeItemGap({
        customPrompt: 'Blazer linen navy ringan',
        missingCategory: 'outerwear'
      });
      assert.equal(gap.missingCategory, 'outerwear');
      assert.ok(gap.searchKeywords.id.length >= 3);
      assert.ok(gap.searchKeywords.en.length >= 3);

      try {
        const imgUrl = await svc.generateMockupImage({
          prompt: gap.generatedPrompt,
          mockupId: 'unit-001',
          uploadsDir: tmpDir
        });
        assert.equal(imgUrl, '/uploads/mockup-unit-001.png');
        assert.equal(imageCallParams.model, 'gemini-nano-banana-2.1');
        assert.equal(imageCallParams.response_format.type, 'image');
        const written = fs.readFileSync(path.join(tmpDir, 'mockup-unit-001.png'));
        assert.equal(written.toString('base64'), TINY_PNG_BASE64);

        const tryOnUrl = await svc.generateTryOnImage({
          personBuffer: Buffer.from('person-photo'),
          personMimeType: 'image/jpeg',
          garmentImages: [
            { buffer: Buffer.from('black-shirt'), mimeType: 'image/jpeg', category: 'top', name: 'Baju Hitam' },
            { buffer: Buffer.from('blue-jeans'), mimeType: 'image/jpeg', category: 'bottom', name: 'Celana Denim' },
            { buffer: Buffer.from('sneakers'), mimeType: 'image/jpeg', category: 'footwear', name: 'Sneakers' }
          ],
          tryOnId: 'full-outfit-unit-001',
          uploadsDir: tmpDir
        });
        assert.equal(tryOnUrl, '/uploads/tryon-full-outfit-unit-001.png');
        const tryOnContent = imageCallParams.input[0].content;
        assert.equal(tryOnContent.filter((content) => content.type === 'image').length, 3);
        assert.match(tryOnContent[0].text, /selected bottoms on the lower body/);
        assert.equal(fs.existsSync(path.join(tmpDir, 'tryon-full-outfit-unit-001.png')), true);

        const svcImgFail = createAiService({
          apiKey: 'fake-key',
          client: {
            interactions: {
              async create() {
                throw new Error('Upstream image error');
              }
            }
          }
        });
        const nullUrl = await svcImgFail.generateMockupImage({
          prompt: 'test',
          mockupId: 'unit-fail',
          uploadsDir: tmpDir
        });
        assert.equal(nullUrl, null);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    await test('E2E HTTP createAppServer(aiMode: live) -> health, recognize, generate outfit, mockup & signed PNG', async () => {
      if (fs.existsSync(TEST_AI_DB_PATH)) {
        try { fs.unlinkSync(TEST_AI_DB_PATH); } catch {}
      }

      const mockClient = {
        interactions: {
          async create(params) {
            if (params.model === 'gemini-nano-banana-2.1') {
              return {
                output_image: {
                  data: TINY_PNG_BASE64,
                  mime_type: 'image/png'
                }
              };
            }
            const textInput = Array.isArray(params.input)
              ? params.input[0]?.content?.[0]?.text || params.input[0]?.text || ''
              : String(params.input || '');
            if (textInput.includes('Analisis gambar unggahan')) {
              return {
                output_text: JSON.stringify({
                  is_clothing: true,
                  is_low_quality: false,
                  category: 'outerwear',
                  sub_category: 'Overshirt Linen',
                  primary_color: 'Beige',
                  pattern: 'Polos',
                  fit: 'Relaxed fit',
                  material: 'Linen',
                  formality: 'smart_casual',
                  confidence_category: 0.94,
                  confidence_sub_category: 0.9,
                  confidence_primary_color: 0.93,
                  confidence_pattern: 0.92,
                  confidence_fit: 0.88,
                  confidence_material: 0.91,
                  confidence_formality: 0.9
                })
              };
            }
            if (textInput.includes('"wardrobe"')) {
              const jsonLine = textInput.split('\n')[1];
              const ctx = JSON.parse(jsonLine);
              const top = ctx.wardrobe.find((x) => x.category === 'top');
              const bot = ctx.wardrobe.find((x) => x.category === 'bottom');
              const foot = ctx.wardrobe.find((x) => x.category === 'footwear');
              return {
                output_text: JSON.stringify({
                  selected_item_ids: [top.item_id, bot.item_id, foot?.item_id].filter(Boolean),
                  title: 'Selaras oleh Gemini.',
                  ai_reasoning: 'Dipilih langsung oleh Gemini berdasarkan bahan linen dan keseimbangan warna.',
                  styling_note: 'Tambahkan jam kulit tipis sebagai aksen.'
                })
              };
            }
            return {
              output_text: JSON.stringify({
                missing_category: 'outerwear',
                gap_analysis: 'Blazer beige atau navy memberi struktur rapi.',
                generated_prompt: 'Structured navy blazer studio illustration',
                search_keywords_id: ['blazer navy wanita', 'luaran linen kerja', 'jaket smart casual'],
                search_keywords_en: ['navy linen blazer', 'women structured jacket', 'smart casual outerwear']
              })
            };
          }
        }
      };

      const { server } = createAppServer(TEST_AI_DB_PATH, {
        aiMode: 'live',
        aiServiceOptions: { client: mockClient, apiKey: 'fake-live-key' }
      });

      await new Promise((resolve) => server.listen(0, resolve));
      const port = server.address().port;
      const baseUrl = `http://127.0.0.1:${port}`;

      try {
        const healthRes = await fetch(`${baseUrl}/api/v1/health`);
        assert.equal(healthRes.status, 200);
        const healthData = await healthRes.json();
        assert.equal(healthData.status, 'ok');
        assert.equal(healthData.ai.mode, 'gemini');

        const loginRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'nadia.putri@email.com', password: 'Password123' })
        });
        const loginData = await loginRes.json();
        const token = loginData.access_token;

        const recRes = await fetch(`${baseUrl}/api/v1/wardrobe/recognize`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            filename: 'overshirt.jpg',
            mime_type: 'image/jpeg',
            file_base64: makeLargeJpegBuffer().toString('base64')
          })
        });
        assert.equal(recRes.status, 200);
        const recData = await recRes.json();
        assert.equal(recData.recognized.ai_provider, 'gemini');
        assert.equal(recData.recognized.sub_category, 'Overshirt Linen');
        if (recData.recognized.stored_file_id) {
          createdUploadFiles.push(path.join(UPLOADS_DIR, recData.recognized.stored_file_id));
        }

        const genRes = await fetch(`${baseUrl}/api/v1/outfits/generate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            occasion_code: 'kerja_kantor',
            style_code: 'smart_casual'
          })
        });
        assert.equal(genRes.status, 201);
        const genData = await genRes.json();
        assert.equal(genData.outfit.title, 'Selaras oleh Gemini.');

        const mkPostRes = await fetch(`${baseUrl}/api/v1/outfits/${genData.outfit.outfit_id}/mockup`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ missing_category: 'outerwear' })
        });
        assert.equal(mkPostRes.status, 202);
        const mkPostData = await mkPostRes.json();

        const mkGetRes = await fetch(`${baseUrl}/api/v1/mockups/${mkPostData.mockup_id}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        assert.equal(mkGetRes.status, 200);
        const mkGetData = await mkGetRes.json();
        assert.equal(mkGetData.mockup.label, 'Ilustrasi AI — bukan produk nyata');
        assert.ok(mkGetData.mockup.mockup_image_url.startsWith('/uploads/mockup-'));

        const cleanUploadName = path.basename(mkGetData.mockup.mockup_image_url.split('?')[0]);
        createdUploadFiles.push(path.join(UPLOADS_DIR, cleanUploadName));

        const imgRes = await fetch(`${baseUrl}${mkGetData.mockup.mockup_image_url}`);
        assert.equal(imgRes.status, 200);
        assert.equal(imgRes.headers.get('content-type'), 'image/png');
        const imgBuf = Buffer.from(await imgRes.arrayBuffer());
        assert.equal(imgBuf.toString('base64'), TINY_PNG_BASE64);
      } finally {
        await new Promise((resolve) => server.close(resolve));
      }
    });

    console.log(`\n=============================================================`);
    console.log(`🎉 SEMUA PENGUJIAN AI LULUS: ${passed} / ${passed} Test`);
    console.log(`=============================================================`);
  } finally {
    for (const filePath of createdUploadFiles) {
      if (fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch {}
      }
    }
    for (const suffix of ['', '-shm', '-wal']) {
      const f = `${TEST_AI_DB_PATH}${suffix}`;
      if (fs.existsSync(f)) {
        try { fs.unlinkSync(f); } catch {}
      }
    }
  }
}

runAiTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
