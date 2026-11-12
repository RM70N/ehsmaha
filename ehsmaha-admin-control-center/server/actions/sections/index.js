import players from './players.js';
import streamers from './streamers.js';
import games from './games.js';
import events from './events.js';
import rewards from './rewards.js';
import shop from './shop.js';
import codes from './codes.js';
import messages from './messages.js';
import analytics from './analytics.js';
import dserver from './dserver.js';
import dmembers from './dmembers.js';
import dcommands from './dcommands.js';
import botsys from './dbotsys.js';
import control from './control.js';
import integration from './integration.js';

// القسم يظهر في الواجهة بالترتيب أدناه. adminDefault = ما يراه الأدمن قبل أي تخصيص من المالك.
import { extra } from './dbotcontrol.js';
const all = [players, streamers, games, events, rewards, shop, codes, messages, analytics, dserver, dmembers, dcommands, ...botsys, ...control, integration];
// دمج إجراءات قناة التحكم داخل البوت في أقسامها
for (const [id, x] of Object.entries(extra)) { const sec = all.find((d) => d.id === id); sec.actions = [...(sec.actions || []), ...(x.actions || [])]; sec.views = [...(sec.views || []), ...(x.views || [])]; }
export const sectionDefs = all;
