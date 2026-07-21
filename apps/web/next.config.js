//@ts-check
const { join } = require('node:path');

const allowedDevOrigins = (process.env['DEV_ALLOWED_ORIGINS'] ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
if (process.env['DEV_LAN_IP']) {
  allowedDevOrigins.push(process.env['DEV_LAN_IP']);
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Runtime image chỉ mang standalone server + traced dependencies, không mang toàn monorepo.
  output: 'standalone',
  // Root monorepo tường minh — không để Next đoán nhầm theo lockfile lạc ngoài repo
  turbopack: {
    root: join(__dirname, '../..'),
  },
  // Next 15+ mặc định chặn serve JS/HMR cho origin khác localhost (chống DNS rebinding) — cần
  // whitelist tường minh để test từ thiết bị khác trong cùng mạng LAN qua IP máy dev. Đọc từ ENV
  // (set `DEV_LAN_IP` trong `.env.local`, không commit) thay vì hardcode IP của 1 máy cụ thể —
  // IP LAN đổi theo máy/mạng của từng người, hardcode sẽ gãy dev server của người khác.
  allowedDevOrigins: [...new Set(allowedDevOrigins)],
};

module.exports = nextConfig;
