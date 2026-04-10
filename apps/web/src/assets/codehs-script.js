console.log('Allocating CodeHS user...');
const uid = (Math.random() * 100000).toFixed(0);
await fetch(`https://scalinghub.codehs.com/hub/api/spinup/${uid}/config/default`, {
  credentials: 'include',
});

console.log('Creating socket...');
const ws = new WebSocket(
  `wss://scalinghub.codehs.com/user/${uid}/spawn/?watch=true&EIO=3&transport=websocket`,
);
/**
 * @param {string} command
 * @param {*} data
 */
const wsSend = (command, data) => {
  ws.send('42' + JSON.stringify([command, data ? data : {}]));
};
await /** @type {Promise<void>} */ (
  new Promise((resolve, reject) => {
    ws.onopen = () => {
      resolve();
    };
    ws.onerror = (err) => {
      reject(err);
    };
  })
);

console.log('Initializing socket...');
await /** @type {Promise<void>} */ (
  new Promise((resolve) => {
    ws.onmessage = (msg) => {
      if (msg.data == '40') resolve();
    };
  })
);

console.log('Installing server...');
wsSend('transfer', {
  'run.sh': `mkdir -p /tmp/proj
cd /tmp/proj

curl -fsSL https://github.com/0k-web/0k/releases/download/latest/tunnel-0k-linux-x64 -o /tmp/tunnel-0k
chmod +x /tmp/tunnel-0k
/tmp/tunnel-0k
`,
});

console.log('Starting server...');
wsSend('spawn', {
  cmd: 'bash',
  args: ['run.sh'],
  id: 'console',
  options: { type: 'echopty' },
});
setInterval(() => {
  wsSend('stdin', { data: '\n', id: 'console' });
}, 30000);
ws.onmessage = /** @param {MessageEvent} msg */ (msg) => {
  if (!msg.data.startsWith('42')) return;

  const parsed = JSON.parse(msg.data.slice(2));
  if (parsed[0] != 'stdout') return;

  const stdout = parsed[1].data;
  console.log(stdout);
};

await new Promise(() => {});
