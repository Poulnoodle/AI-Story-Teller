// 验证局域网访问：node scripts/check-lan.mjs [ip]
const ip = process.argv[2] || "192.168.1.134";
fetch(`http://${ip}:3000/`)
  .then((r) => console.log(`LAN 访问 http://${ip}:3000/ -> HTTP ${r.status}`))
  .catch((e) => console.log(`LAN 访问失败: ${e.cause?.code || e.message}`));
