'use strict';
// يشغّل tiktok-server/server.js الحقيقي مع المكتبة الحقيقية tiktok-live-connector 2.5.0 (بدون محاكي)،
// ويرقّع فقط خطوتين تحتاجان إنترنت تيك توك: جلب رقم الغرفة ومعلومات الغرفة (عبر الـprototype).
// كل ما بعدهما حقيقي: طلب التوقيع HTTP إلى SIGN_API_URL (سيرفر Euler محاكى محلياً)، فك البروتوبف،
// وفتح الويب سوكيت إلى pushServer الذي يرجعه (سيرفر محلي). يُستخدم مع real-library.test.js.
const path = require('path');
const serverDir = path.join(__dirname, '../../tiktok-server');
const lib = require(require.resolve('tiktok-live-connector', { paths: [serverDir] }));
const proto = lib.TikTokLiveConnection.prototype;
proto.fetchRoomId = async function () { this.webClient.roomId = '7770001'; return '7770001'; };
proto.fetchRoomInfo = async function () { this._roomInfo = { data: { status: 2 } }; return this._roomInfo; };
require(path.join(serverDir, 'server.js'));
