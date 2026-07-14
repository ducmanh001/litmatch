//@ts-check
const { join } = require('node:path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Root monorepo tường minh — không để Next đoán nhầm theo lockfile lạc ngoài repo
  turbopack: {
    root: join(__dirname, '../..'),
  },
  // Next 15+ mặc định chặn serve JS/HMR cho origin khác localhost (chống DNS rebinding) — cần
  // whitelist tường minh để test từ thiết bị khác trong cùng mạng LAN qua IP máy dev. Đọc từ ENV
  // (set `DEV_LAN_IP` trong `.env.local`, không commit) thay vì hardcode IP của 1 máy cụ thể —
  // IP LAN đổi theo máy/mạng của từng người, hardcode sẽ gãy dev server của người khác.
  allowedDevOrigins: process.env['DEV_LAN_IP']
    ? [process.env['DEV_LAN_IP']]
    : [],
};

module.exports = nextConfig;
