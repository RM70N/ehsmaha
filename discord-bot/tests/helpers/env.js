'use strict';

// متغيرات بيئة وهمية للاختبارات (ما تتصل بأي خدمة حقيقية)
Object.assign(process.env, {
  DISCORD_TOKEN: 'test-token',
  CLIENT_ID: '1552260327008247879',
  API_KEY: 'x'.repeat(40),
  GEMINI_API_KEY: 'key-one',
  GEMINI_API_KEY_2: 'key-two',
  GEMINI_API_KEY_3: 'key-three',
  GEMINI_FALLBACK_MODELS: 'fallback-model',
  GEMINI_TIMEOUT_MS: '3000',
  API_TIMEOUT_MS: '5000',
  AI_MENTION_COOLDOWN_SECONDS: '1'
});
